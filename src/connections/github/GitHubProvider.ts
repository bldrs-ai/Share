/**
 * GitHub ConnectionProvider implementation.
 *
 * Uses the standard OAuth App popup flow: the popup goes to
 * github.com/login/oauth/authorize, the same-origin callback page at
 * /auth/gh/callback.html postMessages the auth code back, and the opener
 * swaps the code for a token via /.netlify/functions/gh-oauth-exchange.
 * Tokens persist in localStorage at `bldrs:github-token:<connectionId>` and
 * are refreshed lazily on 401 via /.netlify/functions/gh-oauth-refresh.
 *
 * Differs from GoogleDriveProvider in two ways: there's no in-page token
 * client (we own the popup window), and access tokens carry a refresh
 * token. Otherwise the contract — typed errors, state-CSRF, persisted-on-
 * disk tokens — is the same.
 *
 * See design/new/identity-decoupling-decisions.md for scope, TTL and
 * refresh-policy decisions.
 */

import type {
  Connection,
  ConnectionProvider,
  ConnectionStatus,
} from '../types'
import debug from '../../utils/debug'
import {NeedsReconnectError} from '../errors'


// Decisions per design/new/identity-decoupling-decisions.md §Q3:
// - repo:        private + public read/write (no narrower scope exists for OAuth Apps)
// - read:user:   profile name/login/id for "Saving as @user" footer
// - read:org:    enumerate orgs for the existing Save dialog org picker
const SCOPES = ['repo', 'read:user', 'read:org'].join(' ')

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const EXCHANGE_FN = '/.netlify/functions/gh-oauth-exchange'
const REFRESH_FN = '/.netlify/functions/gh-oauth-refresh'
const CALLBACK_PATH = '/auth/gh/callback.html'

// Reasonable popup-flow ceiling. Past this we bail with a typed error so
// callers can offer a Reconnect button rather than hang.
const CONNECT_TIMEOUT_MS = 120_000
const POPUP_POLL_INTERVAL_MS = 500
// Grace period after popup.closed before we reject as "cancelled". The
// callback page calls postMessage just before window.close(), so we
// briefly wait for the message to arrive instead of racing the close
// detection. Mirrors GoogleDriveProvider's POPUP_CLOSE_DEBOUNCE_MS.
const POPUP_CLOSE_DEBOUNCE_MS = 2000
// Default GitHub OAuth-App access-token TTL when the app is configured for
// expiring tokens (decisions §Q2). Used only as a fallback when the
// response omits expires_in (defensive — current GitHub always returns it).
const DEFAULT_ACCESS_TTL_S = 28_800 // 8h
const MS_PER_S = 1000
// Refresh-on-401 cushion: treat tokens within this window of expiry as
// stale and proactively refresh on the next getAccessToken() call.
const EXPIRY_SKEW_MS = 30_000
const HTTP_UNAUTHORIZED = 401
// 6 months in seconds (180 * 24 * 60 * 60). Used only as a fallback if
// GitHub's response omits refresh_token_expires_in (defensive — the live
// API includes it).
const REFRESH_TTL_FALLBACK_S = 15_552_000

const STORAGE_TOKEN_PREFIX = 'bldrs:github-token:'
const SESSION_STATE_KEY = 'github_oauth_state'

const POPUP_FEATURES = 'popup=yes,width=600,height=700'

const POSTMESSAGE_TYPE = 'bldrs:gh-oauth-callback'
const BROADCAST_CHANNEL_NAME = 'bldrs:gh-oauth'


/** Persisted token record. Mirrors GitHub's response shape, with absolute expiries. */
interface StoredToken {
  accessToken: string
  refreshToken: string
  /** ms-epoch at which the access token becomes invalid */
  accessExpiresAt: number
  /** ms-epoch at which the refresh token becomes invalid */
  refreshExpiresAt: number
  /** Granted scopes from GitHub's response (space-delimited) */
  scope: string
}


interface CallbackPayload {
  type?: string
  code?: string | null
  state?: string | null
  error?: string | null
  error_description?: string | null
}


/** In-memory mirror of localStorage so concurrent reads avoid disk hits. */
const tokenCache = new Map<string, StoredToken>()


/**
 * Persist a token record. Storage failures (private mode, full quota) are
 * non-fatal — the in-memory cache covers the rest of the session.
 *
 * @param connectionId The connection these tokens belong to.
 * @param stored The full token record to persist.
 */
function saveToken(connectionId: string, stored: StoredToken): void {
  tokenCache.set(connectionId, stored)
  try {
    localStorage.setItem(STORAGE_TOKEN_PREFIX + connectionId, JSON.stringify(stored))
  } catch {
    // ignore
  }
}


/**
 * Load a persisted token, dropping records whose refresh token has already
 * expired (we can't recover those without re-popping the consent flow).
 *
 * @param connectionId The connection to look up.
 * @return The stored token, or null when missing/expired/malformed.
 */
function loadToken(connectionId: string): StoredToken | null {
  const cached = tokenCache.get(connectionId)
  if (cached) {
    if (Date.now() >= cached.refreshExpiresAt) {
      tokenCache.delete(connectionId)
      try {
        localStorage.removeItem(STORAGE_TOKEN_PREFIX + connectionId)
      } catch {
        // ignore
      }
      return null
    }
    return cached
  }
  try {
    const raw = localStorage.getItem(STORAGE_TOKEN_PREFIX + connectionId)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as StoredToken
    if (Date.now() >= parsed.refreshExpiresAt) {
      localStorage.removeItem(STORAGE_TOKEN_PREFIX + connectionId)
      return null
    }
    tokenCache.set(connectionId, parsed)
    return parsed
  } catch {
    return null
  }
}


/** Remove the token from memory and disk. */
function clearToken(connectionId: string): void {
  tokenCache.delete(connectionId)
  try {
    localStorage.removeItem(STORAGE_TOKEN_PREFIX + connectionId)
  } catch {
    // ignore
  }
}


/**
 * Convert a fresh GitHub token-endpoint response into our persistence shape.
 *
 * @param resp The decoded JSON from gh-oauth-exchange or gh-oauth-refresh.
 * @return A StoredToken with absolute expiries.
 */
function toStoredToken(resp: {
  access_token: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  scope?: string
}): StoredToken {
  const now = Date.now()
  const accessTtlS = resp.expires_in ?? DEFAULT_ACCESS_TTL_S
  const refreshTtlS = resp.refresh_token_expires_in ?? REFRESH_TTL_FALLBACK_S
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? '',
    accessExpiresAt: now + (accessTtlS * MS_PER_S),
    refreshExpiresAt: now + (refreshTtlS * MS_PER_S),
    scope: resp.scope ?? '',
  }
}


/**
 * Generate a CSRF state parameter for the authorize round-trip.
 *
 * @return A cryptographically random UUID.
 */
function generateState(): string {
  return crypto.randomUUID()
}


/** Persist the expected CSRF state across the popup hop. */
function saveStateToSession(state: string): void {
  try {
    sessionStorage.setItem(SESSION_STATE_KEY, state)
  } catch {
    // ignore
  }
}


/**
 * Read-and-clear the CSRF state.
 *
 * @return The persisted state, or null if storage is unavailable.
 */
function consumeStateFromSession(): string | null {
  try {
    const state = sessionStorage.getItem(SESSION_STATE_KEY)
    sessionStorage.removeItem(SESSION_STATE_KEY)
    return state
  } catch {
    return null
  }
}


let idCounter = 0


/** @return A unique connection id. */
function generateId(): string {
  idCounter += 1
  return `github-${Date.now()}-${idCounter}`
}


/**
 * Build the github.com authorize URL with our scopes and CSRF state.
 *
 * @param clientId The OAuth App's public client id.
 * @param state The CSRF nonce (must round-trip back via the callback).
 * @param hint Optional `login` value to pre-select an account.
 * @return The fully-qualified authorize URL.
 */
function buildAuthorizeUrl(clientId: string, state: string, hint?: string): string {
  const redirectUri = `${window.location.origin}${CALLBACK_PATH}`
  // allow_signup=true (the GitHub default) lets unauthenticated visitors
  // sign up for GitHub during the OAuth flow rather than dead-ending. It
  // does NOT control multi-account selection — GitHub OAuth has no
  // prompt=consent equivalent, so a user adding a second account has to
  // log out of github.com or use a private window.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    allow_signup: 'true',
  })
  if (hint) {
    params.set('login', hint)
  }
  return `${AUTHORIZE_URL}?${params.toString()}`
}


/**
 * POST a body to a same-origin Netlify Function and return the parsed JSON.
 * Throws on non-2xx so callers can map to typed errors.
 *
 * @param path The function path under /.netlify/functions/.
 * @param body The JSON body to send.
 * @return The decoded JSON response.
 */
async function postFn(path: string, body: unknown): Promise<{
  access_token: string
  // GitHub OAuth Apps not enrolled in the (since-discontinued) expiring-
  // tokens beta omit refresh_token entirely. getAccessToken() falls
  // back to NeedsReconnectError when the next refresh attempt fails.
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  scope?: string
}> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`${path} failed: ${res.status} ${text}`)
    ;(err as Error & {status?: number}).status = res.status
    throw err
  }
  return res.json()
}


export const githubProvider: ConnectionProvider = {
  id: 'github',
  name: 'GitHub',
  icon: 'github',

  async connect(hint?: string): Promise<Connection> {
    const clientId = process.env.GH_OAUTH_CLIENT_ID
    if (!clientId) {
      throw new Error('GH_OAUTH_CLIENT_ID environment variable is not set')
    }

    const state = generateState()
    saveStateToSession(state)
    const url = buildAuthorizeUrl(clientId, state, hint)

    debug().log('[GitHub] Opening authorize popup')
    const popup = window.open(url, 'bldrs-gh-oauth', POPUP_FEATURES)
    if (!popup) {
      consumeStateFromSession()
      throw new Error('Please allow pop-ups to sign in with GitHub.')
    }

    const payload = await waitForCallback(popup)
    const expectedState = consumeStateFromSession()

    if (payload.error) {
      throw new Error(
        `GitHub OAuth error: ${payload.error}${payload.error_description ? ` - ${payload.error_description}` : ''}`,
      )
    }
    if (!payload.code) {
      throw new Error('GitHub OAuth callback returned no code')
    }
    if (expectedState !== null && payload.state !== expectedState) {
      throw new Error('OAuth state mismatch — possible CSRF attack')
    }

    const tokenResp = await postFn(EXCHANGE_FN, {
      code: payload.code,
      redirect_uri: `${window.location.origin}${CALLBACK_PATH}`,
    })
    const stored = toStoredToken(tokenResp)
    const connectionId = generateId()
    saveToken(connectionId, stored)

    const profile = await fetchUserProfile(stored.accessToken).catch(() => null)
    const label = profile?.login ? `${profile.login} - GitHub` : 'GitHub'

    return {
      id: connectionId,
      providerId: 'github',
      label,
      status: 'connected',
      auth0Connection: 'github',
      createdAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      meta: profile ? {login: profile.login, avatarUrl: profile.avatar_url, name: profile.name} : {},
    }
  },

  // eslint-disable-next-line require-await
  async disconnect(connectionId: string): Promise<void> {
    // Best-effort revocation. GitHub's `DELETE /applications/{cid}/token`
    // requires Basic auth with client_secret, so it has to go through a
    // function — out of scope for PR1. Clearing local credentials is
    // sufficient for the user-facing intent of "log me out"; the server
    // grant lapses naturally at the 8h access / 6mo refresh boundary.
    clearToken(connectionId)
  },

  async checkStatus(connection: Connection): Promise<ConnectionStatus> {
    const stored = loadToken(connection.id)
    if (!stored) {
      return 'disconnected'
    }
    if (Date.now() >= stored.refreshExpiresAt) {
      // Refresh token gone — only a fresh popup can recover, so surface
      // expired so SourcesTab routes to a Reconnect overlay.
      return 'expired'
    }
    // Best-effort live verification against /user. Like Drive's tokeninfo
    // round-trip, this catches server-side revocation that local TTLs
    // can't see.
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {Authorization: `Bearer ${stored.accessToken}`},
      })
      if (res.ok) {
        return 'connected'
      }
      if (res.status === HTTP_UNAUTHORIZED) {
        // 401 with a fresh-looking token likely means revoked — but the
        // refresh token may still be valid, so report expired (recoverable)
        // not disconnected.
        return 'expired'
      }
      // 5xx and rate-limited responses are transient; trust local cache.
      return 'connected'
    } catch {
      return 'connected'
    }
  },

  async getAccessToken(connection: Connection): Promise<string> {
    const stored = loadToken(connection.id)
    if (!stored) {
      throw new NeedsReconnectError(connection, 'no_token', 'No GitHub token for this connection')
    }
    if (Date.now() < stored.accessExpiresAt - EXPIRY_SKEW_MS) {
      return stored.accessToken
    }
    // Access token at/near expiry. If we never got a refresh token (GitHub
    // no longer issues them for new OAuth Apps — see the toStoredToken
    // empty-string fallback), the only recovery is a fresh popup; skip the
    // doomed POST and surface NeedsReconnectError directly.
    if (!stored.refreshToken) {
      clearToken(connection.id)
      throw new NeedsReconnectError(
        connection,
        'no_refresh_token',
        'GitHub access token expired and no refresh token is available',
      )
    }
    // Try the refresh path. On any failure surface NeedsReconnectError so
    // the UI can offer a real consent popup.
    try {
      const refreshed = await postFn(REFRESH_FN, {refresh_token: stored.refreshToken})
      const next = toStoredToken(refreshed)
      saveToken(connection.id, next)
      return next.accessToken
    } catch (err) {
      // Wipe stale credentials so the UI doesn't loop on the same bad
      // refresh token.
      clearToken(connection.id)
      throw new NeedsReconnectError(
        connection,
        'refresh_failed',
        err instanceof Error ? err.message : 'GitHub token refresh failed',
      )
    }
  },
}


/**
 * Block until the popup delivers the OAuth callback or closes/times out.
 * Listens on three signals:
 *   - BroadcastChannel `bldrs:gh-oauth` — primary, COOP-immune.
 *   - postMessage on window — fallback for browsers without
 *     BroadcastChannel and for OAuth providers that don't set strict COOP.
 *   - popup.closed polling — only after a debounce, since the callback
 *     page closes itself immediately after dispatching the message.
 *
 * Resolves with the payload (which may carry `error`); rejects only on
 * structural failures (popup closed without delivering a message, timeout).
 *
 * @param popup The window opened to the authorize URL.
 * @return The CallbackPayload posted by /auth/gh/callback.html.
 */
function waitForCallback(popup: Window): Promise<CallbackPayload> {
  return new Promise<CallbackPayload>((resolve, reject) => {
    let settled = false
    let receivedCallback = false
    // BroadcastChannel may be undefined in old jsdom; tests mock it.
    const channel = typeof BroadcastChannel !== 'undefined' ?
      new BroadcastChannel(BROADCAST_CHANNEL_NAME) :
      null

    const settle = (fn: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('message', onMessage)
      if (channel) {
        channel.removeEventListener('message', onChannelMessage)
        channel.close()
      }
      clearInterval(pollInterval)
      if (closeDebounce !== null) {
        clearTimeout(closeDebounce)
      }
      clearTimeout(overallTimeout)
      try {
        if (!popup.closed) {
          popup.close()
        }
      } catch {
        // ignore — different-origin closes can throw
      }
      fn()
    }

    const acceptPayload = (data: CallbackPayload | undefined): boolean => {
      if (!data || data.type !== POSTMESSAGE_TYPE) {
        return false
      }
      receivedCallback = true
      settle(() => resolve(data))
      return true
    }

    const onMessage = (event: MessageEvent): void => {
      // Reject any opener message not from our own origin. The callback
      // page postMessages with window.location.origin (same-origin only).
      if (event.origin !== window.location.origin) {
        return
      }
      acceptPayload(event.data as CallbackPayload | undefined)
    }

    const onChannelMessage = (event: MessageEvent): void => {
      // BroadcastChannel only delivers same-origin messages, so no origin
      // check is needed.
      acceptPayload(event.data as CallbackPayload | undefined)
    }

    // Popup-close detection. The callback page closes itself right after
    // dispatching, so a clean run looks like "message arrives, then
    // popup.closed flips a few ms later". Debounce briefly so the
    // close-after-success doesn't race the message handler.
    //
    // closeDebounce captures the transition from open → closed exactly
    // once; without it, every 500ms tick after a close would schedule
    // another 2s setTimeout, leaking O(connectTimeout / pollInterval)
    // dangling timers in the worst case.
    let closeDebounce: ReturnType<typeof setTimeout> | null = null
    const pollInterval = setInterval(() => {
      try {
        if (popup.closed && closeDebounce === null) {
          closeDebounce = setTimeout(() => {
            if (!settled && !receivedCallback) {
              settle(() => reject(new Error('GitHub sign-in was cancelled')))
            }
          }, POPUP_CLOSE_DEBOUNCE_MS)
        }
      } catch {
        // Cross-origin during the github.com hop will throw — that's fine.
      }
    }, POPUP_POLL_INTERVAL_MS)

    const overallTimeout = setTimeout(() => {
      settle(() => reject(new Error('GitHub sign-in timed out')))
    }, CONNECT_TIMEOUT_MS)

    window.addEventListener('message', onMessage)
    if (channel) {
      channel.addEventListener('message', onChannelMessage)
    }
  })
}


interface UserProfile {
  login: string
  avatar_url?: string
  name?: string | null
}


/**
 * Fetch the authenticated user's profile. Best-effort: failures don't block
 * connect.
 *
 * @param accessToken A fresh GitHub access token.
 * @return The user profile, or null on failure.
 */
async function fetchUserProfile(accessToken: string): Promise<UserProfile | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {Authorization: `Bearer ${accessToken}`},
    })
    if (!res.ok) {
      return null
    }
    return res.json()
  } catch {
    return null
  }
}

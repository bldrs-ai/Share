/**
 * Google Drive ConnectionProvider implementation.
 *
 * Uses Google Identity Services (GIS) for OAuth token acquisition,
 * separate from Auth0 (which is scoped to the GitHub API audience).
 *
 * Tokens are held in memory only and re-obtained via GIS on page reload.
 */

import type {Connection, ConnectionProvider, ConnectionStatus} from '../types'
import debug from '../../utils/debug'
import {loadGisScript} from './loadGisScript'
import type {TokenResponse} from './loadGisScript'


const CONNECT_TIMEOUT_MS = 120_000
const DEFAULT_TOKEN_EXPIRES_S = 3600
const MS_PER_S = 1000
const EMAIL_FETCH_TIMEOUT_MS = 5000
const POPUP_CLOSE_DEBOUNCE_MS = 2000

// drive.file: per-file access granted via Picker only. Non-sensitive scope —
// no Google verification review and no unverified-app consent warning.
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

interface CachedToken {
  token: string
  expiresAt: number
}

/** In-memory token store keyed by connection ID. */
const tokenCache = new Map<string, CachedToken>()

const SESSION_TOKEN_PREFIX = 'gdrive_token_'


/** Persist token to sessionStorage so it survives same-tab page reloads. */
function saveTokenToSession(connectionId: string, cached: CachedToken): void {
  try {
    sessionStorage.setItem(SESSION_TOKEN_PREFIX + connectionId, JSON.stringify(cached))
  } catch {
    // sessionStorage unavailable — in-memory cache only
  }
}


/**
 * Load a previously persisted token from sessionStorage (if not expired).
 *
 * @return The cached token, or null if absent or expired.
 */
function loadTokenFromSession(connectionId: string): CachedToken | null {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKEN_PREFIX + connectionId)
    if (!raw) {
      return null
    }
    const cached = JSON.parse(raw) as CachedToken
    if (Date.now() >= cached.expiresAt) {
      sessionStorage.removeItem(SESSION_TOKEN_PREFIX + connectionId)
      return null
    }
    return cached
  } catch {
    return null
  }
}


/** Remove token from sessionStorage on disconnect. */
function clearTokenFromSession(connectionId: string): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_PREFIX + connectionId)
  } catch {
    // ignore
  }
}

const SESSION_STATE_KEY = 'gdrive_oauth_state'


/**
 * Generate a cryptographically random state value for CSRF protection.
 *
 * @return A UUID string.
 */
function generateState(): string {
  return crypto.randomUUID()
}


/** Store the expected state in sessionStorage before launching the OAuth popup. */
function saveStateToSession(state: string): void {
  try {
    sessionStorage.setItem(SESSION_STATE_KEY, state)
  } catch {
    // sessionStorage unavailable — state validation will be skipped
  }
}


/**
 * Read and remove the expected state from sessionStorage.
 * Returns null if absent (e.g. sessionStorage unavailable).
 *
 * @return The stored state string, or null.
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

/** @return A unique connection ID */
function generateId(): string {
  idCounter += 1
  return `gdrive-${Date.now()}-${idCounter}`
}


export const googleDriveProvider: ConnectionProvider = {
  id: 'google-drive',
  name: 'Google Drive',
  icon: 'google-drive',

  async connect(hint?: string): Promise<Connection> {
    await loadGisScript()

    const clientId = process.env.GOOGLE_OAUTH2_CLIENT_ID
    if (!clientId) {
      throw new Error('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set')
    }

    debug().log('[GDrive] Starting connect, clientId:', `${clientId.substring(0, 8)}...`)

    return new Promise<Connection>((resolve, reject) => {
      let settled = false
      let gotCallback = false

      // Safety timeout — never let the promise hang forever
      const overallTimeout = setTimeout(() => {
        if (!settled) {
          settled = true
          console.error('[GDrive] Connect timed out after 120s. gotCallback:', gotCallback)
          reject(new Error('Google Drive connection timed out. Please check your GCP OAuth settings and try again.'))
        }
      }, CONNECT_TIMEOUT_MS)

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          clearTimeout(overallTimeout)
          fn()
        }
      }

      const makeConnection = (connectionId: string, email?: string | null): Connection => ({
        id: connectionId,
        providerId: 'google-drive',
        label: email ? `${email} - GDrive` : 'GDrive',
        status: 'connected',
        auth0Connection: 'google-oauth2',
        createdAt: new Date().toISOString(),
        lastRefreshedAt: new Date().toISOString(),
        meta: email ? {email} : {},
      })

      const oauthState = generateState()
      saveStateToSession(oauthState)

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: hint || undefined,
        callback: (response: TokenResponse) => {
          gotCallback = true
          debug().log('[GDrive] OAuth callback received, error:', response.error || 'none')

          if (response.error) {
            consumeStateFromSession()
            settle(() => reject(new Error(
              `Google OAuth error: ${response.error} - ${response.error_description || ''}`,
            )))
            return
          }

          // Verify state to prevent CSRF
          const expectedState = consumeStateFromSession()
          if (expectedState !== null && response.state !== expectedState) {
            settle(() => reject(new Error('OAuth state mismatch — possible CSRF attack')))
            return
          }

          debug().log('[GDrive] Token received, expires_in:', response.expires_in)
          const connectionId = generateId()
          const expiresInMs = (response.expires_in || DEFAULT_TOKEN_EXPIRES_S) * MS_PER_S

          const cached: CachedToken = {token: response.access_token, expiresAt: Date.now() + expiresInMs}
          tokenCache.set(connectionId, cached)
          saveTokenToSession(connectionId, cached)

          // Fetch user email with a 5s timeout — don't let it block connection
          const emailPromise = Promise.race([
            fetchUserEmail(response.access_token),
            new Promise<null>((r) => setTimeout(() => r(null), EMAIL_FETCH_TIMEOUT_MS)),
          ])

          emailPromise
            .then((email) => {
              debug().log('[GDrive] User email:', email || 'unknown')
              settle(() => resolve(makeConnection(connectionId, email)))
            })
            .catch((err) => {
              console.error('[GDrive] fetchUserEmail failed:', err)
              settle(() => resolve(makeConnection(connectionId)))
            })
        },
        error_callback: (error) => {
          debug().log('[GDrive] error_callback:', error.type, error.message, 'gotCallback:', gotCallback)

          // popup_closed fires when the popup window closes. If we already
          // got a successful callback, ignore it. If not, wait briefly to
          // see if the callback arrives (GIS sometimes fires this first).
          if (error.type === 'popup_closed') {
            setTimeout(() => {
              if (!settled && !gotCallback) {
                settle(() => reject(new Error('Google sign-in was cancelled')))
              }
            }, POPUP_CLOSE_DEBOUNCE_MS)
            return
          }
          if (error.type === 'popup_failed_to_open') {
            settle(() => reject(new Error('Please allow pop-ups to sign in with Google.')))
            return
          }
          settle(() => reject(new Error(`Google OAuth error: ${error.type} - ${error.message}`)))
        },
      })

      debug().log('[GDrive] Calling requestAccessToken...')
      client.requestAccessToken({state: oauthState})
    })
  },

  async disconnect(connectionId: string): Promise<void> {
    const cached = tokenCache.get(connectionId)
    if (cached) {
      try {
        await loadGisScript()
        google.accounts.oauth2.revoke(cached.token, () => undefined)
      } catch {
        // Revocation failure is non-critical
      }
      tokenCache.delete(connectionId)
    }
    clearTokenFromSession(connectionId)
  },

  checkStatus(connection: Connection): Promise<ConnectionStatus> {
    const inMemory = tokenCache.get(connection.id)
    if (inMemory) {
      if (Date.now() >= inMemory.expiresAt) {
        return Promise.resolve('expired')
      }
      return Promise.resolve('connected')
    }
    // Fall back to sessionStorage (e.g. after page reload)
    const fromSession = loadTokenFromSession(connection.id)
    if (fromSession) {
      tokenCache.set(connection.id, fromSession)
      return Promise.resolve('connected')
    }
    return Promise.resolve('disconnected')
  },

  async getAccessToken(connection: Connection): Promise<string> {
    const cached = tokenCache.get(connection.id)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token
    }

    // Try sessionStorage before triggering a new OAuth popup (survives same-tab reloads)
    const fromSession = loadTokenFromSession(connection.id)
    if (fromSession) {
      tokenCache.set(connection.id, fromSession)
      return fromSession.token
    }

    // Token expired or missing — re-trigger OAuth flow
    await loadGisScript()

    const clientId = process.env.GOOGLE_OAUTH2_CLIENT_ID
    if (!clientId) {
      throw new Error('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set')
    }

    const oauthState = generateState()
    saveStateToSession(oauthState)

    return new Promise<string>((resolve, reject) => {
      let settled = false

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: (connection.meta.email as string) || undefined,
        callback: (response: TokenResponse) => {
          if (response.error) {
            consumeStateFromSession()
            if (!settled) {
              settled = true
              reject(new Error(`Google OAuth refresh error: ${response.error}`))
            }
            return
          }

          // Verify state to prevent CSRF
          const expectedState = consumeStateFromSession()
          if (expectedState !== null && response.state !== expectedState) {
            if (!settled) {
              settled = true
              reject(new Error('OAuth state mismatch — possible CSRF attack'))
            }
            return
          }

          const expiresInMs = (response.expires_in || DEFAULT_TOKEN_EXPIRES_S) * MS_PER_S
          const refreshed: CachedToken = {token: response.access_token, expiresAt: Date.now() + expiresInMs}
          tokenCache.set(connection.id, refreshed)
          saveTokenToSession(connection.id, refreshed)

          if (!settled) {
            settled = true
            resolve(response.access_token)
          }
        },
        error_callback: (error) => {
          if (error.type === 'popup_closed') {
            return
          }
          if (!settled) {
            settled = true
            reject(new Error(`Google OAuth refresh error: ${error.type} - ${error.message}`))
          }
        },
      })

      // Use empty string prompt to try silent refresh; will show popup if consent needed
      client.requestAccessToken({prompt: '', state: oauthState})
    })
  },
}


/**
 * Fetch the authenticated user's email from Google's userinfo endpoint.
 *
 * @return The user's email or null on failure.
 */
async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {Authorization: `Bearer ${accessToken}`},
    })
    if (!response.ok) {
      return null
    }
    const data = await response.json()
    return data.email || null
  } catch {
    return null
  }
}

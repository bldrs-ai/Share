/**
 * Tests for GitHubProvider.
 *
 * Covers the seams that aren't covered by integration:
 *   - state (CSRF) round-trip through the popup → postMessage hop
 *   - access-token refresh path (success, NeedsReconnectError on failure)
 *   - persisted-token rehydration (cold tab inherits token from localStorage)
 *   - checkStatus mapping for GET /user (200 → connected, 401 → expired)
 */

import {NeedsReconnectError} from '../errors'
import {githubProvider} from './GitHubProvider'


jest.useFakeTimers()


// Whatever fetch sees, we intercept here. Tests redefine its behavior per case.
let fetchMock: jest.Mock
let originalFetch: typeof global.fetch
let originalOpen: typeof window.open
let popup: {closed: boolean; close: jest.Mock}


beforeAll(() => {
  if (!global.crypto?.randomUUID) {
    Object.defineProperty(global, 'crypto', {
      value: {randomUUID: () => 'test-uuid-1234'},
      writable: true,
      configurable: true,
    })
  }
  process.env.GH_OAUTH_CLIENT_ID = 'test-gh-client'
  originalFetch = global.fetch
  originalOpen = window.open
})


afterAll(() => {
  global.fetch = originalFetch
  window.open = originalOpen
})


beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof global.fetch
  popup = {closed: false, close: jest.fn(() => {
    popup.closed = true
  })}
  window.open = jest.fn(() => popup) as unknown as typeof window.open
})


/**
 * Drain the microtask queue so awaited promises inside the provider settle.
 *
 * @return Promise that resolves after pending microtasks.
 */
async function flush(): Promise<void> {
  // A handful of awaits is enough for fetch().then().json().
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}


/**
 * Dispatch a postMessage event to the window from the same origin so the
 * provider's listener accepts it.
 *
 * @param data Payload posted by the callback page.
 */
function postCallback(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', {
    data,
    origin: window.location.origin,
  }))
}


describe('GitHubProvider — connect (CSRF + happy path)', () => {
  it('opens the authorize popup with state, scope, and redirect_uri', async () => {
    const promise = githubProvider.connect().catch(() => null)
    await flush()
    expect(window.open).toHaveBeenCalledTimes(1)
    const url = (window.open as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('https://github.com/login/oauth/authorize')
    expect(url).toContain('client_id=test-gh-client')
    expect(url).toContain('state=test-uuid-1234')
    expect(url).toContain('scope=repo+read%3Auser+read%3Aorg')
    expect(url).toContain(`redirect_uri=${encodeURIComponent(`${window.location.origin}/auth/gh/callback.html`)}`)
    // Settle the dangling connect() so its message listener doesn't leak
    // into the next test (where a postCallback could resolve it with a
    // mismatching state).
    popup.closed = true
    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime(600)
    await promise
  })

  it('rejects when callback state does not match', async () => {
    const promise = githubProvider.connect()
    await flush()
    postCallback({
      type: 'bldrs:gh-oauth-callback',
      code: 'auth-code',
      state: 'wrong-state',
    })
    await expect(promise).rejects.toThrow('OAuth state mismatch')
  })

  it('rejects when popup closes without delivering a message', async () => {
    const promise = githubProvider.connect()
    await flush()
    popup.closed = true
    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime(600)
    await expect(promise).rejects.toThrow('cancelled')
  })

  it('exchanges code for token and resolves a Connection on the happy path', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/.netlify/functions/gh-oauth-exchange') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'gh-access',
            refresh_token: 'gh-refresh',
            expires_in: 28800,
            refresh_token_expires_in: 15552000,
            scope: 'repo,read:user,read:org',
            token_type: 'bearer',
          }),
        })
      }
      if (url === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({login: 'octocat', avatar_url: 'a', name: 'O'}),
        })
      }
      return Promise.resolve({ok: false, status: 404, text: () => Promise.resolve('')})
    })

    const promise = githubProvider.connect()
    await flush()
    postCallback({
      type: 'bldrs:gh-oauth-callback',
      code: 'auth-code',
      state: 'test-uuid-1234',
    })

    const conn = await promise
    expect(conn.providerId).toBe('github')
    expect(conn.status).toBe('connected')
    expect(conn.label).toContain('octocat')
    expect(conn.meta).toMatchObject({login: 'octocat'})
    expect(localStorage.getItem(`bldrs:github-token:${conn.id}`)).toBeTruthy()
  })
})


describe('GitHubProvider — getAccessToken refresh path', () => {
  const SECONDS_PER_HOUR = 3600
  const DEFAULT_ACCESS_TTL_S = 28800
  const REFRESH_TTL_S = 15552000

  /**
   * Drive connect() through to a saved Connection so refresh tests have a
   * realistic starting state.
   *
   * @return The completed Connection.
   */
  async function mintConnection(): Promise<Awaited<ReturnType<typeof githubProvider.connect>>> {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/.netlify/functions/gh-oauth-exchange') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'first-access',
            refresh_token: 'first-refresh',
            expires_in: DEFAULT_ACCESS_TTL_S,
            refresh_token_expires_in: REFRESH_TTL_S,
            scope: 'repo',
          }),
        })
      }
      if (url === 'https://api.github.com/user') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({login: 'octocat'}),
        })
      }
      return Promise.resolve({ok: false, status: 404, text: () => Promise.resolve('')})
    })
    const promise = githubProvider.connect()
    await flush()
    postCallback({
      type: 'bldrs:gh-oauth-callback',
      code: 'auth-code',
      state: 'test-uuid-1234',
    })
    return promise
  }

  it('returns the cached access token while it is fresh', async () => {
    const conn = await mintConnection()
    fetchMock.mockClear()
    const tok = await githubProvider.getAccessToken(conn)
    expect(tok).toBe('first-access')
    // Fresh token — no network round-trip
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hits the refresh function when the access token is past expiry', async () => {
    const conn = await mintConnection()
    fetchMock.mockClear()

    // Fast-forward past the 8h access TTL (but not the 6mo refresh TTL).
    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime((DEFAULT_ACCESS_TTL_S + 60) * 1000)

    fetchMock.mockImplementation((url: string) => {
      if (url === '/.netlify/functions/gh-oauth-refresh') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'second-access',
            refresh_token: 'second-refresh',
            expires_in: DEFAULT_ACCESS_TTL_S,
            refresh_token_expires_in: REFRESH_TTL_S,
            scope: 'repo',
          }),
        })
      }
      return Promise.resolve({ok: false, status: 404, text: () => Promise.resolve('')})
    })

    const tok = await githubProvider.getAccessToken(conn)
    expect(tok).toBe('second-access')
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/gh-oauth-refresh',
      expect.objectContaining({method: 'POST'}),
    )
  })

  it('throws NeedsReconnectError and clears storage when refresh fails', async () => {
    const conn = await mintConnection()
    fetchMock.mockClear()

    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime((DEFAULT_ACCESS_TTL_S + 60) * 1000)

    fetchMock.mockImplementation(() => Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"bad_refresh_token"}'),
    }))

    await expect(githubProvider.getAccessToken(conn)).rejects.toBeInstanceOf(NeedsReconnectError)
    // Stale credentials wiped so the UI doesn't loop on the same bad token
    expect(localStorage.getItem(`bldrs:github-token:${conn.id}`)).toBeNull()
  })

  it('throws NeedsReconnectError when no token is persisted for the connection', async () => {
    const orphan = {
      id: 'github-never-connected',
      providerId: 'github' as const,
      label: 'x',
      status: 'disconnected' as const,
      createdAt: new Date().toISOString(),
      meta: {},
    }
    await expect(githubProvider.getAccessToken(orphan)).rejects.toBeInstanceOf(NeedsReconnectError)
  })

  it('rehydrates a token persisted in localStorage from a prior tab', async () => {
    const id = 'github-cold-tab'
    const stored = {
      accessToken: 'persisted-access',
      refreshToken: 'persisted-refresh',
      // eslint-disable-next-line no-magic-numbers
      accessExpiresAt: Date.now() + (SECONDS_PER_HOUR * 1000),
      // eslint-disable-next-line no-magic-numbers
      refreshExpiresAt: Date.now() + (REFRESH_TTL_S * 1000),
      scope: 'repo',
    }
    localStorage.setItem(`bldrs:github-token:${id}`, JSON.stringify(stored))

    const tok = await githubProvider.getAccessToken({
      id,
      providerId: 'github',
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(tok).toBe('persisted-access')
  })
})


describe('GitHubProvider — checkStatus', () => {
  it('returns disconnected when no token is persisted', async () => {
    const status = await githubProvider.checkStatus({
      id: 'never-connected',
      providerId: 'github',
      label: 'x',
      status: 'disconnected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(status).toBe('disconnected')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns connected when /user replies 200', async () => {
    const id = 'github-active'
    localStorage.setItem(`bldrs:github-token:${id}`, JSON.stringify({
      accessToken: 't',
      refreshToken: 'r',
      // eslint-disable-next-line no-magic-numbers
      accessExpiresAt: Date.now() + 3600_000,
      // eslint-disable-next-line no-magic-numbers
      refreshExpiresAt: Date.now() + 86_400_000,
      scope: 'repo',
    }))
    fetchMock.mockResolvedValue({ok: true, json: () => Promise.resolve({login: 'o'})})
    const status = await githubProvider.checkStatus({
      id,
      providerId: 'github',
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(status).toBe('connected')
  })

  it('returns expired when /user replies 401', async () => {
    const id = 'github-revoked'
    localStorage.setItem(`bldrs:github-token:${id}`, JSON.stringify({
      accessToken: 't',
      refreshToken: 'r',
      // eslint-disable-next-line no-magic-numbers
      accessExpiresAt: Date.now() + 3600_000,
      // eslint-disable-next-line no-magic-numbers
      refreshExpiresAt: Date.now() + 86_400_000,
      scope: 'repo',
    }))
    fetchMock.mockResolvedValue({ok: false, status: 401})
    const status = await githubProvider.checkStatus({
      id,
      providerId: 'github',
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(status).toBe('expired')
  })

  it('returns disconnected when the persisted refresh token has elapsed', async () => {
    // loadToken proactively wipes records whose refresh has elapsed —
    // there's no recovery path without a fresh popup. SourcesTab routes the
    // user to a Reconnect prompt by checking that the Connection still
    // exists in `bldrs:connections` while the provider reports
    // disconnected. Mirrors GoogleDriveProvider's behaviour.
    const id = 'github-refresh-expired'
    localStorage.setItem(`bldrs:github-token:${id}`, JSON.stringify({
      accessToken: 't',
      refreshToken: 'r',
      // eslint-disable-next-line no-magic-numbers
      accessExpiresAt: Date.now() + 3600_000,
      // already past
      refreshExpiresAt: Date.now() - 1,
      scope: 'repo',
    }))
    const status = await githubProvider.checkStatus({
      id,
      providerId: 'github',
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(status).toBe('disconnected')
    // The wiped entry stays wiped on disk
    expect(localStorage.getItem(`bldrs:github-token:${id}`)).toBeNull()
  })
})


describe('GitHubProvider — disconnect', () => {
  it('removes the persisted token', async () => {
    const id = 'gh-to-disconnect'
    localStorage.setItem(`bldrs:github-token:${id}`, JSON.stringify({
      accessToken: 't',
      refreshToken: 'r',
      // eslint-disable-next-line no-magic-numbers
      accessExpiresAt: Date.now() + 3600_000,
      // eslint-disable-next-line no-magic-numbers
      refreshExpiresAt: Date.now() + 86_400_000,
      scope: 'repo',
    }))
    await githubProvider.disconnect(id)
    expect(localStorage.getItem(`bldrs:github-token:${id}`)).toBeNull()
  })
})

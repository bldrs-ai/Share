/**
 * Tests for GoogleDriveProvider, focused on OAuth state (CSRF) verification.
 */

import {googleDriveProvider} from './GoogleDriveProvider'


jest.mock('./loadGisScript', () => ({
  loadGisScript: jest.fn().mockResolvedValue(undefined),
}))

jest.useFakeTimers()


let capturedCallback: ((response: Record<string, unknown>) => void) | null = null
const mockRequestAccessToken = jest.fn()

let originalFetch: typeof global.fetch

beforeAll(() => {
  Object.defineProperty(global, 'google', {
    value: {
      accounts: {
        oauth2: {
          initTokenClient: jest.fn((config) => {
            capturedCallback = config.callback
            return {requestAccessToken: mockRequestAccessToken}
          }),
          revoke: jest.fn(),
        },
      },
    },
    writable: true,
    configurable: true,
  })

  if (!global.crypto?.randomUUID) {
    Object.defineProperty(global, 'crypto', {
      value: {randomUUID: () => 'test-uuid-1234'},
      writable: true,
      configurable: true,
    })
  }

  // Resolve email fetch immediately with null (not found)
  originalFetch = global.fetch
  global.fetch = jest.fn().mockResolvedValue({ok: false})

  process.env.GOOGLE_OAUTH2_CLIENT_ID = 'test-client-id'
})

afterAll(() => {
  global.fetch = originalFetch
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete global.google
})

beforeEach(() => {
  jest.clearAllMocks()
  capturedCallback = null
  sessionStorage.clear()
})


/**
 * Flush the microtask queue so awaited promises inside the provider resolve.
 *
 * @return Promise that resolves after pending microtasks drain.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}


describe('GoogleDriveProvider — OAuth state (CSRF protection)', () => {
  it('passes state to requestAccessToken in connect()', async () => {
    googleDriveProvider.connect()
    await flushMicrotasks()
    expect(mockRequestAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({state: expect.any(String)}),
    )
  })

  it('rejects connect() when response state does not match', async () => {
    const connectPromise = googleDriveProvider.connect()
    await flushMicrotasks()

    capturedCallback?.({
      access_token: 'tok',
      expires_in: 3600,
      scope: 'drive.file',
      token_type: 'Bearer',
      state: 'wrong-state',
    })

    await expect(connectPromise).rejects.toThrow('OAuth state mismatch')
  })

  it('resolves connect() when response state matches', async () => {
    const connectPromise = googleDriveProvider.connect()
    await flushMicrotasks()

    capturedCallback?.({
      access_token: 'tok',
      expires_in: 3600,
      scope: 'drive.file',
      token_type: 'Bearer',
      state: 'test-uuid-1234',
    })

    // Advance past the 5s email-fetch race timeout (but not the 120s connect timeout)
    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime(6_000)
    await flushMicrotasks()

    await expect(connectPromise).resolves.toMatchObject({
      providerId: 'google-drive',
      status: 'connected',
    })
  })

  it('does not reject when state is absent from response (sessionStorage unavailable)', async () => {
    const connectPromise = googleDriveProvider.connect()
    await flushMicrotasks()

    // Clear stored state to simulate unavailable sessionStorage
    sessionStorage.clear()

    capturedCallback?.({
      access_token: 'tok',
      expires_in: 3600,
      scope: 'drive.file',
      token_type: 'Bearer',
      // no state in response — expectedState is null, validation skipped
    })

    // eslint-disable-next-line no-magic-numbers
    jest.advanceTimersByTime(6_000)
    await flushMicrotasks()

    await expect(connectPromise).resolves.toMatchObject({providerId: 'google-drive'})
  })
})


/**
 * Mint a connection (and seed the in-memory token cache) by driving connect()
 * to completion via the captured GIS callback.
 *
 * @return The completed Connection with a known access_token.
 */
async function mintConnection(): Promise<{id: string; providerId: string}> {
  const connectPromise = googleDriveProvider.connect()
  await flushMicrotasks()
  capturedCallback?.({
    access_token: 'live-token',

    expires_in: 3600,
    scope: 'drive.file',
    token_type: 'Bearer',
    state: 'test-uuid-1234',
  })
  // eslint-disable-next-line no-magic-numbers
  jest.advanceTimersByTime(6_000)
  await flushMicrotasks()
  return await connectPromise as {id: string; providerId: string}
}


describe('GoogleDriveProvider — checkStatus tokeninfo validation', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof global.fetch
  })

  it('returns \'disconnected\' when no token is cached', async () => {
    const status = await googleDriveProvider.checkStatus({
      id: 'never-connected',
      providerId: 'google-drive',
      label: 'x',
      status: 'disconnected',
      createdAt: new Date().toISOString(),
      meta: {},
    })
    expect(status).toBe('disconnected')
    // tokeninfo must not be called when there's no token to validate
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns \'connected\' when tokeninfo replies 200', async () => {
    fetchMock.mockResolvedValueOnce({ok: false}) // userinfo fetch during connect
    const conn = await mintConnection()

    fetchMock.mockResolvedValueOnce({ok: true, status: 200})
    const status = await googleDriveProvider.checkStatus({
      ...conn,
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    } as Parameters<typeof googleDriveProvider.checkStatus>[0])

    expect(status).toBe('connected')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('oauth2.googleapis.com/tokeninfo'))
  })

  it('returns \'expired\' when tokeninfo replies 400 (server-revoked token)', async () => {
    fetchMock.mockResolvedValueOnce({ok: false}) // userinfo
    const conn = await mintConnection()

    fetchMock.mockResolvedValueOnce({ok: false, status: 400})
    const status = await googleDriveProvider.checkStatus({
      ...conn,
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    } as Parameters<typeof googleDriveProvider.checkStatus>[0])

    expect(status).toBe('expired')
  })

  it('treats network errors as healthy (\'connected\') so offline doesn\'t poison the cache', async () => {
    fetchMock.mockResolvedValueOnce({ok: false}) // userinfo
    const conn = await mintConnection()

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const status = await googleDriveProvider.checkStatus({
      ...conn,
      label: 'x',
      status: 'connected',
      createdAt: new Date().toISOString(),
      meta: {},
    } as Parameters<typeof googleDriveProvider.checkStatus>[0])

    expect(status).toBe('connected')
  })
})

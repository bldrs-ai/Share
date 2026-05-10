import {
  getAuth0AccessToken,
  registerAuth0AccessTokenFetcher,
} from './auth0Bridge'


describe('auth0Bridge', () => {
  // Module-level state — clear between cases so a stray registration in one
  // test can't leak into the next.
  afterEach(() => {
    registerAuth0AccessTokenFetcher(null)
  })

  it('returns the token from a registered fetcher', async () => {
    registerAuth0AccessTokenFetcher(() => Promise.resolve('mock-access-token'))
    const token = await getAuth0AccessToken()
    expect(token).toBe('mock-access-token')
  })

  it('returns null when no fetcher is registered', async () => {
    // No registration in this case — afterEach clears any prior state.
    const token = await getAuth0AccessToken()
    expect(token).toBeNull()
  })

  it('returns null when the registered fetcher rejects', async () => {
    registerAuth0AccessTokenFetcher(() => Promise.reject(new Error('not signed in')))
    const token = await getAuth0AccessToken()
    expect(token).toBeNull()
  })

  it('replaces a previously-registered fetcher', async () => {
    registerAuth0AccessTokenFetcher(() => Promise.resolve('first'))
    registerAuth0AccessTokenFetcher(() => Promise.resolve('second'))
    const token = await getAuth0AccessToken()
    expect(token).toBe('second')
  })

  it('clears the fetcher when called with null', async () => {
    registerAuth0AccessTokenFetcher(() => Promise.resolve('still-here'))
    registerAuth0AccessTokenFetcher(null)
    const token = await getAuth0AccessToken()
    expect(token).toBeNull()
  })
})

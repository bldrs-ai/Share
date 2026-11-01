import {webcrypto} from 'node:crypto'
import {Auth0Client} from '@auth0/auth0-spa-js'
import {mockLogout, mockLogoutUrl} from './mockLogout'


const DOMAIN = 'https://bldrs.us.auth0.com.jest'
const CLIENT_ID = 'testaudiencejest'


/**
 * The URL the real, pinned auth0-spa-js would navigate to for `options`,
 * caught through its own `openUrl` hook, minus the telemetry param the mock
 * leaves out.
 *
 * @param {object} options LogoutOptions without openUrl
 * @return {Promise<URL>}
 */
async function realLogoutUrl(options) {
  const client = new Auth0Client({domain: DOMAIN, clientId: CLIENT_ID})
  let opened = null
  await client.logout({...options, openUrl: (url) => {
    opened = url
  }})
  const url = new URL(opened)
  url.searchParams.delete('auth0Client')
  return url
}


/**
 * @param {object} options
 * @return {{dispatchLogout: Function, clearSession: Function, assign: Function}} the spies
 */
function runMock(options) {
  const deps = {
    domain: DOMAIN,
    clientId: CLIENT_ID,
    clearSession: jest.fn(),
    dispatchLogout: jest.fn(),
    assign: jest.fn(),
  }
  return mockLogout(options, deps).then(() => deps)
}


describe('Auth0/mockLogout', () => {
  // Auth0Client's constructor refuses to run without SubtleCrypto (its
  // validateCrypto), which jsdom lacks; Node's is the same Web Crypto API.
  let originalCrypto
  beforeAll(() => {
    originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto')
    Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
  })
  afterAll(() => {
    Object.defineProperty(window, 'crypto', originalCrypto)
  })

  // The parity anchor: if the pinned SDK changes how it reads these options,
  // the mock the E2E specs run against has to change with it.
  describe('builds the same /v2/logout URL as the pinned auth0-spa-js', () => {
    it.each([
      ['logoutParams.returnTo', {logoutParams: {returnTo: 'https://share.example'}}],
      ['a v1-style top-level returnTo, which both drop', {returnTo: 'https://share.example'}],
      ['federated', {logoutParams: {returnTo: 'https://share.example', federated: true}}],
      ['no options', {}],
    ])('%s', async (_, options) => {
      const real = await realLogoutUrl(options)
      const mock = new URL(mockLogoutUrl({domain: DOMAIN, clientId: CLIENT_ID, ...options}))
      expect(mock.origin + mock.pathname).toBe(real.origin + real.pathname)
      // As parsed entries, so the SDK's bare `&federated` and its telemetry
      // param's removal don't turn into spelling differences.
      expect([...mock.searchParams].sort()).toEqual([...real.searchParams].sort())
    })

    it('really does drop a top-level returnTo (the Share#1923 bug)', async () => {
      const real = await realLogoutUrl({returnTo: 'https://share.example'})
      expect(real.searchParams.get('returnTo')).toBeNull()
      expect(real.searchParams.get('client_id')).toBe(CLIENT_ID)
    })
  })

  it('without openUrl, navigates to /v2/logout and does not sign out in place', async () => {
    const deps = await runMock({logoutParams: {returnTo: 'https://share.example'}})
    expect(deps.clearSession).toHaveBeenCalledTimes(1)
    expect(deps.assign).toHaveBeenCalledTimes(1)
    const url = new URL(deps.assign.mock.calls[0][0])
    expect(url.pathname).toBe('/v2/logout')
    expect(url.searchParams.get('returnTo')).toBe('https://share.example')
    expect(deps.dispatchLogout).not.toHaveBeenCalled()
  })

  it('with openUrl false, signs out in place and does not navigate', async () => {
    const deps = await runMock({openUrl: false})
    expect(deps.clearSession).toHaveBeenCalledTimes(1)
    expect(deps.assign).not.toHaveBeenCalled()
    expect(deps.dispatchLogout).toHaveBeenCalledTimes(1)
  })

  it('with an openUrl function, hands it the URL instead of navigating', async () => {
    const openUrl = jest.fn()
    const deps = await runMock({openUrl, logoutParams: {returnTo: 'https://share.example'}})
    expect(openUrl).toHaveBeenCalledTimes(1)
    expect(new URL(openUrl.mock.calls[0][0]).searchParams.get('returnTo')).toBe('https://share.example')
    expect(deps.assign).not.toHaveBeenCalled()
    expect(deps.dispatchLogout).toHaveBeenCalledTimes(1)
  })
})

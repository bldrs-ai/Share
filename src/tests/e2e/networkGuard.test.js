import {isBlockedRealNetworkHost} from './networkGuard'


/**
 * The hermeticity guard's decision, which is the difference between a
 * measurement run and a `waitForModelReady` timeout that looks like a slow
 * model. `blockExternalNetwork` wraps this in a `context.route`; the
 * decision itself is what is worth pinning.
 */
describe('isBlockedRealNetworkHost', () => {
  it('blocks the real-data hosts by default', () => {
    expect(isBlockedRealNetworkHost('raw.githubusercontent.com')).toBe(true)
    expect(isBlockedRealNetworkHost('media.githubusercontent.com')).toBe(true)
    expect(isBlockedRealNetworkHost('api.github.com')).toBe(true)
  })

  it('allows a host the caller deliberately requested', () => {
    // The load-measurement harness pointed at a corpus model on GitHub. The
    // request is the point of the run, not a leak from a broken mock.
    expect(isBlockedRealNetworkHost(
      'raw.githubusercontent.com', ['raw.githubusercontent.com'])).toBe(false)
  })

  it('allows only that host, not its siblings', () => {
    // The allow must not become "this suite may talk to GitHub": naming the
    // raw host leaves the Contents API — where a broken mock would hide —
    // blocked exactly as before.
    const allow = ['raw.githubusercontent.com']
    expect(isBlockedRealNetworkHost('api.github.com', allow)).toBe(true)
    expect(isBlockedRealNetworkHost('media.githubusercontent.com', allow)).toBe(true)
    expect(isBlockedRealNetworkHost('github.com', allow)).toBe(true)
  })

  it('leaves hosts nobody denies alone, allowed or not', () => {
    expect(isBlockedRealNetworkHost('localhost')).toBe(false)
    expect(isBlockedRealNetworkHost('api.github.com.pw')).toBe(false)
  })
})

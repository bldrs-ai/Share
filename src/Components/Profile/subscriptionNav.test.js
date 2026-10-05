import Cookies from 'js-cookie'
import {_resetGaClientIdForTests, setGaClientId} from '../../privacy/analytics'
import {goToSubscription} from './subscriptionNav'


jest.mock('@sentry/react', () => ({captureException: jest.fn(), setTag: jest.fn()}))


describe('goToSubscription', () => {
  const originalLocation = window.location

  beforeEach(() => {
    _resetGaClientIdForTests()
    Cookies.remove('_ga')
    window.gtag = jest.fn()
    // jsdom can't navigate; a plain object lets the checkout branch assign
    // href and the test read it back.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...originalLocation, hostname: 'localhost', href: 'http://localhost/'},
    })
  })

  afterEach(() => {
    delete window.gtag
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    jest.restoreAllMocks()
  })

  /** @return {Array} the gtag 'event' calls made so far */
  function gtagEvents() {
    return window.gtag.mock.calls.filter(([kind]) => kind === 'event')
  }

  it('emits begin_checkout once, naming the entry point, with open_cid', async () => {
    setGaClientId('111.222')
    await goToSubscription({
      stripeCustomerId: null,
      userEmail: 'a+b@c.d',
      isDay: true,
      getAccessTokenSilently: jest.fn(),
      from: 'quota',
    })
    expect(gtagEvents()).toEqual([[
      'event',
      'begin_checkout',
      {from: 'quota', destination: 'checkout', transport_type: 'beacon', open_cid: 'cid.111.222'},
    ]])
    // The email is encoded, so the subscribe page's URLSearchParams reads
    // back the `+` rather than a space.
    expect(window.location.href).toBe('/subscribe/?theme=light&userEmail=a%2Bb%40c.d')
  })

  it('reports a known Stripe customer as a portal destination', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({json: () => Promise.resolve({url: 'https://portal'})})
    await goToSubscription({
      stripeCustomerId: 'cus_1',
      userEmail: 'a@b.c',
      isDay: false,
      getAccessTokenSilently: jest.fn().mockResolvedValue('tok'),
      from: 'profile',
    })
    expect(gtagEvents()).toEqual([[
      'event', 'begin_checkout', {from: 'profile', destination: 'portal', transport_type: 'beacon'},
    ]])
    expect(window.location.href).toBe('https://portal')
  })

  it('labels a caller that did not name itself as unknown', async () => {
    await goToSubscription({stripeCustomerId: null, userEmail: '', isDay: true, getAccessTokenSilently: jest.fn()})
    expect(gtagEvents()[0][2]).toEqual(expect.objectContaining({from: 'unknown'}))
  })
})

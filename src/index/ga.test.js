import Cookies from 'js-cookie'
import {captureException} from '@sentry/react'
import {_resetGaClientIdForTests, getGaClientId} from '../privacy/analytics'
import setupGa, {GA_MEASUREMENT_ID, shouldInitGa} from './ga'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


/** @return {HTMLScriptElement|null} the injected gtag/js tag, if any */
function findGtagScript() {
  return document.head.querySelector(`script[src*="${GA_MEASUREMENT_ID}"]`)
}


beforeEach(() => {
  jest.clearAllMocks()
  _resetGaClientIdForTests()
  // getGaClientId falls back to this cookie; clear it so the assertions
  // below see only what setupGa's callback provides.
  Cookies.remove('_ga')
  document.head.querySelectorAll('script').forEach((s) => s.remove())
  // Mirror the inline bootstrap index.html declares before the bundle.
  window.dataLayer = []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
})


describe('shouldInitGa', () => {
  test('true only on prod hosts', () => {
    expect(shouldInitGa({hostname: 'bldrs.ai', isWebdriver: false})).toBe(true)
    expect(shouldInitGa({hostname: 'www.bldrs.ai', isWebdriver: false})).toBe(true)
    expect(shouldInitGa({hostname: 'localhost', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'bldrs-share-dev.netlify.app', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'deploy-preview-1741--bldrs-share-prod.netlify.app', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'bldrs-ai.github.io', isWebdriver: false})).toBe(false)
  })

  test('false under automation even on prod', () => {
    expect(shouldInitGa({hostname: 'bldrs.ai', isWebdriver: true})).toBe(false)
  })
})


describe('setupGa', () => {
  test('does not inject the loader off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(findGtagScript()).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  test('injects the async gtag/js loader on prod', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    const script = findGtagScript()
    expect(script).not.toBeNull()
    expect(script.async).toBe(true)
    expect(script.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`)
    expect(captureException).not.toHaveBeenCalled()
  })

  test('reports a load failure to Sentry, tagged ga_init', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    findGtagScript().onerror()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('ga_init: gtag/js failed to load')}),
      {tags: {subsystem: 'ga_init'}},
    )
  })

  // GA4 has no user-id dimension, so the client id ships as an event
  // param; the callback only resolves once gtag/js actually loads.
  test('requests the GA client id and records it for model-open events', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    const getCall = window.dataLayer.find((entry) => entry?.[0] === 'get')
    expect(getCall).toBeDefined()
    expect(getCall[1]).toBe(GA_MEASUREMENT_ID)
    expect(getCall[2]).toBe('client_id')
    expect(getGaClientId()).toBeNull()
    getCall[3]('1234567890.0987654321')
    expect(getGaClientId()).toBe('1234567890.0987654321')
  })

  // Set at BOTH points on purpose: user properties only attach to events
  // sent after they are set, so a returning visitor's early events —
  // including their first model open — would otherwise miss it.
  test('publishes the client id as a user property before and after the callback', () => {
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    const setCalls = window.dataLayer.filter((entry) => entry?.[0] === 'set')
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0][1]).toBe('user_properties')
    expect(setCalls[0][2]).toEqual({open_cid: 'cid.1234567890.0987654321'})

    const getCall = window.dataLayer.find((entry) => entry?.[0] === 'get')
    getCall[3]('1234567890.0987654321')
    expect(window.dataLayer.filter((entry) => entry?.[0] === 'set')).toHaveLength(2)
  })

  // A first-ever visitor has no cookie, so the setup-time call finds
  // nothing; the callback is the only path that publishes for them.
  test('publishes the user property for a first visit, once the callback lands', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    expect(window.dataLayer.filter((entry) => entry?.[0] === 'set')).toHaveLength(0)

    const getCall = window.dataLayer.find((entry) => entry?.[0] === 'get')
    getCall[3]('1234567890.0987654321')
    const setCalls = window.dataLayer.filter((entry) => entry?.[0] === 'set')
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0][2]).toEqual({open_cid: 'cid.1234567890.0987654321'})
  })

  test('does not publish the user property off-prod', () => {
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(window.dataLayer.filter((entry) => entry?.[0] === 'set')).toHaveLength(0)
  })


  test('does not request a client id off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(window.dataLayer.find((entry) => entry?.[0] === 'get')).toBeUndefined()
  })

  test('reports a missing inline bootstrap to Sentry without throwing', () => {
    delete window.gtag
    expect(() => setupGa({hostname: 'bldrs.ai', isWebdriver: false})).not.toThrow()
    expect(findGtagScript()).toBeNull()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('ga_init: gtag bootstrap missing')}),
      {tags: {subsystem: 'ga_init'}},
    )
  })
})

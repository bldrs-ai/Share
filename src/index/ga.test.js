import Cookies from 'js-cookie'
import {captureException, setTag} from '@sentry/react'
import {_resetGaClientIdForTests, getGaClientId, setIsAllowed} from '../privacy/analytics'
import setupGa, {GA_MEASUREMENT_ID, shouldInitGa} from './ga'


jest.mock('@sentry/react', () => ({captureException: jest.fn(), setTag: jest.fn()}))


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
  Cookies.remove('isAnalyticsAllowed')
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

  test('allows an opted-in deploy preview without enabling other Netlify deploys', () => {
    const preview = 'deploy-preview-1741--bldrs-share-prod.netlify.app'
    expect(shouldInitGa({hostname: preview, isWebdriver: false, enableInPreview: true})).toBe(true)
    expect(shouldInitGa({hostname: preview, isWebdriver: true, enableInPreview: true})).toBe(false)
    expect(shouldInitGa({
      hostname: 'bldrs-share-dev.netlify.app',
      isWebdriver: false,
      enableInPreview: true,
    })).toBe(false)
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

  test('logs preview smoke-test activation before injecting the loader', () => {
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {})
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    setupGa({
      hostname: 'deploy-preview-1757--bldrs-share-dev.netlify.app',
      isWebdriver: false,
      enableInPreview: true,
    })
    expect(findGtagScript()).not.toBeNull()
    expect(consoleInfo).toHaveBeenCalledWith(
      '[ga] preview smoke test enabled; browser privacy tools may still block GA requests')
    findGtagScript().onerror()
    expect(consoleWarn).toHaveBeenCalledWith(
      '[ga] gtag/js was blocked; allow googletagmanager.com and reload to send events')
    consoleInfo.mockRestore()
    consoleWarn.mockRestore()
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

  // Scoped to setupGa: index.html's inline stub publishes it on every host,
  // which is harmless off-prod because ga.js never loads gtag/js there, so
  // the queued entry has nowhere to go.
  test('setupGa does not publish the user property off-prod', () => {
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(window.dataLayer.filter((entry) => entry?.[0] === 'set')).toHaveLength(0)
  })


  test('does not request a client id off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(window.dataLayer.find((entry) => entry?.[0] === 'get')).toBeUndefined()
  })

  // The bizdev dashboard links each noisy model-open chip to a Sentry
  // search on this tag, so nothing matched before it was sent (#1767).
  describe('open_cid Sentry tag', () => {
    afterEach(() => {
      Cookies.remove('isAnalyticsAllowed')
    })

    // Set from the cookie at setup so a load-failure exception thrown
    // before gtag/js resolves still carries the tag.
    test('tags from the _ga cookie at setup, for a returning visitor', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})
      expect(setTag).toHaveBeenCalledWith('open_cid', '1234567890.0987654321')
    })

    // Bare: the cid. prefix exists only to stop GA4 typing the id as a
    // float, and the dashboard strips it before building the query.
    test('sends the bare id, without the GA cid. prefix', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})
      const values = setTag.mock.calls.map(([, value]) => value)
      expect(values).not.toContain('cid.1234567890.0987654321')
    })

    // A first-ever visitor has no cookie; the callback is their only
    // path. The setup-time sync still runs — it just has no id to
    // publish, which is the same undefined a retraction writes.
    test('tags from the gtag callback for a first visit', () => {
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})
      expect(setTag).toHaveBeenLastCalledWith('open_cid', undefined)

      window.dataLayer.find((entry) => entry?.[0] === 'get')[3]('1234567890.0987654321')
      expect(setTag).toHaveBeenLastCalledWith('open_cid', '1234567890.0987654321')
    })

    test('does not tag off-prod, where GA never initializes', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'localhost', isWebdriver: false})
      expect(setTag).not.toHaveBeenCalled()
    })

    // undefined is what removes a tag — Sentry drops undefined keys when
    // it merges scope tags onto an event.
    test('sends no id when analytics consent is withheld', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setIsAllowed(false)
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})
      window.dataLayer.find((entry) => entry?.[0] === 'get')[3]('1234567890.0987654321')
      const values = setTag.mock.calls.filter(([key]) => key === 'open_cid').map(([, value]) => value)
      expect(values.every((value) => value === undefined)).toBe(true)
    })

    // Codex review on #1770: gating only the *set* left a previously
    // published id on Sentry's global scope for the rest of the page's
    // life, so withdrawal has to clear it — and an event's own tags
    // merge over the global scope, so even a deliberately cid-less
    // diagnostics event would have inherited the stale one.
    test('retracts an already-published tag when consent is withdrawn', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})
      expect(setTag).toHaveBeenCalledWith('open_cid', '1234567890.0987654321')

      setIsAllowed(false)
      expect(setTag).toHaveBeenLastCalledWith('open_cid', undefined)
    })

    test('republishes the tag when consent is granted again', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setIsAllowed(false)
      setupGa({hostname: 'bldrs.ai', isWebdriver: false})

      setIsAllowed(true)
      expect(setTag).toHaveBeenLastCalledWith('open_cid', '1234567890.0987654321')
    })
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

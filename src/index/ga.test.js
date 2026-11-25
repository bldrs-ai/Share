import Cookies from 'js-cookie'
import {captureException, setTag} from '@sentry/react'
import {_resetGaClientIdForTests, getGaClientId, setIsAllowed} from '../privacy/analytics'
import {reportClientCapability} from '../privacy/clientCapabilities'
import setupGa, {
  CONSENT_DEFAULT,
  CONSENT_GRANTED,
  GA_CONFIG,
  GA_MEASUREMENT_ID,
  deleteGoogleCookies,
  IS_BROWSER_GA_ON,
  shouldInitGa,
} from './ga'


jest.mock('@sentry/react', () => ({captureException: jest.fn(), setTag: jest.fn()}))
jest.mock('../privacy/clientCapabilities', () => ({reportClientCapability: jest.fn()}))


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
  Cookies.set('consentLevel', '1.functional')
  document.head.querySelectorAll('script').forEach((s) => s.remove())
  // Mirror the inline bootstrap index.html declares before the bundle.
  window.dataLayer = []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
})


describe('shouldInitGa', () => {
  test('true only on prod hosts', () => {
    expect(shouldInitGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})).toBe(true)
    expect(shouldInitGa({hostname: 'www.bldrs.ai', isWebdriver: false})).toBe(true)
    expect(shouldInitGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})).toBe(false)
    expect(shouldInitGa({hostname: 'bldrs-share-prod.netlify.app', isWebdriver: false})).toBe(false)
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
      hostname: 'main--bldrs-share-prod.netlify.app',
      isWebdriver: false,
      enableInPreview: true,
    })).toBe(false)
  })

  // A fork's Netlify site gets the same deploy-preview-N-- hostname shape;
  // only bldrs' own project may opt into the production property.
  test('does not let another Netlify project\'s deploy preview opt in', () => {
    expect(shouldInitGa({
      hostname: 'deploy-preview-12--some-fork-of-share.netlify.app',
      isWebdriver: false,
      enableInPreview: true,
    })).toBe(false)
    expect(shouldInitGa({
      hostname: 'deploy-preview-12--bldrs-share-prod.netlify.app.example.com',
      isWebdriver: false,
      enableInPreview: true,
    })).toBe(false)
  })

  // The kinds of non-production host a copy of the app runs on (local dev
  // and CI, the dev domain, GitHub Pages, a self-hosted domain or a bare
  // IP), plus lookalikes of the prod hostnames.
  test.each([
    'localhost',
    '127.0.0.1',
    '203.0.113.7',
    'bldrs.dev',
    'someone.github.io',
    'share.example.com',
    'bldrs.ai.example.com',
    'notbldrs.ai',
    'bldrs.ai.',
  ])('false on non-production host %s', (hostname) => {
    expect(shouldInitGa({hostname, isWebdriver: false, enableInPreview: true})).toBe(false)
  })
})


describe('setupGa', () => {
  test('does not inject the loader off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})
    expect(findGtagScript()).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  test('injects the async gtag/js loader on prod', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
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
      hostname: 'deploy-preview-1757--bldrs-share-prod.netlify.app',
      isWebdriver: false,
      enableInPreview: true,
      isBrowserGaOn: true,
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

  // A blocked client is expected, not a defect (AGENTS.md, Reported
  // Conditions): counted as a client-capability report, not a Sentry event.
  test('reports a load failure as a ga_blocked capability report, not to Sentry', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
    expect(reportClientCapability).not.toHaveBeenCalled()
    findGtagScript().onerror()
    expect(reportClientCapability).toHaveBeenCalledWith('ga_blocked')
    expect(captureException).not.toHaveBeenCalled()
  })

  // GA4 has no user-id dimension, so the client id ships as an event
  // param; the callback only resolves once gtag/js actually loads.
  test('requests the GA client id and records it for model-open events', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
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
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
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
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
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
    setupGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})
    expect(window.dataLayer.filter((entry) => entry?.[0] === 'set')).toHaveLength(0)
  })


  test('does not request a client id off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})
    expect(window.dataLayer.find((entry) => entry?.[0] === 'get')).toBeUndefined()
  })

  // The bizdev dashboard links each noisy model-open chip to a Sentry
  // search on this tag, so nothing matched before it was sent (#1767).
  describe('open_cid Sentry tag', () => {
    afterEach(() => {
      Cookies.set('consentLevel', '1.functional')
    })

    // Set from the cookie at setup so a load-failure exception thrown
    // before gtag/js resolves still carries the tag.
    test('tags from the _ga cookie at setup, for a returning visitor', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
      expect(setTag).toHaveBeenCalledWith('open_cid', '1234567890.0987654321')
    })

    // Bare: the cid. prefix exists only to stop GA4 typing the id as a
    // float, and the dashboard strips it before building the query.
    test('sends the bare id, without the GA cid. prefix', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
      const values = setTag.mock.calls.map(([, value]) => value)
      expect(values).not.toContain('cid.1234567890.0987654321')
    })

    // A first-ever visitor has no cookie; the callback is their only
    // path. The setup-time sync still runs — it just has no id to
    // publish, which is the same undefined a retraction writes.
    test('tags from the gtag callback for a first visit', () => {
      setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
      expect(setTag).toHaveBeenLastCalledWith('open_cid', undefined)

      window.dataLayer.find((entry) => entry?.[0] === 'get')[3]('1234567890.0987654321')
      expect(setTag).toHaveBeenLastCalledWith('open_cid', '1234567890.0987654321')
    })

    test('does not tag off-prod, where GA never initializes', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})
      expect(setTag).not.toHaveBeenCalled()
    })

    // undefined is what removes a tag — Sentry drops undefined keys when
    // it merges scope tags onto an event. A visitor who declined never gets
    // gtag/js at all, so there's no client id callback to publish from.
    test('sends no id when analytics consent is withheld', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setIsAllowed(false)
      setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
      expect(window.dataLayer.find((entry) => entry?.[0] === 'get')).toBeUndefined()
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
      setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
      expect(setTag).toHaveBeenCalledWith('open_cid', '1234567890.0987654321')

      setIsAllowed(false)
      expect(setTag).toHaveBeenLastCalledWith('open_cid', undefined)
    })
  })

  test('reports a missing inline bootstrap to Sentry without throwing', () => {
    delete window.gtag
    expect(() => setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})).not.toThrow()
    expect(findGtagScript()).toBeNull()
    // Fingerprinted, so one defect is one issue whatever the build's stack.
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('ga_init: gtag bootstrap missing')}),
      {tags: {subsystem: 'ga_init'}, fingerprint: ['ga_init', expect.stringContaining('gtag bootstrap missing')]},
    )
    expect(reportClientCapability).not.toHaveBeenCalled()
  })
})


// design/new/analytics-consent.md: browser GA is off for everyone; a later
// opt-in would turn it back on, loading only once the visitor allows it.
describe('consent', () => {
  const PROD = {hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true}

  // Owner, 2026-11-25: no Google Analytics in the browser, consent or not.
  test('browser GA is off: even a consenting visitor on prod gets no loader, and leftovers go', () => {
    expect(IS_BROWSER_GA_ON).toBe(false)
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    expect(findGtagScript()).toBeNull()
    expect(window.dataLayer).toHaveLength(0)
    expect(Cookies.get('_ga')).toBeUndefined()
  })

  test('a visitor who has not chosen gets no loader on prod', () => {
    Cookies.remove('consentLevel')
    setupGa(PROD)
    expect(findGtagScript()).toBeNull()
    expect(window.dataLayer).toHaveLength(0)
  })

  // Codex on #2051: GA was default-on until this change, so a returning
  // visitor can arrive undecided with GA cookies already set.
  test.each([
    ['has not chosen', null],
    ['chose Browse only', '1.restricted'],
  ])('deletes leftover GA cookies at setup when the visitor %s', (_, cookie) => {
    if (cookie) {
      Cookies.set('consentLevel', cookie)
    } else {
      Cookies.remove('consentLevel')
    }
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    Cookies.set('_gcl_au', '1.1.x')
    setupGa({hostname: 'bldrs.ai', isWebdriver: false, isBrowserGaOn: true})
    expect(Cookies.get('_ga')).toBeUndefined()
    expect(Cookies.get('_gcl_au')).toBeUndefined()
  })

  // A bldrs preview that didn't opt into GA this load could still have
  // run the tag on an earlier one, so its leftovers go too.
  test('deletes leftover GA cookies on a bldrs deploy preview without the GA flag', () => {
    Cookies.remove('consentLevel')
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'deploy-preview-2051--bldrs-share-prod.netlify.app', isWebdriver: false, enableInPreview: false})
    expect(Cookies.get('_ga')).toBeUndefined()
  })

  // Codex on #2051: a self-hosted Share under another site never ran our
  // tag; the `_ga` there is that site's analytics, not ours to delete.
  test.each(['share.example.com', 'localhost', 'deploy-preview-1--some-fork.netlify.app'])(
    'leaves GA cookies alone on %s, where our tag never ran', (hostname) => {
      Cookies.remove('consentLevel')
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      setupGa({hostname, isWebdriver: false, enableInPreview: true})
      expect(Cookies.get('_ga')).toBe('GA1.1.1234567890.0987654321')
      Cookies.remove('_ga')
    })

  test('keeps the GA cookie at setup for a consenting visitor', () => {
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setupGa({hostname: 'localhost', isWebdriver: false, isBrowserGaOn: true})
    expect(Cookies.get('_ga')).toBe('GA1.1.1234567890.0987654321')
  })

  test('a visitor who chose Browse only gets no loader on prod', () => {
    Cookies.set('consentLevel', '1.restricted')
    setupGa(PROD)
    expect(findGtagScript()).toBeNull()
  })

  // Google Ads is switched off: consent is for analytics and nothing else.
  test('consent grants analytics only, never an ad signal', () => {
    expect(CONSENT_DEFAULT).toEqual({
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
    expect(CONSENT_GRANTED).toEqual({
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
    expect(GA_CONFIG).toEqual({allow_google_signals: false, allow_ad_personalization_signals: false})
  })

  test('deleteGoogleCookies tries every parent domain', () => {
    const remove = jest.spyOn(Cookies, 'remove')
    Cookies.set('_ga', 'GA1.1.1.2')
    deleteGoogleCookies('www.bldrs.ai')
    const domains = remove.mock.calls.filter(([name]) => name === '_ga').map(([, opts]) => opts.domain)
    expect(domains).toEqual([undefined, 'www.bldrs.ai', 'bldrs.ai'])
    remove.mockRestore()
  })

  test('deleteGoogleCookies does nothing off our own GA hosts', () => {
    const remove = jest.spyOn(Cookies, 'remove')
    Cookies.set('_ga', 'GA1.1.1.2')
    deleteGoogleCookies('share.example.com')
    expect(remove).not.toHaveBeenCalled()
    remove.mockRestore()
    Cookies.remove('_ga')
  })
})

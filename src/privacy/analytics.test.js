import Cookies from 'js-cookie'
import * as Analytics from './analytics'


describe('Analytics', () => {
  test('isAllowed true by default', () => {
    expect(Analytics.isAllowed()).toBe(true)
  })


  test('setIsAllowed', () => {
    expect(Analytics.isAllowed()).toBe(true)
    Analytics.setIsAllowed(false)
    expect(Analytics.isAllowed()).toBe(false)
    Analytics.setIsAllowed(true)
    expect(Analytics.isAllowed()).toBe(true)
  })


  test('logs preview events for smoke testing even when gtag is blocked', () => {
    const originalLocation = window.location
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        hostname: 'deploy-preview-1757--bldrs-share-dev.netlify.app',
        search: '?feature=gaEnableInPreview',
      },
    })
    delete window.gtag
    Analytics.gtagEvent('real_model_open', {content_id: 'house.ifc'})
    expect(consoleInfo).toHaveBeenCalledWith(
      '[ga] event real_model_open', {content_id: 'house.ifc'})
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    consoleInfo.mockRestore()
  })


  describe('model engagement', () => {
    let hasFocusSpy
    let visibilityState

    beforeEach(() => {
      jest.useFakeTimers()
      window.gtag = jest.fn()
      hasFocusSpy = jest.spyOn(document, 'hasFocus').mockReturnValue(true)
      visibilityState = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    })

    afterEach(() => {
      hasFocusSpy.mockRestore()
      visibilityState.mockRestore()
      delete window.gtag
      jest.useRealTimers()
    })

    // The param name is load-bearing as things are configured: GA4 reserves
    // engagement_time_msec and folds it into the standard
    // userEngagementDuration metric, which is what the bizdev dashboard
    // queries. So a rename here is a migration, not an edit — it empties that
    // column until the new name is registered as a custom metric GA4-side and
    // the query is repointed at it. See startModelEngagement's doc.
    test('emits foreground time with stable model identity when stopped', () => {
      const ENGAGEMENT_MS = 2500
      const stop = Analytics.startModelEngagement({content_id: 'house.ifc', content_type: 'ifc'})
      jest.advanceTimersByTime(ENGAGEMENT_MS)
      stop()
      stop()

      expect(window.gtag).toHaveBeenCalledTimes(1)
      expect(window.gtag).toHaveBeenCalledWith('event', 'model_engagement', {
        content_id: 'house.ifc',
        content_type: 'ifc',
        engagement_time_msec: ENGAGEMENT_MS,
        transport_type: 'beacon',
      })
    })

    test('splits engagement around background time without counting it', () => {
      const FIRST_ENGAGEMENT_MS = 1000
      const BACKGROUND_MS = 5000
      const SECOND_ENGAGEMENT_MS = 2000
      const stop = Analytics.startModelEngagement({content_id: 'house.ifc'})
      jest.advanceTimersByTime(FIRST_ENGAGEMENT_MS)
      visibilityState.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      jest.advanceTimersByTime(BACKGROUND_MS)
      visibilityState.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      jest.advanceTimersByTime(SECOND_ENGAGEMENT_MS)
      stop()

      const durations = window.gtag.mock.calls.map((call) => call[2].engagement_time_msec)
      expect(durations).toEqual([FIRST_ENGAGEMENT_MS, SECOND_ENGAGEMENT_MS])
    })
  })


  // open_cid carries GA4's client id on model-open events so per-user
  // open depth is queryable; see the module doc for why the param is
  // simply absent when GA never initialized.
  describe('GA client id', () => {
    beforeEach(() => {
      Analytics._resetGaClientIdForTests()
      Cookies.remove('_ga')
    })

    test('null when neither the gtag callback nor the cookie has an id', () => {
      expect(Analytics.getGaClientId()).toBeNull()
    })

    test('records a non-empty string id', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      expect(Analytics.getGaClientId()).toBe('1234567890.0987654321')
    })

    test('ignores the empty/undefined ids gtag yields before the property loads', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      Analytics.setGaClientId(undefined)
      Analytics.setGaClientId('')
      expect(Analytics.getGaClientId()).toBe('1234567890.0987654321')
    })

    // Events fired before gtag's async callback resolves still reach
    // GA4; without this fallback they'd lose the param exactly on a
    // visitor's first open.
    test('falls back to the _ga cookie, whose id keeps its embedded dot', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      expect(Analytics.getGaClientId()).toBe('1234567890.0987654321')
    })

    test('prefers the gtag callback id over the cookie', () => {
      Cookies.set('_ga', 'GA1.1.1111111111.2222222222')
      Analytics.setGaClientId('3333333333.4444444444')
      expect(Analytics.getGaClientId()).toBe('3333333333.4444444444')
    })

    test('null for a malformed cookie rather than a junk id', () => {
      Cookies.set('_ga', 'GA1.1')
      expect(Analytics.getGaClientId()).toBeNull()
    })

    // GA4 reserves the ga_ prefix and silently drops matching params.
    test('param name avoids GA4 reserved prefixes', () => {
      expect(Analytics.OPEN_CID_PARAM).toBe('open_cid')
      expect(Analytics.OPEN_CID_PARAM).not.toMatch(/^(_|ga_|google_|firebase_|gtag\.)/)
    })
  })


  /*
   * The param VALUE must be un-parseable as a number. A bare client id
   * is numeric-looking, and gtag sends numeric-looking params as `epn.`
   * (number): float64 truncates the id's 20 digits to ~16, colliding
   * distinct clients, and a text custom dimension won't populate from a
   * numeric param at all.
   */
  describe('getOpenCid', () => {
    beforeEach(() => {
      Analytics._resetGaClientIdForTests()
      Cookies.remove('_ga')
    })

    test('null when no client id is available, so the param is omitted', () => {
      expect(Analytics.getOpenCid()).toBeNull()
    })

    test('tags the id so it cannot be parsed as a number', () => {
      Analytics.setGaClientId('1871520000.1754700000')
      const value = Analytics.getOpenCid()
      expect(value).toBe('cid.1871520000.1754700000')
      expect(Number.isNaN(Number(value))).toBe(true)
    })

    test('preserves the full id, which float64 would truncate', () => {
      const cid = '1871520000.1754700000'
      Analytics.setGaClientId(cid)
      expect(Analytics.getOpenCid()).toContain(cid)
      // The bug this guards: Number() drops 5 digits, so two clients
      // differing only in the tail would collapse to one value.
      expect(String(Number(cid))).not.toBe(cid)
    })

    test('tags the cookie-derived id too', () => {
      Cookies.set('_ga', 'GA1.1.1871520000.1754700000')
      expect(Analytics.getOpenCid()).toBe('cid.1871520000.1754700000')
    })
  })


  /*
   * Sentry's half of the same id (issue #1767). Bare, because the
   * `cid.` prefix only exists to stop GA4 typing the value as a float,
   * and the dashboard strips it before searching Sentry.
   */
  describe('getOpenCidForSentry', () => {
    beforeEach(() => {
      Analytics._resetGaClientIdForTests()
      Cookies.remove('_ga')
      Cookies.remove('isAnalyticsAllowed')
    })

    afterEach(() => {
      Cookies.remove('isAnalyticsAllowed')
    })

    test('null when no client id is available, so the tag is omitted', () => {
      expect(Analytics.getOpenCidForSentry()).toBeNull()
    })

    test('is the bare id, not the cid.-prefixed GA param value', () => {
      Analytics.setGaClientId('1871520000.1754700000')
      expect(Analytics.getOpenCidForSentry()).toBe('1871520000.1754700000')
      expect(Analytics.getOpenCidForSentry()).not.toBe(Analytics.getOpenCid())
    })

    test('reads the cookie fallback, so a returning visitor is tagged at first paint', () => {
      Cookies.set('_ga', 'GA1.1.1871520000.1754700000')
      expect(Analytics.getOpenCidForSentry()).toBe('1871520000.1754700000')
    })

    // Fails closed for the same reason syncUserCidProperty does: a
    // declined visitor must not have an analytics id on their error
    // reports either.
    test('null when analytics consent is withheld', () => {
      Analytics.setGaClientId('1871520000.1754700000')
      Analytics.setIsAllowed(false)
      expect(Analytics.getOpenCidForSentry()).toBeNull()
    })

    // Same identifier, and the dashboard builds the Sentry query from
    // the GA param name.
    test('the Sentry tag name matches the GA param name', () => {
      expect(Analytics.SENTRY_CID_TAG).toBe(Analytics.OPEN_CID_PARAM)
      expect(Analytics.SENTRY_CID_TAG).toBe('open_cid')
    })
  })


  // Route-result shapes mirror routes.ts#handleRoute output. The one
  // excluded shape is the homepage's bundled demo — everything else is
  // a real open.
  describe('isRealModelOpen', () => {
    test('false for the bundled homepage demo (/share/v/p/index.ifc)', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: 'index.ifc',
      })).toBe(false)
    })

    test('false for a demo permalink with an element subpath', () => {
      // processFile strips the eltPath, so the demo shape is identical.
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: 'index.ifc',
        eltPath: '/81/621',
      })).toBe(false)
    })

    test('true for an uploaded file', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: true,
        filepath: '6f5a9c22-0330-4f4a-a2f0-d295c07d9a3c.ifc',
      })).toBe(true)
    })

    test('true for an upload even when isUploadedFile is misdetected', () => {
      // GitHub Pages installs prefix routes with /Share, defeating
      // processFile's '/share/v/new' test — the UUID filepath still
      // distinguishes the upload from the demo.
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: '6f5a9c22-0330-4f4a-a2f0-d295c07d9a3c.ifc',
      })).toBe(true)
    })

    test('true for GitHub-hosted models', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'provider',
        provider: 'github',
        gitpath: 'https://github.com/bldrs-ai/test-models/blob/main/ifc/misc/box.ifc',
      })).toBe(true)
    })

    test('true for Google Drive and generic URL sources', () => {
      expect(Analytics.isRealModelOpen({kind: 'provider', provider: 'google', fileId: 'abc123'})).toBe(true)
      expect(Analytics.isRealModelOpen({kind: 'url'})).toBe(true)
    })

    // All *.netlify.app hosts (deploy previews, branch deploys, the dev
    // site) serve the prod GA tag — opens there are team/CI traffic,
    // not conversions.
    test('false on Netlify deploy hosts, even for real sources', () => {
      const githubOpen = {
        kind: 'provider',
        provider: 'github',
        gitpath: 'https://github.com/bldrs-ai/test-models/blob/main/ifc/misc/box.ifc',
      }
      expect(Analytics.isRealModelOpen(githubOpen, 'deploy-preview-1741--bldrs-share-prod.netlify.app')).toBe(false)
      expect(Analytics.isRealModelOpen(githubOpen, 'bldrs-share-dev.netlify.app')).toBe(false)
    })

    it('counts an opted-in deploy-preview open but not a branch deploy', () => {
      const githubOpen = {kind: 'file', isUploadedFile: false, filepath: 'models/house.ifc'}
      const preview = 'deploy-preview-1741--bldrs-share-prod.netlify.app'
      expect(Analytics.isRealModelOpen(githubOpen, preview, true)).toBe(true)
      expect(Analytics.isRealModelOpen(githubOpen, 'bldrs-share-dev.netlify.app', true)).toBe(false)
    })

    test('true on production and localhost hosts for real sources', () => {
      const githubOpen = {
        kind: 'provider',
        provider: 'github',
        gitpath: 'https://github.com/bldrs-ai/test-models/blob/main/ifc/misc/box.ifc',
      }
      expect(Analytics.isRealModelOpen(githubOpen, 'bldrs.ai')).toBe(true)
      // localhost must stay true: realModelOpen.spec.ts asserts the
      // event fires in the E2E harness, which serves on localhost.
      expect(Analytics.isRealModelOpen(githubOpen, 'localhost')).toBe(true)
    })
  })


  // The event param answers open depth; the user property is what makes
  // session- and engagement-scoped questions answerable per user at all.
  describe('setUserCidProperty', () => {
    beforeEach(() => {
      Analytics._resetGaClientIdForTests()
      Cookies.remove('_ga')
      Analytics.setIsAllowed(true)
      window.gtag = jest.fn()
    })

    afterEach(() => {
      delete window.gtag
      Analytics.setIsAllowed(true)
    })

    test('sets the client id as a user property', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      Analytics.setUserCidProperty()
      expect(window.gtag).toHaveBeenCalledWith(
        'set', 'user_properties', {open_cid: 'cid.1234567890.0987654321'})
    })

    // Same prefix trap as the event param: a bare id is numeric-looking,
    // and a user-scoped custom dimension won\'t populate from a number.
    test('sends the prefixed value, never a bare numeric id', () => {
      Analytics.setGaClientId('1871520000.1754700000')
      Analytics.setUserCidProperty()
      const [, , props] = window.gtag.mock.calls[0]
      expect(props[Analytics.OPEN_CID_USER_PROPERTY]).toMatch(/^cid\./)
      expect(Number.isNaN(Number(props[Analytics.OPEN_CID_USER_PROPERTY]))).toBe(true)
    })

    test('falls back to the _ga cookie before the gtag callback lands', () => {
      Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      Analytics.setUserCidProperty()
      expect(window.gtag).toHaveBeenCalledWith(
        'set', 'user_properties', {open_cid: 'cid.1234567890.0987654321'})
    })

    test('no-op when no client id is available', () => {
      Analytics.setUserCidProperty()
      expect(window.gtag).not.toHaveBeenCalled()
    })

    // The property is as much a user identifier as the event param, so
    // it honours the same consent gate gtagEvent does.
    test('publishes no identifier when analytics consent is withheld', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      Analytics.setIsAllowed(false)
      // setIsAllowed itself retracts the property — that is the
      // withdrawal suite's subject. Only what follows is under test.
      window.gtag.mockClear()
      Analytics.setUserCidProperty()
      expect(window.gtag).not.toHaveBeenCalledWith(
        'set', 'user_properties', expect.objectContaining({open_cid: expect.any(String)}))
    })

    test('no-op when gtag never loaded', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      delete window.gtag
      expect(() => Analytics.setUserCidProperty()).not.toThrow()
    })
  })


  // The typing trap that zero-padding alone does NOT solve: Number('08')
  // is 8, so a padded-but-unprefixed hour still beacons as a number and
  // the event-scoped dimension stays empty for all 24 values.
  describe('getLocalHour', () => {
    test('is not parseable as a number', () => {
      expect(Number(Analytics.getLocalHour())).toBeNaN()
    })

    test('carries the browser hour, zero-padded', () => {
      const HOUR_DIGITS = 2
      const expected = String(new Date().getHours()).padStart(HOUR_DIGITS, '0')
      expect(Analytics.getLocalHour()).toBe(`h.${expected}`)
    })

    test('every hour of the day stays non-numeric', () => {
      const HOURS_PER_DAY = 24
      const spy = jest.spyOn(Date.prototype, 'getHours')
      try {
        for (let h = 0; h < HOURS_PER_DAY; h++) {
          spy.mockReturnValue(h)
          expect(Number(Analytics.getLocalHour())).toBeNaN()
        }
      } finally {
        spy.mockRestore()
      }
    })
  })


  // gtagEvent re-reads consent per call, but a user property is sticky —
  // gtag/js keeps attaching it to its own automatic events after an
  // opt-out unless it is explicitly cleared.
  describe('consent withdrawal clears the user property', () => {
    beforeEach(() => {
      Analytics._resetGaClientIdForTests()
      Cookies.remove('_ga')
      Analytics.setIsAllowed(true)
      window.gtag = jest.fn()
    })

    afterEach(() => {
      delete window.gtag
      Analytics.setIsAllowed(true)
    })

    test('opting out retracts it with null', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      Analytics.setIsAllowed(false)
      expect(window.gtag).toHaveBeenLastCalledWith(
        'set', 'user_properties', {open_cid: null})
    })

    test('opting back in republishes it', () => {
      Analytics.setGaClientId('1234567890.0987654321')
      Analytics.setIsAllowed(false)
      Analytics.setIsAllowed(true)
      expect(window.gtag).toHaveBeenLastCalledWith(
        'set', 'user_properties', {open_cid: 'cid.1234567890.0987654321'})
    })
  })
})

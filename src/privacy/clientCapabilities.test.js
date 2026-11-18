import {CAPABILITY_FIELDS, parseCapabilityReport} from './clientCapabilityReport'
import {
  BAIT_SETTLE_MS,
  CAPABILITY_REPORT_PATH,
  _resetClientCapabilitiesForTests,
  blockerKind,
  browserFamily,
  capabilityReport,
  formFactor,
  reportClientCapability,
} from './clientCapabilities'


/* eslint-disable max-len, no-magic-numbers -- real user agents are long; the bodies are sized on purpose */
const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 OPR/120.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  ddg: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0 Mobile/15E148 Safari/604.1',
}


describe('privacy/clientCapabilities', () => {
  beforeEach(() => {
    _resetClientCapabilitiesForTests()
    document.body.innerHTML = ''
    document.head.querySelectorAll('style').forEach((s) => s.remove())
  })

  describe('browserFamily', () => {
    it.each([
      ['chrome', UA.chrome],
      ['edge', UA.edge],
      ['opera', UA.opera],
      ['samsung', UA.samsung],
      ['duckduckgo', UA.ddg],
      ['firefox', UA.firefox],
      ['safari', UA.safari],
      ['chrome', UA.chromeIos],
      ['other', 'curl/8.0'],
    ])('names %s', (family, userAgent) => {
      expect(browserFamily({userAgent})).toBe(family)
    })

    // Brave sends a plain Chrome user agent; only navigator.brave tells it apart.
    it('names Brave by navigator.brave, not its Chrome user agent', () => {
      expect(browserFamily({userAgent: UA.chrome, brave: {isBrave: () => Promise.resolve(true)}})).toBe('brave')
    })
  })

  describe('formFactor', () => {
    it('reads userAgentData when the browser has it, else the user agent', () => {
      expect(formFactor({userAgent: UA.chrome, userAgentData: {mobile: true}})).toBe('mobile')
      expect(formFactor({userAgent: UA.samsung})).toBe('mobile')
      expect(formFactor({userAgent: UA.firefox})).toBe('desktop')
    })
  })

  describe('blockerKind', () => {
    const NOW = {delayMs: 0}

    it('says offline when the browser does', async () => {
      expect(await blockerKind(document, {onLine: false}, NOW)).toBe('offline')
    })

    // An element-hiding filter hides the bait; nothing else touches it.
    it('says cosmetic when a filter hides the bait, network when nothing does', async () => {
      expect(await blockerKind(document, {onLine: true}, NOW)).toBe('network')
      const style = document.createElement('style')
      style.textContent = '.adsbox { display: none !important; }'
      document.head.appendChild(style)
      expect(await blockerKind(document, {onLine: true}, NOW)).toBe('cosmetic')
    })

    // uBlock Origin and Brave Shields add class-hiding rules only after they
    // see the new element, asynchronously: the read must wait for them.
    it('waits for a hiding rule that lands after the bait goes in', async () => {
      const schedule = (callback, delayMs) => {
        expect(delayMs).toBe(BAIT_SETTLE_MS)
        expect(document.querySelector('.adsbox')).not.toBeNull()
        const style = document.createElement('style')
        style.textContent = '.adsbox { display: none !important; }'
        document.head.appendChild(style)
        setTimeout(callback, 0)
      }
      expect(await blockerKind(document, {onLine: true}, {schedule})).toBe('cosmetic')
    })

    it('leaves no bait behind', async () => {
      await blockerKind(document, {onLine: true}, NOW)
      expect(document.querySelector('.adsbox')).toBeNull()
    })
  })

  // The function refuses anything else, so what the page builds must parse.
  it('builds a report the function accepts, from closed values only', async () => {
    const report = await capabilityReport('ga_blocked', {doc: document, nav: {userAgent: UA.firefox, onLine: true}, consent: false, delayMs: 0})
    expect(report).toEqual({condition: 'ga_blocked', browser: 'firefox', blocker: 'network', form_factor: 'desktop', consent: 'off'})
    expect(parseCapabilityReport(JSON.stringify(report))).toEqual(report)
    for (const [field, value] of Object.entries(report)) {
      expect(CAPABILITY_FIELDS[field]).toContain(value)
    }
  })

  describe('reportClientCapability', () => {
    /** @return {object} a navigator whose beacon records what it was given */
    function beaconNav() {
      const sent = []
      return {sent, nav: {userAgent: UA.chrome, onLine: true, sendBeacon: (url, body) => {
        sent.push([url, JSON.parse(body)])
        return true
      }}}
    }

    // Owner's call: a capability report is sent whatever the analytics
    // setting, and says which way it was.
    it('sends one report to Share\'s own function, even with analytics off', async () => {
      const {sent, nav} = beaconNav()
      expect(await reportClientCapability('ga_blocked', {nav, doc: document, consent: false, storage: null, delayMs: 0})).toBe(true)
      expect(sent).toEqual([[CAPABILITY_REPORT_PATH, expect.objectContaining({condition: 'ga_blocked', consent: 'off'})]])
    })

    it('sends once per page session, across page loads in the same session', async () => {
      const {sent, nav} = beaconNav()
      const store = new Map()
      const storage = {getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)}
      const env = {nav, doc: document, consent: true, storage, delayMs: 0}
      // The second call lands while the first one's bait is still settling.
      await Promise.all([reportClientCapability('ga_blocked', env), reportClientCapability('ga_blocked', env)])
      expect(sent).toHaveLength(1)
      // A reload: the page's own flag is gone, the session's isn't.
      _resetClientCapabilitiesForTests()
      expect(await reportClientCapability('ga_blocked', env)).toBe(false)
      expect(sent).toHaveLength(1)
    })

    it('refuses a condition the function doesn\'t know', async () => {
      const {sent, nav} = beaconNav()
      expect(await reportClientCapability('something_else', {nav, doc: document, consent: true, storage: null})).toBe(false)
      expect(sent).toHaveLength(0)
    })

    it('never rejects, whatever the browser does', async () => {
      const nav = {userAgent: UA.chrome, onLine: true, sendBeacon: () => {
        throw new Error('blocked')
      }}
      await expect(reportClientCapability('ga_blocked', {nav, doc: document, consent: true, storage: null, delayMs: 0}))
        .resolves.toBe(false)
    })
  })
})


describe('privacy/clientCapabilityReport — parseCapabilityReport', () => {
  const valid = {condition: 'ga_blocked', browser: 'brave', blocker: 'cosmetic', form_factor: 'mobile', consent: 'on'}

  it('accepts exactly the fields, with known values', () => {
    expect(parseCapabilityReport(JSON.stringify(valid))).toEqual(valid)
  })

  // No free text can reach GA through the function.
  it.each([
    ['empty', ''],
    ['not JSON', 'nope'],
    ['an array', '[]'],
    ['an empty object', '{}'],
    ['an unknown value', JSON.stringify({...valid, browser: 'Mozilla/5.0 (X11)'})],
    ['an extra field', JSON.stringify({...valid, url: 'https://bldrs.ai/share/v/p/private.ifc'})],
    ['a missing field', JSON.stringify({...valid, consent: undefined})],
    ['too long', JSON.stringify({...valid, pad: 'x'.repeat(600)})],
  ])('refuses %s', (_, text) => {
    expect(parseCapabilityReport(text)).toBeNull()
  })
})

import {_resetPageSessionForTests, pageSession} from './modelOpenCount'
import {
  PAGE_VISIT_PATH,
  _resetPageVisitForTests,
  pageVisitReport,
  referrerClass,
  reportPageVisit,
  visitRouteKind,
} from './pageVisit'
import {parsePageVisitReport} from '../privacy/pageVisitReport'


const PROD = {hostname: 'bldrs.ai', isWebdriver: false, enableInPreview: false}
const PREVIEW_HOST = 'deploy-preview-2400--bldrs-share-prod.netlify.app'
const DESKTOP_NAV = {userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0'}


/** @return {object} a navigator whose sendBeacon records what it was given */
function beaconNav() {
  return {...DESKTOP_NAV, sendBeacon: jest.fn(() => true)}
}


describe('app/pageVisit', () => {
  beforeEach(() => {
    _resetPageVisitForTests()
    _resetPageSessionForTests()
  })

  it.each([
    ['/', 'home'],
    ['', 'home'],
    ['/share', 'home'],
    ['/share/', 'home'],
    ['/Share/', 'home'],
    ['/Share/share/', 'home'],
    ['/share/v/p/index.ifc', 'viewer-demo'],
    ['/share/v/p/index.step/12/34', 'viewer-demo'],
    ['/share/v/p/haus.ifc', 'other'],
    ['/share/v/local-only/0A1B2C3D-0000-4000-8000-000000000001.ifc', 'viewer-local'],
    ['/share/v/new/0A1B2C3D-0000-4000-8000-000000000001.ifc', 'viewer-local'],
    ['/share/v/gh/someone/private/main/secret.ifc', 'viewer-github'],
    ['/Share/share/v/gh/o/r/main/x.ifc', 'viewer-github'],
    ['/share/v/g/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO', 'viewer-gdrive'],
    ['/share/v/u/https://drive.google.com/file/d/abc/view', 'viewer-gdrive'],
    ['/share/v/u/https://example.com/secret.ifc', 'viewer-url'],
    ['/privacy', 'other'],
    ['/share/v/zz/x', 'other'],
  ])('reads %p as route kind %p', (path, kind) => {
    expect(visitRouteKind(path)).toBe(kind)
  })

  it.each([
    ['', 'direct'],
    [undefined, 'direct'],
    ['https://www.google.com/', 'search'],
    ['https://www.google.com.br/search?q=secret', 'search'],
    ['https://google.de/', 'search'],
    ['https://www.bing.com/search?q=x', 'search'],
    ['https://duckduckgo.com/', 'search'],
    ['https://www.linkedin.com/feed/', 'social'],
    ['https://lnkd.in/abc', 'social'],
    ['https://t.co/xyz', 'social'],
    ['https://l.facebook.com/l.php?u=x', 'social'],
    ['https://old.reddit.com/r/bim', 'social'],
    ['https://bldrs.ai/blog/post', 'bldrs'],
    ['https://www.bldrs.ai/', 'bldrs'],
    [`https://${PREVIEW_HOST}/`, 'bldrs'],
    ['https://example.com/private/page', 'other'],
    ['https://notgoogle.com/', 'other'],
    ['https://evil-bing.com/', 'other'],
    ['not a url', 'other'],
  ])('classes the referrer %p as %p', (referrer, klass) => {
    expect(referrerClass(referrer, 'bldrs.ai')).toBe(klass)
  })

  it('builds a report from enums and the session id only, the path, query and referrer left behind', () => {
    const report = pageVisitReport({
      pathname: '/share/v/gh/someone/private/main/secret.ifc',
      search: '?utm_source=LinkedIn&utm_medium=social&utm_campaign=secret-launch&q=private',
      referrer: 'https://example.com/private/page?token=abc',
      hostname: 'bldrs.ai',
      nav: DESKTOP_NAV,
    })
    expect(report).toEqual({
      route_kind: 'viewer-github',
      referrer_class: 'other',
      utm_source: 'linkedin',
      utm_medium: 'social',
      form_factor: 'desktop',
      session_id: pageSession(),
    })
    expect(parsePageVisitReport(JSON.stringify(report))).toEqual(report)
    expect(JSON.stringify(report)).not.toMatch(/secret|private|example|token|launch|someone/)
  })

  it.each([
    ['', 'none', 'none'],
    ['?utm_source=google&utm_medium=cpc', 'google', 'cpc'],
    ['?utm_source=spring-promo&utm_medium=carrier-pigeon', 'other', 'other'],
    ['?utm_source=&utm_medium=', 'none', 'none'],
    ['?utm_medium=email', 'none', 'email'],
  ])('reads the campaign in %p as %p / %p', (search, source, medium) => {
    const report = pageVisitReport({pathname: '/', search, referrer: '', hostname: 'bldrs.ai', nav: DESKTOP_NAV})
    expect(report.utm_source).toBe(source)
    expect(report.utm_medium).toBe(medium)
  })

  // A visit and the loads it makes join on this id.
  it('carries the same page session id as model_open_count', () => {
    expect(pageVisitReport({pathname: '/', nav: DESKTOP_NAV}).session_id).toBe(pageSession())
  })

  it('sends one report to the function in production, once per page load', () => {
    const nav = beaconNav()
    const env = {...PROD, nav, pathname: '/share/v/g/abc', search: '', referrer: 'https://www.google.com/'}
    expect(reportPageVisit(env)).toBe(true)
    expect(reportPageVisit(env)).toBe(false)
    expect(nav.sendBeacon).toHaveBeenCalledTimes(1)
    const [path, body] = nav.sendBeacon.mock.calls[0]
    expect(path).toBe(PAGE_VISIT_PATH)
    expect(JSON.parse(body)).toMatchObject({route_kind: 'viewer-gdrive', referrer_class: 'search'})
    expect(JSON.parse(body)).not.toHaveProperty('country')
  })

  it('sends from an opted-in bldrs deploy preview', () => {
    const nav = beaconNav()
    expect(reportPageVisit({hostname: PREVIEW_HOST, isWebdriver: false, enableInPreview: true, nav, pathname: '/'}))
      .toBe(true)
  })

  it.each([
    ['localhost', {hostname: 'localhost', isWebdriver: false, enableInPreview: false}],
    ['a deploy preview not opted in', {hostname: PREVIEW_HOST, isWebdriver: false, enableInPreview: false}],
    ['production under webdriver', {...PROD, isWebdriver: true}],
  ])('sends nothing on %s', (_, host) => {
    const nav = beaconNav()
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    try {
      expect(reportPageVisit({...host, nav, pathname: '/'})).toBe(false)
      expect(nav.sendBeacon).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  // jsdom's own host is localhost: the defaults alone send nothing, which is
  // what keeps unit and E2E runs out of the counts.
  it('sends nothing with the page\'s own host in tests', () => {
    const nav = beaconNav()
    expect(reportPageVisit({nav})).toBe(false)
    expect(nav.sendBeacon).not.toHaveBeenCalled()
  })

  // The guarantee the privacy policy rests on: nothing of the visit is put
  // on the device.
  it('writes nothing to any storage', () => {
    const writes = [
      jest.spyOn(Storage.prototype, 'setItem'),
      jest.spyOn(Object.getPrototypeOf(document), 'cookie', 'set'),
    ]
    const idbOpen = jest.fn()
    const savedIdb = globalThis.indexedDB
    globalThis.indexedDB = {open: idbOpen}
    const savedStorage = navigator.storage
    const getDirectory = jest.fn()
    Object.defineProperty(navigator, 'storage', {value: {getDirectory}, configurable: true})
    const nav = beaconNav()
    try {
      expect(reportPageVisit({...PROD, nav, pathname: '/', search: '?utm_source=google', referrer: 'https://google.com/'}))
        .toBe(true)
      for (const spy of writes) {
        expect(spy).not.toHaveBeenCalled()
      }
      expect(idbOpen).not.toHaveBeenCalled()
      expect(getDirectory).not.toHaveBeenCalled()
    } finally {
      writes.forEach((spy) => spy.mockRestore())
      globalThis.indexedDB = savedIdb
      Object.defineProperty(navigator, 'storage', {value: savedStorage, configurable: true})
    }
  })

  it('falls back to a keepalive fetch, and swallows every error', async () => {
    const refused = {...DESKTOP_NAV, sendBeacon: jest.fn(() => false)}
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    try {
      expect(reportPageVisit({...PROD, nav: refused, pathname: '/'})).toBe(true)
      expect(fetchSpy).toHaveBeenCalledWith(PAGE_VISIT_PATH, expect.objectContaining({method: 'POST', keepalive: true}))
      await Promise.resolve()
    } finally {
      fetchSpy.mockRestore()
    }
    _resetPageVisitForTests()
    const throwing = {...DESKTOP_NAV, sendBeacon: () => {
      throw new Error('beacon broke')
    }}
    expect(reportPageVisit({...PROD, nav: throwing, pathname: '/'})).toBe(false)
  })
})

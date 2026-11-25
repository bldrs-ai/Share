import {resetModelOpenReportForTest} from '../utils/reportModelOpen'
import {
  MODEL_OPEN_COUNT_PATH,
  _resetPageSessionForTests,
  modelOpenCountReport,
  modelOpenFailureReport,
  modelOpenSampleId,
  modelOpenSource,
  pageSession,
  reportModelOpenCount,
  reportModelOpenFailure,
} from './modelOpenCount'
import {SESSION_ID_PATTERN, parseModelOpenCountReport} from '../privacy/modelOpenCountReport'


/* eslint-disable no-magic-numbers */
const MB = 1024 * 1024
const PROD = {hostname: 'bldrs.ai', isWebdriver: false, enableInPreview: false}
const PREVIEW_HOST = 'deploy-preview-2400--bldrs-share-prod.netlify.app'
const DESKTOP_NAV = {userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0'}

const ROUTES = {
  local: {kind: 'file', isUploadedFile: true, filepath: '/share/v/new/0a1b2c3d.ifc'},
  hosted: {kind: 'file', isUploadedFile: false, filepath: 'haus.ifc'},
  sample: {kind: 'provider', provider: 'github', getRepoPath: () => '/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc'},
  github: {kind: 'provider', provider: 'github', getRepoPath: () => '/someone/private/main/secret.ifc'},
  gdrive: {kind: 'provider', provider: 'google', fileId: 'abc'},
  url: {kind: 'url', url: 'https://example.com/secret.ifc'},
}

// real_model_open's params as reportModelOpened assembles them: the identifying
// ones too, to prove the report takes none of them.
const OUTCOME_PARAMS = {
  content_id: 'https://example.com/secret.ifc',
  open_cid: 'cid.123.456',
  local_hour: 'h14',
  load_outcome: 'displayed',
  stats_fileSize: 20 * MB,
  stats_loadTime: 8123.4,
  stats_firstMeshMs: 2100,
  stats_openMs: 5000.6,
  stats_parseTime: 3000,
  stats_geometryTime: 1800,
  stats_triangleCount: 1234567,
  stats_vertexCount: 2345678,
  stats_pageErrorCount: 3,
  stats_warningCount: 2,
  stats_pageWarnCount: 40,
  stats_ifcVersion: 'IFC4',
}


/** @return {object} a navigator whose sendBeacon records what it was given */
function beaconNav() {
  return {...DESKTOP_NAV, sendBeacon: jest.fn(() => true)}
}


describe('app/modelOpenCount', () => {
  beforeEach(() => {
    resetModelOpenReportForTest()
    _resetPageSessionForTests()
  })

  it.each([
    ['local', 'local'],
    ['hosted', 'sample'],
    ['sample', 'sample'],
    ['github', 'github'],
    ['gdrive', 'gdrive'],
    ['url', 'url'],
  ])('a %s route is source %s', (route, source) => {
    expect(modelOpenSource(ROUTES[route])).toBe(source)
  })

  it('has no source for a route it does not know, and builds no report then', () => {
    expect(modelOpenSource(null)).toBeUndefined()
    expect(modelOpenSource({kind: 'provider', provider: 'dropbox'})).toBeUndefined()
    expect(modelOpenCountReport({kind: 'other'}, {type: 'ifc'}, {openKind: 'page'})).toBeNull()
  })

  // Only our own public samples are ever named.
  it('names a roster sample, and nothing else', () => {
    expect(modelOpenSampleId(ROUTES.sample)).toBe('momentum')
    expect(modelOpenSampleId(ROUTES.github)).toBe('none')
    expect(modelOpenSampleId(ROUTES.hosted)).toBe('none')
    expect(modelOpenSampleId(ROUTES.url)).toBe('none')
  })

  it('names every roster sample by its own route', () => {
    const {SAMPLE_MODELS} = jest.requireActual('../Components/Open/sampleModelRoster')
    for (const sample of SAMPLE_MODELS) {
      const repoPath = sample.path.split('#')[0].slice('/share/v/gh'.length)
      const route = {kind: 'provider', provider: 'github', getRepoPath: () => repoPath}
      expect(modelOpenSource(route)).toBe('sample')
      expect(modelOpenSampleId(route)).toBe(sample.name.toLowerCase())
    }
  })

  it.each(Object.keys(ROUTES))('builds a %s route\'s report from enums, numbers and the session id only', (route) => {
    const report = modelOpenCountReport(ROUTES[route], {type: 'IFC'}, {outcomeParams: OUTCOME_PARAMS, nav: DESKTOP_NAV})
    expect(report).toEqual({
      content_type: 'ifc',
      size_bucket: '10-50mb',
      source: modelOpenSource(ROUTES[route]),
      sample_id: route === 'sample' ? 'momentum' : 'none',
      open_kind: 'page',
      form_factor: 'desktop',
      load_outcome: 'displayed',
      reason_class: 'none',
      last_phase: 'none',
      session_id: pageSession(),
      load_ms: 8123,
      first_mesh_ms: 2100,
      open_ms: 5001,
      parse_ms: 3000,
      geometry_ms: 1800,
      triangle_count: 1234567,
      vertex_count: 2345678,
      // The engine's count when it has one, else the console tee's.
      error_count: 3,
      warning_count: 2,
    })
    // What the function accepts, and nothing of the route in it.
    expect(parseModelOpenCountReport(JSON.stringify(report))).toEqual(report)
    expect(JSON.stringify(report)).not.toMatch(/secret|example|0a1b2c3d|haus|cid\.|h14|IFC4/)
  })

  it('carries the no-geometry outcome, and leaves out what the load didn\'t measure', () => {
    const report = modelOpenCountReport(ROUTES.url, {type: 'IFCPROJECT'},
      {outcomeParams: {load_outcome: 'no_geometry', stats_loadTime: 900}, nav: DESKTOP_NAV})
    expect(report.load_outcome).toBe('no_geometry')
    expect(report.content_type).toBe('other')
    expect(report.size_bucket).toBe('unknown')
    expect(report.load_ms).toBe(900)
    expect(report).not.toHaveProperty('triangle_count')
    expect(report).not.toHaveProperty('open_ms')
  })

  it('builds a failed load\'s report with load_failed\'s reason and phase, and no measures', () => {
    const report = modelOpenFailureReport(ROUTES.gdrive,
      {error: new Error('OpenModel returned -1'), format: 'step', fileSize: 2 * MB, phase: 'dataParse'},
      {nav: DESKTOP_NAV})
    expect(report).toEqual({
      content_type: 'step',
      size_bucket: '1-10mb',
      source: 'gdrive',
      sample_id: 'none',
      open_kind: 'page',
      form_factor: 'desktop',
      load_outcome: 'failed',
      reason_class: 'parse',
      last_phase: 'dataparse',
      session_id: pageSession(),
    })
    expect(parseModelOpenCountReport(JSON.stringify(report))).toEqual(report)
    expect(modelOpenFailureReport(ROUTES.url, {error: new Error('x')}).content_type).toBe('other')
  })

  it('says in_app for a later open in the same document', () => {
    expect(modelOpenCountReport(ROUTES.github, {type: 'ifc'}).open_kind).toBe('page')
    expect(modelOpenCountReport(ROUTES.url, {type: 'ifc'}).open_kind).toBe('in_app')
  })

  describe('the page session id', () => {
    it('is a positive integer GA accepts as its session_id', () => {
      for (let i = 0; i < 50; i++) {
        _resetPageSessionForTests()
        expect(pageSession()).toMatch(SESSION_ID_PATTERN)
        expect(Number.isSafeInteger(Number(pageSession()))).toBe(true)
      }
      // The draw's extremes still fit.
      _resetPageSessionForTests()
      expect(pageSession({getRandomValues: (a) => a.fill(0)})).toBe('1')
      _resetPageSessionForTests()
      expect(pageSession({getRandomValues: (a) => a.fill(0xffffffff)})).toMatch(SESSION_ID_PATTERN)
    })

    it('stays the same across in-app opens, and a reload draws another', () => {
      const first = modelOpenCountReport(ROUTES.github, {type: 'ifc'}).session_id
      const second = modelOpenCountReport(ROUTES.url, {type: 'ifc'}).session_id
      const failed = modelOpenFailureReport(ROUTES.gdrive, {error: new Error('x')}).session_id
      expect(second).toBe(first)
      expect(failed).toBe(first)
      _resetPageSessionForTests()
      expect(pageSession()).not.toBe(first)
    })

    // The guarantee the privacy policy rests on: the id is never put on the
    // device, so nothing ties one visit to the next.
    it('is never written to any storage', () => {
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
        reportModelOpenCount(ROUTES.github, {type: 'ifc'}, {...PROD, nav, outcomeParams: OUTCOME_PARAMS})
        reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav})
        reportModelOpenFailure(ROUTES.local, {error: new Error('x')}, {...PROD, nav})
        expect(nav.sendBeacon).toHaveBeenCalledTimes(3)
        for (const spy of writes) {
          expect(spy).not.toHaveBeenCalled()
        }
        expect(idbOpen).not.toHaveBeenCalled()
        expect(getDirectory).not.toHaveBeenCalled()
        const sessionId = JSON.parse(nav.sendBeacon.mock.calls[0][1]).session_id
        expect(document.cookie).not.toContain(sessionId)
        for (const store of [localStorage, sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            expect(store.getItem(store.key(i))).not.toContain(sessionId)
          }
        }
      } finally {
        writes.forEach((spy) => spy.mockRestore())
        globalThis.indexedDB = savedIdb
        Object.defineProperty(navigator, 'storage', {value: savedStorage, configurable: true})
      }
    })
  })

  it('sends a finished load\'s report to the function in production', () => {
    const nav = beaconNav()
    expect(reportModelOpenCount(ROUTES.gdrive, {type: 'step'}, {...PROD, nav, outcomeParams: OUTCOME_PARAMS})).toBe(true)
    expect(nav.sendBeacon).toHaveBeenCalledTimes(1)
    const [path, body] = nav.sendBeacon.mock.calls[0]
    expect(path).toBe(MODEL_OPEN_COUNT_PATH)
    const sent = JSON.parse(body)
    expect(sent).toMatchObject({content_type: 'step', source: 'gdrive', load_outcome: 'displayed', load_ms: 8123})
    expect(sent).not.toHaveProperty('consent')
  })

  it('sends a failed load\'s report to the function in production', () => {
    const nav = beaconNav()
    expect(reportModelOpenFailure(ROUTES.url, {error: new Error('out of memory')}, {...PROD, nav})).toBe(true)
    expect(JSON.parse(nav.sendBeacon.mock.calls[0][1])).toMatchObject({load_outcome: 'failed', source: 'url'})
  })

  it('sends from an opted-in bldrs deploy preview', () => {
    const nav = beaconNav()
    const preview = {hostname: PREVIEW_HOST, isWebdriver: false, enableInPreview: true}
    expect(reportModelOpenCount(ROUTES.local, {type: 'glb'}, {...preview, nav})).toBe(true)
    expect(nav.sendBeacon).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['localhost', {hostname: 'localhost', isWebdriver: false, enableInPreview: false}],
    ['a deploy preview not opted in', {hostname: PREVIEW_HOST, isWebdriver: false, enableInPreview: false}],
    ['production under webdriver', {...PROD, isWebdriver: true}],
  ])('sends nothing on %s', (_, host) => {
    const nav = beaconNav()
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    try {
      expect(reportModelOpenCount(ROUTES.github, {type: 'ifc'}, {...host, nav})).toBe(false)
      expect(reportModelOpenFailure(ROUTES.github, {error: new Error('x')}, {...host, nav})).toBe(false)
      expect(nav.sendBeacon).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  // jsdom's own host is localhost, so the defaults alone must send nothing:
  // that is what keeps unit and E2E runs out of the counts.
  it('sends nothing with the page\'s own host in tests', () => {
    const nav = beaconNav()
    expect(reportModelOpenCount(ROUTES.github, {type: 'ifc'}, {nav})).toBe(false)
    expect(nav.sendBeacon).not.toHaveBeenCalled()
  })

  it('falls back to a keepalive fetch when the beacon is refused', () => {
    const nav = {...DESKTOP_NAV, sendBeacon: jest.fn(() => false)}
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    try {
      expect(reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav})).toBe(true)
      expect(fetchSpy).toHaveBeenCalledWith(MODEL_OPEN_COUNT_PATH, expect.objectContaining({method: 'POST', keepalive: true}))
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('swallows every error', async () => {
    const throwing = {...DESKTOP_NAV, sendBeacon: jest.fn(() => {
      throw new Error('beacon broke')
    })}
    expect(reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav: throwing})).toBe(false)
    expect(reportModelOpenFailure(ROUTES.url, {error: new Error('x')}, {...PROD, nav: throwing})).toBe(false)
    const refused = {...DESKTOP_NAV, sendBeacon: () => false}
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    try {
      expect(reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav: refused})).toBe(true)
      await Promise.resolve()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

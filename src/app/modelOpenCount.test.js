import {resetModelOpenReportForTest} from '../utils/reportModelOpen'
import {MODEL_OPEN_COUNT_PATH, modelOpenCountReport, modelOpenSource, reportModelOpenCount} from './modelOpenCount'
import {parseModelOpenCountReport} from '../privacy/modelOpenCountReport'


jest.mock('../privacy/analytics', () => ({
  ...jest.requireActual('../privacy/analytics'),
  isAllowed: jest.fn(() => false),
}))


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


/** @return {object} a navigator whose sendBeacon records what it was given */
function beaconNav() {
  return {...DESKTOP_NAV, sendBeacon: jest.fn(() => true)}
}


describe('app/modelOpenCount', () => {
  const {isAllowed} = jest.requireMock('../privacy/analytics')

  beforeEach(() => {
    resetModelOpenReportForTest()
    isAllowed.mockReturnValue(false)
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

  // The sample roster is checked against localOnlyMode's own list, so a
  // sample route stays `sample` only as long as the roster has it.
  it('takes the sample repo paths from the roster', () => {
    const {SAMPLE_MODELS} = jest.requireActual('../Components/Open/sampleModelRoster')
    const ghSample = SAMPLE_MODELS.map((s) => s.path.split('#')[0]).find((p) => p.startsWith('/share/v/gh/'))
    const route = {kind: 'provider', provider: 'github', getRepoPath: () => ghSample.slice('/share/v/gh'.length)}
    expect(modelOpenSource(route)).toBe('sample')
  })

  it.each(Object.keys(ROUTES))('builds a %s route\'s report from enums only', (route) => {
    const report = modelOpenCountReport(ROUTES[route], {type: 'IFC'}, {fileSize: 20 * MB, nav: DESKTOP_NAV, consent: true})
    expect(report).toEqual({
      content_type: 'ifc',
      size_bucket: '10-50mb',
      source: modelOpenSource(ROUTES[route]),
      open_kind: 'page',
      form_factor: 'desktop',
      consent: 'on',
    })
    // What the function accepts, and nothing of the route in it.
    expect(parseModelOpenCountReport(JSON.stringify(report))).toEqual(report)
    expect(JSON.stringify(report)).not.toMatch(/secret|example|0a1b2c3d|haus|Momentum/)
  })

  it('files an unknown format under other, and an unknown size under unknown', () => {
    const report = modelOpenCountReport(ROUTES.url, {type: 'IFCPROJECT'}, {nav: DESKTOP_NAV})
    expect(report.content_type).toBe('other')
    expect(report.size_bucket).toBe('unknown')
  })

  it('says in_app for a later open in the same document', () => {
    expect(modelOpenCountReport(ROUTES.github, {type: 'ifc'}).open_kind).toBe('page')
    expect(modelOpenCountReport(ROUTES.url, {type: 'ifc'}).open_kind).toBe('in_app')
  })

  // The point of the count: it doesn't depend on the consent choice, and says
  // which way it was.
  it.each([[true, 'on'], [false, 'off']])('sends with analytics allowed=%s, as consent %s', (allowed, consent) => {
    isAllowed.mockReturnValue(allowed)
    const nav = beaconNav()
    expect(reportModelOpenCount(ROUTES.gdrive, {type: 'step'}, {...PROD, nav, fileSize: 2 * MB})).toBe(true)
    expect(nav.sendBeacon).toHaveBeenCalledTimes(1)
    const [path, body] = nav.sendBeacon.mock.calls[0]
    expect(path).toBe(MODEL_OPEN_COUNT_PATH)
    expect(JSON.parse(body)).toEqual({
      content_type: 'step', size_bucket: '1-10mb', source: 'gdrive', open_kind: 'page', form_factor: 'desktop', consent,
    })
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
    const refused = {...DESKTOP_NAV, sendBeacon: () => false}
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    try {
      expect(reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav: refused})).toBe(true)
      await Promise.resolve()
    } finally {
      fetchSpy.mockRestore()
    }
    isAllowed.mockImplementation(() => {
      throw new Error('cookie read broke')
    })
    expect(reportModelOpenCount(ROUTES.url, {type: 'obj'}, {...PROD, nav: beaconNav()})).toBe(false)
  })
})

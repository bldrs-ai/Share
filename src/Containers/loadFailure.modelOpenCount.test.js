import {reportModelOpenFailure} from '../app/modelOpenCount'
import {resetModelOpenReportForTest} from '../utils/reportModelOpen'
import {reportLoadFailure} from './loadFailure'


// The failed-load report (app/modelOpenCount.js, tested there): here, only
// that reportLoadFailure sends it beside load_failed, for exactly the
// failures load_failed counts. The rest of the failure path (alerts, Sentry)
// is stubbed.
jest.mock('../app/modelOpenCount', () => ({reportModelOpenFailure: jest.fn()}))
jest.mock('@sentry/react', () => ({captureException: jest.fn()}))
jest.mock('../privacy/analytics', () => ({
  ...jest.requireActual('../privacy/analytics'),
  gtagFunnelEvent: jest.fn(),
  gtagEventWithCid: jest.fn(),
}))
jest.mock('../loader/loadProgress', () => ({
  ...jest.requireActual('../loader/loadProgress'),
  attachLoadFailureContext: jest.fn(),
  getLoadFailureInfo: jest.fn(() => ({phase: 'dataParse', fileSize: 1234, format: 'ifc'})),
  loadStallCaptureTags: jest.fn(() => ({})),
}))


/**
 * @param {object} modelPath the route that failed
 * @return {object} reportLoadFailure's context, with fresh refs
 */
function context(modelPath) {
  return {
    modelPath,
    installPrefix: '',
    loadSerialBefore: 0,
    reported: {loadFailure: {current: null}, refusal: {current: null}},
    setAlert: jest.fn(),
    isLegacyUploadRoute: false,
    getIsAuthenticated: () => false,
  }
}

const githubRoute = () => ({kind: 'provider', provider: 'github', getRepoPath: () => '/o/r/main/a.ifc', filepath: '/a.ifc'})


describe('Containers/loadFailure model_open_count', () => {
  const {gtagFunnelEvent} = jest.requireMock('../privacy/analytics')
  let errorSpy

  // reportLoadFailure logs every failure it handles; that line is expected
  // here, so it is diverted and checked rather than left in the test output.
  beforeEach(() => {
    resetModelOpenReportForTest()
    reportModelOpenFailure.mockClear()
    gtagFunnelEvent.mockClear()
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('reports a failed real open once, beside load_failed, with what load_failed reads', () => {
    const route = githubRoute()
    const error = new Error('OpenModel returned -1')
    const ctx = context(route)
    reportLoadFailure(error, ctx)
    expect(reportModelOpenFailure).toHaveBeenCalledTimes(1)
    expect(reportModelOpenFailure).toHaveBeenCalledWith(route, {error, format: 'ifc', fileSize: 1234, phase: 'dataParse'})
    expect(gtagFunnelEvent).toHaveBeenCalledWith('load_failed', expect.anything())
    // An auth or view-settings re-run of the same failure is not a second one.
    reportLoadFailure(error, ctx)
    expect(reportModelOpenFailure).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(error)
  })

  it('does not report the bundled demo failing', () => {
    reportLoadFailure(new Error('x'), context({kind: 'file', isUploadedFile: false, filepath: 'index.ifc'}))
    expect(reportModelOpenFailure).not.toHaveBeenCalled()
  })
})

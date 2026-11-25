import {reportModelOpenCount} from '../app/modelOpenCount'
import {resetModelOpenReportForTest} from '../utils/reportModelOpen'
import {reportModelOpened} from './modelOpenEvents'


// The count's own module is tested in app/modelOpenCount.test.js; here,
// only that reportModelOpened calls it for exactly the opens real_model_open
// counts. Its siblings in sendOpenEvents are stubbed, being tested elsewhere.
jest.mock('../app/modelOpenCount', () => ({reportModelOpenCount: jest.fn(() => true), reportModelOpenFailure: jest.fn()}))
jest.mock('../app/modelActionTracking', () => ({trackModelActionWhenAuthSettled: jest.fn()}))
jest.mock('../privacy/engagementTracking', () => ({trackEngagementOnOpen: jest.fn()}))
jest.mock('../connections/uploadLedger', () => ({recordLocalUpload: jest.fn()}))
jest.mock('../loader/loadProgress', () => ({
  ...jest.requireActual('../loader/loadProgress'),
  captureLoadDiagnostics: jest.fn(),
  getCompletedLoadOutcome: jest.fn(() => 'displayed'),
  getCompletedLoadStats: jest.fn(() => ({fileSize: 3 * 1024 * 1024, loadTime: 10})), // eslint-disable-line no-magic-numbers
}))
jest.mock('../privacy/analytics', () => ({
  ...jest.requireActual('../privacy/analytics'),
  gtagEvent: jest.fn(),
  startModelEngagement: jest.fn(() => () => {}),
}))


/** @return {object} reportModelOpened's context, with fresh refs */
function context() {
  return {
    installPrefix: '',
    refs: {engagementStop: {current: null}, refusal: {current: null}, open: {current: null}},
    setAlert: jest.fn(),
    getIsAuthenticated: () => false,
  }
}

const FILE_SIZE = 3 * 1024 * 1024 // eslint-disable-line no-magic-numbers
const githubRoute = () => ({kind: 'provider', provider: 'github', getRepoPath: () => '/o/r/main/a.ifc', downloadUrl: 'https://x/a.ifc'})


describe('Containers/modelOpenEvents model_open_count', () => {
  const {gtagEvent} = jest.requireMock('../privacy/analytics')

  beforeEach(() => {
    resetModelOpenReportForTest()
    reportModelOpenCount.mockClear()
    gtagEvent.mockClear()
  })

  it('counts a new real open once, beside real_model_open, with its size and kind', () => {
    const route = githubRoute()
    const model = {type: 'ifc'}
    reportModelOpened(route, model, context())
    expect(reportModelOpenCount).toHaveBeenCalledTimes(1)
    expect(reportModelOpenCount).toHaveBeenCalledWith(route, model, {
      outcomeParams: expect.objectContaining({load_outcome: 'displayed', stats_fileSize: FILE_SIZE, stats_loadTime: 10}),
      openKind: 'page',
    })
    expect(gtagEvent).toHaveBeenCalledWith('real_model_open', expect.anything())
  })

  // A theme toggle or view-settings change reloads the same open.
  it('does not count a reload of the same open', () => {
    const route = githubRoute()
    const ctx = context()
    reportModelOpened(route, {type: 'ifc'}, ctx)
    reportModelOpened(route, {type: 'ifc'}, ctx)
    expect(reportModelOpenCount).toHaveBeenCalledTimes(1)
  })

  it('counts an in-app switch to another model as a new open', () => {
    const ctx = context()
    reportModelOpened(githubRoute(), {type: 'ifc'}, ctx)
    reportModelOpened(githubRoute(), {type: 'ifc'}, ctx)
    expect(reportModelOpenCount).toHaveBeenCalledTimes(2)
    expect(reportModelOpenCount.mock.calls[1][2].openKind).toBe('in_app')
  })

  it('does not count the bundled demo', () => {
    reportModelOpened({kind: 'file', isUploadedFile: false, filepath: 'index.ifc'}, {type: 'ifc'}, context())
    expect(reportModelOpenCount).not.toHaveBeenCalled()
    expect(gtagEvent).not.toHaveBeenCalledWith('real_model_open', expect.anything())
  })
})

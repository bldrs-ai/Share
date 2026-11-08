import {setTag} from '@sentry/react'
import {flags} from '../../FeatureFlags'
import {gtagEvent} from '../../privacy/analytics'
import {reportRenderMode, resetRenderModeReportForTest} from './reportRenderMode'


jest.mock('@sentry/react', () => ({setTag: jest.fn()}))
jest.mock('../../privacy/analytics', () => ({gtagEvent: jest.fn()}))


describe('viewer/three/reportRenderMode', () => {
  let originalLocation
  const setSearch = (search) => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
  }
  beforeEach(() => {
    originalLocation = window.location
    setSearch('')
    resetRenderModeReportForTest()
    jest.clearAllMocks()
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('reports on-demand by default: Sentry tag and one GA event', () => {
    reportRenderMode()
    expect(setTag).toHaveBeenCalledWith('render_mode', 'on-demand')
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('render_mode', {mode: 'on-demand'})
  })

  it('reports the per-session kill switch', () => {
    setSearch('?feature=disableRenderOnDemand')
    reportRenderMode()
    expect(setTag).toHaveBeenCalledWith('render_mode', 'every-frame:disableRenderOnDemand')
    expect(gtagEvent).toHaveBeenCalledWith('render_mode', {mode: 'every-frame:disableRenderOnDemand'})
  })

  it('reports the static rollback', () => {
    const flag = flags.find((f) => f.name === 'disableRenderOnDemand')
    flag.isActive = true
    try {
      reportRenderMode()
    } finally {
      flag.isActive = false
    }
    expect(setTag).toHaveBeenCalledWith('render_mode', 'every-frame:rollback')
    expect(gtagEvent).toHaveBeenCalledWith('render_mode', {mode: 'every-frame:rollback'})
  })

  it('sends GA once per page load but re-sets the tag on a rebuild', () => {
    reportRenderMode()
    reportRenderMode()
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(setTag).toHaveBeenCalledTimes(2)
  })

  it('never throws out when a sink throws, and the other sink still runs', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('ga down')
    })
    expect(() => reportRenderMode()).not.toThrow()
    expect(setTag).toHaveBeenCalledTimes(1)
    resetRenderModeReportForTest()
    setTag.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    expect(() => reportRenderMode()).not.toThrow()
    expect(gtagEvent).toHaveBeenCalledTimes(2)
  })

  it('retries GA on a rebuild when the first send threw', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('ga down')
    })
    reportRenderMode()
    reportRenderMode()
    reportRenderMode()
    expect(gtagEvent).toHaveBeenCalledTimes(2)
  })
})

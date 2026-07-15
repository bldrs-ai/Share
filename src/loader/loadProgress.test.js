jest.mock('@sentry/react', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}))

import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import {
  STALL_TIMEOUT_MS,
  attachLoadFailureContext,
  beginLoadProgress,
  endLoadProgress,
  formatLoadProgress,
  isStructuredProgress,
  reportLoadProgress,
} from './loadProgress'


describe('loadProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    endLoadProgress()
    jest.useRealTimers()
  })

  describe('formatLoadProgress', () => {
    it('renders a percent when the total is known', () => {
      expect(formatLoadProgress({phase: 'geometry', completed: 42, total: 100, unit: 'products'}))
        .toBe('Extracting geometry 42%')
    })

    it('renders the label alone when indeterminate', () => {
      expect(formatLoadProgress({phase: 'dataParse', completed: 5000, unit: 'bytes'}))
        .toBe('Parsing model')
    })

    it('passes unknown phases through', () => {
      expect(formatLoadProgress({phase: 'mystery', completed: 1})).toBe('mystery')
    })
  })

  describe('isStructuredProgress', () => {
    it('accepts conway-shaped events and rejects legacy signals', () => {
      expect(isStructuredProgress({phase: 'geometry', completed: 1})).toBe(true)
      expect(isStructuredProgress('Loading model...')).toBe(false)
      expect(isStructuredProgress({loaded: 1024})).toBe(false)
      expect(isStructuredProgress(null)).toBe(false)
    })
  })

  describe('reporter lifecycle', () => {
    it('forwards structured events and adds breadcrumbs', () => {
      const onEvent = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onEvent})
      const event = {phase: 'dataParse', completed: 10, total: 100, unit: 'bytes'}
      reportLoadProgress(event)
      expect(onEvent).toHaveBeenCalledWith(event)
      expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
        category: 'model.load',
        message: 'Parsing model 10%',
      }))
    })

    it('throttles breadcrumbs but not UI events', () => {
      const onEvent = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onEvent})
      const eventCount = 5
      for (let i = 1; i <= eventCount; i++) {
        reportLoadProgress({phase: 'geometry', completed: i, total: 10, unit: 'products'})
      }
      expect(onEvent).toHaveBeenCalledTimes(eventCount)
      expect(addBreadcrumb).toHaveBeenCalledTimes(1)
    })

    it('fires the stall watchdog once with the last event', () => {
      const onStall = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onStall})
      const event = {phase: 'geometry', completed: 3, total: 10, unit: 'products'}
      reportLoadProgress(event)
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      expect(onStall).toHaveBeenCalledWith(event)
      expect(captureMessage).toHaveBeenCalledWith('Model load stalled', 'warning')
      expect(setTag).toHaveBeenCalledWith('load.phase', 'geometry')
    })

    it('stops the watchdog on endLoadProgress but keeps failure context', () => {
      const onStall = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onStall})
      reportLoadProgress({phase: 'dataParse', completed: 1, total: 4, unit: 'bytes'})
      endLoadProgress()
      jest.advanceTimersByTime(STALL_TIMEOUT_MS * 2)
      expect(onStall).not.toHaveBeenCalled()

      attachLoadFailureContext()
      expect(setTag).toHaveBeenCalledWith('load.phase', 'dataParse')
      expect(setContext).toHaveBeenCalledWith('load', expect.objectContaining({
        phase: 'dataParse',
        completed: 1,
        total: 4,
        fileInfo: 'index.ifc',
      }))
    })

    it('keeps a legacy string trail for failure context', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress('Downloading model data...')
      attachLoadFailureContext()
      expect(setTag).toHaveBeenCalledWith('load.phase', 'Downloading model data...')
    })

    it('is a safe no-op with no active load', () => {
      endLoadProgress()
      expect(() => reportLoadProgress({phase: 'geometry', completed: 1})).not.toThrow()
      expect(() => attachLoadFailureContext()).not.toThrow()
    })
  })
})

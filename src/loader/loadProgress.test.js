jest.mock('@sentry/react', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}))

import {captureMessage, setContext, setTag} from '@sentry/react'
import useStore from '../store/useStore'
import {
  STALL_TIMEOUT_MS,
  attachLoadFailureContext,
  beginLoadProgress,
  endLoadProgress,
  isModelInfoProgress,
  isStructuredProgress,
  reportEngineVersion,
  reportLoadProgress,
  reportModelInfo,
} from './loadProgress'


/** @return {string[]} the report lines currently in the store */
function reportLines() {
  return useStore.getState().loadReportLines
}


describe('loadProgress', () => {
  let consoleInfoSpy

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    useStore.getState().setLoadReportLines([])
    useStore.getState().setCurrentLoadLine(null)
    useStore.getState().setLoadResult(null)
  })

  afterEach(() => {
    endLoadProgress()
    consoleInfoSpy.mockRestore()
    jest.useRealTimers()
  })

  describe('signal detection', () => {
    it('classifies structured events, model-info envelopes, and strings', () => {
      expect(isStructuredProgress({phase: 'geometry', completed: 1})).toBe(true)
      expect(isStructuredProgress('Loading model...')).toBe(false)
      expect(isStructuredProgress({loaded: 1024})).toBe(false)
      expect(isModelInfoProgress({modelInfo: {fileName: 'a.ifc'}})).toBe(true)
      expect(isModelInfoProgress({phase: 'geometry', completed: 1})).toBe(false)
    })
  })

  describe('report accumulation', () => {
    it('begins with the Share preamble line and mirrors it to the console', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      expect(reportLines()[0]).toMatch(/^Share v/)
      expect(consoleInfoSpy).toHaveBeenCalledWith(reportLines()[0])
    })

    it('appends engine and model lines', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportEngineVersion('Conway v1.379.1190')
      reportLoadProgress({modelInfo: {fileName: 'index.ifc', schema: 'IFC4'}})
      expect(reportLines()).toContain('Conway v1.379.1190')
      expect(reportLines()).toContain('Model: index.ifc — IFC4')
    })

    it('reportModelInfo works for non-engine formats', () => {
      beginLoadProgress({fileInfo: 'ISS_stationary.glb'})
      reportModelInfo({fileName: 'ISS_stationary.glb', schema: 'GLB', byteLength: 39_950_000})
      expect(reportLines()).toContain('Model: ISS_stationary.glb — GLB, 38.1 MB')
    })

    it('publishes a live bar and freezes a completed stage without a bar', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'dataParse', completed: 50, total: 100, elapsedMs: 100})
      // Live stage keeps its bar.
      expect(useStore.getState().currentLoadLine).toMatch(/^Parsing \[0%/)

      // dataParse reaches 100%, then geometry begins → Parsing freezes as a
      // completed line: colon format, no bar.
      reportLoadProgress({phase: 'dataParse', completed: 100, total: 100, elapsedMs: 150})
      reportLoadProgress({phase: 'geometry', completed: 0, total: 10, elapsedMs: 200})
      const frozenParsing = reportLines().find((line) => line.startsWith('Parsing'))
      expect(frozenParsing).toMatch(/^Parsing: /)
      expect(frozenParsing).not.toMatch(/\[/)
      expect(useStore.getState().currentLoadLine).toMatch(/^Geometry/)
    })

    it('normalizes legacy strings into stages with stamped deltas', () => {
      beginLoadProgress({fileInfo: 'model.fbx'})
      reportLoadProgress('Downloading model data...')
      expect(useStore.getState().currentLoadLine).toMatch(/^Downloading model data \[\.\.\.\]/)
      reportLoadProgress('Processing model data...')
      // Indeterminate stage completed → colon format, no bar.
      expect(reportLines().some((line) => /^Downloading model data: /.test(line))).toBe(true)
    })

    it('endLoadProgress freezes the running stage + Total and clears the live line', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'geometry', completed: 5, total: 10, elapsedMs: 100})
      endLoadProgress()
      const lines = reportLines()
      expect(lines.some((line) => line.startsWith('Geometry'))).toBe(true)
      expect(lines.some((line) => /^Total: /.test(line))).toBe(true)
      expect(useStore.getState().currentLoadLine).toBe(null)
    })

    it('appends captured console warnings/errors after the Total line', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'geometry', completed: 1, total: 10, elapsedMs: 50})
      // Engine-style errors during the load — captured via the console tee.
      console.error('CDT Exception (hemisphere: 0)')
      console.error('CDT Exception (hemisphere: 0)')
      endLoadProgress()

      const lines = reportLines()
      const totalIndex = lines.findIndex((line) => /^Total: /.test(line))
      const diagHeaderIndex = lines.findIndex((line) => /^Warnings & errors \(/.test(line))
      expect(totalIndex).toBeGreaterThanOrEqual(0)
      expect(diagHeaderIndex).toBeGreaterThan(totalIndex)
      expect(lines).toContain('CDT Exception (hemisphere: 0) (×2)')
      consoleErrorSpy.mockRestore()
    })

    it('a new load clears the previous report', () => {
      beginLoadProgress({fileInfo: 'a.ifc'})
      reportEngineVersion('Conway v1')
      endLoadProgress()
      beginLoadProgress({fileInfo: 'b.ifc'})
      expect(reportLines()).not.toContain('Conway v1')
    })
  })

  describe('grace result', () => {
    it('publishes a success result with the "Model Loaded." prefix', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'geometry', completed: 10, total: 10, elapsedMs: 100})
      endLoadProgress()
      const result = useStore.getState().loadResult
      expect(result.status).toBe('success')
      expect(result.summaryLine).toMatch(/^Model Loaded\. Total: /)
    })

    it('publishes an error result with the failure summary', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})
      endLoadProgress(new Error('bad STEP header'))
      const result = useStore.getState().loadResult
      expect(result.status).toBe('error')
      expect(result.summaryLine).toBe('Load failed: bad STEP header')
    })

    it('summarizes an out-of-memory failure specially', () => {
      const oom = new Error('Cannot enlarge memory arrays')
      oom.isOutOfMemory = true
      beginLoadProgress({fileInfo: 'big.ifc'})
      endLoadProgress(oom)
      expect(useStore.getState().loadResult.summaryLine).toBe('Load failed: out of memory')
    })

    it('a new load clears the previous grace result', () => {
      beginLoadProgress({fileInfo: 'a.ifc'})
      endLoadProgress()
      expect(useStore.getState().loadResult).not.toBe(null)
      beginLoadProgress({fileInfo: 'b.ifc'})
      expect(useStore.getState().loadResult).toBe(null)
    })
  })

  describe('sentry integration', () => {
    it('fires the stall watchdog once and tags the phase', () => {
      const onStall = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onStall})
      reportLoadProgress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      expect(onStall).toHaveBeenCalledWith(expect.objectContaining({phase: 'geometry'}))
      expect(captureMessage).toHaveBeenCalledWith('Model load stalled', 'warning')
      expect(setTag).toHaveBeenCalledWith('load.phase', 'geometry')
    })

    it('failure context includes the accumulated report text', () => {
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})
      endLoadProgress()
      attachLoadFailureContext()
      expect(setTag).toHaveBeenCalledWith('load.phase', 'dataParse')
      expect(setContext).toHaveBeenCalledWith('load', expect.objectContaining({
        phase: 'dataParse',
        fileInfo: 'index.ifc',
        report: expect.stringContaining('Share v'),
      }))
    })

    it('ignores straggler progress after endLoadProgress', () => {
      const onStall = jest.fn()
      beginLoadProgress({fileInfo: 'index.ifc', onStall})
      reportLoadProgress({phase: 'dataParse', completed: 2, total: 4, elapsedMs: 10})
      endLoadProgress()
      const linesAtEnd = reportLines()

      reportLoadProgress({phase: 'geometry', completed: 9, total: 10, elapsedMs: 20})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS * 2)
      expect(onStall).not.toHaveBeenCalled()
      expect(reportLines()).toEqual(linesAtEnd)
    })

    it('is a safe no-op with no active load', () => {
      endLoadProgress()
      expect(() => reportLoadProgress({phase: 'geometry', completed: 1})).not.toThrow()
      expect(() => reportEngineVersion('Conway v1')).not.toThrow()
      expect(() => attachLoadFailureContext()).not.toThrow()
    })
  })
})

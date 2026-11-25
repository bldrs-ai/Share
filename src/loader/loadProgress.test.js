jest.mock('@sentry/react', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}))

// reportBvhDepthCapToGa returns whether GA took the event.
jest.mock('./reportLoadDiagnostics', () => ({
  reportBvhDepthCapToGa: jest.fn(() => true),
  reportLoadDiagnosticsToGa: jest.fn(() => true),
  reportLoadStallRecovered: jest.fn(() => true),
}))
import Cookies from 'js-cookie'
import {reportBvhDepthCapToGa, reportLoadDiagnosticsToGa, reportLoadStallRecovered} from './reportLoadDiagnostics'
import Logger, {DATA_DEFECT} from '@bldrs-ai/conway/src/logging/logger'
import {captureMessage, setContext, setTag} from '@sentry/react'
import {_resetGaClientIdForTests} from '../privacy/analytics'
import {consoleFileName, withSentrySafeMessage} from '../privacy/sentryRedaction'
import useStore from '../store/useStore'
import {
  HANG_TIMEOUT_MS,
  LOAD_HUNG_MESSAGE,
  LoadReporter,
  STALL_TIMEOUT_MS,
  NO_GEOMETRY_ALERT,
  classifyLoadOutcome,
  isModelInfoProgress,
  isStructuredProgress,
  loadFailureInfoOf,
  noGeometryAlert,
} from './loadProgress'
import {consoleTeeHolder} from './consoleTee'


/**
 * The store as a reporter's sink, written as a load job that is still
 * current writes it (session/modelSession.js#LoadJob#set). The report text
 * is read back from the store, as the UI reads it.
 */
const storeSink = {
  set: (partial) => {
    useStore.setState(partial)
    return true
  },
  get: (key) => useStore.getState()[key],
}


/**
 * The reporter the test began last. Each test begins its own: a load holds
 * its reporter (open-t200 slice R), and so does each test here.
 */
let report = null


/**
 * A load's reporter, publishing to the store.
 *
 * @param {object} opts LoadReporter's
 * @return {LoadReporter}
 */
function beginReport(opts) {
  report = new LoadReporter({sink: storeSink, ...opts})
  return report
}


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
    report?.end()
    report = null
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

  describe('classifyLoadOutcome', () => {
    it('is displayed whenever anything was built', () => {
      expect(classifyLoadOutcome({vertexCount: 8, triangleCount: 4})).toBe('displayed')
      // One count present and non-zero is enough — a point cloud has no
      // triangles and is still on screen.
      expect(classifyLoadOutcome({vertexCount: 8})).toBe('displayed')
      expect(classifyLoadOutcome({vertexCount: 8, triangleCount: 0})).toBe('displayed')
    })

    it('is unusable only when every reported count is zero', () => {
      expect(classifyLoadOutcome({vertexCount: 0, triangleCount: 0})).toBe('unusable')
      expect(classifyLoadOutcome({triangleCount: 0})).toBe('unusable')
    })

    it('defaults to displayed when the loader reported nothing usable', () => {
      expect(classifyLoadOutcome(undefined)).toBe('displayed')
      expect(classifyLoadOutcome({})).toBe('displayed')
      expect(classifyLoadOutcome({vertexCount: undefined, triangleCount: null})).toBe('displayed')
    })

    // Share#1962's table. Every case builds nothing (vertexCount 0); only
    // conway's own counts decide whether that is the file or the engine.
    describe('an empty build, split by conway\'s counts (Share#1962)', () => {
      const EMPTY = {vertexCount: 0, triangleCount: 0}

      it('is no_geometry when the file has no products and conway confirms no errors', () => {
        expect(classifyLoadOutcome({...EMPTY, productCount: 0, errorCount: 0})).toBe('no_geometry')
      })

      // Zero products with errors is what a parse or extraction that died
      // before recording any product looks like, so it is the engine's
      // failure, not an empty file.
      it('stays unusable for no products when conway logged errors', () => {
        expect(classifyLoadOutcome({...EMPTY, productCount: 0, errorCount: 3})).toBe('unusable')
      })

      it('stays unusable for no products when the error count is unknown', () => {
        expect(classifyLoadOutcome({...EMPTY, productCount: 0})).toBe('unusable')
      })

      // Statistics#getErrorCount can leave out errors the Logger saw; the
      // reporter's own tally of the Logger's errors (engineErrorTotal) vetoes.
      it('stays unusable when the logger tally has errors Statistics did not count', () => {
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 0, errorCount: 0, engineErrorTotal: 2,
        })).toBe('unusable')
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 12, productsWithGeometryCount: 0, errorCount: 0, engineErrorTotal: 2,
        })).toBe('unusable')
        // A zero tally is no veto.
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 0, errorCount: 0, engineErrorTotal: 0,
        })).toBe('no_geometry')
      })

      it('is no_geometry for products with none drawable and no engine error', () => {
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 12, productsWithGeometryCount: 0, errorCount: 0,
        })).toBe('no_geometry')
      })

      it('stays unusable when products had no geometry and conway logged errors', () => {
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 12, productsWithGeometryCount: 0, errorCount: 2,
        })).toBe('unusable')
      })

      it('stays unusable when conway counted geometry yet nothing was built', () => {
        expect(classifyLoadOutcome({
          ...EMPTY, productCount: 12, productsWithGeometryCount: 5, errorCount: 0,
        })).toBe('unusable')
      })

      // An engine that does not report a count has not said zero.
      it('stays unusable when the engine did not report the counts the verdict needs', () => {
        expect(classifyLoadOutcome(EMPTY)).toBe('unusable')
        expect(classifyLoadOutcome({...EMPTY, productCount: 12})).toBe('unusable')
        expect(classifyLoadOutcome({...EMPTY, productCount: 12, productsWithGeometryCount: 0})).toBe('unusable')
        expect(classifyLoadOutcome({...EMPTY, productCount: 12, errorCount: 0})).toBe('unusable')
      })

      it('is displayed whenever geometry was built, whatever the counts say', () => {
        expect(classifyLoadOutcome({
          vertexCount: 8, triangleCount: 4, productCount: 0, productsWithGeometryCount: 0, errorCount: 0,
        })).toBe('displayed')
      })
    })
  })

  describe('report accumulation', () => {
    it('begins with the Share preamble line and mirrors it to the console', () => {
      beginReport({fileInfo: 'index.ifc'})
      expect(reportLines()[0]).toMatch(/^Share v/)
      expect(consoleInfoSpy).toHaveBeenCalledWith(reportLines()[0])
    })

    it('appends engine and model lines', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.engineVersion('Conway v1.379.1190')
      report.progress({modelInfo: {fileName: 'index.ifc', schema: 'IFC4'}})
      expect(reportLines()).toContain('Conway v1.379.1190')
      expect(reportLines()).toContain('Model: index.ifc — IFC4')
    })

    // A BVH that hit three-mesh-bvh's depth cap becomes one Health line,
    // summed over the load's builds, instead of the console warning that
    // titled its diagnostics event (model/bvhBuild.js).
    it('adds one Health line for BVH trees that hit the depth cap', () => {
      beginReport({fileInfo: 'big.stp'})
      report.bvhDepthCap({trees: 1, maxLeafTriangles: 120, maxDepth: 40})
      report.bvhDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
      report.end()
      expect(reportLines()).toContain(
        'Health: picking index hit its depth cap (40) in 3 trees; largest leaf 3400 triangles, tested one by one per pick')
      // After the load it is a no-op.
      report.bvhDepthCap({trees: 9, maxLeafTriangles: 9, maxDepth: 40})
      expect(reportLines().filter((line) => line.startsWith('Health: picking'))).toHaveLength(1)
    })

    it('reportModelInfo works for non-engine formats', () => {
      beginReport({fileInfo: 'ISS_stationary.glb'})
      report.modelInfo({fileName: 'ISS_stationary.glb', schema: 'GLB', byteLength: 39_950_000})
      expect(reportLines()).toContain('Model: ISS_stationary.glb — GLB, 38.1 MB')
    })

    it('exposes completed GA load stats with separate diagnostic counts', () => {
      const BYTES_PER_MB = 1024 * 1024 // eslint-disable-line no-magic-numbers
      const HEAP_MB = 64
      const LOAD_TIME_MS = 1250
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(performance, 'memory', {
        configurable: true,
        value: {usedJSHeapSize: HEAP_MB * BYTES_PER_MB},
      })
      beginReport({fileInfo: 'ISS_stationary.glb'})
      report.modelInfo({fileName: 'ISS_stationary.glb', byteLength: 39_950_000})
      console.warn('recoverable material issue')
      console.error('missing texture')
      console.warn('recoverable material issue')
      jest.advanceTimersByTime(LOAD_TIME_MS)
      report.end()

      expect(report.completedStats()).toEqual({
        fileSize: 39_950_000,
        memoryUsed: HEAP_MB * BYTES_PER_MB,
        loadTime: LOAD_TIME_MS,
        // The console tee is page noise, so it is named for that. The
        // unqualified errorCount/warningCount are reserved for the engine.
        pageErrorCount: 1,
        pageWarnCount: 2,
      })
      delete performance.memory
      consoleWarnSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('reportSourceInfo appends a byte-source line', () => {
      beginReport({fileInfo: 'model.ply'})
      report.line('Source: OPFS cache (uploaded file)')
      expect(reportLines()).toContain('Source: OPFS cache (uploaded file)')
    })

    // Before slice R: with no active reporter. A load that has none now
    // holds none (Loader.js#load's `report?.`), so what is left to pin is
    // that a line after the load's end is a no-op, as it was then.
    it('reportSourceInfo is a no-op without an active load', () => {
      beginReport({fileInfo: 'model.ply'})
      report.end()
      const linesAtEnd = reportLines()
      expect(() => report.line('Source: OPFS cache (uploaded file)')).not.toThrow()
      expect(reportLines()).toEqual(linesAtEnd)
    })

    it('publishes a live bar and freezes a completed stage without a bar', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'dataParse', completed: 50, total: 100, elapsedMs: 100})
      // Live stage keeps its bar.
      expect(useStore.getState().currentLoadLine).toMatch(/^Parsing \[0%/)

      // dataParse reaches 100%, then geometry begins → Parsing freezes as a
      // completed line: colon format, no bar.
      report.progress({phase: 'dataParse', completed: 100, total: 100, elapsedMs: 150})
      report.progress({phase: 'geometry', completed: 0, total: 10, elapsedMs: 200})
      const frozenParsing = reportLines().find((line) => line.startsWith('Parsing'))
      expect(frozenParsing).toMatch(/^Parsing: /)
      expect(frozenParsing).not.toMatch(/\[/)
      expect(useStore.getState().currentLoadLine).toMatch(/^Geometry/)
    })

    it('rebases engine elapsedMs so legacy→engine stage boundaries never go negative', () => {
      // Regression: engine events carry elapsedMs from the ENGINE clock
      // (conway's tracker starts at OpenModel), while legacy strings are
      // stamped from load start. Closing a legacy stage with a raw engine
      // timestamp produced "Parsing model geometry: -1.6s" whenever the
      // pre-parse stages (download, read) took longer than the engine's
      // first-event offset.
      beginReport({fileInfo: 'index.ifc'})
      // 5s of Share-side wall clock passes before the engine starts
      // (download + read stages under fake timers).
      const shareSideStagesMs = 5000
      report.progress('Preparing file download...')
      jest.advanceTimersByTime(shareSideStagesMs)
      report.progress('Parsing model geometry...')
      // Engine's first event: 10ms on ITS clock — far behind Share's.
      report.progress({phase: 'dataParse', completed: 0, total: 100, elapsedMs: 10})
      report.progress({phase: 'geometry', completed: 0, total: 100, elapsedMs: 250})
      const frozen = reportLines()
      // Every closed stage line carries a non-negative duration (the legacy
      // "Parsing model geometry" line closes at 0.000s, not -4.99s).
      const durations = frozen
        .map((line) => / (-?[\d.]+)s/.exec(line))
        .filter((match) => match !== null)
        .map((match) => Number(match[1]))
      expect(durations.length).toBeGreaterThan(0)
      for (const duration of durations) {
        expect(duration).toBeGreaterThanOrEqual(0)
      }
      expect(frozen.some((line) => /^Parsing model geometry: 0\.000s/.test(line))).toBe(true)
      // Engine-to-engine deltas are preserved exactly: the Parsing stage
      // (frozen mid-flight, so it keeps its bar) closes at the geometry
      // event, 250-10 = 240ms on the engine clock.
      expect(frozen.some((line) => /^Parsing \[.*0\.240s/.test(line))).toBe(true)
    })

    it('normalizes legacy strings into stages with stamped deltas', () => {
      beginReport({fileInfo: 'model.fbx'})
      report.progress('Downloading model data...')
      expect(useStore.getState().currentLoadLine).toMatch(/^Downloading model data \[\.\.\.\]/)
      report.progress('Processing model data...')
      // Indeterminate stage completed → colon format, no bar.
      expect(reportLines().some((line) => /^Downloading model data: /.test(line))).toBe(true)
    })

    it('endLoadProgress freezes the running stage + Total and clears the live line', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'geometry', completed: 5, total: 10, elapsedMs: 100})
      report.end()
      const lines = reportLines()
      expect(lines.some((line) => line.startsWith('Geometry'))).toBe(true)
      expect(lines.some((line) => /^Total: /.test(line))).toBe(true)
      expect(useStore.getState().currentLoadLine).toBe(null)
    })

    // open-205 #2011 step A: a load given up for another model leaves no
    // report and no "Load failed" grace line, and stops teeing the console.
    it('endLoadProgress for an aborted load clears the report instead of freezing it', () => {
      const consoleWarnBefore = console.warn
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'geometry', completed: 5, total: 10, elapsedMs: 100})
      expect(reportLines().length).toBeGreaterThan(0)
      report.end(new Error('engine session closed'), {isAborted: true})
      expect(reportLines()).toEqual([])
      expect(useStore.getState().currentLoadLine).toBe(null)
      expect(useStore.getState().loadResult).toBe(null)
      expect(console.warn).toBe(consoleWarnBefore)
      // Ended: a late progress event from the given-up load writes nothing.
      report.progress({phase: 'geometry', completed: 9, total: 10, elapsedMs: 200})
      expect(reportLines()).toEqual([])
      // Where it stopped is still readable, for the abort's GA event.
      expect(report.failureInfo().phase).toBe('geometry')
    })

    // open-205 #2019 (codex on #2247): a load the user has left can still be
    // unwinding after the next load has begun (a remount gives each view its
    // own queue). Its end and its late progress touch nothing of the next
    // load's report: since open-t200 slice R each load holds its own
    // reporter, and a left load's sink (its LoadJob, no longer current)
    // writes nothing. Red with one shared reporter, as `activeReporter` was:
    // A's end then ends B's report.
    it('a load holding its own reporter cannot end, or write into, the next load\'s report', () => {
      let isACurrent = true
      const sinkOfA = {set: (partial) => isACurrent && storeSink.set(partial), get: storeSink.get}
      const reporterOfA = beginReport({fileInfo: 'a.ifc', sink: sinkOfA})
      isACurrent = false
      const reporterOfB = beginReport({fileInfo: 'b.ifc'})
      reporterOfB.progress({phase: 'geometry', completed: 1, total: 10, elapsedMs: 10})
      const linesOfB = reportLines()
      const liveLineOfB = useStore.getState().currentLoadLine

      reporterOfA.progress('Parsing A late')
      reporterOfA.end(null)
      reporterOfA.end(new Error('A gave up'), {isAborted: true})

      expect(reporterOfA).not.toBe(reporterOfB)
      expect(reporterOfB.ended).toBe(false)
      expect(reportLines()).toEqual(linesOfB)
      expect(useStore.getState().currentLoadLine).toBe(liveLineOfB)
      expect(useStore.getState().loadResult).toBe(null)
      reporterOfB.end(null)
      expect(reporterOfB.ended).toBe(true)
    })

    it('summarizes captured console warnings/errors after the Total line', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'geometry', completed: 1, total: 10, elapsedMs: 50})
      // Engine-style errors during the load — captured via the console tee.
      console.error('CDT Exception (hemisphere: 0)')
      console.error('CDT Exception (hemisphere: 0)')
      report.end()

      const lines = reportLines()
      const totalIndex = lines.findIndex((line) => /^Total: /.test(line))
      const diagIndex = lines.findIndex((line) => /^Warnings & errors \(/.test(line))
      expect(totalIndex).toBeGreaterThanOrEqual(0)
      expect(diagIndex).toBeGreaterThan(totalIndex)
      // One line only: counts + the message. A single distinct message drops
      // the "N distinct" note.
      expect(lines[diagIndex]).toBe('Warnings & errors (2): CDT Exception (hemisphere: 0) (×2)')
      consoleErrorSpy.mockRestore()
    })

    // Share#2107: an Error logged during the load whose text names the user's
    // file is tallied by its safe message; the console still prints it whole.
    it('tallies a marked Error by its safe message', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      beginReport({fileInfo: 'index.ifc'})
      console.error(withSentrySafeMessage(new Error('Error writing to Tower-of-Secrets.ifc'),
        'Error from worker [condition=write-failed]: (details withheld)'))
      report.end()
      const line = reportLines().find((l) => /^Warnings & errors/.test(l))
      expect(line).toBe('Warnings & errors (1): Error from worker [condition=write-failed]: (details withheld)')
      expect(consoleErrorSpy.mock.calls[0][0].message).toContain('Tower-of-Secrets')
      consoleErrorSpy.mockRestore()
    })

    it('collapses many distinct warnings into that one line', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginReport({fileInfo: 'Arty_Z7_PCB.stp'})
      // Per-entity engine diagnostics: textually distinct, so dedup can't
      // collapse them — a STEP model emits hundreds.
      const distinctCount = 200
      for (let i = 0; i < distinctCount; i++) {
        console.warn(`Error processing representation #${i}`)
      }
      // ...plus one repeated message, which wins the "most common" sample.
      console.warn('No basis found for brep!')
      console.warn('No basis found for brep!')
      report.end()

      const lines = reportLines()
      const diagLines = lines.filter((line) => /^Warnings & errors/.test(line))
      expect(diagLines).toHaveLength(1)
      expect(diagLines[0]).toBe('Warnings & errors (202, 201 distinct): No basis found for brep! (×2)')
      // Nothing else from the diagnostics leaks into the report.
      expect(lines.some((line) => /Error processing representation/.test(line))).toBe(false)
      consoleWarnSpy.mockRestore()
    })

    it('truncates a long sample message', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const overlongChars = 200
      const readableLineChars = 120
      beginReport({fileInfo: 'index.ifc'})
      console.warn(`long ${'x'.repeat(overlongChars)}`)
      report.end()

      const diagLine = reportLines().find((line) => /^Warnings & errors/.test(line))
      expect(diagLine).toMatch(/^Warnings & errors \(1\): long x+…$/)
      expect(diagLine.length).toBeLessThan(readableLineChars)
      consoleWarnSpy.mockRestore()
    })

    it('a new load clears the previous report', () => {
      beginReport({fileInfo: 'a.ifc'})
      report.engineVersion('Conway v1')
      report.end()
      beginReport({fileInfo: 'b.ifc'})
      expect(reportLines()).not.toContain('Conway v1')
    })
  })

  // Share#1954: the per-load numbers GA gets on real_model_open.
  describe('load analytics signals', () => {
    const DEFECT = 'Skipping representation items with an unresolved or mistyped STEP reference'
    let warnSpy
    let errorSpy

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      Logger.clearLogs()
    })

    afterEach(() => {
      Logger.clearLogs()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    describe('engine severity tally', () => {
      // The reporter's tally reaches the verdict: Statistics says 0 errors, the
      // Logger saw one (Share#1998 review).
      it('an empty build is unusable when the logger saw an error Statistics did not count', () => {
        beginReport({fileInfo: 'shell.ifc'})
        report.geometryStats({vertexCount: 0, triangleCount: 0, productCount: 0, errorCount: 0})
        Logger.error('Error extracting product', 1)
        report.end()
        expect(report.completedOutcome()).toBe('unusable')
      })

      it('an empty build with a quiet logger and zero Statistics errors is no_geometry', () => {
        beginReport({fileInfo: 'shell.ifc'})
        report.geometryStats({vertexCount: 0, triangleCount: 0, productCount: 0, errorCount: 0})
        Logger.warning('Unsupported type: IfcFoo', 1)
        Logger.error(DEFECT, 2, DATA_DEFECT)
        report.end()
        expect(report.completedOutcome()).toBe('no_geometry')
      })

      it('counts engine errors total and distinct, warnings distinct, defects apart', () => {
        beginReport({fileInfo: 'part.step'})
        report.geometryStats({vertexCount: 8, triangleCount: 4})
        Logger.error('Error extracting face', 1)
        Logger.error('Error extracting face', 2)
        Logger.error('Error extracting face', 3)
        Logger.error('Error extracting product', 4)
        Logger.warning('Unsupported type: IfcFoo', 5)
        Logger.warning('Unsupported type: IfcFoo', 6)
        Logger.warning('Unsupported type: IfcBar', 7)
        Logger.error(DEFECT, 8, DATA_DEFECT)
        Logger.warning(DEFECT, 9, DATA_DEFECT)
        report.end()

        expect(report.completedStats()).toMatchObject({
          engineErrorTotal: 4,
          engineErrorDistinct: 2,
          engineWarnDistinct: 2,
          dataDefectTotal: 2,
        })
      })

      it('counts an engine WORKER\'s forwarded log exactly as the main-thread Logger would', () => {
        // engine-worker.md §2.4 G3: the same entries as the test above, but
        // arriving folded with counts from a worker's Logger, which this
        // module's proxy cannot see.
        beginReport({fileInfo: 'part.step'})
        report.geometryStats({vertexCount: 8, triangleCount: 4})
        report.engineLog({
          entries: [
            {level: 'error', message: 'Error extracting face', count: 3},
            {level: 'error', message: 'Error extracting product', count: 1},
            {level: 'warning', message: 'Unsupported type: IfcFoo', count: 2},
            {level: 'warning', message: 'Unsupported type: IfcBar', count: 1},
            {level: 'error', message: DEFECT, category: DATA_DEFECT, count: 1},
            {level: 'warning', message: DEFECT, category: DATA_DEFECT, count: 1},
          ],
          lines: [{level: 'warning', text: 'Unsupported type: IfcFoo #5', count: 2}],
        })
        report.end()
        expect(report.completedStats()).toMatchObject({
          engineErrorTotal: 4,
          engineErrorDistinct: 2,
          engineWarnDistinct: 2,
          dataDefectTotal: 2,
          // The worker's console warnings count as page warnings, as the
          // console tee counts a main-thread engine's.
          pageWarnCount: 2,
        })
      })

      it('counts every occurrence, not just the first conway echoes', () => {
        beginReport({fileInfo: 'part.step'})
        report.geometryStats({vertexCount: 1})
        for (let i = 0; i < 50; i++) { // eslint-disable-line no-magic-numbers
          Logger.error('Error extracting face', i)
        }
        report.end()
        // The console tee sees one echo, because conway echoes only a message's
        // first occurrence; the engine tally sees all 50.
        expect(report.completedStats().pageErrorCount).toBe(1)
        expect(report.completedStats().engineErrorTotal).toBe(50) // eslint-disable-line no-magic-numbers
      })

      it('counts the unmarked data-defect fallback messages as defects, not engine errors', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.geometryStats({vertexCount: 1})
        Logger.error('No IfcProjects found?')
        Logger.warning('No units defined.')
        report.end()
        expect(report.completedStats()).toMatchObject({
          engineErrorTotal: 0, engineWarnDistinct: 0, dataDefectTotal: 2,
        })
      })

      it('ignores debug and info entries', () => {
        // Logger echoes info through console.log; divert it so the test
        // console stays clean.
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        beginReport({fileInfo: 'a.ifc'})
        report.geometryStats({vertexCount: 1})
        Logger.info('Model loaded')
        Logger.debug('detail')
        report.end()
        logSpy.mockRestore()
        expect(report.completedStats()).toMatchObject({
          engineErrorTotal: 0, engineErrorDistinct: 0, engineWarnDistinct: 0, dataDefectTotal: 0,
        })
      })

      it('is absent, not zero, for a load no engine reported on', () => {
        beginReport({fileInfo: 'a.obj'})
        Logger.error('conway message from some other load, not this format')
        report.end()
        const stats = report.completedStats()
        expect(stats.engineErrorTotal).toBeUndefined()
        expect(stats.engineErrorDistinct).toBeUndefined()
        expect(stats.engineWarnDistinct).toBeUndefined()
        expect(stats.dataDefectTotal).toBeUndefined()
      })

      it('does not count what conway logs after the load window closed', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.geometryStats({vertexCount: 1})
        report.end()
        Logger.error('late demand-geometry error')
        expect(report.completedStats().engineErrorTotal).toBe(0)
      })

      it('keeps page noise separate from the engine tally', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.geometryStats({vertexCount: 1})
        console.warn('some third-party script')
        console.error('three.js complained')
        report.end()
        expect(report.completedStats()).toMatchObject({
          pageWarnCount: 1, pageErrorCount: 1, engineErrorTotal: 0, engineWarnDistinct: 0,
        })
      })
    })

    describe('geometry counts and outcome', () => {
      it('carries vertex and triangle counts when the loader reported them', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.geometryStats({vertexCount: 120, triangleCount: 40})
        report.end()
        expect(report.completedStats()).toMatchObject({vertexCount: 120, triangleCount: 40})
        expect(report.completedOutcome()).toBe('displayed')
      })

      it('an empty build is unusable', () => {
        beginReport({fileInfo: 'nist.stp'})
        report.geometryStats({vertexCount: 0, triangleCount: 0})
        report.end()
        expect(report.completedOutcome()).toBe('unusable')
        expect(report.completedStats()).toMatchObject({vertexCount: 0, triangleCount: 0})
      })

      it('an empty build of a file with no products is no_geometry, counts kept', () => {
        beginReport({fileInfo: 'shell.ifc'})
        report.geometryStats({vertexCount: 0, triangleCount: 0, productCount: 0, errorCount: 0})
        report.end()
        expect(report.completedOutcome()).toBe('no_geometry')
        expect(report.completedStats()).toMatchObject({vertexCount: 0, triangleCount: 0})
      })

      it('has a typed, constant alert for the no_geometry outcome', () => {
        expect(noGeometryAlert()).toEqual({type: 'noGeometry', message: NO_GEOMETRY_ALERT})
        expect(NO_GEOMETRY_ALERT).toBe('This file contains no 3D geometry.')
      })

      it('omits counts for formats that reported none', () => {
        beginReport({fileInfo: 'a.obj'})
        report.end()
        expect(report.completedStats().vertexCount).toBeUndefined()
        expect(report.completedOutcome()).toBe('displayed')
      })

      it('has no completed stats until the load ends', () => {
        beginReport({fileInfo: 'a.ifc'})
        expect(report.completedStats()).toBeNull()
      })
    })

    describe('cacheHit', () => {
      it.each([[true, 'true'], [false, 'false']])('reports %s as the string %s', (isHit, expected) => {
        beginReport({fileInfo: 'a.ifc'})
        report.cacheHit(isHit)
        report.end()
        expect(report.completedStats().cacheHit).toBe(expected)
      })

      it('is absent when the loader never said', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.end()
        expect(report.completedStats().cacheHit).toBeUndefined()
      })
    })

    describe('sizes on a GLB cache hit', () => {
      // A hit parses the cached artifact, so its bytes must never stand in for
      // the source's: a 24 MB IFC used to report its 4 MB GLB as stats_fileSize
      // and on the model line. The loader passes the source size the writer
      // stamped (byteLength) and the artifact's own (artifactByteLength).
      const SOURCE_BYTES = 5_879_866
      const GLB_BYTES = 1_394_746

      it('reports the source as fileSize and the GLB as artifactSize', () => {
        beginReport({fileInfo: 'Momentum.ifc'})
        report.modelInfo({fileName: 'Momentum.ifc', schema: 'IFC', byteLength: SOURCE_BYTES, artifactByteLength: GLB_BYTES})
        report.end()
        expect(report.completedStats().fileSize).toBe(SOURCE_BYTES)
        expect(report.completedStats().artifactSize).toBe(GLB_BYTES)
      })

      it('shows both sizes on the model line', () => {
        beginReport({fileInfo: 'Momentum.ifc'})
        report.modelInfo({fileName: 'Momentum.ifc', schema: 'IFC', byteLength: SOURCE_BYTES, artifactByteLength: GLB_BYTES})
        expect(reportLines()).toContain('Model: Momentum.ifc — IFC, 5.6 MB (cached GLB 1.3 MB)')
        report.end()
      })

      it('reports no source size, not the GLB\'s, for an artifact that predates the stamp', () => {
        beginReport({fileInfo: 'Momentum.ifc'})
        report.modelInfo({fileName: 'Momentum.ifc', schema: 'IFC', artifactByteLength: GLB_BYTES})
        expect(reportLines()).toContain('Model: Momentum.ifc — IFC (source size not recorded; cached GLB 1.3 MB)')
        report.end()
        expect(report.completedStats().fileSize).toBeUndefined()
        expect(report.completedStats().artifactSize).toBe(GLB_BYTES)
      })

      it('has no artifact size on a load that parsed the source', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.modelInfo({fileName: 'a.ifc', schema: 'IFC', byteLength: SOURCE_BYTES})
        report.end()
        expect(report.completedStats().artifactSize).toBeUndefined()
      })
    })

    describe('firstMeshMs', () => {
      it('is the load-clock time of the first mesh and latches', () => {
        const FIRST_MS = 400
        beginReport({fileInfo: 'a.ifc'})
        jest.advanceTimersByTime(FIRST_MS)
        report.firstMesh()
        jest.advanceTimersByTime(FIRST_MS * 3)
        report.firstMesh()
        report.end()
        expect(report.completedStats().firstMeshMs).toBe(FIRST_MS)
      })

      it('can still be recorded after the report froze, for one-shot formats', () => {
        const LOAD_MS = 900
        const SCENE_ADD_MS = 50
        beginReport({fileInfo: 'a.glb'})
        jest.advanceTimersByTime(LOAD_MS)
        report.end()
        expect(report.completedStats().firstMeshMs).toBeUndefined()
        jest.advanceTimersByTime(SCENE_ADD_MS)
        report.firstMesh()
        expect(report.completedStats().firstMeshMs).toBe(LOAD_MS + SCENE_ADD_MS)
        // And it shares loadTime's clock, so the two are comparable.
        expect(report.completedStats().firstMeshMs).toBeGreaterThanOrEqual(report.completedStats().loadTime)
      })

      it('is absent when nothing ever reported a mesh', () => {
        beginReport({fileInfo: 'a.ifc'})
        report.end()
        expect(report.completedStats().firstMeshMs).toBeUndefined()
      })
    })

    describe('failureInfo', () => {
      it('reads the last phase, size and format of its own load', () => {
        beginReport({fileInfo: 'https://host/models/house.ifc?x=1'})
        report.modelInfo({fileName: 'house.ifc', byteLength: 5000})
        report.progress({phase: 'geometry', completed: 3, total: 10})
        expect(report.failureInfo()).toEqual({phase: 'geometry', fileSize: 5000, format: 'ifc'})
      })

      it('reads the format off a URL object, which is what a GitHub route passes', () => {
        beginReport({fileInfo: new URL('https://github.com/bldrs-ai/test-models/main/ifc/misc/box.ifc')})
        expect(report.failureInfo().format).toBe('ifc')
      })

      it.each([
        ['https://host/models/box.glb.gz', 'glb'],
        ['https://host/models/BOX.GLB.GZ?x=1', 'glb'],
        // A bare .gz names no format underneath.
        ['https://host/models/archive.gz', undefined],
      ])('strips the gzip envelope: %s -> %s', (fileInfo, expected) => {
        beginReport({fileInfo})
        expect(report.failureInfo().format).toBe(expected)
      })

      // Before slice R this read "the reporter begun since a serial", so a
      // failure thrown before the next load's reporter began could not
      // borrow the previous load's phase. Now the failing attempt's caller
      // holds the reporter its attempt began (LoadJob#report), or none; the
      // job side is in session/modelSession.test.js.
      it('reports nothing for a failure that came before any load began', () => {
        beginReport({fileInfo: 'previous.ifc'})
        report.modelInfo({fileName: 'previous.ifc', byteLength: 5000})
        report.progress({phase: 'geometry', completed: 3, total: 10})
        report.end()
        // The reporter lingers after its load. A failure thrown before the
        // NEXT attempt's reporter began must not borrow its phase and size.
        expect(loadFailureInfoOf(null)).toEqual({
          phase: undefined, fileSize: undefined, format: undefined,
        })
        expect(loadFailureInfoOf(report).phase).toBe('geometry')
      })
    })
  })

  describe('grace result', () => {
    it('publishes a terse "Loaded <name>" success result (no timing/heap)', () => {
      beginReport({fileInfo: 'path/to/index.ifc'})
      report.progress({phase: 'geometry', completed: 10, total: 10, elapsedMs: 100})
      report.end()
      const result = useStore.getState().loadResult
      expect(result.status).toBe('success')
      // Just the name (basename of fileInfo when no header was parsed) — no
      // Total, no seconds, no MB.
      expect(result.summaryLine).toBe('Loaded index.ifc')
    })

    it('uses the filename, ignoring an unreliable STEP header fileName', () => {
      // The STEP header's fileName is often junk (a comment); the grace line
      // falls back to the source filename (the snackbar prefers model.name).
      beginReport({fileInfo: 'path/to/Arty_Z7_PCB.stp'})
      report.progress({modelInfo: {fileName: `/* name */ 'export2`, schema: 'AP214'}})
      report.end()
      expect(useStore.getState().loadResult.summaryLine).toBe('Loaded Arty_Z7_PCB.stp')
    })

    it('publishes an error result with the failure summary', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})
      report.end(new Error('bad STEP header'))
      const result = useStore.getState().loadResult
      expect(result.status).toBe('error')
      expect(result.summaryLine).toBe('Load failed: bad STEP header')
    })

    it('summarizes an out-of-memory failure specially', () => {
      const oom = new Error('Cannot enlarge memory arrays')
      oom.isOutOfMemory = true
      beginReport({fileInfo: 'big.ifc'})
      report.end(oom)
      expect(useStore.getState().loadResult.summaryLine).toBe('Load failed: out of memory')
    })

    it('a new load clears the previous grace result', () => {
      beginReport({fileInfo: 'a.ifc'})
      report.end()
      expect(useStore.getState().loadResult).not.toBe(null)
      beginReport({fileInfo: 'b.ifc'})
      expect(useStore.getState().loadResult).toBe(null)
    })
  })

  describe('framing exclusion (robust auto-framing, test-models-private#26)', () => {
    it('appends a Health line, warns the console, and notes the grace result', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginReport({fileInfo: 'basel.ifc'})
      report.end()

      report.framingExclusion({excludedElements: 3, excludedVertices: 0, maxDistance: 1877.4})

      const healthLine = reportLines().find((line) => line.startsWith('Health:'))
      expect(healthLine).toBe(
        'Health: stray geometry excluded from view framing (3 elements, up to 1877 model units out)')
      expect(warnSpy).toHaveBeenCalledWith(healthLine)
      const result = useStore.getState().loadResult
      expect(result.status).toBe('success')
      // The terse "Loaded <name>" stays; the note rides alongside for the
      // snackbar to append.
      expect(result.summaryLine).toBe('Loaded basel.ifc')
      expect(result.note).toMatch(/stray geometry/)
      warnSpy.mockRestore()
    })

    it('reports vertex-granularity exclusions too', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginReport({fileInfo: 'basel.ifc'})
      report.end()

      report.framingExclusion({excludedElements: 0, excludedVertices: 52, maxDistance: 1450})

      expect(reportLines().find((line) => line.startsWith('Health:'))).toBe(
        'Health: stray geometry excluded from view framing (52 vertices, up to 1450 model units out)')
      warnSpy.mockRestore()
    })

    it('is silent when nothing was excluded, or with no load reported', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginReport({fileInfo: 'clean.ifc'})
      report.end()
      const linesBefore = reportLines().length

      report.framingExclusion({excludedElements: 0, excludedVertices: 0, maxDistance: 0})
      report.framingExclusion(null)

      expect(reportLines().length).toBe(linesBefore)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(useStore.getState().loadResult.note).toBeUndefined()
      warnSpy.mockRestore()
    })

    it('does not touch an error grace result', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginReport({fileInfo: 'broken.ifc'})
      report.end(new Error('bad header'))

      report.framingExclusion({excludedElements: 1, excludedVertices: 0, maxDistance: 500})

      expect(useStore.getState().loadResult.note).toBeUndefined()
      // The Health line still lands in the report for the "i" dialog.
      expect(reportLines().some((line) => line.startsWith('Health:'))).toBe(true)
      warnSpy.mockRestore()
    })
  })

  describe('sentry integration', () => {
    // SHARE-1HJ: a 30 s stall is the UI's cue only. Sentry hears about a load
    // still silent at HANG_TIMEOUT_MS, once, tagged with its phase.
    it('tells the UI at the stall, and Sentry only once the load is hung', () => {
      const onStall = jest.fn()
      beginReport({fileInfo: 'index.ifc', onStall})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      expect(onStall).toHaveBeenCalledWith(expect.objectContaining({phase: 'geometry'}))
      expect(captureMessage).not.toHaveBeenCalled()

      jest.advanceTimersByTime(HANG_TIMEOUT_MS - STALL_TIMEOUT_MS)
      expect(captureMessage).toHaveBeenCalledTimes(1)
      expect(captureMessage).toHaveBeenCalledWith(LOAD_HUNG_MESSAGE, {level: 'warning', tags: {'load.stalled': 'true'}})
      expect(setTag).toHaveBeenCalledWith('load.phase', 'geometry')
      // Per event, never on the scope, where it would outlive this load
      // (codex on #2235).
      expect(setTag).not.toHaveBeenCalledWith('load.stalled', expect.anything())
      jest.advanceTimersByTime(HANG_TIMEOUT_MS * 2)
      expect(captureMessage).toHaveBeenCalledTimes(1)
    })

    it('does not report a hang when progress resumes after a stall', () => {
      beginReport({fileInfo: 'index.ifc', onStall: jest.fn()})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      report.progress({phase: 'geometry', completed: 4, total: 10, elapsedMs: 40_000})
      jest.advanceTimersByTime(HANG_TIMEOUT_MS - STALL_TIMEOUT_MS)
      // Still within one stall period of the last event: the hang clock reset.
      expect(captureMessage).not.toHaveBeenCalled()
      report.end()
      jest.advanceTimersByTime(HANG_TIMEOUT_MS * 2)
      expect(captureMessage).not.toHaveBeenCalled()
    })

    // One condition, one sink: a stall the load came back from is GA's.
    it('counts a stall the load recovered from in GA, once, on success', () => {
      beginReport({fileInfo: 'part.step', onStall: jest.fn()})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      report.progress({phase: 'geometry', completed: 10, total: 10, elapsedMs: 40_000})
      report.end()
      report.captureDiagnostics()
      report.captureDiagnostics()
      expect(reportLoadStallRecovered).toHaveBeenCalledTimes(1)
      expect(reportLoadStallRecovered).toHaveBeenCalledWith({phase: 'geometry', format: 'step', sizeBytes: undefined})
      expect(captureMessage).not.toHaveBeenCalled()
    })

    it('does not count a load that never stalled, or one already reported hung', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      report.end()
      report.captureDiagnostics()
      expect(reportLoadStallRecovered).not.toHaveBeenCalled()

      beginReport({fileInfo: 'index.ifc', onStall: jest.fn()})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(HANG_TIMEOUT_MS + 1)
      report.end()
      report.captureDiagnostics()
      expect(captureMessage).toHaveBeenCalledWith(LOAD_HUNG_MESSAGE, expect.objectContaining({level: 'warning'}))
      expect(reportLoadStallRecovered).not.toHaveBeenCalled()
    })

    // A load that fails after a stall: the stall rides the failure's own event.
    it('tags a failed load that stalled', () => {
      beginReport({fileInfo: 'index.ifc', onStall: jest.fn()})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS + 1)
      report.end(new Error('boom'))
      expect(report.captureContext().tags).toEqual({'load.phase': 'geometry', 'load.stalled': 'true'})
      expect(report.stallCaptureTags()).toEqual({'load.stalled': 'true'})
      // The scope gets the phase only.
      report.attachFailureContext()
      expect(setTag).not.toHaveBeenCalledWith('load.stalled', expect.anything())

      // The next load starts clean.
      beginReport({fileInfo: 'index.ifc'})
      expect(report.stallCaptureTags()).toBeNull()
    })

    it('failure context includes the accumulated report text, and not the file path', () => {
      // fileInfo is the route path or URL: the name of a private model (Share#2107).
      beginReport({fileInfo: 'secret/plan.ifc'})
      report.progress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})
      report.end()
      report.attachFailureContext()
      expect(setTag).toHaveBeenCalledWith('load.phase', 'dataParse')
      expect(setContext).toHaveBeenCalledWith('load', expect.objectContaining({
        phase: 'dataParse',
        report: expect.stringContaining('Share v'),
      }))
      expect(JSON.stringify(setContext.mock.calls)).not.toMatch(/secret|plan\.ifc/)
    })

    // The per-event counterpart (Share#1899): the same tags and context,
    // returned for one capture's own context and NOT written to the
    // session scope, where they would ride along on every later event.
    it('hands back the failure context for one event without touching the scope', () => {
      beginReport({fileInfo: 'road.ifc'})
      report.progress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})
      report.end()
      setTag.mockClear()
      setContext.mockClear()
      const {tags, contexts} = report.captureContext()
      expect(tags).toEqual({'load.phase': 'dataParse'})
      expect(contexts.load).toEqual(expect.objectContaining({
        phase: 'dataParse',
        fileInfo: 'road.ifc',
        report: expect.stringContaining('Share v'),
      }))
      expect(setTag).not.toHaveBeenCalled()
      expect(setContext).not.toHaveBeenCalled()
    })

    /*
     * The header's FILE_NAME and author text reached Sentry verbatim in the
     * report context, including a full UNC path to a company file share
     * (SHARE-1MT). The report the user sees keeps them; the Sentry copy
     * carries only fields already known to be safe.
     */
    describe('the Sentry copy of the report withholds header text', () => {
      const header = {
        fileName: '\\\\10.0.0.5\\Projects\\ACME Tower\\Bracket rev2.stp',
        schema: 'CONFIG_CONTROL_DESIGN',
        byteLength: 127_611_699, // 121.7 MB
        originatingSystem: 'CATIA V5 exported by jane@example.com',
        preprocessorVersion: 'CATIA V5 STEP AP203 v1',
      }

      /** @param {string} reportText the report text Sentry would receive */
      function expectWithheld(reportText) {
        expect(reportText).toContain('Model: (name withheld) — CONFIG_CONTROL_DESIGN, 121.7 MB, Dassault CATIA')
        expect(reportText).not.toContain('10.0.0.5')
        expect(reportText).not.toContain('ACME')
        expect(reportText).not.toContain('Bracket')
        expect(reportText).not.toContain('jane@example.com')
        expect(reportText).not.toContain('AP203')
      }

      it('keeps the full model line in the report the user sees', () => {
        beginReport({fileInfo: 'a518f06c.stp'})
        report.progress({modelInfo: header})
        expect(reportLines().join('\n')).toContain('Bracket rev2.stp')
      })

      it('withholds it from the failure context', () => {
        beginReport({fileInfo: 'a518f06c.stp'})
        report.progress({modelInfo: header})
        report.progress({phase: 'geometry', completed: 1, total: 4, elapsedMs: 10})
        report.end()
        const {report: sentryReport} = report.captureContext().contexts.load
        expect(sentryReport).toMatch(/^Share v/)
        expectWithheld(sentryReport)
      })

      it('withholds it from the diagnostics event', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'a518f06c.stp'})
        report.progress({modelInfo: header})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1})
        const call = captureMessage.mock.calls.find(([message]) => message.startsWith('Load diagnostics'))
        expectWithheld(call[1].contexts.loadDiagnostics.report)
        warnSpy.mockRestore()
      })

      // The console tee feeds the diagnostics event's title, `messages` and
      // the report's `Warnings & errors` line, none of which pass through
      // beforeBreadcrumb; a warning naming a dropped file mid-load must
      // arrive there with the name withheld.
      it('withholds a teed warning\'s file name from the diagnostics event', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        try {
          beginReport({fileInfo: 'a518f06c.stp'})
          console.warn(`handleFileDrop: ${consoleFileName('Secret Tower.dwg')} (267 bytes) is not a recognized model format`)
          report.end()
        } finally {
          warnSpy.mockRestore()
        }
        report.captureDiagnostics({warningCount: 1})
        const [title, context] = captureMessage.mock.calls.find(([message]) => message.startsWith('Load diagnostics'))
        expect(title).toContain('handleFileDrop: file (name withheld)')
        expect(JSON.stringify([title, context])).not.toContain('Secret Tower')
      })

      // The non-engine path (reportModelInfo) carries the user's own file
      // name, e.g. a Drive file's, so it is withheld the same way.
      it('withholds a non-engine format\'s file name too', () => {
        beginReport({fileInfo: 'gdrive:abc123'})
        report.modelInfo({fileName: 'Client site survey.glb', schema: 'GLB', byteLength: 39_950_000})
        report.end()
        const {report: sentryReport} = report.captureContext().contexts.load
        expect(sentryReport).toContain('Model: (name withheld) — GLB, 38.1 MB')
        expect(sentryReport).not.toContain('Client site survey')
        expect(reportLines()).toContain('Model: Client site survey.glb — GLB, 38.1 MB')
      })
    })

    /*
     * The end-of-load diagnostics event (issue #1767): the counterpart
     * a dashboard model-open chip with non-zero errors/warnings links
     * to. CadView drives it from inside the real_model_open branch, so
     * the counts here are the GA stats_* ones that colour the chip —
     * NOT the console tee's, which disagree with them on IFC/STEP.
     */
    describe('captureDiagnostics', () => {
      /** @return {Array} the [message, context] of the diagnostics capture */
      function diagnosticsCall() {
        return captureMessage.mock.calls.find(([, arg]) => typeof arg === 'object' && arg !== null)
      }

      beforeEach(() => {
        _resetGaClientIdForTests()
        // The tag value comes from the real analytics module, whose
        // cookie fallback is what a returning visitor has.
        Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
      })

      afterEach(() => {
        Cookies.remove('_ga')
        Cookies.set('consentLevel', '1.functional')
      })

      it('sends one event per noisy load, tagged with the bare cid, content_id and type', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'gdrive:abc123'})
        console.warn('No basis found for brep!')
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({
          warningCount: 2,
          contentId: 'https://drive/abc123',
          contentType: 'ifc',
        })

        const [message, context] = diagnosticsCall()
        expect(message).toBe('Load diagnostics: No basis found for brep!')
        // Warnings only — nothing here failed.
        expect(context.level).toBe('warning')
        // Bare id: the GA param's `cid.` prefix would not match the
        // dashboard's Sentry query.
        expect(context.tags.open_cid).toBe('1234567890.0987654321')
        expect(context.tags.content_id).toBe('https://drive/abc123')
        expect(context.tags.content_type).toBe('ifc')
        expect(context.contexts.loadDiagnostics).toEqual(expect.objectContaining({
          warningCount: 2,
          errorCount: 0,
          consoleDistinct: 1,
          consoleTotal: 2,
          messages: ['2× No basis found for brep!'],
          report: expect.stringContaining('Share v'),
        }))
        warnSpy.mockRestore()
      })

      // A depth-cap hit is volume-only signal (AGENTS.md, Reported
      // Conditions): GA, once per load, and no Sentry event of its own.
      it('retries a cap hit that GA dropped (gtag/js not loaded yet), and stops once it is sent', () => {
        reportBvhDepthCapToGa.mockReturnValueOnce(false)
        beginReport({fileInfo: 'index.stp'})
        report.bvhDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
        report.end()
        report.captureDiagnostics({})
        report.captureDiagnostics({})
        report.captureDiagnostics({})
        expect(reportBvhDepthCapToGa).toHaveBeenCalledTimes(2)
      })

      it('counts a cap hit in GA once, and sends nothing to Sentry for it', () => {
        beginReport({fileInfo: 'index.stp'})
        report.bvhDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
        report.end()
        report.captureDiagnostics({})
        report.captureDiagnostics({})

        expect(reportBvhDepthCapToGa.mock.calls).toEqual([[{format: 'stp', trees: 2, maxLeafTriangles: 3400}]])
        expect(diagnosticsCall()).toBeUndefined()
      })

      // A batched model builds its trees once it is on screen
      // (deferredBatchedBvh.js), so its cap usually lands after the load
      // ended. It keeps its Health line and its one GA event. The deferred
      // build reports through the callback it took when it was scheduled,
      // `onLateDepthCap`: the load's own, in place of the token of the
      // module's one reporter before slice R.
      describe('a depth cap that lands after the load', () => {
        const healthLines = () => reportLines().filter((line) => line.startsWith('Health: picking'))

        it('gets its Health line after Total and is counted in GA once', () => {
          beginReport({fileInfo: 'index.stp'})
          const onLateDepthCap = report.onLateDepthCap
          report.end()
          report.captureDiagnostics({})
          expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()

          onLateDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
          const lines = reportLines()
          expect(healthLines()).toEqual([
            'Health: picking index hit its depth cap (40) in 2 trees; largest leaf 3400 triangles, ' +
            'tested one by one per pick'])
          expect(lines.indexOf(healthLines()[0])).toBeGreaterThan(lines.findIndex((l) => l.startsWith('Total')))
          expect(reportBvhDepthCapToGa.mock.calls).toEqual([[{format: 'stp', trees: 2, maxLeafTriangles: 3400}]])
        })

        it('replaces the Health line rather than adding a second one', () => {
          beginReport({fileInfo: 'index.stp'})
          const onLateDepthCap = report.onLateDepthCap
          report.onDepthCap({trees: 1, maxLeafTriangles: 90, maxDepth: 40})
          report.end()
          report.captureDiagnostics({})
          onLateDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})

          expect(healthLines()).toEqual([
            'Health: picking index hit its depth cap (40) in 3 trees; largest leaf 3400 triangles, ' +
            'tested one by one per pick'])
          // GA counted the in-load cap; the late one is not counted again.
          expect(reportBvhDepthCapToGa).toHaveBeenCalledTimes(1)
        })

        it('waits for the load to be known good before counting it in GA', () => {
          beginReport({fileInfo: 'index.stp'})
          const onLateDepthCap = report.onLateDepthCap
          report.end()
          onLateDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
          expect(healthLines()).toHaveLength(1)
          expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()
          report.captureDiagnostics({})
          expect(reportBvhDepthCapToGa).toHaveBeenCalledTimes(1)
        })

        // Before slice R the token told the load apart from the next; now the
        // first load's own reporter takes it, and its sink, a load job no
        // longer current, drops it. Red with one shared reporter: the cap
        // lands in the second load's report.
        it('is dropped once another load has started', () => {
          let isFirstCurrent = true
          beginReport({
            fileInfo: 'first.stp',
            sink: {set: (partial) => isFirstCurrent && storeSink.set(partial), get: storeSink.get},
          })
          const onLateDepthCap = report.onLateDepthCap
          report.end()
          isFirstCurrent = false
          beginReport({fileInfo: 'second.stp'})
          onLateDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
          report.end()
          report.captureDiagnostics({})
          expect(healthLines()).toEqual([])
          expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()
        })

        it('needs the late callback: a later tree of an edit is not the load\'s', () => {
          beginReport({fileInfo: 'index.stp'})
          report.end()
          report.captureDiagnostics({})
          report.bvhDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})
          expect(healthLines()).toEqual([])
          expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()
        })
      })

      it('sends nothing anywhere for a clean load that did not hit the cap', () => {
        beginReport({fileInfo: 'index.stp'})
        report.end()
        report.captureDiagnostics({})
        expect(diagnosticsCall()).toBeUndefined()
        expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()
      })

      // The diagnostics event is still titled by the console's top message,
      // and carries no cap field: the cap is counted in GA alone.
      it('titles a cap hit with console diagnostics by the diagnostics', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'index.stp'})
        console.warn('No basis found for brep!')
        report.bvhDepthCap({trees: 1, maxLeafTriangles: 90, maxDepth: 40})
        report.end()
        report.captureDiagnostics({warningCount: 1})

        const [message, context] = diagnosticsCall()
        expect(message).toBe('Load diagnostics: No basis found for brep!')
        expect(context.level).toBe('warning')
        expect(context.contexts.loadDiagnostics).not.toHaveProperty('bvhDepthCap')
        expect(reportBvhDepthCapToGa).toHaveBeenCalledTimes(1)
        warnSpy.mockRestore()
      })

      /*
       * Severity is the load's outcome, not its noise level (ops#27 T0).
       * These three cases are the whole policy: geometry reached the scene
       * → regular however loud the errors were; nothing was built → major;
       * the loader said nothing about geometry → regular, because most
       * formats never report counts and calling those major would raise
       * the entire project to major.
       */
      it('keeps regular severity when errors came with a model that displays', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginReport({fileInfo: 'index.stp'})
        console.error('CDT Exception (hemisphere: 0)')
        report.geometryStats({vertexCount: 120_000, triangleCount: 40_000})
        report.end()
        report.captureDiagnostics({errorCount: 1})

        expect(diagnosticsCall()[1].level).toBe('warning')
        expect(diagnosticsCall()[1].tags.load_outcome).toBe('displayed')
        errorSpy.mockRestore()
      })

      it('raises severity to error when the load built no geometry at all', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginReport({fileInfo: 'index.stp'})
        console.error('CDT Exception (hemisphere: 0)')
        report.geometryStats({vertexCount: 0, triangleCount: 0})
        report.end()
        report.captureDiagnostics({errorCount: 1})

        expect(diagnosticsCall()[1].level).toBe('error')
        expect(diagnosticsCall()[1].tags.load_outcome).toBe('unusable')
        errorSpy.mockRestore()
      })

      /*
       * Share#1962: a file with nothing to draw is an input property, so its
       * diagnostics event must not land in Sentry's error stream, while an
       * empty build the file does not explain still must. The counts that
       * separate the two ride on the event either way.
       */
      // Since 2026-11 a nothing-to-draw load is counted in GA; an engine
      // diagnostic it also hit still reaches Sentry (codex on #2235).
      it('counts a no-geometry load in GA, and sends its engine gap to Sentry', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'tiny.ifc'})
        console.warn('No units defined.')
        console.warn('No basis found for brep!')
        report.geometryStats({
          vertexCount: 0, triangleCount: 0,
          productCount: 3, productsWithGeometryCount: 0, errorCount: 0, dataDefectCount: 1,
        })
        report.end()
        report.captureDiagnostics({warningCount: 2})

        const [message, context] = diagnosticsCall()
        expect(message).toBe('Load diagnostics: No basis found for brep!')
        expect(context.level).toBe('warning')
        expect(context.tags.load_outcome).toBe('no_geometry')
        expect(context.contexts.loadDiagnostics).toMatchObject({
          productCount: 3, productsWithGeometryCount: 0, dataDefectCount: 1,
        })
        expect(reportLoadDiagnosticsToGa).toHaveBeenCalledTimes(1)
        expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({
          outcome: 'no_geometry', defect: 'no_units', format: 'ifc',
        }))
        warnSpy.mockRestore()
      })

      it('sends a no-geometry load with only defects to GA alone', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'tiny.ifc'})
        console.warn('No units defined.')
        report.geometryStats({
          vertexCount: 0, triangleCount: 0, productCount: 3, productsWithGeometryCount: 0, errorCount: 0, dataDefectCount: 1,
        })
        report.end()
        report.captureDiagnostics({warningCount: 1})

        expect(diagnosticsCall()).toBeUndefined()
        expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({outcome: 'no_geometry', defect: 'no_units'}))
        warnSpy.mockRestore()
      })

      it('puts the same counts on the error event of an empty build the file does not explain', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginReport({fileInfo: 'index.stp'})
        console.error('CDT Exception (hemisphere: 0)')
        report.geometryStats({
          vertexCount: 0, triangleCount: 0,
          productCount: 3, productsWithGeometryCount: 0, errorCount: 4, dataDefectCount: 2,
        })
        report.end()
        report.captureDiagnostics({errorCount: 4})

        const [, context] = diagnosticsCall()
        expect(context.level).toBe('error')
        expect(context.tags.load_outcome).toBe('unusable')
        expect(context.contexts.loadDiagnostics).toMatchObject({
          productCount: 3, productsWithGeometryCount: 0, dataDefectCount: 2,
        })
        errorSpy.mockRestore()
      })

      it('leaves the counts absent, not zero, when the engine reported none', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginReport({fileInfo: 'index.stp'})
        console.error('boom')
        report.geometryStats({vertexCount: 5, triangleCount: 2})
        report.end()
        report.captureDiagnostics({errorCount: 1})

        const loadDiagnostics = diagnosticsCall()[1].contexts.loadDiagnostics
        expect(loadDiagnostics.productCount).toBeUndefined()
        expect(loadDiagnostics.productsWithGeometryCount).toBeUndefined()
        expect(loadDiagnostics.dataDefectCount).toBeUndefined()
        errorSpy.mockRestore()
      })

      it('defaults to regular severity when no loader reported geometry', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginReport({fileInfo: 'ISS_stationary.glb'})
        console.error('missing texture')
        report.end()
        report.captureDiagnostics({errorCount: 1})

        expect(diagnosticsCall()[1].level).toBe('warning')
        expect(diagnosticsCall()[1].tags.load_outcome).toBe('displayed')
        errorSpy.mockRestore()
      })

      /*
       * The tags exist because Sentry's server-side scrubber can rewrite the
       * report body to "[Filtered]", taking the authoring tool and schema —
       * the first two questions asked of any load diagnostic — with it.
       */
      it('tags the authoring tool, schema, format and rounded size', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const sizeBytes = 14_365_000
        const sizeMb = 14
        beginReport({fileInfo: 'https://example.test/models/Tower.ifc'})
        report.modelInfo({
          fileName: 'Tower.ifc',
          schema: 'IFC4',
          byteLength: sizeBytes,
          originatingSystem: 'Autodesk Revit 2024 (ENU)',
        })
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1, contentType: 'ifc'})

        const {tags} = diagnosticsCall()[1]
        expect(tags.authoring_tool).toBe('Autodesk Revit 2024')
        expect(tags.model_schema).toBe('IFC4')
        expect(tags.model_format).toBe('ifc')
        expect(tags.model_size_mb).toBe(sizeMb)
        // Nothing that names the file or where it came from.
        expect(Object.values(tags).join(' ')).not.toContain('example.test')
        expect(Object.values(tags).join(' ')).not.toContain('Tower')
        warnSpy.mockRestore()
      })

      it('prefers the parsed header over the extension-derived schema', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'Arty_Z7_PCB.stp'})
        // What Loader stamps from the filename before the parse...
        report.modelInfo({fileName: 'Arty_Z7_PCB.stp', schema: 'STP', byteLength: 1_000_000})
        // ...then what conway's ON_MODEL_INFO reports once the header parses.
        report.progress({modelInfo: {
          fileName: 'Arty_Z7_PCB.stp',
          schema: 'AP242',
          preprocessorVersion: 'KiCad 8.0',
        }})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1})

        const {tags} = diagnosticsCall()[1]
        expect(tags.model_schema).toBe('AP242')
        // The header named no authoring system, so the preprocessor stands in
        // — the same preference order the model line uses.
        expect(tags.authoring_tool).toBe('KiCad 8.0')
        expect(tags.model_format).toBe('stp')
        warnSpy.mockRestore()
      })

      // Schema is the header string that still reaches a tag verbatim; the
      // tool no longer can (knownAuthoringTool emits this module's own short
      // canonical name), so truncation is asserted where it stays reachable.
      it('truncates tag values at Sentry limit and omits what the header never said', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const overlongChars = 300
        const maxTagChars = 200
        beginReport({fileInfo: 'noext'})
        report.modelInfo({fileName: 'noext', schema: 'S'.repeat(overlongChars)})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1})

        const {tags} = diagnosticsCall()[1]
        expect(tags.model_schema).toHaveLength(maxTagChars)
        expect(tags).not.toHaveProperty('authoring_tool')
        expect(tags).not.toHaveProperty('model_size_mb')
        // No extension to read, and no contentType passed to fall back on.
        expect(tags).not.toHaveProperty('model_format')
        warnSpy.mockRestore()
      })

      it('falls back to the content type when the name carries no extension', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'gdrive:1sWR7x4BZ'})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1, contentType: 'IFC'})

        expect(diagnosticsCall()[1].tags.model_format).toBe('ifc')
        warnSpy.mockRestore()
      })

      /*
       * The tag exists to bypass Sentry's scrubber, so it cannot be built by
       * removing the bad parts of exporter-written free text — there is no
       * bounded set of bad parts. Only an allowlisted family reaches it, as
       * this module's own canonical string.
       */
      describe('authoring_tool allowlist', () => {
        /**
         * @param {object} info the model-header fields under test
         * @return {object} the tags of the resulting diagnostics event
         */
        function tagsForHeader(info) {
          // diagnosticsCall() reads the first matching capture, so cases that
          // exercise several headers have to start from a clean mock.
          captureMessage.mockClear()
          const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
          beginReport({fileInfo: 'Tower.ifc'})
          report.modelInfo({fileName: 'Tower.ifc', ...info})
          console.warn('No basis found for brep!')
          report.end()
          report.captureDiagnostics({warningCount: 1})
          warnSpy.mockRestore()
          return diagnosticsCall()[1].tags
        }

        it('names a known family canonically, with its numeric version', () => {
          expect(tagsForHeader({originatingSystem: 'Autodesk Revit 2024 (ENU)'}).authoring_tool)
            .toBe('Autodesk Revit 2024')
        })

        it('canonicalizes a family however the header spelled it', () => {
          expect(tagsForHeader({originatingSystem: 'ARCHICAD-64'}).authoring_tool)
            .toBe('Graphisoft ArchiCAD')
        })

        // The exact shape Codex raised on PR #1815: identifying free text with
        // no path separator anywhere in it.
        it('never lets free text through, even when it names a family', () => {
          const {authoring_tool: tool} = tagsForHeader({
            originatingSystem: 'Revit exported by jane@example.com',
          })
          expect(tool).toBe('Autodesk Revit')
          expect(tool).not.toContain('jane')
          expect(tool).not.toContain('@')
        })

        it('omits the tag entirely for a header that names no known family', () => {
          // A real Revit preprocessor_version — it names the exporter build,
          // not the application, so the allowlist places nothing.
          expect(tagsForHeader({
            originatingSystem: '20190108_1515(x64) - Exporter 19.3.0.0 - Alternative Benutzeroberflache',
          })).not.toHaveProperty('authoring_tool')
          expect(tagsForHeader({originatingSystem: '/home/jsmith/exporters/ifc'}))
            .not.toHaveProperty('authoring_tool')
        })

        it('takes a version token only when it is purely numeric', () => {
          expect(tagsForHeader({originatingSystem: 'KiCad 8.0'}).authoring_tool).toBe('KiCad 8.0')
          // 'Structures' follows the matched name, so there is no version to
          // take — the canonical family name stands alone rather than
          // carrying a word out of the header.
          expect(tagsForHeader({originatingSystem: 'Tekla Structures 21.0'}).authoring_tool)
            .toBe('Tekla Structures')
        })

        /*
         * Round-3 review: four family names are short enough, or ordinary
         * enough as English, to match prose an exporter happened to write.
         * Nothing leaks either way — the tag carries the table's canonical
         * name, never a span of the header — but a mislabelled tool is a
         * mislabelled tool. These are the reviewer's exact examples.
         */
        it.each([
          ['a word that merely contains a family name', 'confusion in the model geometry'],
          ['diffusion', 'There was diffusion between the profusion of parts'],
          ['Rhino as an ordinary noun', 'White Rhino Tower model'],
          ['Inventor as a role', 'Inventor: John Smith, authored 2019'],
          ['NX as a part code', 'Complex NX-200 model code'],
          ['NX as a project name', 'Project NX designation'],
        ])('does not mistake %s for a family', (_label, originatingSystem) => {
          expect(tagsForHeader({originatingSystem})).not.toHaveProperty('authoring_tool')
        })

        // The same four, spelled the way a real header spells them. The bare
        // 'Rhino 8' / 'NX 12.0.2.9' forms are admitted by the version that
        // follows the name, which is exactly what the prose above lacks.
        it.each([
          ['Autodesk Fusion 360', 'Autodesk Fusion 360'],
          ['Rhino 8', 'Rhino 8'],
          ['Rhinoceros 7.4', 'Rhino 7.4'],
          ['Autodesk Inventor 2024', 'Autodesk Inventor 2024'],
          ['Siemens NX 2306', 'Siemens NX 2306'],
          ['NX 12.0.2.9', 'Siemens NX 12.0.2.9'],
        ])('still places the real header %s', (originatingSystem, expected) => {
          expect(tagsForHeader({originatingSystem}).authoring_tool).toBe(expected)
        })

        // The table is ordered most-specific-first, which is the only thing
        // keeping these two off the more generic family that also matches.
        it('prefers the more specific family when a header names both', () => {
          expect(tagsForHeader({originatingSystem: 'Autodesk AutoCAD Civil 3D 2023'}).authoring_tool)
            .toBe('Autodesk Civil 3D 2023')
          expect(tagsForHeader({originatingSystem: 'Bonsai 0.8 (Blender)'}).authoring_tool)
            .toBe('Bonsai/BlenderBIM 0.8')
        })

        /*
         * Safe only because of the allowlist: an unmatched preprocessor
         * yields no tag at all, so reaching for it can add a family but never
         * substitute one header's free text for another's.
         */
        it('falls back to the preprocessor when the authoring system matches nothing', () => {
          expect(tagsForHeader({
            originatingSystem: '20190108_1515(x64) - Exporter 19.3.0.0',
            preprocessorVersion: 'Autodesk Revit 2022 (ENU)',
          }).authoring_tool).toBe('Autodesk Revit 2022')
        })
      })

      /*
       * The two header fields are latched separately, so a later header that
       * names only a preprocessor cannot downgrade an authoring system an
       * earlier one already supplied.
       */
      it('keeps the richer authoring system when a later header names only a preprocessor', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'Tower.ifc'})
        report.modelInfo({fileName: 'Tower.ifc', originatingSystem: 'Autodesk Revit 2024 (ENU)'})
        report.progress({modelInfo: {fileName: 'Tower.ifc', preprocessorVersion: 'KiCad 8.0'}})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1})

        expect(diagnosticsCall()[1].tags.authoring_tool).toBe('Autodesk Revit 2024')
        warnSpy.mockRestore()
      })

      // CadView sends content_type as `loadedModel.type || 'undefined'`, so
      // the literal string is what an unknown type looks like here.
      it('omits model_format rather than tagging the literal "undefined"', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'gdrive:1sWR7x4BZ'})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1, contentType: 'undefined'})

        expect(diagnosticsCall()[1].tags).not.toHaveProperty('model_format')
        warnSpy.mockRestore()
      })

      it('stays silent when the load reported no errors or warnings', () => {
        beginReport({fileInfo: 'index.ifc'})
        report.progress({phase: 'geometry', completed: 1, total: 1, elapsedMs: 5})
        report.end()
        report.captureDiagnostics({errorCount: 0, warningCount: 0})
        expect(captureMessage).not.toHaveBeenCalled()
      })

      /*
       * The bug this gating shape exists to prevent (PR #1770 review).
       * On IFC/STEP the chip is coloured by Conway's counts, which
       * ShareIfcLoader publishes on loadStats and CadView applies over
       * the reporter's console-tee fallbacks. A tee-gated capture would
       * disagree with the chip in both directions.
       */
      it('fires on engine counts even when the console tee caught nothing', () => {
        beginReport({fileInfo: 'index.ifc'})
        report.end()
        report.captureDiagnostics({errorCount: 4, contentType: 'ifc'})

        const [message, context] = diagnosticsCall()
        // No console text to name a family by, so the title stays generic.
        expect(message).toBe('Load completed with diagnostics')
        expect(context.contexts.loadDiagnostics).toEqual(expect.objectContaining({
          errorCount: 4,
          consoleTotal: 0,
          messages: [],
        }))
      })

      it('stays silent when the engine reports clean but the console was chatty', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'index.ifc'})
        console.warn('No basis found for brep!')
        report.end()
        // Conway said zero, so the chip is green — no event behind it.
        report.captureDiagnostics({errorCount: 0, warningCount: 0, contentType: 'ifc'})
        expect(captureMessage).not.toHaveBeenCalled()
        warnSpy.mockRestore()
      })

      // Sentry groups a message event by its text, and engine
      // diagnostics are per-entity, so the digits have to go or every
      // entity of every model opens its own issue.
      it('groups by message family, collapsing per-entity numbers', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginReport({fileInfo: 'Arty_Z7_PCB.stp'})
        console.warn('Error processing representation #1204')
        report.end()
        report.captureDiagnostics({warningCount: 1})
        expect(diagnosticsCall()[0]).toBe('Load diagnostics: Error processing representation #')
        warnSpy.mockRestore()
      })

      it('caps both the number of messages and the length of each', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const distinctCount = 200
        const overlongChars = 300
        beginReport({fileInfo: 'Arty_Z7_PCB.stp'})
        for (let i = 0; i < distinctCount; i++) {
          console.warn(`Error processing representation #${i}`)
        }
        // A collapsed wasm stack trace: one very long line.
        console.warn(`stack ${'x'.repeat(overlongChars)}`)
        console.warn(`stack ${'x'.repeat(overlongChars)}`)
        report.end()
        report.captureDiagnostics({warningCount: distinctCount + 2})

        const {loadDiagnostics} = diagnosticsCall()[1].contexts
        const maxCarried = 25
        const maxEntryChars = 90
        expect(loadDiagnostics.messages).toHaveLength(maxCarried)
        // Most frequent first, and trimmed.
        expect(loadDiagnostics.messages[0]).toMatch(/^2× stack x+…$/)
        expect(Math.max(...loadDiagnostics.messages.map((m) => m.length)))
          .toBeLessThan(maxEntryChars)
        // The true totals still ride along.
        expect(loadDiagnostics.consoleDistinct).toBe(distinctCount + 1)
        expect(loadDiagnostics.consoleTotal).toBe(distinctCount + 2)
        warnSpy.mockRestore()
      })

      it('omits the cid tag when analytics consent is withheld', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        Cookies.set('consentLevel', '1.restricted')
        beginReport({fileInfo: 'index.ifc'})
        console.warn('No basis found for brep!')
        report.end()
        report.captureDiagnostics({warningCount: 1})
        expect(diagnosticsCall()[1].tags).not.toHaveProperty('open_cid')
        warnSpy.mockRestore()
      })

      /*
       * Share#1863: `data_defect` marks events whose captured diagnostic is
       * an authoring defect in the file, so engine-gap triage can filter
       * them out. Driven through conway's REAL Logger — its console echo is
       * what the tee captures and its proxy hand-off is what carries the
       * marker — so these exercise the same join production relies on.
       */
      describe('data_defect tag', () => {
        const DANGLING = 'Skipping representation items with an unresolved or mistyped STEP reference'
        const EXPRESS_ID = 4242
        let warnSpy
        let errorSpy

        beforeEach(() => {
          warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
          errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
          // Logger is static and echoes only an entry's FIRST occurrence, so
          // a message another test already logged would never reach the tee.
          Logger.clearLogs()
        })

        afterEach(() => {
          Logger.clearLogs()
          warnSpy.mockRestore()
          errorSpy.mockRestore()
        })

        // An authoring defect on a load the user is looking at is GA's: its
        // family only ('marked'), never conway's prose about the file.
        it('sends a diagnostic conway marked as a data defect to GA, not Sentry', () => {
          beginReport({fileInfo: 'part.step'})
          Logger.error(DANGLING, EXPRESS_ID, DATA_DEFECT)
          report.end()
          report.captureDiagnostics({errorCount: 1})

          expect(diagnosticsCall()).toBeUndefined()
          expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'displayed', defect: 'marked', format: 'step',
          }))
          expect(JSON.stringify(reportLoadDiagnosticsToGa.mock.calls)).not.toContain('Skipping')
        })

        // An unusable load is an error whatever the console said, so one
        // whose diagnostics are all defects still reaches Sentry, titled and
        // tagged by the defect.
        it('still sends an unusable load to Sentry when its only diagnostic is a defect', () => {
          beginReport({fileInfo: 'part.step'})
          Logger.error(DANGLING, EXPRESS_ID, DATA_DEFECT)
          report.geometryStats({vertexCount: 0, triangleCount: 0})
          report.end()
          report.captureDiagnostics({errorCount: 1})

          const [message, context] = diagnosticsCall()
          // The tee holds conway's echo, record id appended — the separator
          // the classifier cuts at is really there (the title ellipsizes it).
          expect(message).toMatch(new RegExp(`^Load diagnostics: ${DANGLING} exp…$`))
          expect(context.level).toBe('error')
          expect(context.tags.data_defect).toBe('true')
        })

        it('leaves the same text unmarked when conway did not mark it', () => {
          // Identical prose, no category: only the marker differs, so this
          // is what fails if the tag were derived from the message text.
          beginReport({fileInfo: 'part.step'})
          Logger.error(DANGLING, EXPRESS_ID)
          report.end()
          report.captureDiagnostics({errorCount: 1})

          expect(diagnosticsCall()[1].tags).not.toHaveProperty('data_defect')
        })

        it('matches the marked message exactly, not an unmarked one it prefixes', () => {
          // conway logs both of these: the first marked, the second (a
          // different failure carrying its error text) not.
          const untypeable = 'Skipping property definition representation that is untypeable in AP214'
          beginReport({fileInfo: 'part.step'})
          // One tee echo each, so the tie goes to the first seen: the
          // unmarked variant titles the event while the marked one is still
          // registered — a prefix match would tag it.
          Logger.warning(`${untypeable}: TypeError: boom`, '#8')
          Logger.warning(untypeable, '#7', DATA_DEFECT)
          report.end()
          report.captureDiagnostics({warningCount: 2})

          const [message, context] = diagnosticsCall()
          // Titled by the unmarked variant (digits normalized, ellipsized).
          expect(message).toMatch(/untypeable in AP#: TypeErro…$/)
          expect(report.dataDefectMessages.has(untypeable)).toBe(true)
          expect(context.tags).not.toHaveProperty('data_defect')
        })

        /*
         * Conway's category is part of an entry's dedup identity, so the
         * same text logged with and without the marker is two Logger entries
         * whose echoes are identical — the tee merges them into one
         * diagnostic. The text cannot say which dominated, so it must not be
         * tagged (engine triage wins), in either order.
         */
        it.each([
          ['marked, then unmarked', [DATA_DEFECT, undefined]],
          ['unmarked, then marked', [undefined, DATA_DEFECT]],
        ])('does not tag a message logged both marked and unmarked: %s', (_label, categories) => {
          beginReport({fileInfo: 'part.step'})
          categories.forEach((category) => Logger.error(DANGLING, EXPRESS_ID, category))
          report.end()
          report.captureDiagnostics({errorCount: 2})

          const [message, context] = diagnosticsCall()
          // One merged tee diagnostic, seen twice — the collision itself.
          expect(context.contexts.loadDiagnostics.consoleDistinct).toBe(1)
          expect(context.contexts.loadDiagnostics.consoleTotal).toBe(2)
          expect(message).toMatch(new RegExp(`^Load diagnostics: ${DANGLING} exp…$`))
          expect(context.tags).not.toHaveProperty('data_defect')
        })

        it('is not cancelled by an info-level sighting the tee never captures', () => {
          const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
          beginReport({fileInfo: 'part.step'})
          Logger.info(DANGLING)
          Logger.error(DANGLING, EXPRESS_ID, DATA_DEFECT)
          report.end()
          report.captureDiagnostics({errorCount: 1})

          // The info entry really was logged and echoed — to console.log,
          // which the tee does not capture.
          expect(logSpy).toHaveBeenCalledWith(DANGLING)
          expect(diagnosticsCall()).toBeUndefined()
          expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({defect: 'marked'}))
          logSpy.mockRestore()
        })

        // SHARE-1MV and SHARE-1MZ: the two unmarked fallbacks, by name.
        it.each([
          ['No units defined.', 'No units defined.', 'no_units'],
          ['No IfcProjects found?', 'No IfcProjects found?', 'no_projects'],
          // The tee collapses whitespace; the fallback must see the same form.
          ['a whitespace variant', 'No  units\n  defined.', 'no_units'],
        ])('sends the unmarked data-quality fallback to GA, not Sentry: %s', (_label, text, defect) => {
          beginReport({fileInfo: 'index.ifc'})
          Logger.warning(text)
          report.end()
          report.captureDiagnostics({warningCount: 1})

          expect(diagnosticsCall()).toBeUndefined()
          expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({outcome: 'displayed', defect}))
        })

        it('does not tag an ordinary engine diagnostic', () => {
          beginReport({fileInfo: 'index.ifc'})
          Logger.warning('No basis found for brep!')
          report.end()
          report.captureDiagnostics({warningCount: 1})

          expect(diagnosticsCall()[1].tags).not.toHaveProperty('data_defect')
        })

        /*
         * The issue's rule: the tag classifies the diagnostic the event is
         * titled and grouped by, not the load. Here the file has a defect,
         * but an engine error dominated — the event is that engine error's
         * issue, and tagging it would filter a real engine gap out of the
         * very searches the tag exists to clean up.
         */
        it('does not tag when an engine error, not the defect, is the top diagnostic', () => {
          beginReport({fileInfo: 'part.step'})
          Logger.error(DANGLING, EXPRESS_ID, DATA_DEFECT)
          console.error('CDT Exception (hemisphere: 0)')
          console.error('CDT Exception (hemisphere: 0)')
          report.end()
          report.captureDiagnostics({errorCount: 3})

          const [message, context] = diagnosticsCall()
          expect(message).toBe('Load diagnostics: CDT Exception (hemisphere: #)')
          // The defect was seen — the tag's absence is the rule, not a miss.
          expect(report.dataDefectMessages.has(DANGLING)).toBe(true)
          expect(context.tags).not.toHaveProperty('data_defect')
          // The defect is still counted, in GA.
          expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({defect: 'marked'}))
        })

        // A minority engine gap is still the Sentry event when a defect is
        // the most frequent diagnostic: it is what someone can go fix.
        it('titles Sentry by the engine gap even when a defect is more frequent', () => {
          beginReport({fileInfo: 'index.ifc'})
          Logger.warning('No units defined.')
          console.warn('No units defined.')
          console.warn('No units defined.')
          console.error('CDT Exception (hemisphere: 0)')
          report.end()
          report.captureDiagnostics({errorCount: 1, warningCount: 3})

          const [message, context] = diagnosticsCall()
          expect(message).toBe('Load diagnostics: CDT Exception (hemisphere: #)')
          expect(context.tags).not.toHaveProperty('data_defect')
          expect(reportLoadDiagnosticsToGa).toHaveBeenCalledWith(expect.objectContaining({defect: 'no_units'}))
        })

        it('stops listening to conway when the load ends', () => {
          beginReport({fileInfo: 'part.step'})
          report.end()
          Logger.error(DANGLING, EXPRESS_ID, DATA_DEFECT)

          expect(report.dataDefectMessages.size).toBe(0)
        })
      })
    })

    it('ignores straggler progress after endLoadProgress', () => {
      const onStall = jest.fn()
      beginReport({fileInfo: 'index.ifc', onStall})
      report.progress({phase: 'dataParse', completed: 2, total: 4, elapsedMs: 10})
      report.end()
      const linesAtEnd = reportLines()

      report.progress({phase: 'geometry', completed: 9, total: 10, elapsedMs: 20})
      jest.advanceTimersByTime(STALL_TIMEOUT_MS * 2)
      expect(onStall).not.toHaveBeenCalled()
      expect(reportLines()).toEqual(linesAtEnd)
    })

    // Before slice R: with no active reporter. Now a load holds its own, and
    // the caller of one that never began holds none (`report?.`); what is
    // left to pin is that an ended one takes anything without throwing.
    it('is a safe no-op once ended', () => {
      beginReport({fileInfo: 'index.ifc'})
      report.end()
      expect(() => report.progress({phase: 'geometry', completed: 1})).not.toThrow()
      expect(() => report.engineVersion('Conway v1')).not.toThrow()
      expect(() => report.attachFailureContext()).not.toThrow()
    })
  })

  // open-t200 slice R (design/tracks/open-t200/layering.md §4.4, §7 "R"):
  // one reporter per load run, the page-wide parts held by the foreground
  // run's. Each case names the bug it is red against.
  describe('a reporter per load', () => {
    /** @return {{set: Function, get: Function, lines: Function}} a sink that records its own report */
    function recordingSink() {
      const written = {}
      return {
        set: (partial) => {
          Object.assign(written, partial)
          return true
        },
        get: (key) => written[key],
        lines: () => written.loadReportLines ?? [],
      }
    }

    // Red with a shared instance (one reporter for the page, as
    // `activeReporter` was): A's line lands in B's report, and A's end
    // ends B.
    it('two at once keep their lines apart, and each ends only itself', () => {
      const sinkOfA = recordingSink()
      const sinkOfB = recordingSink()
      const reportOfA = new LoadReporter({fileInfo: 'a.ifc', sink: sinkOfA})
      const reportOfB = new LoadReporter({fileInfo: 'b.ifc', sink: sinkOfB, isForeground: false})
      reportOfA.line('Source: A')
      reportOfB.line('Source: B')
      reportOfA.progress({phase: 'geometry', completed: 1, total: 4, elapsedMs: 10})
      reportOfB.progress({phase: 'dataParse', completed: 1, total: 4, elapsedMs: 10})

      reportOfA.end()

      expect(sinkOfA.lines()).toContain('Source: A')
      expect(sinkOfA.lines()).not.toContain('Source: B')
      expect(sinkOfB.lines()).toContain('Source: B')
      expect(sinkOfB.lines()).not.toContain('Source: A')
      expect(reportOfA.ended).toBe(true)
      expect(sinkOfA.lines().some((line) => line.startsWith('Total'))).toBe(true)
      expect(reportOfB.ended).toBe(false)
      expect(sinkOfB.lines().some((line) => line.startsWith('Total'))).toBe(false)
      expect(sinkOfB.get('loadResult')).toBe(null)
      expect(sinkOfB.get('currentLoadLine')).not.toBe(null)
      reportOfB.end()
      expect(sinkOfB.lines().some((line) => line.startsWith('Total'))).toBe(true)
    })

    // A left load that ends late (a mesh parse that could not be stopped, a
    // remount's unwinding view) must not strip the next load's tee. Red with
    // each reporter restoring the console it saved when it began, as
    // `restoreConsole` did before slice R: A puts back the console it found,
    // B's tee goes with it, and B's warning is never counted.
    it('a left reporter that ends after the next has begun leaves the next one\'s console tee in place', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const consoleWarnBefore = console.warn
        const reportOfA = beginReport({fileInfo: 'a.ifc'})
        const reportOfB = new LoadReporter({fileInfo: 'b.ifc', sink: recordingSink()})
        expect(consoleTeeHolder()).toBe(reportOfB)

        reportOfA.end()
        console.warn('No basis found for brep!')

        expect(consoleTeeHolder()).toBe(reportOfB)
        expect(reportOfB.warningCount).toBe(1)
        expect(reportOfA.warningCount).toBe(0)
        reportOfB.end()
        expect(reportOfB.sink.lines()).toContain('Warnings & errors (1): No basis found for brep!')
        // The last holder's end puts the true console back.
        expect(console.warn).toBe(consoleWarnBefore)
        expect(consoleTeeHolder()).toBe(null)
      } finally {
        warnSpy.mockRestore()
      }
    })

    // A pump held by backpressure, or a background load waiting its turn, is
    // not hung. Red if pausing leaves the clocks running.
    it('a paused reporter\'s hang watchdog does not fire', () => {
      const onStall = jest.fn()
      beginReport({fileInfo: 'index.ifc', onStall})
      report.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      report.pauseWatchdog()
      // Progress while paused (a held pump can still say where it is) does
      // not re-arm it.
      report.progress({phase: 'geometry', completed: 4, total: 10, elapsedMs: 60})
      jest.advanceTimersByTime(HANG_TIMEOUT_MS * 2)
      expect(onStall).not.toHaveBeenCalled()
      expect(captureMessage).not.toHaveBeenCalled()

      // Non-vacuity: resumed, the same silence is a hang.
      report.resumeWatchdog()
      jest.advanceTimersByTime(HANG_TIMEOUT_MS)
      expect(onStall).toHaveBeenCalledTimes(1)
      expect(captureMessage).toHaveBeenCalledWith(LOAD_HUNG_MESSAGE, expect.anything())
    })

    // The scope is the foreground load's. Red with a background reporter
    // stamping it as the foreground's does: its hang event then has no
    // phase of its own, and the scope says `dataParse` for the foreground's
    // next capture.
    it('a background reporter\'s Sentry capture carries its own load.phase', () => {
      const foreground = beginReport({fileInfo: 'shown.ifc'})
      foreground.progress({phase: 'geometry', completed: 3, total: 10, elapsedMs: 50})
      const background = new LoadReporter({fileInfo: 'left.ifc', sink: recordingSink(), isForeground: false})
      background.progress({phase: 'dataParse', completed: 1, total: 10, elapsedMs: 50})
      foreground.pauseWatchdog()

      jest.advanceTimersByTime(HANG_TIMEOUT_MS)

      expect(captureMessage).toHaveBeenCalledTimes(1)
      const [message, context] = captureMessage.mock.calls[0]
      expect(message).toBe(LOAD_HUNG_MESSAGE)
      expect(context.tags).toEqual({'load.phase': 'dataParse', 'load.stalled': 'true'})
      expect(context.contexts.load.phase).toBe('dataParse')
      // Allowlisted per event, as the OPFS reports are: no file identity.
      expect(JSON.stringify(context)).not.toContain('left.ifc')
      expect(setTag).not.toHaveBeenCalled()
      expect(setContext).not.toHaveBeenCalled()
      // The foreground's own failure capture still stamps its own phase.
      foreground.attachFailureContext()
      expect(setTag).toHaveBeenCalledWith('load.phase', 'geometry')
      background.end()
    })

    // A deferred build that finishes after the user left the model (or after
    // a theme change reloaded it) is not that open's. Red with the late cap
    // going to GA whatever the sink said: the open had armed GA, and the cap
    // would be counted for a model the user is no longer on.
    it('a late depth cap of a run the user has left reaches neither the report nor GA', () => {
      let isCurrent = true
      beginReport({
        fileInfo: 'index.stp',
        sink: {set: (partial) => isCurrent && storeSink.set(partial), get: storeSink.get},
      })
      report.end()
      // A successful open: GA is armed for a cap that lands later.
      report.captureDiagnostics({})
      const linesWhenLeft = reportLines()
      isCurrent = false

      report.onLateDepthCap({trees: 2, maxLeafTriangles: 3400, maxDepth: 40})

      expect(reportBvhDepthCapToGa).not.toHaveBeenCalled()
      expect(reportLines()).toEqual(linesWhenLeft)
      // Non-vacuity: the same cap while the run is current is counted.
      isCurrent = true
      report.onLateDepthCap({trees: 1, maxLeafTriangles: 10, maxDepth: 40})
      expect(reportBvhDepthCapToGa).toHaveBeenCalledTimes(1)
    })

    it('a background reporter does not take the page\'s console', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const foreground = beginReport({fileInfo: 'shown.ifc'})
        const background = new LoadReporter({fileInfo: 'left.ifc', sink: recordingSink(), isForeground: false})
        console.warn('three.js complained')
        expect(consoleTeeHolder()).toBe(foreground)
        expect(foreground.warningCount).toBe(1)
        expect(background.warningCount).toBe(0)
        // Its engine's own log still reaches it (layering.md §4.4).
        background.engineLog({lines: [{level: 'warning', text: 'engine said so', count: 2}]})
        expect(background.warningCount).toBe(2)
        background.end()
        expect(consoleTeeHolder()).toBe(foreground)
      } finally {
        warnSpy.mockRestore()
      }
    })
  })
})

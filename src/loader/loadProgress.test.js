jest.mock('@sentry/react', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}))

import Cookies from 'js-cookie'
import {captureMessage, setContext, setTag} from '@sentry/react'
import {_resetGaClientIdForTests} from '../privacy/analytics'
import useStore from '../store/useStore'
import {
  STALL_TIMEOUT_MS,
  attachLoadFailureContext,
  beginLoadProgress,
  captureLoadDiagnostics,
  classifyLoadOutcome,
  endLoadProgress,
  getCompletedLoadStats,
  isModelInfoProgress,
  isStructuredProgress,
  reportEngineVersion,
  reportFramingExclusion,
  reportGeometryStats,
  reportLoadProgress,
  reportModelInfo,
  reportSourceInfo,
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
      beginLoadProgress({fileInfo: 'ISS_stationary.glb'})
      reportModelInfo({fileName: 'ISS_stationary.glb', byteLength: 39_950_000})
      console.warn('recoverable material issue')
      console.error('missing texture')
      console.warn('recoverable material issue')
      jest.advanceTimersByTime(LOAD_TIME_MS)
      endLoadProgress()

      expect(getCompletedLoadStats()).toEqual({
        fileSize: 39_950_000,
        memoryUsed: HEAP_MB * BYTES_PER_MB,
        loadTime: LOAD_TIME_MS,
        errorCount: 1,
        warningCount: 2,
      })
      delete performance.memory
      consoleWarnSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('reportSourceInfo appends a byte-source line', () => {
      beginLoadProgress({fileInfo: 'model.ply'})
      reportSourceInfo('Source: OPFS cache (uploaded file)')
      expect(reportLines()).toContain('Source: OPFS cache (uploaded file)')
    })

    it('reportSourceInfo is a no-op without an active load', () => {
      expect(() => reportSourceInfo('Source: OPFS cache (uploaded file)')).not.toThrow()
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

    it('rebases engine elapsedMs so legacy→engine stage boundaries never go negative', () => {
      // Regression: engine events carry elapsedMs from the ENGINE clock
      // (conway's tracker starts at OpenModel), while legacy strings are
      // stamped from load start. Closing a legacy stage with a raw engine
      // timestamp produced "Parsing model geometry: -1.6s" whenever the
      // pre-parse stages (download, read) took longer than the engine's
      // first-event offset.
      beginLoadProgress({fileInfo: 'index.ifc'})
      // 5s of Share-side wall clock passes before the engine starts
      // (download + read stages under fake timers).
      const shareSideStagesMs = 5000
      reportLoadProgress('Preparing file download...')
      jest.advanceTimersByTime(shareSideStagesMs)
      reportLoadProgress('Parsing model geometry...')
      // Engine's first event: 10ms on ITS clock — far behind Share's.
      reportLoadProgress({phase: 'dataParse', completed: 0, total: 100, elapsedMs: 10})
      reportLoadProgress({phase: 'geometry', completed: 0, total: 100, elapsedMs: 250})
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

    it('summarizes captured console warnings/errors after the Total line', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'index.ifc'})
      reportLoadProgress({phase: 'geometry', completed: 1, total: 10, elapsedMs: 50})
      // Engine-style errors during the load — captured via the console tee.
      console.error('CDT Exception (hemisphere: 0)')
      console.error('CDT Exception (hemisphere: 0)')
      endLoadProgress()

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

    it('collapses many distinct warnings into that one line', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'Arty_Z7_PCB.stp'})
      // Per-entity engine diagnostics: textually distinct, so dedup can't
      // collapse them — a STEP model emits hundreds.
      const distinctCount = 200
      for (let i = 0; i < distinctCount; i++) {
        console.warn(`Error processing representation #${i}`)
      }
      // ...plus one repeated message, which wins the "most common" sample.
      console.warn('No basis found for brep!')
      console.warn('No basis found for brep!')
      endLoadProgress()

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
      beginLoadProgress({fileInfo: 'index.ifc'})
      console.warn(`long ${'x'.repeat(overlongChars)}`)
      endLoadProgress()

      const diagLine = reportLines().find((line) => /^Warnings & errors/.test(line))
      expect(diagLine).toMatch(/^Warnings & errors \(1\): long x+…$/)
      expect(diagLine.length).toBeLessThan(readableLineChars)
      consoleWarnSpy.mockRestore()
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
    it('publishes a terse "Loaded <name>" success result (no timing/heap)', () => {
      beginLoadProgress({fileInfo: 'path/to/index.ifc'})
      reportLoadProgress({phase: 'geometry', completed: 10, total: 10, elapsedMs: 100})
      endLoadProgress()
      const result = useStore.getState().loadResult
      expect(result.status).toBe('success')
      // Just the name (basename of fileInfo when no header was parsed) — no
      // Total, no seconds, no MB.
      expect(result.summaryLine).toBe('Loaded index.ifc')
    })

    it('uses the filename, ignoring an unreliable STEP header fileName', () => {
      // The STEP header's fileName is often junk (a comment); the grace line
      // falls back to the source filename (the snackbar prefers model.name).
      beginLoadProgress({fileInfo: 'path/to/Arty_Z7_PCB.stp'})
      reportLoadProgress({modelInfo: {fileName: `/* name */ 'export2`, schema: 'AP214'}})
      endLoadProgress()
      expect(useStore.getState().loadResult.summaryLine).toBe('Loaded Arty_Z7_PCB.stp')
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

  describe('framing exclusion (robust auto-framing, test-models-private#26)', () => {
    it('appends a Health line, warns the console, and notes the grace result', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'basel.ifc'})
      endLoadProgress()

      reportFramingExclusion({excludedElements: 3, excludedVertices: 0, maxDistance: 1877.4})

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
      beginLoadProgress({fileInfo: 'basel.ifc'})
      endLoadProgress()

      reportFramingExclusion({excludedElements: 0, excludedVertices: 52, maxDistance: 1450})

      expect(reportLines().find((line) => line.startsWith('Health:'))).toBe(
        'Health: stray geometry excluded from view framing (52 vertices, up to 1450 model units out)')
      warnSpy.mockRestore()
    })

    it('is silent when nothing was excluded, or with no load reported', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'clean.ifc'})
      endLoadProgress()
      const linesBefore = reportLines().length

      reportFramingExclusion({excludedElements: 0, excludedVertices: 0, maxDistance: 0})
      reportFramingExclusion(null)

      expect(reportLines().length).toBe(linesBefore)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(useStore.getState().loadResult.note).toBeUndefined()
      warnSpy.mockRestore()
    })

    it('does not touch an error grace result', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      beginLoadProgress({fileInfo: 'broken.ifc'})
      endLoadProgress(new Error('bad header'))

      reportFramingExclusion({excludedElements: 1, excludedVertices: 0, maxDistance: 500})

      expect(useStore.getState().loadResult.note).toBeUndefined()
      // The Health line still lands in the report for the "i" dialog.
      expect(reportLines().some((line) => line.startsWith('Health:'))).toBe(true)
      warnSpy.mockRestore()
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

    /*
     * The end-of-load diagnostics event (issue #1767): the counterpart
     * a dashboard model-open chip with non-zero errors/warnings links
     * to. CadView drives it from inside the real_model_open branch, so
     * the counts here are the GA stats_* ones that colour the chip —
     * NOT the console tee's, which disagree with them on IFC/STEP.
     */
    describe('captureLoadDiagnostics', () => {
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
        Cookies.remove('isAnalyticsAllowed')
      })

      it('sends one event per noisy load, tagged with the bare cid, content_id and type', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'gdrive:abc123'})
        console.warn('No basis found for brep!')
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({
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
        beginLoadProgress({fileInfo: 'index.stp'})
        console.error('CDT Exception (hemisphere: 0)')
        reportGeometryStats({vertexCount: 120_000, triangleCount: 40_000})
        endLoadProgress()
        captureLoadDiagnostics({errorCount: 1})

        expect(diagnosticsCall()[1].level).toBe('warning')
        expect(diagnosticsCall()[1].tags.load_outcome).toBe('displayed')
        errorSpy.mockRestore()
      })

      it('raises severity to error when the load built no geometry at all', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'index.stp'})
        console.error('CDT Exception (hemisphere: 0)')
        reportGeometryStats({vertexCount: 0, triangleCount: 0})
        endLoadProgress()
        captureLoadDiagnostics({errorCount: 1})

        expect(diagnosticsCall()[1].level).toBe('error')
        expect(diagnosticsCall()[1].tags.load_outcome).toBe('unusable')
        errorSpy.mockRestore()
      })

      it('defaults to regular severity when no loader reported geometry', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'ISS_stationary.glb'})
        console.error('missing texture')
        endLoadProgress()
        captureLoadDiagnostics({errorCount: 1})

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
        beginLoadProgress({fileInfo: 'https://example.test/models/Tower.ifc'})
        reportModelInfo({
          fileName: 'Tower.ifc',
          schema: 'IFC4',
          byteLength: sizeBytes,
          originatingSystem: 'Autodesk Revit 2024 (ENU)',
        })
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1, contentType: 'ifc'})

        const {tags} = diagnosticsCall()[1]
        expect(tags.authoring_tool).toBe('Autodesk Revit 2024 (ENU)')
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
        beginLoadProgress({fileInfo: 'Arty_Z7_PCB.stp'})
        // What Loader stamps from the filename before the parse...
        reportModelInfo({fileName: 'Arty_Z7_PCB.stp', schema: 'STP', byteLength: 1_000_000})
        // ...then what conway's ON_MODEL_INFO reports once the header parses.
        reportLoadProgress({modelInfo: {
          fileName: 'Arty_Z7_PCB.stp',
          schema: 'AP242',
          preprocessorVersion: 'KiCad 8.0',
        }})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})

        const {tags} = diagnosticsCall()[1]
        expect(tags.model_schema).toBe('AP242')
        // The header named no authoring system, so the preprocessor stands in
        // — the same preference order the model line uses.
        expect(tags.authoring_tool).toBe('KiCad 8.0')
        expect(tags.model_format).toBe('stp')
        warnSpy.mockRestore()
      })

      it('truncates tag values at Sentry limit and omits what the header never said', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const overlongChars = 300
        const maxTagChars = 200
        beginLoadProgress({fileInfo: 'noext'})
        reportModelInfo({fileName: 'noext', originatingSystem: 'T'.repeat(overlongChars)})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})

        const {tags} = diagnosticsCall()[1]
        expect(tags.authoring_tool).toHaveLength(maxTagChars)
        expect(tags).not.toHaveProperty('model_schema')
        expect(tags).not.toHaveProperty('model_size_mb')
        // No extension to read, and no contentType passed to fall back on.
        expect(tags).not.toHaveProperty('model_format')
        warnSpy.mockRestore()
      })

      it('falls back to the content type when the name carries no extension', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'gdrive:1sWR7x4BZ'})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1, contentType: 'IFC'})

        expect(diagnosticsCall()[1].tags.model_format).toBe('ifc')
        warnSpy.mockRestore()
      })

      /*
       * The tag exists to bypass Sentry's scrubber, so it has to police its
       * own content: an exporter-written originating_system sometimes carries
       * the exporter's install path, which on Windows names a user.
       */
      it('strips path-like tokens from the authoring tool', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'Tower.ifc'})
        reportModelInfo({
          fileName: 'Tower.ifc',
          originatingSystem: 'Revit Exporter C:\\Users\\jsmith\\rvt2ifc.exe',
        })
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})

        const {tags} = diagnosticsCall()[1]
        expect(tags.authoring_tool).toBe('Revit Exporter')
        expect(tags.authoring_tool).not.toContain('jsmith')
        warnSpy.mockRestore()
      })

      it('omits the authoring tool entirely when it is nothing but a path', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'Tower.ifc'})
        reportModelInfo({fileName: 'Tower.ifc', originatingSystem: '/home/jsmith/exporters/ifc'})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})

        expect(diagnosticsCall()[1].tags).not.toHaveProperty('authoring_tool')
        warnSpy.mockRestore()
      })

      /*
       * The two header fields are latched separately, so a later header that
       * names only a preprocessor cannot downgrade an authoring system an
       * earlier one already supplied.
       */
      it('keeps the richer authoring system when a later header names only a preprocessor', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'Tower.ifc'})
        reportModelInfo({fileName: 'Tower.ifc', originatingSystem: 'Autodesk Revit 2024 (ENU)'})
        reportLoadProgress({modelInfo: {fileName: 'Tower.ifc', preprocessorVersion: 'IFC4 exporter'}})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})

        expect(diagnosticsCall()[1].tags.authoring_tool).toBe('Autodesk Revit 2024 (ENU)')
        warnSpy.mockRestore()
      })

      // CadView sends content_type as `loadedModel.type || 'undefined'`, so
      // the literal string is what an unknown type looks like here.
      it('omits model_format rather than tagging the literal "undefined"', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'gdrive:1sWR7x4BZ'})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1, contentType: 'undefined'})

        expect(diagnosticsCall()[1].tags).not.toHaveProperty('model_format')
        warnSpy.mockRestore()
      })

      it('stays silent when the load reported no errors or warnings', () => {
        beginLoadProgress({fileInfo: 'index.ifc'})
        reportLoadProgress({phase: 'geometry', completed: 1, total: 1, elapsedMs: 5})
        endLoadProgress()
        captureLoadDiagnostics({errorCount: 0, warningCount: 0})
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
        beginLoadProgress({fileInfo: 'index.ifc'})
        endLoadProgress()
        captureLoadDiagnostics({errorCount: 4, contentType: 'ifc'})

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
        beginLoadProgress({fileInfo: 'index.ifc'})
        console.warn('No basis found for brep!')
        endLoadProgress()
        // Conway said zero, so the chip is green — no event behind it.
        captureLoadDiagnostics({errorCount: 0, warningCount: 0, contentType: 'ifc'})
        expect(captureMessage).not.toHaveBeenCalled()
        warnSpy.mockRestore()
      })

      // Sentry groups a message event by its text, and engine
      // diagnostics are per-entity, so the digits have to go or every
      // entity of every model opens its own issue.
      it('groups by message family, collapsing per-entity numbers', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        beginLoadProgress({fileInfo: 'Arty_Z7_PCB.stp'})
        console.warn('Error processing representation #1204')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})
        expect(diagnosticsCall()[0]).toBe('Load diagnostics: Error processing representation #')
        warnSpy.mockRestore()
      })

      it('caps both the number of messages and the length of each', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const distinctCount = 200
        const overlongChars = 300
        beginLoadProgress({fileInfo: 'Arty_Z7_PCB.stp'})
        for (let i = 0; i < distinctCount; i++) {
          console.warn(`Error processing representation #${i}`)
        }
        // A collapsed wasm stack trace: one very long line.
        console.warn(`stack ${'x'.repeat(overlongChars)}`)
        console.warn(`stack ${'x'.repeat(overlongChars)}`)
        endLoadProgress()
        captureLoadDiagnostics({warningCount: distinctCount + 2})

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
        Cookies.set('isAnalyticsAllowed', 'false')
        beginLoadProgress({fileInfo: 'index.ifc'})
        console.warn('No basis found for brep!')
        endLoadProgress()
        captureLoadDiagnostics({warningCount: 1})
        expect(diagnosticsCall()[1].tags).not.toHaveProperty('open_cid')
        warnSpy.mockRestore()
      })
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

import {
  LoadLogAccumulator,
  formatBar,
  formatMb,
  formatModelLine,
  formatSeconds,
  stageLabel,
} from './loadLogFormat'


// These vectors mirror conway's core/progress_log.test.ts exactly — this
// module is an interim copy of that canonical implementation (see the
// header note in loadLogFormat.js); identical vectors keep the swap safe.
const HALF_DOTS = 9
const HALF_PERCENT = 56
const SAMPLE_MS = 3210
const SAMPLE_MB = 210
const LOAD_END_MS = 16_600
const LOAD_END_MB = 720

describe('loadLogFormat', () => {
  describe('formatBar', () => {
    it('grows dots with percent', () => {
      expect(formatBar(0)).toBe('[0%0%]')
      expect(formatBar(HALF_PERCENT)).toBe(`[0%${'.'.repeat(HALF_DOTS)}56%]`)
    })

    it('renders indeterminate without a percent', () => {
      expect(formatBar(undefined)).toBe('[...]')
    })
  })

  describe('formatSeconds / formatMb', () => {
    it('seconds render to millisecond precision', () => {
      expect(formatSeconds(SAMPLE_MS)).toBe('3.210s')
    })

    it('memory renders to byte precision', () => {
      expect(formatMb(SAMPLE_MB)).toBe('210.000000')
    })
  })

  describe('formatModelLine', () => {
    it('renders the full header info', () => {
      expect(formatModelLine({
        fileName: 'Arty_Z7.stp',
        schema: 'AP214',
        originatingSystem: 'SolidWorks 2021',
        preprocessorVersion: 'SwSTEP 2.0',
        byteLength: 39_950_000,
      })).toBe('Model: Arty_Z7.stp — AP214, 38.1 MB, SolidWorks 2021 (SwSTEP 2.0)')
    })

    it('degrades gracefully with partial info', () => {
      expect(formatModelLine({})).toBe('Model: (unnamed)')
      expect(formatModelLine({fileName: 'a.glb', schema: 'GLB'})).toBe('Model: a.glb — GLB')
    })
  })

  describe('stageLabel', () => {
    it('merges header and data parse into Parsing; title-cases unknowns', () => {
      expect(stageLabel('headerParse')).toBe('Parsing')
      expect(stageLabel('dataParse')).toBe('Parsing')
      expect(stageLabel('Converting model format')).toBe('Converting model format')
    })
  })

  describe('LoadLogAccumulator', () => {
    it('a completed stage drops its bar and owns the gap until the next begins', () => {
      const log = new LoadLogAccumulator()
      log.setModelInfo({fileName: 'index.ifc', schema: 'IFC4'})

      log.onProgress({phase: 'dataParse', completed: 0, total: 100, elapsedMs: 0, memoryMb: 500})
      log.onProgress(
        {phase: 'dataParse', completed: 100, total: 100, elapsedMs: 3200, memoryMb: 710})

      // Geometry begins at 3300ms/712MB → closes + extends Parsing to it.
      const closed = log.onProgress(
        {phase: 'geometry', completed: 0, total: 200, elapsedMs: 3300, memoryMb: 712})
      expect(closed).toBe('Parsing: 3.300s, +212.000000 MB heap')
    })

    it('a stage frozen below 100% keeps its bar', () => {
      const log = new LoadLogAccumulator()
      log.onProgress({phase: 'geometry', completed: 0, total: 200, elapsedMs: 0, memoryMb: 712})
      log.onProgress(
        {phase: 'geometry', completed: 112, total: 200, elapsedMs: 41_000, memoryMb: 1100})
      expect(log.currentLine()).toBe(
        `Geometry [0%${'.'.repeat(HALF_DOTS)}56%] 41.000s, +388.000000 MB heap`)

      log.closeCurrentStage()
      expect(log.finished[0]).toBe(
        `Geometry [0%${'.'.repeat(HALF_DOTS)}56%] 41.000s, +388.000000 MB heap`)
    })

    it('closeCurrentStage extends the final stage to the load-end point', () => {
      const log = new LoadLogAccumulator()
      log.onProgress({phase: 'geometry', completed: 0, elapsedMs: 100, memoryMb: 500})
      log.closeCurrentStage(LOAD_END_MS, LOAD_END_MB)
      expect(log.finished[0]).toBe('Geometry: 16.500s, +220.000000 MB heap')
      expect(log.totalLine()).toBe('Total: 16.500s, 500.000000 → 720.000000 MB heap')
    })

    it('handles indeterminate stages and missing memory', () => {
      const log = new LoadLogAccumulator()
      log.onProgress({phase: 'geometry', completed: 0, elapsedMs: 0})
      log.onProgress({phase: 'geometry', completed: 0, elapsedMs: 12_400})
      expect(log.currentLine()).toBe('Geometry [...] 12.400s')
      log.closeCurrentStage()
      expect(log.finished[0]).toBe('Geometry: 12.400s')
      expect(log.totalLine()).toBe('Total: 12.400s')
    })
  })
})

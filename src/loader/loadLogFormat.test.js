import {LoadLogAccumulator, formatBar, formatModelLine, stageLabel} from './loadLogFormat'


// These vectors mirror conway's core/progress_log.test.ts exactly — this
// module is an interim copy of that canonical implementation (see the
// header note in loadLogFormat.js); identical vectors keep the swap safe.
const FULL_DOTS = 16
const HALF_DOTS = 9
const HALF_PERCENT = 56
const FULL_PERCENT = 100

describe('loadLogFormat', () => {
  describe('formatBar', () => {
    it('grows dots with percent and completes at 100', () => {
      expect(formatBar(0)).toBe('[0%0%]')
      expect(formatBar(HALF_PERCENT)).toBe(`[0%${'.'.repeat(HALF_DOTS)}56%]`)
      expect(formatBar(FULL_PERCENT)).toBe(`[0%${'.'.repeat(FULL_DOTS)}100%]`)
    })

    it('renders indeterminate without a percent', () => {
      expect(formatBar(undefined)).toBe('[...]')
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
      expect(stageLabel('geometry')).toBe('Geometry')
      expect(stageLabel('Converting model format')).toBe('Converting model format')
    })
  })

  describe('LoadLogAccumulator', () => {
    it('freezes stage lines with owned deltas and a separate Total', () => {
      const log = new LoadLogAccumulator()
      log.setModelInfo({fileName: 'index.ifc', schema: 'IFC4'})

      log.onProgress({phase: 'dataParse', completed: 0, total: 100, elapsedMs: 0, memoryMb: 500})
      log.onProgress(
        {phase: 'dataParse', completed: 100, total: 100, elapsedMs: 3200, memoryMb: 710})

      const closed = log.onProgress(
        {phase: 'geometry', completed: 0, total: 200, elapsedMs: 3300, memoryMb: 712})
      expect(closed).toBe(`Parsing [0%${'.'.repeat(FULL_DOTS)}100%] 3.2s, +210 MB heap`)

      log.onProgress(
        {phase: 'geometry', completed: 112, total: 200, elapsedMs: 44_300, memoryMb: 1100})
      expect(log.currentLine()).toBe(`Geometry [0%${'.'.repeat(HALF_DOTS)}56%] 41.0s, +388 MB heap`)

      log.closeCurrentStage()
      expect(log.totalLine()).toBe('Total: 44.3s, 500 → 1100 MB heap')
    })

    it('handles indeterminate stages and missing memory', () => {
      const log = new LoadLogAccumulator()
      log.onProgress({phase: 'geometry', completed: 0, elapsedMs: 0})
      log.onProgress({phase: 'geometry', completed: 0, elapsedMs: 12_400})
      expect(log.currentLine()).toBe('Geometry [...] 12.4s')
      log.closeCurrentStage()
      expect(log.totalLine()).toBe('Total: 12.4s')
    })
  })
})

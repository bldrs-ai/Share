/* eslint-disable no-magic-numbers, no-mixed-operators */
import {gtagEvent} from '../privacy/analytics'
import {
  ENGINE_BUFFERED_REASONS,
  leafBucket,
  reportBvhDepthCapToGa,
  reportEngineSourceBuffered,
  reportPreviewUnitsSkipped,
  sizeClass,
  skippedBucket,
} from './reportLoadDiagnostics'


jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))

const MIB = 1024 * 1024
const GIB = 1024 * MIB


describe('loader/reportLoadDiagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('reportPreviewUnitsSkipped', () => {
    it('sends exactly format, kind and a bucketed count', () => {
      reportPreviewUnitsSkipped({format: 'ifc', kind: 'github', skipped: 3})
      expect(gtagEvent.mock.calls).toEqual([['preview_unit_skipped', {format: 'ifc', kind: 'github', skipped: '2-10'}]])
    })

    it('sends nothing for zero or missing skips', () => {
      reportPreviewUnitsSkipped({format: 'ifc', kind: 'github', skipped: 0})
      reportPreviewUnitsSkipped({format: 'ifc', kind: 'github', skipped: undefined})
      expect(gtagEvent).not.toHaveBeenCalled()
    })

    it('buckets the count at its boundaries', () => {
      expect([1, 2, 10, 11, 5000].map(skippedBucket)).toEqual(['1', '2-10', '2-10', '11+', '11+'])
    })

    it('does not throw when GA does', () => {
      gtagEvent.mockImplementationOnce(() => {
        throw new Error('gtag blocked')
      })
      expect(() => reportPreviewUnitsSkipped({format: 'step', kind: 'local', skipped: 1})).not.toThrow()
    })
  })

  describe('reportEngineSourceBuffered', () => {
    it('sends exactly reason and size_class', () => {
      reportEngineSourceBuffered({reason: 'opfs-unavailable', sizeBytes: 50 * MIB})
      expect(gtagEvent.mock.calls).toEqual([
        ['engine_source_buffered', {reason: 'opfs-unavailable', size_class: '10-100MB'}],
      ])
    })

    it('buckets the size at its boundaries', () => {
      expect([
        0, 10 * MIB - 1, 10 * MIB, 100 * MIB - 1, 100 * MIB, GIB - 1, GIB, 5 * GIB,
      ].map(sizeClass)).toEqual([
        '<10MB', '<10MB', '10-100MB', '10-100MB', '100MB-1GB', '100MB-1GB', '>=1GB', '>=1GB',
      ])
    })

    it('files an unknown size under the smallest class rather than sending NaN', () => {
      reportEngineSourceBuffered({reason: 'unknown', sizeBytes: undefined})
      expect(gtagEvent.mock.calls[0][1].size_class).toBe('<10MB')
    })

    it('does not throw when GA does', () => {
      gtagEvent.mockImplementationOnce(() => {
        throw new Error('gtag blocked')
      })
      expect(() => reportEngineSourceBuffered({reason: 'unknown', sizeBytes: 1})).not.toThrow()
    })

    it('documents a small fixed reason enum', () => {
      expect(ENGINE_BUFFERED_REASONS).toContain('opfs-unavailable')
      expect(ENGINE_BUFFERED_REASONS).toContain('unknown')
    })
  })

  describe('reportBvhDepthCapToGa', () => {
    it('sends exactly format and bucketed tree and leaf counts', () => {
      reportBvhDepthCapToGa({format: 'step', trees: 3, maxLeafTriangles: 3400})
      expect(gtagEvent.mock.calls).toEqual([['bvh_depth_cap', {format: 'step', trees: '2-10', max_leaf: '1001-10000'}]])
    })

    it('sends nothing when no tree hit the cap', () => {
      reportBvhDepthCapToGa({format: 'ifc', trees: 0, maxLeafTriangles: 0})
      expect(gtagEvent).not.toHaveBeenCalled()
    })

    it('buckets the leaf size at its boundaries', () => {
      expect([1, 100, 101, 1000, 1001, 10000, 10001].map(leafBucket)).toEqual([
        '<=100', '<=100', '101-1000', '101-1000', '1001-10000', '1001-10000', '>10000',
      ])
    })
  })
})

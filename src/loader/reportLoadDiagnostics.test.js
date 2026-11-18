/* eslint-disable no-magic-numbers, no-mixed-operators */
import {gtagEvent} from '../privacy/analytics'
import {
  ENGINE_BUFFERED_REASONS,
  leafBucket,
  reportBvhDepthCapToGa,
  reportEngineSourceBuffered,
  reportEngineSourceFallback,
  reportLoadDiagnosticsToGa,
  reportLoadStallRecovered,
  reportPreviewUnitsSkipped,
  schemaParam,
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

  describe('reportEngineSourceFallback', () => {
    it('sends exactly format, store, failure and a size class', () => {
      reportEngineSourceFallback({format: 'step', storeKind: 'blobHeld', failure: 'outOfMemory', sizeBytes: 2 * GIB})
      expect(gtagEvent.mock.calls).toEqual([
        ['engine_source_fallback', {format: 'step', store: 'blobHeld', failure: 'outOfMemory', size_class: '>=1GB'}],
      ])
    })

    it('fills what it was not told with unknown, never undefined', () => {
      reportEngineSourceFallback({})
      expect(gtagEvent.mock.calls).toEqual([
        ['engine_source_fallback', {format: 'unknown', store: 'unknown', failure: 'unknown', size_class: '<10MB'}],
      ])
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
    it('returns whether GA took the event, so a caller can retry a dropped one', () => {
      gtagEvent.mockReturnValueOnce(false)
      expect(reportBvhDepthCapToGa({format: 'ifc', trees: 1, maxLeafTriangles: 5})).toBe(false)
      gtagEvent.mockReturnValueOnce(true)
      expect(reportBvhDepthCapToGa({format: 'ifc', trees: 1, maxLeafTriangles: 5})).toBe(true)
      gtagEvent.mockImplementationOnce(() => {
        throw new Error('gtag down')
      })
      expect(reportBvhDepthCapToGa({format: 'ifc', trees: 1, maxLeafTriangles: 5})).toBe(false)
      // Nothing to send is nothing left to retry.
      expect(reportBvhDepthCapToGa({format: 'ifc', trees: 0, maxLeafTriangles: 0})).toBe(true)
    })

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


  // SHARE-1MV / SHARE-1MZ: authoring defects and nothing-to-draw loads.
  describe('reportLoadDiagnosticsToGa', () => {
    it('sends exactly the closed-set fields, with the size bucketed', () => {
      reportLoadDiagnosticsToGa({
        outcome: 'displayed', defect: 'no_units', format: 'ifc',
        authoringTool: 'Revit', schema: 'ifc2x3', sizeBytes: 20 * MIB,
      })
      expect(gtagEvent.mock.calls).toEqual([['load_diagnostics', {
        outcome: 'displayed', defect: 'no_units', format: 'ifc',
        authoring_tool: 'Revit', schema: 'IFC2X3', size_class: '10-100MB',
      }]])
    })

    it('says unknown for a missing tool, schema or size', () => {
      reportLoadDiagnosticsToGa({outcome: 'no_geometry', defect: 'none', format: 'step'})
      expect(gtagEvent.mock.calls[0][1]).toEqual(expect.objectContaining({
        authoring_tool: 'unknown', schema: 'unknown', size_class: '<10MB',
      }))
    })

    // The schema is header text: only a known schema or AP family passes.
    it.each([
      ['CONFIG_CONTROL_DESIGN', 'CONFIG_CONTROL_DESIGN'],
      ['IFC4X3_ADD2', 'IFC4X3_ADD2'],
      ['ifc2x3', 'IFC2X3'],
      ['AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }', 'AUTOMOTIVE_DESIGN'],
      ['AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF', 'AP242'],
      ['GLB', 'GLB'],
      // A plain identifier is not enough (codex on #2235).
      ['CLIENT_ACME_TOWER', 'other'],
      ['\\\\fileserver\\projects\\plan', 'other'],
      ['', 'unknown'],
    ])('passes schema %s as %s', (schema, expected) => {
      expect(schemaParam(schema)).toBe(expected)
    })
  })


  // SHARE-1HJ: a stall the load came back from.
  describe('reportLoadStallRecovered', () => {
    it('sends exactly phase, format and size class', () => {
      reportLoadStallRecovered({phase: 'geometry', format: 'step', sizeBytes: 200 * MIB})
      expect(gtagEvent.mock.calls).toEqual([['load_stall_recovered', {phase: 'geometry', format: 'step', size_class: '100MB-1GB'}]])
    })

    it('keeps anything but a plain phase name out', () => {
      reportLoadStallRecovered({phase: 'geometry: /private/model.ifc', format: 'ifc'})
      expect(gtagEvent.mock.calls[0][1].phase).toBe('other')
    })
  })
})

// Tests for the compression-mode resolution + schema-version partitioning
// in glbCompress. The actual compression work goes through
// @gltf-transform + meshoptimizer + Google DRACO; those are exercised in
// browser smoke since they involve wasm and DOM script injection.

const mockIsFeatureEnabled = jest.fn()
jest.mock('../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))

import {BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {
  activeGlbCompressionMode,
  activeSchemaVersion,
  compressGlb,
  schemaVersionFor,
} from './glbCompress'


describe('loader/glbCompress', () => {
  beforeEach(() => {
    mockIsFeatureEnabled.mockReset().mockReturnValue(false)
  })

  describe('activeGlbCompressionMode', () => {
    it('returns null when both flags are off', () => {
      expect(activeGlbCompressionMode()).toBeNull()
    })

    it('returns "draco" when glbDraco is on', () => {
      mockIsFeatureEnabled.mockImplementation((n) => n === 'glbDraco')
      expect(activeGlbCompressionMode()).toBe('draco')
    })

    it('returns "meshopt" when glbMeshopt is on', () => {
      mockIsFeatureEnabled.mockImplementation((n) => n === 'glbMeshopt')
      expect(activeGlbCompressionMode()).toBe('meshopt')
    })

    it('prefers draco when both flags are on (deterministic tie-break)', () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      expect(activeGlbCompressionMode()).toBe('draco')
    })
  })

  describe('schemaVersionFor', () => {
    it('returns the base version for uncompressed', () => {
      expect(schemaVersionFor(null)).toBe(BLDRS_GLB_SCHEMA_VERSION)
    })

    it('suffixes the base version for draco', () => {
      expect(schemaVersionFor('draco')).toBe(`${BLDRS_GLB_SCHEMA_VERSION}-draco`)
    })

    it('suffixes the base version for meshopt', () => {
      expect(schemaVersionFor('meshopt')).toBe(`${BLDRS_GLB_SCHEMA_VERSION}-meshopt`)
    })

    it('produces distinct versions per mode so cache slots do not collide', () => {
      const versions = new Set([
        schemaVersionFor(null),
        schemaVersionFor('draco'),
        schemaVersionFor('meshopt'),
      ])
      expect(versions.size).toBe(3)
    })
  })

  describe('activeSchemaVersion', () => {
    it('combines flag state + schemaVersionFor', () => {
      expect(activeSchemaVersion()).toBe(BLDRS_GLB_SCHEMA_VERSION)
      mockIsFeatureEnabled.mockImplementation((n) => n === 'glbMeshopt')
      expect(activeSchemaVersion()).toBe(`${BLDRS_GLB_SCHEMA_VERSION}-meshopt`)
    })
  })

  describe('compressGlb', () => {
    it('returns {bytes, mode:null} on null mode', async () => {
      const input = new Uint8Array([1, 2, 3])
      const result = await compressGlb(input, null)
      expect(result.bytes).toBe(input)
      expect(result.mode).toBeNull()
    })

    it('passes through on unrecognised mode (mode reported as null)', async () => {
      const input = new Uint8Array([1, 2, 3])
      const result = await compressGlb(input, 'lz4')
      expect(result.bytes).toBe(input)
      expect(result.mode).toBeNull()
    })
  })
})

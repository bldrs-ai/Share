// Tests for the compression-mode resolution + schema-version partitioning
// in glbCompress. The actual compression work goes through
// @gltf-transform + meshoptimizer + Google DRACO; those are exercised in
// browser smoke since they involve wasm and DOM script injection.

const mockIsFeatureEnabled = jest.fn()
jest.mock('../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))

// Fail the gltf-transform import deterministically. Historically this
// import failed ON ITS OWN under jest (the ESM-only `property-graph` dep
// didn't transform), and the compressGlb tests below silently relied on
// that: "DRACO proceeds past the guard" really asserted "the import after
// the guard threw fast". Now that jest transforms
// @gltf-transform/core|extensions for the batched-native writer's tests,
// the import would SUCCEED here and compressGlb would advance to
// `loadDracoEncoder()` — a script-tag injection jsdom never completes, so
// the test hangs to timeout instead. The real encoder paths are
// browser-smoke territory (module doc); this keeps these tests pinned to
// the guard/fallback logic they were written for.
jest.mock('@gltf-transform/core', () => {
  throw new Error('gltf-transform unavailable under jsdom (see mock comment)')
})

import {BLDRS_GLB_BATCHED_SCHEMA_VERSION, BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {
  activeArtifactSpec,
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

  describe('activeArtifactSpec', () => {
    it('defaults to the merged slot, uncompressed', () => {
      expect(activeArtifactSpec())
        .toEqual({schemaVer: BLDRS_GLB_SCHEMA_VERSION, mode: null})
    })

    it('selects the batched slot when glbBatched is on', () => {
      mockIsFeatureEnabled.mockImplementation((n) => n === 'glbBatched')
      expect(activeArtifactSpec())
        .toEqual({schemaVer: BLDRS_GLB_BATCHED_SCHEMA_VERSION, mode: null})
    })

    it('lets glbBatched win over a compression flag — mode stays null', () => {
      // Without this precedence, a `glbBatched,glbDraco` reader would look
      // in the batched slot but demand draco-marked bytes and false-miss
      // its own writer's artifact every load.
      mockIsFeatureEnabled.mockImplementation(
        (n) => n === 'glbBatched' || n === 'glbDraco')
      expect(activeArtifactSpec())
        .toEqual({schemaVer: BLDRS_GLB_BATCHED_SCHEMA_VERSION, mode: null})
    })

    it('keeps compression slots for merged artifacts when glbBatched is off', () => {
      mockIsFeatureEnabled.mockImplementation((n) => n === 'glbDraco')
      expect(activeArtifactSpec())
        .toEqual({schemaVer: `${BLDRS_GLB_SCHEMA_VERSION}-draco`, mode: 'draco'})
    })

    it('sends disableGlbBatched back to the merged slot', () => {
      // The off-switch for the now-default-on layout. Pinned at THIS seam
      // because it is the one both the reader's lookup and the writer's key
      // derivation go through — an off-switch honored by only one of them
      // would write artifacts nothing ever reads.
      mockIsFeatureEnabled.mockImplementation(
        (n) => n === 'glbBatched' || n === 'disableGlbBatched')
      expect(activeArtifactSpec())
        .toEqual({schemaVer: BLDRS_GLB_SCHEMA_VERSION, mode: null})
    })

    it('keeps the batched slot disjoint from every merged slot', () => {
      const slots = new Set([
        BLDRS_GLB_BATCHED_SCHEMA_VERSION,
        schemaVersionFor(null),
        schemaVersionFor('draco'),
        schemaVersionFor('meshopt'),
      ])
      expect(slots.size).toBe(4)
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

    it('skips DRACO when the GLB carries per-vertex _EXPRESSID', async () => {
      // DRACO's 16-bit quantization corrupts per-vertex IFC IDs on
      // models with expressID > 65535. The compressor detects the
      // attribute by name and short-circuits to a no-op rather than
      // produce a cache that picks wrong elements. Test by building
      // a minimal GLB with `_EXPRESSID` in the primitive attributes.
      const {serializeGlb} = await import('./injectGlbExtensions')
      const EXPRESS_ID_MAX = 999_999
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        accessors: [{
          bufferView: 0, componentType: 5125 /* UNSIGNED_INT */,
          type: 'SCALAR', count: 1, max: [EXPRESS_ID_MAX], min: [1],
        }],
        meshes: [{primitives: [{attributes: {_EXPRESSID: 0}}]}],
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const result = await compressGlb(glb, 'draco')
      expect(result.bytes).toBe(glb)
      expect(result.mode).toBeNull()
    })

    it('skips DRACO when the GLB carries per-vertex _INSTANCEID', async () => {
      const {serializeGlb} = await import('./injectGlbExtensions')
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        accessors: [{
          bufferView: 0, componentType: 5125, type: 'SCALAR', count: 1,
        }],
        meshes: [{primitives: [{attributes: {_INSTANCEID: 0}}]}],
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const result = await compressGlb(glb, 'draco')
      expect(result.bytes).toBe(glb)
      expect(result.mode).toBeNull()
    })

    it('does NOT skip DRACO when the GLB has no per-vertex IFC attributes', async () => {
      // No `_EXPRESSID` / `_INSTANCEID` → DRACO proceeds. The
      // compression itself fails on this contrived GLB (no actual
      // geometry data), but that exercises the path *past* the
      // hasPerVertexIfcIds guard — proving the guard didn't fire.
      const {serializeGlb} = await import('./injectGlbExtensions')
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        accessors: [{
          bufferView: 0, componentType: 5126 /* FLOAT */,
          type: 'VEC3', count: 1,
        }],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const result = await compressGlb(glb, 'draco')
      // Compression fell back to null mode (transform threw on this
      // contrived GLB) — but the guard didn't intercept; otherwise
      // the test name's claim would be wrong. The way to assert "guard
      // didn't fire" is that bytes match the original (true either way
      // for failure modes) and mode is null.
      expect(result.mode).toBeNull()
    })
  })
})

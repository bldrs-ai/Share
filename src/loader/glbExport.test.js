// Tests for the GLB writer (post-2a switch to GLTFExporter). The
// exporter and OPFS are mocked so these are unit tests of the wiring +
// container packing, not an integration test of an actual scene→GLB
// conversion.

const mockWriteGlbBytesToOPFS = jest.fn()
jest.mock('../OPFS/utils', () => ({
  writeGlbBytesToOPFS: (...args) => mockWriteGlbBytesToOPFS(...args),
}))

const mockExporterParse = jest.fn()
jest.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
  GLTFExporter: jest.fn().mockImplementation(() => ({
    parse: (...args) => mockExporterParse(...args),
  })),
}))

// The real glbCompress lazy-imports @gltf-transform; in unit tests we
// short-circuit it to a passthrough so the writer's behavior is testable
// without standing up the wasm encoder pipeline. The schemaVersionFor
// mock reads through to the live `BLDRS_GLB_SCHEMA_VERSION` constant
// (via `jest.requireActual`) so bumping the schema in `glbCacheKey.js`
// doesn't break this mock.
const mockActiveMode = jest.fn(() => null)
const mockCompressGlb = jest.fn((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
jest.mock('./glbCompress', () => ({
  activeGlbCompressionMode: () => mockActiveMode(),
  // Batched-native layout off in these tests — they pin the MERGED
  // writer path (bake + face_ids + compression slots).
  isGlbBatchedActive: () => false,
  schemaVersionFor: (mode) => {
    const {BLDRS_GLB_SCHEMA_VERSION: ver} = jest.requireActual('./glbCacheKey')
    return mode ? `${ver}-${mode}` : ver
  },
  compressGlb: (...args) => mockCompressGlb(...args),
}))

// The worker dispatch fails synchronously in jsdom (no Worker
// constructor), so `exportAndCacheGlb` takes the inline-fallback path
// — calling `injectGlbExtensions` directly. We spy on that to assert
// the writer passed the right `sceneExtras` shape into the consolidated
// inject pass. Real `injectGlbExtensions` is also exported in
// `requireActual` so callers can decide whether to delegate or stub.
const mockInjectGlbExtensions = jest.fn()
jest.mock('./injectGlbExtensions', () => {
  const actual = jest.requireActual('./injectGlbExtensions')
  return {
    ...actual,
    injectGlbExtensions: (...args) => mockInjectGlbExtensions(...args),
  }
})

import {BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {BLDRS_TITLE_EXTRAS_KEY, exportAndCacheGlb, exportThreeModelAsGlb} from './glbExport'
import {
  APPLIED_COORDINATION_KEY,
  COORDINATION_OFFSET_KEY,
} from '../viewer/ifc/appliedCoordination'
import {parseGlb, serializeGlb} from './injectGlbExtensions'
import {gitHubCacheKey} from './sourceCacheKey'
import {flatMeshToBatchedModel} from '../viewer/ifc/flatMeshToBatchedModel'


/**
 * Build a decorated single-batch `THREE.BatchedMesh` (two placements of one
 * unit triangle) the way `buildBatchedConwayModel` does — enough for the
 * writer's batched→merged bake path. Uses the real `flatMeshToBatchedModel`
 * over a tiny mock Conway IfcAPI.
 *
 * @return {object} decorated BatchedMesh
 */
function buildDecoratedBatchedMesh() {
  const verts = new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
  const idxData = new Uint32Array([0, 1, 2])
  const GEOM_ID = 999
  const api = {
    GetGeometry: (_m, id) => (id === GEOM_ID ? {
      GetVertexData: () => 0,
      GetIndexData: () => 0,
      GetVertexDataSize: () => verts.length,
      GetIndexDataSize: () => idxData.length,
    } : null),
    GetVertexArray: () => verts,
    GetIndexArray: () => idxData,
  }
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]
  const grey = {x: 0.8, y: 0.8, z: 0.8, w: 1}
  const {batches} = flatMeshToBatchedModel([
    {expressID: 100, geometries: [{geometryExpressID: GEOM_ID, flatTransformation: ident, color: grey}]},
    {expressID: 200, geometries: [{geometryExpressID: GEOM_ID, flatTransformation: shift, color: grey}]},
  ], api, 0)
  const batch = batches[0]
  batch.mesh.instanceParents = batch.instanceParents
  batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
  batch.mesh.instanceColors = batch.instanceColors
  return batch.mesh
}


// Two placed instances used by the batched-occurrence writer test: parent
// express ids + their occurrence paths. Named so the round-trip assertions
// below read against meaningful identities rather than bare literals.
/* eslint-disable no-magic-numbers */
const OCC_EXPRESS_A = 100
const OCC_EXPRESS_B = 200
const OCC_PATH_A = [10, 20]
const OCC_PATH_B = [10, 30]
/* eslint-enable no-magic-numbers */


/**
 * Like `buildDecoratedBatchedMesh` but wires the STEP per-occurrence side
 * tables (`instanceOccurrencePaths` / `instanceGeometryIds`) the way
 * `buildBatchedConwayModel` does, so the writer's batched-path occurrence
 * capture has something to re-key. Two placements of one shape, occurrence
 * paths [10,20] and [10,30].
 *
 * @return {object} decorated BatchedMesh with occurrence tables
 */
function buildDecoratedBatchedMeshWithOccurrences() {
  const verts = new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
  const idxData = new Uint32Array([0, 1, 2])
  const GEOM_ID = 999
  const api = {
    GetGeometry: (_m, id) => (id === GEOM_ID ? {
      GetVertexData: () => 0,
      GetIndexData: () => 0,
      GetVertexDataSize: () => verts.length,
      GetIndexDataSize: () => idxData.length,
    } : null),
    GetVertexArray: () => verts,
    GetIndexArray: () => idxData,
  }
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]
  const grey = {x: 0.8, y: 0.8, z: 0.8, w: 1}
  const {batches} = flatMeshToBatchedModel([
    {expressID: OCC_EXPRESS_A, geometries: [
      {geometryExpressID: GEOM_ID, flatTransformation: ident, color: grey, occurrencePath: OCC_PATH_A}]},
    {expressID: OCC_EXPRESS_B, geometries: [
      {geometryExpressID: GEOM_ID, flatTransformation: shift, color: grey, occurrencePath: OCC_PATH_B}]},
  ], api, 0)
  const batch = batches[0]
  batch.mesh.instanceParents = batch.instanceParents
  batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
  batch.mesh.instanceColors = batch.instanceColors
  batch.mesh.instanceGeometryIds = batch.instanceGeometryIds ?? null
  batch.mesh.instanceOccurrencePaths = batch.instanceOccurrencePaths ?? null
  return batch.mesh
}


/**
 * Minimal GLB carrying one primitive with `_EXPRESSID` (and optionally
 * `_INSTANCEID`) per vertex, enough for `capturePerTriangleIds` to return a
 * non-null face_ids capture — the gate the writer's occurrence-path attach
 * sits behind.
 *
 * @param {object} args
 * @param {Uint32Array} args.expressIdsPerVertex
 * @param {Uint32Array} [args.instanceIdsPerVertex]
 * @return {Uint8Array}
 */
function makeGlbWithExpressIds({expressIdsPerVertex, instanceIdsPerVertex}) {
  const vertexCount = expressIdsPerVertex.length
  const indices = new Uint32Array(Array.from({length: vertexCount}, (_, i) => i))
  const asBytes = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  const indexBytes = asBytes(indices)
  const positionBytes = new Uint8Array(vertexCount * 3 * 4)
  const expressBytes = asBytes(expressIdsPerVertex)
  const instanceBytes = instanceIdsPerVertex ? asBytes(instanceIdsPerVertex) : null
  const bufferViews = []
  let cursor = 0
  const push = (bytes) => {
    bufferViews.push({buffer: 0, byteOffset: cursor, byteLength: bytes.byteLength})
    cursor += bytes.byteLength
    return bufferViews.length - 1
  }
  const idxBv = push(indexBytes)
  const posBv = push(positionBytes)
  const exprBv = push(expressBytes)
  const instBv = instanceBytes ? push(instanceBytes) : -1
  const accessors = [
    {bufferView: idxBv, componentType: 5125, type: 'SCALAR', count: indices.length},
    {bufferView: posBv, componentType: 5126, type: 'VEC3', count: vertexCount},
    {bufferView: exprBv, componentType: 5125, type: 'SCALAR', count: vertexCount},
  ]
  const attributes = {POSITION: 1, _EXPRESSID: 2}
  if (instBv >= 0) {
    accessors.push({bufferView: instBv, componentType: 5125, type: 'SCALAR', count: vertexCount})
    attributes._INSTANCEID = 3
  }
  const json = {
    asset: {version: '2.0'},
    scene: 0,
    scenes: [{nodes: []}],
    buffers: [{byteLength: cursor}],
    bufferViews,
    accessors,
    meshes: [{primitives: [{indices: 0, attributes}]}],
  }
  const bin = new Uint8Array(cursor)
  bin.set(indexBytes, bufferViews[idxBv].byteOffset)
  bin.set(positionBytes, bufferViews[posBv].byteOffset)
  bin.set(expressBytes, bufferViews[exprBv].byteOffset)
  if (instanceBytes) {
    bin.set(instanceBytes, bufferViews[instBv].byteOffset)
  }
  return serializeGlb(json, bin)
}


/**
 * Build a minimal-but-spec-valid GLB the inject step can parseGlb.
 * Has the required `asset.version`, a single empty scene, and an empty
 * buffer — enough for the writer's `parseGlb` → mutate → `serializeGlb`
 * round-trip without standing up the real GLTFExporter pipeline.
 *
 * @return {Uint8Array}
 */
function makeValidEmptyGlb() {
  const json = {
    asset: {version: '2.0'},
    scene: 0,
    scenes: [{nodes: []}],
    buffers: [{byteLength: 0}],
  }
  return serializeGlb(json, null)
}


describe('loader/glbExport', () => {
  beforeEach(() => {
    mockWriteGlbBytesToOPFS.mockReset().mockResolvedValue(true)
    mockExporterParse.mockReset()
    mockActiveMode.mockReset().mockReturnValue(null)
    mockCompressGlb.mockReset().mockImplementation((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
    // Default the inject spy to a passthrough; per-test cases override
    // to capture arguments. The real shape would be `{bytes, stats}`;
    // we return the input bytes so downstream `packGlbChunks` succeeds.
    mockInjectGlbExtensions.mockReset().mockImplementation((bytes) => ({
      bytes,
      stats: {addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0, addedSceneName: 0, skippedNames: []},
    }))
  })

  describe('exportThreeModelAsGlb', () => {
    it('returns a Uint8Array when GLTFExporter resolves with an ArrayBuffer', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2]).buffer) // eslint-disable-line no-magic-numbers
      })
      const out = await exportThreeModelAsGlb({fake: 'model'})
      expect(out).toBeInstanceOf(Uint8Array)
      expect(Array.from(out.subarray(0, 4))).toEqual([0x67, 0x6c, 0x54, 0x46]) // eslint-disable-line no-magic-numbers
    })

    it('resolves to null when GLTFExporter returns non-binary', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone({asset: {version: '2.0'}})
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })

    it('resolves to null when GLTFExporter calls onError', async () => {
      mockExporterParse.mockImplementation((_input, _onDone, onError) => {
        onError(new Error('boom'))
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })

    it('resolves to null when GLTFExporter throws synchronously', async () => {
      mockExporterParse.mockImplementation(() => {
        throw new Error('sync boom')
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })
  })

  describe('exportAndCacheGlb (T-1: writer/reader cache-key parity)', () => {
    const cacheKeyArgs = gitHubCacheKey({
      owner: 'bldrs-ai',
      repo: 'share',
      branch: 'main',
      filePath: 'sub/dir/index.ifc',
      shaHash: 'abc123',
    })
    const ctx = {kindLabel: 'github', cacheKeyArgs}
    // eslint-disable-next-line no-magic-numbers
    const fakeGlbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3])

    it('writes the container to OPFS at exactly the cache key the reader looks up', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))

      const ok = await exportAndCacheGlb({model: {fake: 'model'}, ...ctx})
      expect(ok).toBe(true)

      expect(mockWriteGlbBytesToOPFS).toHaveBeenCalledTimes(1)
      const [bytes, originalFilePath, commitHash, owner, repo, branch] =
        mockWriteGlbBytesToOPFS.mock.calls[0]
      expect(bytes).toBeInstanceOf(Uint8Array)
      // Bldrs container header: "BLDR" magic.
      const BLDR_MAGIC = [0x42, 0x4c, 0x44, 0x52] // eslint-disable-line no-magic-numbers
      expect(Array.from(bytes.subarray(0, 4))).toEqual(BLDR_MAGIC)
      // Reader derives the same path from glbCacheKey({sourcePath: filePath, schemaVer: default}).
      expect(originalFilePath).toBe(`sub/dir/index.${BLDRS_GLB_SCHEMA_VERSION}.glb`)
      expect(commitHash).toBe('abc123')
      expect(owner).toBe('bldrs-ai')
      expect(repo).toBe('share')
      expect(branch).toBe('main')
    })

    it('skips an undecorated BatchedMesh (no source tables → nothing to bake)', async () => {
      const ok = await exportAndCacheGlb({model: {isBatchedMesh: true}, ...ctx})
      expect(ok).toBe(false)
      expect(mockExporterParse).not.toHaveBeenCalled()
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('skips a traversed scene with no vertices so an empty artifact cannot poison the cache', async () => {
      const model = {
        traverse: (fn) => {
          fn({isMesh: true, geometry: {attributes: {position: {count: 0}}}})
        },
      }
      const ok = await exportAndCacheGlb({model, ...ctx})
      expect(ok).toBe(false)
      expect(mockExporterParse).not.toHaveBeenCalled()
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('skips a Group whose only BatchedMesh child has no convertible instances', async () => {
      const model = {
        traverse: (fn) => {
          fn({isBatchedMesh: false})
          fn({isBatchedMesh: true})
        },
      }
      const ok = await exportAndCacheGlb({model, ...ctx})
      expect(ok).toBe(false)
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('bakes a decorated batched model to a merged mesh and exports it', async () => {
      // A real decorated BatchedMesh (two placements of one shape). The writer
      // must bake it to a plain merged Mesh — carrying per-vertex expressID —
      // and hand THAT to GLTFExporter, not the un-serialisable batch.
      const batchedMesh = buildDecoratedBatchedMesh()
      let exported = null
      mockExporterParse.mockImplementation((input, onDone) => {
        exported = input
        onDone(makeValidEmptyGlb().buffer)
      })

      const ok = await exportAndCacheGlb({model: batchedMesh, ...ctx})
      expect(ok).toBe(true)
      // Serialised the baked merged mesh, not the BatchedMesh.
      expect(exported).not.toBe(batchedMesh)
      expect(exported.isBatchedMesh).toBeFalsy()
      expect(exported.geometry.getAttribute('expressID')).toBeDefined()
      expect(exported.geometry.getAttribute('instanceID')).toBeDefined()
      expect(mockWriteGlbBytesToOPFS).toHaveBeenCalledTimes(1)
    })

    it('persists STEP occurrence paths for a batched model (cache-hit scene highlight)', async () => {
      // Regression: a batched-first load (demandGeometry default) wrote a GLB
      // with NO occurrence data — the writer read `model.instanceMap`, which a
      // BatchedMesh lacks — so a cache-hit reload kept the NavTree highlight
      // (spatial tree persists paths) but lost the scene per-occurrence
      // highlight (mesh occurrence table gone). The writer must re-key the
      // batch side tables into `BLDRS_face_ids.occurrencePaths`.
      const batchedMesh = buildDecoratedBatchedMeshWithOccurrences()
      // Merged export bakes instanceID = occurrence id (0, 1 here); return a
      // GLB carrying those per-vertex ids so capturePerTriangleIds yields a
      // non-null face_ids capture (the gate the occurrence attach sits behind).
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone(makeGlbWithExpressIds({
          expressIdsPerVertex: new Uint32Array([OCC_EXPRESS_A, OCC_EXPRESS_B]),
          instanceIdsPerVertex: new Uint32Array([0, 1]),
        }).buffer)
      })
      let injectedExtensions = null
      mockInjectGlbExtensions.mockImplementation((bytes, extensions) => {
        injectedExtensions = extensions
        return {bytes, stats: {
          addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0,
          addedSceneName: 0, skippedNames: [],
        }}
      })

      const ok = await exportAndCacheGlb({model: batchedMesh, ...ctx})
      expect(ok).toBe(true)

      const faceIdsExt = injectedExtensions.find((e) => e.data && e.data.perPrimitive)
      expect(faceIdsExt).toBeDefined()
      // occurrencePaths indexed by occurrence id; the two placements carry
      // [10,20] and [10,30]. Without the fix this key is absent entirely.
      expect(Array.isArray(faceIdsExt.data.occurrencePaths)).toBe(true)
      expect(faceIdsExt.data.occurrencePaths).toContainEqual(OCC_PATH_A)
      expect(faceIdsExt.data.occurrencePaths).toContainEqual(OCC_PATH_B)
      // Geometry ids ride along for STEP (occurrence paths present).
      expect(Array.isArray(faceIdsExt.data.geometryExpressIds)).toBe(true)
    })

    it('skips geometry ids + identity sweep for an occurrence-less (IFC) batched model', async () => {
      // The geometry-id table's only consumers are occurrence-path-gated
      // (STEP per-solid selection, "Face #" rows), and the identity sweep
      // costs one async property lookup per distinct geometry id while
      // resolving nothing for IFC — so an occurrence-less model must persist
      // NEITHER, keeping IFC cache writes at their pre-occurrence cost.
      const batchedMesh = buildDecoratedBatchedMesh() // no occurrencePath on any placement
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone(makeGlbWithExpressIds({
          expressIdsPerVertex: new Uint32Array([OCC_EXPRESS_A, OCC_EXPRESS_A]),
          instanceIdsPerVertex: new Uint32Array([0, 1]),
        }).buffer)
      })
      let injectedExtensions = null
      mockInjectGlbExtensions.mockImplementation((bytes, extensions) => {
        injectedExtensions = extensions
        return {bytes, stats: {
          addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0,
          addedSceneName: 0, skippedNames: [],
        }}
      })

      const ok = await exportAndCacheGlb({model: batchedMesh, ...ctx})
      expect(ok).toBe(true)

      const faceIdsExt = injectedExtensions.find((e) => e.data && e.data.perPrimitive)
      expect(faceIdsExt).toBeDefined()
      expect(faceIdsExt.data.occurrencePaths).toBeUndefined()
      expect(faceIdsExt.data.geometryExpressIds).toBeUndefined()
      expect(faceIdsExt.data.geometryItemIdentities).toBeUndefined()
    })

    it('captures against the engine modelID, not the scene id on the model (#1776)', async () => {
      // `CadView.jsx` pins `model.modelID = 0` (the scene-level id every
      // ShareViewer call site passes) the moment `load()` resolves, and this
      // writer runs later, from an idle callback. So the property no longer
      // holds Conway's engine handle by the time we read it — the Loader
      // latches that handle at parse time and hands it in. Reading
      // `model.modelID` instead aimed every capture at a model Conway never
      // opened, and the artifact cached with no NavTree and no Properties.
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      const ifcManager = {
        getSpatialStructure: jest.fn(() => Promise.resolve({
          expressID: 5, type: 'product', children: [],
        })),
        getItemProperties: jest.fn(() => Promise.resolve({expressID: 5, type: 'product'})),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }

      const ok = await exportAndCacheGlb({
        model: {fake: 'model', modelID: 0},
        ...ctx,
        ifcManager,
        modelID: 3,
      })

      expect(ok).toBe(true)
      expect(ifcManager.getSpatialStructure).toHaveBeenCalledWith(3, true)
    })

    it('falls back to model.modelID when no engine modelID is passed', async () => {
      // Call sites that predate the explicit argument keep working.
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      const ifcManager = {
        getSpatialStructure: jest.fn(() => Promise.resolve({
          expressID: 5, type: 'product', children: [],
        })),
        getItemProperties: jest.fn(() => Promise.resolve({expressID: 5, type: 'product'})),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }

      await exportAndCacheGlb({model: {fake: 'model', modelID: 2}, ...ctx, ifcManager})

      expect(ifcManager.getSpatialStructure).toHaveBeenCalledWith(2, true)
    })

    it('returns false (no throw) when the exporter produces no bytes', async () => {
      mockExporterParse.mockImplementation((_input, _onDone, onError) => onError(new Error('nope')))
      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(false)
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('returns false (no throw) when OPFS write fails', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      mockWriteGlbBytesToOPFS.mockRejectedValueOnce(new Error('disk quota'))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(false)
    })

    it('passes the exported bytes through compressGlb with the active mode', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      mockActiveMode.mockReturnValue('draco')

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)
      expect(mockCompressGlb).toHaveBeenCalledTimes(1)
      const [bytes, mode] = mockCompressGlb.mock.calls[0]
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(mode).toBe('draco')
    })

    it('still calls compressGlb (with null mode) when no flag is on', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)
      expect(mockCompressGlb).toHaveBeenCalledWith(
        expect.any(Uint8Array), null, expect.objectContaining({preserveTriangleOrder: expect.any(Boolean)}))
    })
  })


  describe('exportAndCacheGlb — model title stamping (page-title cache-hit fix)', () => {
    const cacheKeyArgs = gitHubCacheKey({
      owner: 'bldrs-ai',
      repo: 'share',
      branch: 'main',
      filePath: 'sub/dir/index.ifc',
      shaHash: 'abc123',
    })
    const ctx = {kindLabel: 'github', cacheKeyArgs}

    it('passes the title to injectGlbExtensions via sceneExtras (no separate parse/serialize pass)', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 'Momentum'}, ...ctx})
      expect(ok).toBe(true)

      // The writer should consolidate the title injection into the
      // existing BLDRS_* inject pass — one parse/serialize, not two.
      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, extensionsArg, sceneExtrasArg, sceneNameArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(Array.isArray(extensionsArg)).toBe(true)
      expect(sceneExtrasArg).toEqual({[BLDRS_TITLE_EXTRAS_KEY]: 'Momentum'})
      // Same pass also stamps the standard glTF scenes[0].name (#1595).
      expect(sceneNameArg).toBe('Momentum')
    })

    it('passes sceneExtras: null when model.name is absent (drag-dropped GLB / OBJ etc.)', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)

      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, , sceneExtrasArg, sceneNameArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
      expect(sceneNameArg).toBeNull()
    })

    it('passes sceneExtras: null when model.name is the empty string', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: ''}, ...ctx})
      expect(ok).toBe(true)

      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
    })

    it('passes sceneExtras: null when model.name is non-string', async () => {
      // Defensive: `Object3D.name` defaults to '' but a hostile caller
      // could pass anything. The writer should coerce non-string to
      // null rather than serialize garbage into scenes[0].extras.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 42}, ...ctx})
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
    })

    it('end-to-end: title round-trips through injectGlbExtensions into scenes[0].extras', async () => {
      // Integration test: run with the REAL injectGlbExtensions (no
      // mock) so we verify the consolidated pass actually writes the
      // title to scenes[0].extras. The mock spy default would swallow
      // sceneExtras silently, hiding writer bugs.
      const actual = jest.requireActual('./injectGlbExtensions')
      mockInjectGlbExtensions.mockImplementation(actual.injectGlbExtensions)

      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 'Momentum'}, ...ctx})
      expect(ok).toBe(true)

      // The injected bytes (returned from `injectGlbExtensions` to the
      // writer) carry the title. Grab them from the mock's return value.
      const injectResult = mockInjectGlbExtensions.mock.results[0].value
      const {json} = parseGlb(injectResult.bytes)
      expect(json.scenes[0].extras[BLDRS_TITLE_EXTRAS_KEY]).toBe('Momentum')
      expect(injectResult.stats.addedSceneExtras).toBe(1)
      // Standard glTF alignment (#1595): the same pass stamps the
      // title into scenes[0].name — the field generic viewers show.
      expect(json.scenes[0].name).toBe('Momentum')
      expect(injectResult.stats.addedSceneName).toBe(1)
    })
  })

  describe('exportAndCacheGlb — applied coordination frame (Share#1633 item 1)', () => {
    // The MERGED writer path (this file mocks `isGlbBatchedActive` false).
    // The batched-native writer's half of the same round-trip is in
    // `glbBatchedRoundTrip.test.js`, against a real GLTFLoader.
    //
    // Why the frame must ride in scene extras at all: both writers DROP
    // `model.userData` — the merged bake (`batchedModelToMergedMesh`) copies
    // only matrix + name, so `GLTFExporter` serialises an empty userData —
    // which is exactly how a stamped model could reach the cache unstamped
    // and come back out that way on every subsequent load.
    const cacheKeyArgs = gitHubCacheKey({
      owner: 'bldrs-ai',
      repo: 'share',
      branch: 'main',
      filePath: 'sub/dir/index.ifc',
      shaHash: 'abc123',
    })
    const ctx = {kindLabel: 'github', cacheKeyArgs}
    // scale(mm) * NormalizeMat(Z-up -> Y-up) * translate(-anchor), the shape
    // conway derives — distinctive enough that a dropped or reordered stamp
    // cannot pass the assertions below.
    /* eslint-disable no-magic-numbers */
    const FRAME = [
      0.001, 0, 0, 0,
      0, 0, -0.001, 0,
      0, 0.001, 0, 0,
      -2600, 450, 1200, 1,
    ]
    /* eslint-enable no-magic-numbers */

    /**
     * @param {object} userData
     * @return {object} a model stub shaped for the writer's tail
     */
    function modelWith(userData) {
      return {name: 'Momentum', userData}
    }

    it('passes the stamped frame to injectGlbExtensions via sceneExtras', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({[APPLIED_COORDINATION_KEY]: FRAME}), ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      // Alongside the title, in the SAME inject pass — one parse/serialize.
      expect(sceneExtrasArg).toEqual({
        [BLDRS_TITLE_EXTRAS_KEY]: 'Momentum',
        [APPLIED_COORDINATION_KEY]: FRAME,
      })
    })

    it('omits the key when the model carries no frame', async () => {
      // Pre-conway#702 engines, and every non-IFC source. The title must
      // still go out on its own, so the two keys are independent.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: modelWith({}), ...ctx})
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toEqual({[BLDRS_TITLE_EXTRAS_KEY]: 'Momentum'})
    })

    it('stamps the frame even when the model has no title', async () => {
      // The two keys are gathered independently, so a titleless model (a
      // drag-dropped IFC with no project name) must still get its frame —
      // the shape a single `titleForExtras ? … : null` ternary would drop.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: {userData: {[APPLIED_COORDINATION_KEY]: FRAME}}, ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg, sceneNameArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toEqual({[APPLIED_COORDINATION_KEY]: FRAME})
      expect(sceneNameArg).toBeNull()
    })

    it('refuses to cache a malformed frame', async () => {
      // Validated at the write, not just at the read: an artifact persists
      // across sessions, so a frame that would read back as NaN must never
      // reach one. 16 elements, so length alone would have let it through.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))
      const bad = [...FRAME]
      bad[5] = null

      const ok = await exportAndCacheGlb({
        model: modelWith({[APPLIED_COORDINATION_KEY]: bad}), ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toEqual({[BLDRS_TITLE_EXTRAS_KEY]: 'Momentum'})
    })

    it('end-to-end: the frame round-trips into scenes[0].extras', async () => {
      // REAL injectGlbExtensions, as in the title's end-to-end above: the
      // spy default would swallow sceneExtras and hide a writer bug.
      const actual = jest.requireActual('./injectGlbExtensions')
      mockInjectGlbExtensions.mockImplementation(actual.injectGlbExtensions)

      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({[APPLIED_COORDINATION_KEY]: FRAME}), ...ctx,
      })
      expect(ok).toBe(true)

      const injectResult = mockInjectGlbExtensions.mock.results[0].value
      const {json} = parseGlb(injectResult.bytes)
      expect(json.scenes[0].extras[APPLIED_COORDINATION_KEY]).toEqual(FRAME)
      expect(injectResult.stats.addedSceneExtras).toBe(2)
    })

    // Share's backstop offset is the OTHER half of the documented mapping
    // (`rendered = (A * world) - coordinationOffset`). On the degraded path
    // where the backstop fired, the offset is baked into the geometry being
    // exported — so persisting only the frame yields a cache hit whose
    // documented inverse reconstructs coordinates displaced by exactly it.
    // Half a composition is wrong rather than absent, and silently so.
    /* eslint-disable no-magic-numbers */
    const OFFSET = [2600000, 450, -1200000]
    /* eslint-enable no-magic-numbers */

    it('carries the backstop offset alongside the frame', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({
          [APPLIED_COORDINATION_KEY]: FRAME,
          [COORDINATION_OFFSET_KEY]: OFFSET,
        }),
        ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toEqual({
        [BLDRS_TITLE_EXTRAS_KEY]: 'Momentum',
        [APPLIED_COORDINATION_KEY]: FRAME,
        [COORDINATION_OFFSET_KEY]: OFFSET,
      })
    })

    it('omits the offset key on a healthy load (backstop never fired)', async () => {
      // The normal case since the conway#680 fix chain: absence must stay
      // absence, so consumers read it as `[0, 0, 0]` rather than finding a
      // zeroed key they cannot distinguish from a real one.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({[APPLIED_COORDINATION_KEY]: FRAME}), ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(COORDINATION_OFFSET_KEY in sceneExtrasArg).toBe(false)
    })

    it('refuses to cache a malformed offset', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({
          [APPLIED_COORDINATION_KEY]: FRAME,
          [COORDINATION_OFFSET_KEY]: [1, NaN, 3],
        }),
        ...ctx,
      })
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(COORDINATION_OFFSET_KEY in sceneExtrasArg).toBe(false)
      // The frame still goes out — one bad key must not cost the other.
      expect(sceneExtrasArg[APPLIED_COORDINATION_KEY]).toEqual(FRAME)
    })

    it('end-to-end: both halves round-trip into scenes[0].extras', async () => {
      const actual = jest.requireActual('./injectGlbExtensions')
      mockInjectGlbExtensions.mockImplementation(actual.injectGlbExtensions)

      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({
        model: modelWith({
          [APPLIED_COORDINATION_KEY]: FRAME,
          [COORDINATION_OFFSET_KEY]: OFFSET,
        }),
        ...ctx,
      })
      expect(ok).toBe(true)

      const injectResult = mockInjectGlbExtensions.mock.results[0].value
      const {json} = parseGlb(injectResult.bytes)
      expect(json.scenes[0].extras[APPLIED_COORDINATION_KEY]).toEqual(FRAME)
      expect(json.scenes[0].extras[COORDINATION_OFFSET_KEY]).toEqual(OFFSET)
      expect(injectResult.stats.addedSceneExtras).toBe(3)
    })
  })
})

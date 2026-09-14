/* eslint-disable no-magic-numbers, require-await */
// #1844: a Bldrs GLB the user opens is the same artifact the OPFS cache
// serves, and must load the same way.
//
// The Export tab (share-140) hands the user chunk 0 of the cached container —
// a standalone `.glb` carrying `BLDRS_instance_tables` (batched layout) or
// per-vertex `_EXPRESSID`/`_INSTANCEID` (merged layout). Opening it back
// through the Open dialog rendered the model and even showed the NavTree (the
// `BLDRS_*` reader plugins park their payloads on `userData` unconditionally),
// but hover, click and NavTree→scene selection all did nothing: the batched
// hydration and the picking restore were gated on `cameFromGlbCache` — on
// where the BYTES came from rather than on what the FILE is.
//
// These tests drive real artifact bytes through the real `load()` on the
// user-opened path (`cameFromGlbCache` false throughout — nothing here
// populates the GLB cache, and the fixture path is a `.glb`, so the cache
// lookup never even runs). What they assert is the state that makes a model
// pickable: the decorated BatchedMesh with its instance tables, or the merged
// model's per-mesh `IfcInstanceMap` and its BVH.
import {BufferGeometry} from 'three'
import {computeBoundsTree} from 'three-mesh-bvh'
import {getGlbLogs} from '../../tools/jest/glbLogCapture'
import {downloadToOPFS} from '../OPFS/utils'
import {batchedArtifactBytes, liveBatchedModel, mergedGlbBytes} from './glbArtifact.fixture'
import {isBldrsGlbArtifact, load} from './Loader'


// Steer the `isOpfsAvailable` path without a real worker or cache: the
// fixture path is locally hosted, so `load()` asks `downloadToOPFS` for the
// file and nothing else in the OPFS surface is touched.
jest.mock('../OPFS/utils', () => ({
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
  deleteFileFromOPFS: jest.fn(),
  readModelByPathFromOPFS: jest.fn(),
}))


// A locally-hosted `.glb`, the shape the Open dialog's file chooser produces
// once the upload has landed (`/share/v/new/<uuid>.glb`). Extension-bearing
// on purpose: the loader picks GLTFLoader off it without a header sniff.
const ARTIFACT_PATH = '/index.glb'


/** A File-alike over fixed bytes, enough for the OPFS handoff in `load()`. */
class MockFile {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes
  }

  /** @return {number} */
  get size() {
    return this.bytes.byteLength
  }

  /**
   * @param {number} start
   * @param {number} [end]
   * @return {MockFile}
   */
  slice(start, end = this.size) {
    return new MockFile(this.bytes.subarray(start, end))
  }

  /** @return {Promise<ArrayBuffer>} */
  async arrayBuffer() {
    // A standalone ArrayBuffer in the realm's own constructor: three's
    // GLTFLoader.parse does a cross-realm `instanceof ArrayBuffer` check that
    // a Node Buffer's backing store fails under jsdom.
    const ab = new ArrayBuffer(this.bytes.byteLength)
    new Uint8Array(ab).set(this.bytes)
    return ab
  }
}


/**
 * The non-IFC path through `load()` needs only these four things off the
 * viewer; `context.getScene` is what the hydration passes as the subset
 * fallback parent.
 *
 * @return {object}
 */
function makeViewerStub() {
  return {
    IFC: {
      type: 'glb',
      addIfcModel: jest.fn(),
      loader: {ifcManager: {state: {models: []}}},
    },
    ifcLoader: {type: null},
    context: {getScene: () => null},
  }
}


/**
 * Open `bytes` the way a user opens a downloaded export.
 *
 * @param {Uint8Array} bytes the `.glb` file's contents
 * @return {Promise<object>} the loaded model
 */
async function openGlb(bytes) {
  downloadToOPFS.mockResolvedValue(new MockFile(bytes))
  return await load(ARTIFACT_PATH, makeViewerStub(), jest.fn(), true, jest.fn(), '')
}


describe('Loader#load — a user-opened Bldrs GLB artifact (#1844)', () => {
  const originalComputeBoundsTree = BufferGeometry.prototype.computeBoundsTree

  beforeAll(() => {
    // The viewer installs this prototype patch at init (wit-three's
    // `initializeMeshBVH`); mirror it or the BVH block silently no-ops and
    // the merged-layout assertion below would pass for the wrong reason.
    BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
  })

  afterAll(() => {
    BufferGeometry.prototype.computeBoundsTree = originalComputeBoundsTree
  })

  it('hydrates the batched-native layout to a pickable BatchedMesh', async () => {
    const model = await openGlb(await batchedArtifactBytes(liveBatchedModel()))

    // Non-vacuity: the payload really did arrive, so a failure below is the
    // GATE and not a reader-plugin regression. This much worked before the
    // fix — it is why the NavTree appeared while nothing was selectable.
    expect(model.userData.bldrsInstanceTables).toBeTruthy()

    // …and the hydration ran on it. Before the fix `load()` kept the raw
    // GLTFLoader scene: a Group of InstancedMeshes that renders correctly and
    // carries no instance tables, so every pick resolved to nothing.
    expect(model.isBatchedMesh).toBe(true)
    expect(Array.from(model.instanceParents).sort((a, b) => a - b)).toEqual([11, 12, 20])
    // The three things selection actually calls: the batch-aware subset
    // builder, and the capabilities that route `ShareViewer#setSelection` to
    // it rather than to wit-three's parser-backed `pickByIds`.
    expect(model.createSubset).toBeInstanceOf(Function)
    expect(model.capabilities.batchedPicking).toBe(true)
    expect(model.capabilities.expressIdPicking).toBe(true)
    expect(model.capabilities.ifcSubsets).toBe(false)
    expect(getGlbLogs().map((l) => l.text))
      .toContain('reader: hydrated batched-native artifact to a BatchedMesh model')
  })

  it('restores per-mesh instance maps and BVHs on the merged layout', async () => {
    const model = await openGlb(mergedGlbBytes())

    const meshes = []
    model.traverse((obj) => {
      if (obj.isMesh) {
        meshes.push(obj)
      }
    })
    expect(meshes).toHaveLength(1)
    const [mesh] = meshes

    // Per-vertex identity survived the round trip and was promoted back off
    // GLTFLoader's lowercased `_expressid` / `_instanceid`.
    expect(mesh.geometry.attributes.expressID.count).toBe(6)
    expect(model.capabilities.instancePicking).toBe(true)
    // The map a scene pick resolves through: triangle → instance → element.
    expect(mesh.instanceMap).toBeDefined()
    expect(mesh.instanceMap.getParentExpressIdByInstance(
      mesh.instanceMap.getInstanceIdByTriangle(0))).toBe(100)
    // …and the BVH that keeps hover off `Mesh.prototype.raycast`'s
    // O(triangles) brute force. This is the gate that used to read
    // `cameFromGlbCache`.
    expect(mesh.geometry.boundsTree).toBeDefined()
  })

  it('leaves a GLB with no Bldrs payload plain, and does not throw', async () => {
    // The third-party control. Same geometry, none of our identity: nothing
    // must be hydrated, no map attached, no BVH built — and no error raised
    // by any of the three now-artifact-keyed gates deciding they do not apply.
    const model = await openGlb(mergedGlbBytes({withElementIds: false}))

    expect(model).toBeDefined()
    expect(isBldrsGlbArtifact(model)).toBe(false)
    expect(model.isBatchedMesh).toBeFalsy()
    expect(model.capabilities.instancePicking).toBeFalsy()
    expect(model.capabilities.batchedPicking).toBeFalsy()
    const meshes = []
    model.traverse((obj) => {
      if (obj.isMesh) {
        meshes.push(obj)
      }
    })
    expect(meshes).toHaveLength(1)
    expect(meshes[0].instanceMap).toBeUndefined()
    expect(meshes[0].geometry.boundsTree).toBeUndefined()
  })

  it('degrades an artifact from a different Share build to plain, not to an error', async () => {
    // A `.glb` exported by a build whose `BLDRS_instance_tables` schema this
    // reader does not know. `parseInstanceTablesExtensionData` version-checks
    // and returns null, so the plugin never parks the payload — which the
    // artifact-keyed gate then reads as "not one of ours". The user gets the
    // geometry (three draws EXT_mesh_gpu_instancing natively) instead of a
    // failed load.
    const bytes = await batchedArtifactBytes(liveBatchedModel(), {
      mutatePayload: (payload) => ({...payload, version: payload.version + 1}),
    })

    const model = await openGlb(bytes)

    expect(model).toBeDefined()
    expect(model.userData.bldrsInstanceTables).toBeUndefined()
    expect(model.isBatchedMesh).toBeFalsy()
    // The reader said so out loud rather than failing silently — this line is
    // the only signal a triager gets for a version mismatch.
    expect(getGlbLogs().map((l) => l.text))
      .toContain('BLDRS_instance_tables: payload failed validation; skipping')
  })
})

/* eslint-disable no-magic-numbers */
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  Raycaster,
  Vector3,
} from 'three'
import {Logger, WebIO} from '@gltf-transform/core'
import {KHRDracoMeshCompression} from '@gltf-transform/extensions'
import * as pako from 'pako'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  markLossyTables,
  parseInstanceTablesExtensionData,
} from '../loader/bldrsInstanceTables'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME} from '../loader/bldrsSpatialTree'
import {batchedArtifactBytes} from '../loader/glbArtifact.fixture'
import {loadDracoDecoder} from '../loader/glbCompress'
import {injectGlbExtensions, parseGlb, serializeGlb} from '../loader/injectGlbExtensions'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'
import {COMPRESSION_DRACO, COMPRESSION_MESHOPT, compressExportGlb} from './glbCompression'
import {rewriteGlbPortable} from './glbPortable'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


/**
 * A collapsed artifact through a DRACO export and back (share-140 #1871, the
 * owner's smoke on DSA and Right_Hand: the Draco download looked right and
 * could not be selected).
 *
 * The real encoder AND decoder run here, reached through the same
 * `DracoEncoderModule` / `DracoDecoderModule` globals the page defines
 * (`glbCompression.test.js` does the same). What cannot run under jsdom is
 * three's DRACOLoader — it decodes on a Worker built from a blob URL — so the
 * scene GLTFLoader would build is assembled here from the gltf-transform
 * decode instead: one Mesh per node, the node's TRS, its `extras` promoted to
 * `userData`, the tables payload read off the file and marked lossy from the
 * file's own JSON (`markLossyTables`, which the tables plugin runs). The real
 * loader path is covered in the browser by `batchedGlbCache.spec.ts`.
 */


const TIMEOUT_MS = 120000
const DRACO_DIR = path.resolve(__dirname, '../../public/static/js/draco')
/** One-triangle elements in the strip: every one its own row. */
const ELEMENTS = 60
/** World offset the strip sits at, so baking and recentring are exercised. */
const OFFSET = 1000
const EDGE = 0.37


beforeAll(() => {
  const encoder = require(path.join(DRACO_DIR, 'draco_encoder.js'))
  const encoderWasm = new Uint8Array(readFileSync(path.join(DRACO_DIR, 'draco_encoder.wasm')))
  window.DracoEncoderModule = (options) => encoder({...options, wasmBinary: encoderWasm})
  const decoder = require(path.join(DRACO_DIR, 'draco_wasm_wrapper.js'))
  const decoderWasm = new Uint8Array(readFileSync(path.join(DRACO_DIR, 'draco_decoder.wasm')))
  window.DracoDecoderModule = (options) => decoder({...options, wasmBinary: decoderWasm})
})


/**
 * DSA's shape: a tiled strip of one-triangle elements, each its own row,
 * whose neighbours share edge POSITIONS through separate vertices — the case
 * where Draco merges vertices across rows (measured: 600 in, 202 out).
 *
 * @return {{model: BatchedMesh, centres: Array<Vector3>}} model + a point
 *   inside each element, in model space
 */
function stripModel() {
  const mesh = new BatchedMesh(ELEMENTS, ELEMENTS * 3, ELEMENTS * 3)
  const centres = []
  for (let i = 0; i < ELEMENTS; i++) {
    const x = Math.floor(i / 2) * EDGE
    const up = i % 2 === 1
    const corners = up ?
      [[x, EDGE, 0], [x + EDGE, EDGE, 0], [x + EDGE, 0, 0]] :
      [[x, 0, 0], [x + EDGE, 0, 0], [x, EDGE, 0]]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(corners.flat()), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
    geometry.setIndex(new BufferAttribute(new Uint32Array(up ? [0, 2, 1] : [0, 1, 2]), 1))
    mesh.setMatrixAt(
      mesh.addInstance(mesh.addGeometry(geometry)),
      new Matrix4().makeTranslation(OFFSET, OFFSET, 0))
    const centre = new Vector3()
    for (const c of corners) {
      centre.add(new Vector3(...c))
    }
    centres.push(centre.divideScalar(3).add(new Vector3(OFFSET, OFFSET, 0)))
  }
  mesh.instanceParents = Array.from({length: ELEMENTS}, (_, i) => 1000 + i)
  mesh.instanceOccurrenceIds = Array.from({length: ELEMENTS}, (_, i) => i)
  mesh.instanceOccurrencePaths = Array.from({length: ELEMENTS}, (_, i) => [7, i])
  mesh.instanceSourceColors = Array.from({length: ELEMENTS}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
  return {model: mesh, centres}
}


/**
 * The scene three's GLTFLoader would build from `bytes`, decoded with the
 * real Draco decoder: nodes nested as in the file, TRS applied, extras on
 * userData, the tables payload parsed and marked lossy from the file's JSON.
 *
 * @param {Uint8Array} bytes one GLB, possibly Draco-compressed
 * @return {Promise<Group>} scene
 */
async function loadLikeGltfLoader(bytes) {
  const io = new WebIO()
    .setLogger(new Logger(Logger.Verbosity.SILENT))
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({'draco3d.decoder': await loadDracoDecoder()})
  const doc = await io.readBinary(bytes)
  const build = (node) => {
    let object = new Group()
    const mesh = node.getMesh()
    if (mesh) {
      const primitive = mesh.listPrimitives()[0]
      const geometry = new BufferGeometry()
      geometry.setAttribute('position',
        new BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3))
      const normal = primitive.getAttribute('NORMAL')
      if (normal) {
        geometry.setAttribute('normal', new BufferAttribute(normal.getArray(), 3))
      }
      geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1))
      object = new Mesh(geometry)
    }
    object.position.fromArray(node.getTranslation())
    object.quaternion.fromArray(node.getRotation())
    object.scale.fromArray(node.getScale())
    object.userData = {...node.getExtras()}
    for (const child of node.listChildren()) {
      object.add(build(child))
    }
    return object
  }
  const scene = new Group()
  for (const node of doc.getRoot().getDefaultScene().listChildren()) {
    scene.add(build(node))
  }
  // The tables plugin's work, against the file's own JSON and payload.
  const {json, bin} = parseGlb(bytes)
  const view = json.bufferViews[json.extensions[BLDRS_INSTANCE_TABLES_EXTENSION_NAME].bufferView]
  const at = view.byteOffset ?? 0
  const tables = parseInstanceTablesExtensionData(
    JSON.parse(pako.ungzip(bin.subarray(at, at + view.byteLength), {to: 'string'})))
  markLossyTables(json, tables)
  scene.userData.bldrsInstanceTables = tables
  scene.updateMatrixWorld(true)
  return scene
}


/**
 * @param {object} model hydrated BatchedMesh
 * @param {Vector3} point model-space target
 * @return {?number} the picked element's parent expressID
 */
function pickParent(model, point) {
  model.updateMatrixWorld(true)
  const raycaster = new Raycaster(new Vector3(point.x, point.y, 5), new Vector3(0, 0, -1))
  const hits = []
  model.raycast(raycaster, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits.length === 0 ? null : model.instanceParents[hits[0].batchId]
}


/**
 * The decoded tables payload of a GLB.
 *
 * @param {Uint8Array} bytes
 * @return {object} raw payload JSON
 */
function rawTables(bytes) {
  const {json, bin} = parseGlb(bytes)
  const view = json.bufferViews[json.extensions[BLDRS_INSTANCE_TABLES_EXTENSION_NAME].bufferView]
  const at = view.byteOffset ?? 0
  return JSON.parse(pako.ungzip(bin.subarray(at, at + view.byteLength), {to: 'string'}))
}


/**
 * Replace a GLB's tables payload.
 *
 * @param {Uint8Array} bytes
 * @param {function(object): object} edit
 * @return {Uint8Array}
 */
function withTables(bytes, edit) {
  const edited = edit(rawTables(bytes))
  // `injectGlbExtensions` refuses to overwrite a payload already present, so
  // drop the entry first; its old bufferView is left orphaned, which no
  // reader here looks at.
  const {json, bin} = parseGlb(bytes)
  delete json.extensions[BLDRS_INSTANCE_TABLES_EXTENSION_NAME]
  return injectGlbExtensions(serializeGlb(json, bin), [{
    name: BLDRS_INSTANCE_TABLES_EXTENSION_NAME, data: edited, compress: true,
  }], null, null).bytes
}


describe('collapsed artifact through a Draco export', () => {
  let source
  let draco
  let centres

  beforeAll(async () => {
    const strip = stripModel()
    centres = strip.centres
    source = await batchedArtifactBytes(strip.model, {collapse: true})
    draco = await compressExportGlb(source, COMPRESSION_DRACO)
  }, TIMEOUT_MS)

  it('encodes Draco and carries a lossy witness for the collapsed table', () => {
    expect(draco.mode).toBe(COMPRESSION_DRACO)
    expect(parseGlb(draco.withMetadata).json.extensionsUsed).toContain('KHR_draco_mesh_compression')
    const collapsed = rawTables(draco.withMetadata).nodes.filter((node) => node.ranges)
    expect(collapsed.length).toBeGreaterThan(0)
    for (const node of collapsed) {
      expect(node.witness).toBeDefined()
    }
    // The lossless source is untouched: the witness is a Draco-export thing.
    expect(rawTables(source).nodes.every((node) => node.witness === undefined)).toBe(true)
  })

  it('re-opens pickable, every element on its own triangle', async () => {
    // The owner's bug, reproduced: before the fix this hydrated to null — the
    // plain, unpickable GLTF model.
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata))

    expect(model).not.toBeNull()
    expect(model.capabilities.batchedPicking).toBe(true)
    centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
  }, TIMEOUT_MS)

  it('refuses the Draco file when its identity rows are reordered', async () => {
    // The identity half of the witness: geometry untouched, two rows' parents
    // swapped — every centroid still matches, only the exact identity hash can
    // see it.
    const swapped = withTables(draco.withMetadata, (raw) => {
      const parents = parseInstanceTablesExtensionData(raw).flatMap((t) => t.parents)
      ;[parents[0], parents[1]] = [parents[1], parents[0]]
      return {...raw, parents: Buffer.from(new Uint32Array(parents).buffer).toString('base64')}
    })

    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(swapped))).toBeNull()
  }, TIMEOUT_MS)

  it('refuses the Draco file when a row\'s geometry has moved', async () => {
    // The centroid half: nudge one stored centroid far outside tolerance —
    // equivalent to that row's triangles being somewhere else.
    const moved = withTables(draco.withMetadata, (raw) => {
      const node = raw.nodes.find((n) => n.witness)
      const words = Buffer.from(node.witness.centroids, 'base64')
      const q = new Uint16Array(words.buffer, words.byteOffset, words.byteLength / 2)
      q[0] = q[0] > 30000 ? 0 : 65535
      node.witness.centroids = Buffer.from(words).toString('base64')
      return raw
    })

    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(moved))).toBeNull()
  }, TIMEOUT_MS)

  it('refuses a Draco file with no witness rather than trusting its ranges', async () => {
    const bare = withTables(draco.withMetadata, (raw) => {
      raw.nodes.forEach((node) => delete node.witness)
      return raw
    })

    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bare))).toBeNull()
  }, TIMEOUT_MS)

  it('keeps triangle order, so rows are still contiguous runs (sequential, not edgebreaker)', async () => {
    // What the whole rebuild stands on. Edgebreaker scrambles triangles across
    // rows; this is the assertion that fails if the export stops forcing
    // sequential for collapsed files.
    const scene = await loadLikeGltfLoader(draco.withMetadata)
    const merged = scene.children.find((obj) => obj.isMesh)
    const position = merged.geometry.getAttribute('position')
    const index = merged.geometry.getIndex()
    for (let t = 0; t < ELEMENTS; t++) {
      const c = new Vector3()
      for (let k = 0; k < 3; k++) {
        c.add(new Vector3().fromBufferAttribute(position, index.getX((t * 3) + k)))
      }
      c.divideScalar(3).add(merged.position)
      expect(c.distanceTo(centres[t])).toBeLessThan(0.01)
    }
  }, TIMEOUT_MS)
})


describe('portable collapsed artifact through a Draco export', () => {
  it('re-opens pickable', async () => {
    const strip = stripModel()
    const tree = {
      expressID: 1, type: 'PRODUCT', Name: {value: 'Strip'},
      children: strip.model.instanceParents.map((id, i) => ({
        expressID: id, type: 'PRODUCT', Name: {value: `E${i}`}, occurrencePath: [7, i], children: [],
      })),
    }
    const withTree = injectGlbExtensions(await batchedArtifactBytes(strip.model, {collapse: true}),
      [{name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true}], null, null).bytes
    const portable = rewriteGlbPortable(withTree)
    const draco = await compressExportGlb(portable.bytes, COMPRESSION_DRACO)

    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata))

    expect(model).not.toBeNull()
    strip.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
  }, TIMEOUT_MS)
})


describe('lossless exports are untouched by the lossy path', () => {
  it('writes no witness into a Meshopt export', async () => {
    const source = await batchedArtifactBytes(stripModel().model, {collapse: true})
    const meshopt = await compressExportGlb(source, COMPRESSION_MESHOPT)
    expect(rawTables(meshopt.withMetadata).nodes.every((node) => node.witness === undefined)).toBe(true)
  }, TIMEOUT_MS)

  it('does not witness a source whose exact canary fails', async () => {
    // The export only vouches for what it verified: tamper the source's BIN
    // (swap two rows' vertices) and the Draco file must carry no witness, so
    // the reader refuses it exactly as it would have refused the source.
    const source = await batchedArtifactBytes(stripModel().model, {collapse: true})
    const {json, bin} = parseGlb(source)
    const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
    const view = json.bufferViews[accessor.bufferView]
    const stride = view.byteStride ?? 12
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const tampered = bin.slice()
    for (let v = 0; v < 3; v++) {
      const a = tampered.slice(base + (v * stride), base + (v * stride) + 12)
      tampered.set(tampered.slice(base + ((v + 3) * stride), base + ((v + 3) * stride) + 12),
        base + (v * stride))
      tampered.set(a, base + ((v + 3) * stride))
    }
    const draco = await compressExportGlb(serializeGlb(json, tampered), COMPRESSION_DRACO)
    expect(rawTables(draco.withMetadata).nodes.every((node) => node.witness === undefined)).toBe(true)
  }, TIMEOUT_MS)
})

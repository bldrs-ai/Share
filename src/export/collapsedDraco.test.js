/* eslint-disable no-magic-numbers */
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three'
import {Logger, WebIO} from '@gltf-transform/core'
import {EXTMeshGPUInstancing, EXTMeshoptCompression, KHRDracoMeshCompression} from '@gltf-transform/extensions'
import * as pako from 'pako'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  ROW_TAG_ATTRIBUTE,
  ROW_TAG_SEMANTIC,
  markLossyTables,
  parseInstanceTablesExtensionData,
  rowOfTag,
} from '../loader/bldrsInstanceTables'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME} from '../loader/bldrsSpatialTree'
import {batchedArtifactBytes} from '../loader/glbArtifact.fixture'
import {loadDracoDecoder} from '../loader/glbCompress'
import {injectGlbExtensions, parseGlb, serializeGlb} from '../loader/injectGlbExtensions'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'
import {COMPRESSION_DRACO, COMPRESSION_MESHOPT, COMPRESSION_NONE, compressExportGlb} from './glbCompression'
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
 * file's own JSON (`markLossyTables`, which the tables plugin runs). The row
 * tag is carried the way GLTFLoader names it (`ROW_TAG_ATTRIBUTE`) and typed
 * the way DRACOLoader types it, off the accessor's component type. The real
 * loader path is covered in the browser by `Components/Share/
 * exportCollapsed.spec.ts`.
 */


const TIMEOUT_MS = 120000
const DRACO_DIR = path.resolve(__dirname, '../../public/static/js/draco')
/** One-triangle elements in the strip: every one its own row. */
const ELEMENTS = 60
/** World offset the strip sits at, so baking and recentring are exercised. */
const OFFSET = 1000
const EDGE = 0.37
/** `stripModel(true)`'s slab: counter-clockwise from +z, like the strip. */
const SLAB_CORNERS = [[-40000, -40000, 0], [-20000, -40000, 0], [-40000, -20000, 0]]
/** How far past its row `gridRowsModel`'s zero-area triangle reaches. */
const FAR_CORNER = 5000
/** Where `withExpressIdMesh` puts its one triangle: far from every pick target. */
const EXPRESS_ID_MESH_AT = [-500, -500, 0]
/** `gridRowsModel({sliver})`: how far the sliver row reaches in +y. */
const SLIVER_REACH = 50
/**
 * The sliver's two close corners, apart in x: several float32 steps where the
 * strip sits (so it is not zero-area to the export, which compares bits) and
 * a fraction of the sliver row's own Draco step (`SLIVER_REACH` / 16383 ≈
 * 3 mm at 14 bits), so the first quantization puts both on one grid point.
 */
const SLIVER_GAP = 0.001
/**
 * A Draco file written before the row tag (#1898's code, commit fdd0e24):
 * `hybridModel()` below, collapsed, through that build's
 * `compressExportGlb(…, COMPRESSION_DRACO)` — the collapsed primitive
 * SEQUENTIAL and untagged, the instanced one EDGEBREAKER, spliced. Checked in
 * as bytes because the code that wrote it no longer exists.
 */
const SEQUENTIAL_FIXTURE = path.resolve(__dirname, 'fixtures/collapsedDracoSequential.glb')


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
 * With `slab`, one more element follows the strip: a triangle 20 km across,
 * well clear of it, sharing its table (same colour, single placement) — the
 * shape where one row's Draco step dwarfs its neighbours'.
 *
 * With `shape`, that geometry follows as one genuinely instanced part,
 * placed twice past the strip's end — the hybrid a real artifact is.
 *
 * @param {boolean} [slab]
 * @param {?BufferGeometry} [shape]
 * @return {{model: BatchedMesh, centres: Array<Vector3>}} model + a point
 *   inside each strip element, in model space
 */
function stripModel(slab = false, shape = null) {
  const rows = ELEMENTS + (slab ? 1 : 0)
  const count = rows + (shape ? 2 : 0)
  const mesh = new BatchedMesh(count,
    (rows * 3) + (shape?.getAttribute('position').count ?? 0),
    (rows * 3) + (shape?.getIndex().count ?? 0))
  const centres = []
  for (let i = 0; i < rows; i++) {
    const x = Math.floor(i / 2) * EDGE
    const up = i % 2 === 1
    const corners = i === ELEMENTS ? SLAB_CORNERS : up ?
      [[x, EDGE, 0], [x + EDGE, EDGE, 0], [x + EDGE, 0, 0]] :
      [[x, 0, 0], [x + EDGE, 0, 0], [x, EDGE, 0]]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(corners.flat()), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
    geometry.setIndex(new BufferAttribute(new Uint32Array(up && i !== ELEMENTS ? [0, 2, 1] : [0, 1, 2]), 1))
    mesh.setMatrixAt(
      mesh.addInstance(mesh.addGeometry(geometry)),
      new Matrix4().makeTranslation(OFFSET, OFFSET, 0))
    const centre = new Vector3()
    for (const c of corners) {
      centre.add(new Vector3(...c))
    }
    centres.push(centre.divideScalar(3).add(new Vector3(OFFSET, OFFSET, 0)))
  }
  if (shape) {
    const shapeId = mesh.addGeometry(shape)
    for (const x of [OFFSET + 50, OFFSET + 60]) {
      mesh.setMatrixAt(mesh.addInstance(shapeId), new Matrix4().makeTranslation(x, OFFSET, 0))
    }
  }
  mesh.instanceParents = Array.from({length: count}, (_, i) => 1000 + i)
  mesh.instanceOccurrenceIds = Array.from({length: count}, (_, i) => i)
  mesh.instanceOccurrencePaths = Array.from({length: count}, (_, i) => [7, i])
  mesh.instanceSourceColors = Array.from({length: count}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
  return {model: mesh, centres}
}


/**
 * `stripModel`'s rows beside one genuinely instanced shape: a 4 × 4 grid of
 * quads placed twice, well clear of the strip. The strip collapses into one
 * merged primitive; the shape stays an `EXT_mesh_gpu_instancing` node.
 *
 * @return {{model: BatchedMesh, centres: Array<Vector3>, shapeIndexCount: number}}
 */
function hybridModel() {
  const cells = 4
  const positions = []
  const indices = []
  for (let y = 0; y <= cells; y++) {
    for (let x = 0; x <= cells; x++) {
      positions.push(x, y, 0)
    }
  }
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const a = (y * (cells + 1)) + x
      indices.push(a, a + 1, a + cells + 1, a + 1, a + cells + 2, a + cells + 1)
    }
  }
  const shape = new BufferGeometry()
  shape.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  shape.setAttribute('normal', new BufferAttribute(
    new Float32Array(positions.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3))
  shape.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
  return {...stripModel(false, shape), shapeIndexCount: indices.length}
}


/**
 * Rows of SEVERAL triangles, which the one-triangle strip cannot exercise:
 * each element a 2 × 1 run of quads (four triangles) tiling a strip with its
 * neighbours, so rows share edge positions; every third element placed
 * mirrored, which the writer bakes by reversing winding. With `zeroArea`,
 * element 4 also carries a triangle of zero area (two corners at one
 * position, through separate vertices) — the kind real collapsed rows carry
 * and EDGEBREAKER drops — whose third corner lies `FAR_CORNER` past the
 * strip. A vertex only that triangle uses still sets Draco's quantization
 * grid even though EDGEBREAKER drops the triangle (measured: the decoded row
 * moves), so unless the export drops it too, the grid is 5 km wide while the
 * decoded primitive — the extent the reader takes the tolerance from — is
 * under a metre, and the row is refused. With `allZeroArea`, element 7
 * carries NOTHING else, so EDGEBREAKER would erase it.
 *
 * With `sliver`, element 9 also carries a triangle reaching `SLIVER_REACH`
 * in +y, which widens that row's Draco grid, and a sliver — two corners
 * `SLIVER_GAP` apart — that the export keeps (its corners differ) and the
 * first Draco encode keeps (EDGEBREAKER drops only corners that are equal
 * on the way in) but decodes as zero-area: its two close corners land on one
 * grid point. A second EDGEBREAKER encode of that decoded file would drop it.
 *
 * @param {object} [options]
 * @param {boolean} [options.zeroArea]
 * @param {boolean} [options.allZeroArea]
 * @param {boolean} [options.sliver]
 * @return {{model: BatchedMesh, centres: Array<Vector3>}}
 */
function gridRowsModel({zeroArea = false, allZeroArea = false, sliver = false} = {}) {
  const rows = 12
  const geometries = []
  for (let i = 0; i < rows; i++) {
    const positions = []
    const indices = []
    if (!(allZeroArea && i === 7)) {
      for (let y = 0; y <= 1; y++) {
        for (let x = 0; x <= 2; x++) {
          positions.push((i * 2 * EDGE) + (x * EDGE), y * EDGE, 0)
        }
      }
      indices.push(0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4)
    }
    if ((zeroArea && i === 4) || (allZeroArea && i === 7)) {
      const at = positions.length / 3
      const p = [(i * 2 * EDGE) + 0.1, 0.1, 0]
      positions.push(...p, ...p, p[0] + (i === 4 ? FAR_CORNER : 0.2), 0.1, 0)
      indices.push(at, at + 1, at + 2)
    }
    if (sliver && i === 9) {
      const at = positions.length / 3
      const x = i * 2 * EDGE
      positions.push(
        x, EDGE, 0, x + EDGE, EDGE, 0, x, SLIVER_REACH, 0,
        x + 0.1, 0.1, 0, x + 0.1 + SLIVER_GAP, 0.1, 0, x + 0.2, 0.2, 0)
      indices.push(at, at + 1, at + 2, at + 3, at + 4, at + 5)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(
      new Float32Array(positions.length).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3))
    geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
    geometries.push(geometry)
  }
  const mesh = new BatchedMesh(rows,
    geometries.reduce((n, g) => n + g.getAttribute('position').count, 0),
    geometries.reduce((n, g) => n + g.getIndex().count, 0))
  const centres = []
  geometries.forEach((geometry, i) => {
    // Mirrored in y about the strip's centre line, so the element lands where
    // it would have unmirrored and the pick targets stay simple.
    const matrix = i % 3 === 2 ?
      new Matrix4().makeTranslation(OFFSET, OFFSET + EDGE, 0).multiply(new Matrix4().makeScale(1, -1, 1)) :
      new Matrix4().makeTranslation(OFFSET, OFFSET, 0)
    mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(geometry)), matrix)
    centres.push(new Vector3(OFFSET + (i * 2 * EDGE) + EDGE, OFFSET + (EDGE / 2), 0))
  })
  mesh.instanceParents = Array.from({length: rows}, (_, i) => 2000 + i)
  mesh.instanceOccurrenceIds = Array.from({length: rows}, (_, i) => i)
  mesh.instanceOccurrencePaths = Array.from({length: rows}, (_, i) => [9, i])
  mesh.instanceSourceColors = Array.from({length: rows}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
  return {model: mesh, centres}
}


/** A Draco bitstream's method byte: 'DRACO', major, minor, encoder type, METHOD. */
const DRACO_METHOD_BYTE = 8
const DRACO_SEQUENTIAL = 0
const DRACO_EDGEBREAKER = 1


/**
 * The encoded Draco payloads of one mesh's primitives.
 *
 * @param {object} json
 * @param {Uint8Array} bin
 * @param {number} meshIndex
 * @return {Array<Uint8Array>}
 */
function dracoPayloadsOf(json, bin, meshIndex) {
  return json.meshes[meshIndex].primitives.map((primitive) => {
    const view = json.bufferViews[primitive.extensions.KHR_draco_mesh_compression.bufferView]
    const at = view.byteOffset ?? 0
    return bin.slice(at, at + view.byteLength)
  })
}


/**
 * The Draco method each of one mesh's primitives was encoded with, read off
 * the bitstream header rather than inferred from sizes.
 *
 * @param {object} json
 * @param {Uint8Array} bin
 * @param {number} meshIndex
 * @return {Array<number>} `DRACO_SEQUENTIAL` / `DRACO_EDGEBREAKER` per primitive
 */
function dracoMethodsOf(json, bin, meshIndex) {
  return dracoPayloadsOf(json, bin, meshIndex).map((payload) => {
    expect(new TextDecoder().decode(payload.subarray(0, 5))).toBe('DRACO')
    return payload[DRACO_METHOD_BYTE]
  })
}


/**
 * The scene three's GLTFLoader would build from `bytes`, decoded with the
 * real Draco (or Meshopt) decoder: nodes nested as in the file, TRS applied, extras on
 * userData, the tables payload parsed and marked lossy from the file's JSON.
 *
 * @param {Uint8Array} bytes one GLB, possibly Draco- or Meshopt-compressed
 * @return {Promise<Group>} scene
 */
async function loadLikeGltfLoader(bytes) {
  const {MeshoptDecoder} = await import('meshoptimizer/decoder')
  await MeshoptDecoder.ready
  const io = new WebIO()
    .setLogger(new Logger(Logger.Verbosity.SILENT))
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, EXTMeshGPUInstancing])
    .registerDependencies({'draco3d.decoder': await loadDracoDecoder(), 'meshopt.decoder': MeshoptDecoder})
  const doc = await io.readBinary(bytes)
  // One geometry per glTF mesh, shared by every node that uses it, as
  // GLTFLoader caches it — the portable join checks a table's placements
  // share one.
  const geometries = new Map()
  const build = (node) => {
    let object = new Group()
    const mesh = node.getMesh()
    if (mesh) {
      const primitive = mesh.listPrimitives()[0]
      const geometry = geometries.get(mesh) ?? new BufferGeometry()
      const isShared = geometries.has(mesh)
      geometries.set(mesh, geometry)
      if (!isShared) {
        geometry.setAttribute('position',
          new BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3))
        const normal = primitive.getAttribute('NORMAL')
        if (normal) {
          geometry.setAttribute('normal', new BufferAttribute(normal.getArray(), 3))
        }
        const tag = primitive.getAttribute(ROW_TAG_SEMANTIC)
        if (tag) {
          geometry.setAttribute(ROW_TAG_ATTRIBUTE, new BufferAttribute(tag.getArray(), tag.getElementSize()))
        }
        geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1))
      }
      // GLTFLoader builds an InstancedMesh for an `EXT_mesh_gpu_instancing`
      // node, one matrix per TRANSLATION entry; the hybrid's instanced half
      // only joins its table as one.
      const instancing = node.getExtension('EXT_mesh_gpu_instancing')
      if (instancing) {
        const translation = instancing.getAttribute('TRANSLATION')
        const rotation = instancing.getAttribute('ROTATION')
        const scale = instancing.getAttribute('SCALE')
        object = new InstancedMesh(geometry, undefined, translation.getCount())
        for (let i = 0; i < translation.getCount(); i++) {
          object.setMatrixAt(i, new Matrix4().compose(
            new Vector3().fromArray(translation.getElement(i, [])),
            rotation ? new Quaternion().fromArray(rotation.getElement(i, [])) : new Quaternion(),
            scale ? new Vector3().fromArray(scale.getElement(i, [])) : new Vector3(1, 1, 1)))
        }
      } else {
        object = new Mesh(geometry)
      }
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


/**
 * A strip row's three corners in model space, as `stripModel` places them.
 *
 * @param {number} row
 * @return {Array<Vector3>}
 */
function stripCorners(row) {
  const x = Math.floor(row / 2) * EDGE
  const corners = row % 2 === 1 ?
    [[x, EDGE, 0], [x + EDGE, EDGE, 0], [x + EDGE, 0, 0]] :
    [[x, 0, 0], [x + EDGE, 0, 0], [x, EDGE, 0]]
  return corners.map(([cx, cy, cz]) => new Vector3(cx + OFFSET, cy + OFFSET, cz))
}


/**
 * Every element's triangles in model space, read the way picking and
 * isolation read them: the batch's own index range for the element's
 * geometry id, placed by its instance matrix.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Map<number, Array<Array<Vector3>>>} parent -> triangles
 */
function trianglesByParent(model) {
  const out = new Map()
  const index = model.geometry.getIndex()
  const position = model.geometry.getAttribute('position')
  const matrix = new Matrix4()
  for (let batchId = 0; batchId < model.instanceParents.length; batchId++) {
    const {indexStart, indexCount} = model.getGeometryRangeAt(model.getGeometryIdAt(batchId))
    model.getMatrixAt(batchId, matrix)
    const triangles = []
    for (let i = indexStart; i < indexStart + indexCount; i += 3) {
      triangles.push([0, 1, 2].map((k) =>
        new Vector3().fromBufferAttribute(position, index.getX(i + k)).applyMatrix4(matrix)))
    }
    out.set(model.instanceParents[batchId], triangles)
  }
  return out
}


/**
 * @param {Array<Vector3>} triangle
 * @return {boolean} two of its corners coincide
 */
function isZeroArea([a, b, c]) {
  return a.equals(b) || b.equals(c) || a.equals(c)
}


/**
 * The same triangle, corner for corner within `tolerance`, up to a rotation
 * of its corners — which keeps the triangle and its winding, and which a
 * codec is free to choose. A reflection (flipped winding) is NOT the same.
 *
 * @param {Array<Vector3>} a
 * @param {Array<Vector3>} b
 * @param {number} tolerance
 * @return {boolean}
 */
function sameTriangle(a, b, tolerance) {
  return [0, 1, 2].some((shift) =>
    [0, 1, 2].every((k) => a[(k + shift) % 3].distanceTo(b[k]) <= tolerance))
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
    // swapped — every corner stat still matches, only the exact identity hash can
    // see it.
    const swapped = withTables(draco.withMetadata, (raw) => {
      const parents = parseInstanceTablesExtensionData(raw).flatMap((t) => t.parents)
      ;[parents[0], parents[1]] = [parents[1], parents[0]]
      return {...raw, parents: Buffer.from(new Uint32Array(parents).buffer).toString('base64')}
    })

    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(swapped))).toBeNull()
  }, TIMEOUT_MS)

  it('refuses the Draco file when a row\'s geometry has moved', async () => {
    // The geometry half: nudge one stored stat far outside tolerance —
    // equivalent to that row's triangles being somewhere else.
    const moved = withTables(draco.withMetadata, (raw) => {
      const node = raw.nodes.find((n) => n.witness)
      const words = Buffer.from(node.witness.stats, 'base64')
      const q = new Uint16Array(words.buffer, words.byteOffset, words.byteLength / 2)
      q[0] = q[0] > 30000 ? 0 : 65535
      node.witness.stats = Buffer.from(words).toString('base64')
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

  it('encodes the collapsed primitive EDGEBREAKER, carrying an integer row tag', () => {
    // The row tag is what lets the method be EDGEBREAKER: rows no longer need
    // their triangle order. Read off the bitstream, not inferred from sizes.
    const {json, bin} = parseGlb(draco.withMetadata)
    const primitive = json.meshes[0].primitives[0]
    const tag = json.accessors[primitive.attributes[ROW_TAG_SEMANTIC]]

    expect(dracoMethodsOf(json, bin, 0)).toEqual([DRACO_EDGEBREAKER])
    expect(primitive.extensions.KHR_draco_mesh_compression.attributes[ROW_TAG_SEMANTIC]).toBeDefined()
    // UNSIGNED_SHORT SCALAR: glTF forbids UNSIGNED_INT on a vertex attribute,
    // and FLOAT is what Draco's GENERIC quantization would corrupt.
    expect(tag).toMatchObject({componentType: 5123, type: 'SCALAR'})
  })

  it('brings every vertex\'s row back exactly, and merges no vertex across rows', async () => {
    // Each strip row is one triangle whose corners sit on its neighbours'
    // corners, which Draco merges when nothing tells the vertices apart
    // (600 → 202 on a strip of 200). A tag that differs per row does, so
    // every row keeps its own three vertices — and each of them must be at
    // one of THAT row's corners, which is what "exact" means for a tag: one
    // integer off and the vertex sits on another row's triangle.
    const scene = await loadLikeGltfLoader(draco.withMetadata)
    const merged = scene.children.find((obj) => obj.isMesh)
    const position = merged.geometry.getAttribute('position')
    const tag = merged.geometry.getAttribute(ROW_TAG_ATTRIBUTE)

    expect(tag.array).toBeInstanceOf(Uint16Array)
    expect(position.count).toBe(ELEMENTS * 3)
    const perRow = new Array(ELEMENTS).fill(0)
    let misplaced = 0
    for (let v = 0; v < position.count; v++) {
      const row = tag.getX(v)
      expect(row).toBeLessThan(ELEMENTS)
      perRow[row]++
      const at = new Vector3().fromBufferAttribute(position, v).add(merged.position)
      if (Math.min(...stripCorners(row).map((c) => c.distanceTo(at))) > 0.001) {
        misplaced++
      }
    }
    expect(misplaced).toBe(0)
    expect(perRow.every((n) => n === 3)).toBe(true)
  }, TIMEOUT_MS)

  it('refuses a file whose row tags are swapped between two rows', async () => {
    // The geometry half of the witness, on the tag: rows 0 and 6 are the same
    // triangle 3 × EDGE apart, so swapping their tags hands each row the
    // other's triangle with every count unchanged — only the corner stats can
    // see it.
    const scene = await loadLikeGltfLoader(draco.withMetadata)
    const tag = scene.children.find((obj) => obj.isMesh).geometry.getAttribute(ROW_TAG_ATTRIBUTE)
    for (let v = 0; v < tag.count; v++) {
      const row = tag.getX(v)
      if (row === 0 || row === 6) {
        tag.setX(v, 6 - row)
      }
    }

    expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
  }, TIMEOUT_MS)

  it('refuses a file whose row tag disagrees within a triangle', async () => {
    // One corner of one triangle retagged to a neighbour's row. Its SECOND
    // corner, deliberately: the regroup reads a triangle's row off its first,
    // so without the agreement check the triangle would land in its right
    // row and pass every other check.
    const scene = await loadLikeGltfLoader(draco.withMetadata)
    const geometry = scene.children.find((obj) => obj.isMesh).geometry
    const tag = geometry.getAttribute(ROW_TAG_ATTRIBUTE)
    const corner = geometry.getIndex().getX(1)
    tag.setX(corner, (tag.getX(corner) + 1) % ELEMENTS)

    expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
  }, TIMEOUT_MS)

  it('drops the tag from the geometry once it has regrouped the rows', async () => {
    const scene = await loadLikeGltfLoader(draco.withMetadata)
    const geometry = scene.children.find((obj) => obj.isMesh).geometry
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    expect(model).not.toBeNull()
    expect(geometry.getAttribute(ROW_TAG_ATTRIBUTE)).toBeUndefined()
    expect(model.geometry.getAttribute(ROW_TAG_ATTRIBUTE)).toBeUndefined()
  }, TIMEOUT_MS)
})


describe('rows of several triangles through a Draco export', () => {
  let grid
  let source
  let draco

  beforeAll(async () => {
    grid = gridRowsModel({zeroArea: true})
    source = await batchedArtifactBytes(grid.model, {collapse: true})
    draco = await compressExportGlb(source, COMPRESSION_DRACO)
  }, TIMEOUT_MS)

  it('encodes the zero-area triangle out, so Draco has nothing of its own to drop', async () => {
    // EDGEBREAKER drops zero-area triangles itself (measured). The export
    // removes them first and witnesses what is left, so the file's triangle
    // count is the source's minus exactly that one — and the rows reopen,
    // which they could not if Draco had dropped one the witness counted.
    const {json, bin} = parseGlb(draco.withMetadata)
    const sourceJson = parseGlb(source).json
    const sourceTriangles = sourceJson.accessors[sourceJson.meshes[0].primitives[0].indices].count / 3

    expect(dracoMethodsOf(json, bin, 0)).toEqual([DRACO_EDGEBREAKER])
    expect(json.accessors[json.meshes[0].primitives[0].indices].count / 3).toBe(sourceTriangles - 1)
    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata)))
      .not.toBeNull()
  }, TIMEOUT_MS)

  it('regroups every row to the same model-space triangles as the lossless file', async () => {
    // The regroup's whole claim: from triangles in the codec's order, every
    // row comes back holding exactly its own triangles — compared, per
    // element, with what the SAME artifact hydrates to uncompressed, to within
    // one Draco step. Zero-area triangles are left out of the lossless side,
    // since they are the one thing the Draco file deliberately lacks.
    const lossless = trianglesByParent(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(source)))
    const lossy = trianglesByParent(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata)))
    // One 14-bit step over the strip's 24 × EDGE extent, doubled for margin.
    const step = 2 * (24 * EDGE) / ((2 ** 14) - 1)

    expect([...lossy.keys()].sort()).toEqual([...lossless.keys()].sort())
    let compared = 0
    for (const [parent, triangles] of lossless) {
      const expected = triangles.filter((t) => !isZeroArea(t))
      const got = lossy.get(parent)
      expect(got).toHaveLength(expected.length)
      for (const triangle of expected) {
        expect(got.some((candidate) => sameTriangle(candidate, triangle, step))).toBe(true)
        compared++
      }
    }
    // Twelve elements of four triangles: the loop above ran, on all of them.
    expect(compared).toBe(48)
  }, TIMEOUT_MS)

  it('picks every element', async () => {
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata))
    grid.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(2000 + i)
    })
  }, TIMEOUT_MS)

  it('falls back to SEQUENTIAL, untagged, when a row has no triangle of non-zero area', async () => {
    // EDGEBREAKER would erase that element outright, so the file takes the
    // layout the reader has always opened by triangle runs — one method, one
    // write, the whole file.
    const empty = gridRowsModel({allZeroArea: true})
    const bytes = (await compressExportGlb(
      await batchedArtifactBytes(empty.model, {collapse: true}), COMPRESSION_DRACO)).withMetadata
    const {json, bin} = parseGlb(bytes)

    expect(dracoMethodsOf(json, bin, 0)).toEqual([DRACO_SEQUENTIAL])
    expect(json.meshes[0].primitives[0].attributes[ROW_TAG_SEMANTIC]).toBeUndefined()
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    expect(pickParent(model, empty.centres[3])).toBe(2003)
  }, TIMEOUT_MS)
})


describe('hybrid artifact through a Draco export', () => {
  // One method per file again: the row tag frees the collapsed primitive from
  // SEQUENTIAL, so the instanced one beside it no longer needs a second write
  // spliced in to keep EDGEBREAKER (#1898's `dracoMethodSplice.js`, removed).
  let hybrid
  let draco

  beforeAll(async () => {
    hybrid = hybridModel()
    draco = await compressExportGlb(await batchedArtifactBytes(hybrid.model, {collapse: true}), COMPRESSION_DRACO)
  }, TIMEOUT_MS)

  it('encodes both primitives EDGEBREAKER, and tags only the collapsed one', () => {
    const {json, bin} = parseGlb(draco.withMetadata)
    const collapsed = json.nodes.filter((node) =>
      Number.isInteger(node.extras?.bldrsTableNode) && !node.extensions?.EXT_mesh_gpu_instancing)
    const instanced = json.nodes.filter((node) => node.extensions?.EXT_mesh_gpu_instancing)

    expect(draco.mode).toBe(COMPRESSION_DRACO)
    expect(collapsed).toHaveLength(1)
    expect(instanced).toHaveLength(1)
    expect(dracoMethodsOf(json, bin, collapsed[0].mesh)).toEqual([DRACO_EDGEBREAKER])
    expect(dracoMethodsOf(json, bin, instanced[0].mesh)).toEqual([DRACO_EDGEBREAKER])
    expect(json.meshes[collapsed[0].mesh].primitives[0].attributes[ROW_TAG_SEMANTIC]).toBeDefined()
    expect(json.meshes[instanced[0].mesh].primitives[0].attributes[ROW_TAG_SEMANTIC]).toBeUndefined()
  })

  it('ships the instanced primitive byte-for-byte as the collapse-off export does', async () => {
    // Per-primitive quantization makes each payload independent of its
    // neighbours, so "the method it would have had" is checkable exactly.
    const off = await compressExportGlb(await batchedArtifactBytes(hybridModel().model), COMPRESSION_DRACO)
    const shared = (bytes) => {
      const {json, bin} = parseGlb(bytes)
      const node = json.nodes.find((n) =>
        json.accessors[n.extensions?.EXT_mesh_gpu_instancing?.attributes?.TRANSLATION]?.count === 2)
      return dracoPayloadsOf(json, bin, node.mesh)
    }

    expect(shared(draco.withMetadata)).toEqual(shared(off.withMetadata))
  }, TIMEOUT_MS)

  it('reopens with every collapsed row and both instanced placements pickable', async () => {
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(draco.withMetadata))

    expect(model).not.toBeNull()
    hybrid.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
    expect(pickParent(model, new Vector3(OFFSET + 52, OFFSET + 2, 0))).toBe(1000 + ELEMENTS)
    expect(pickParent(model, new Vector3(OFFSET + 62, OFFSET + 2, 0))).toBe(1000 + ELEMENTS + 1)
  }, TIMEOUT_MS)
})


describe('a Draco export written before the row tag still opens', () => {
  // Backward compatibility, on bytes the old writer actually produced
  // (`SEQUENTIAL_FIXTURE`): no tag, so the reader must find each row as its
  // contiguous triangle run, as it did when that file was written.
  let bytes

  beforeAll(() => {
    bytes = new Uint8Array(readFileSync(SEQUENTIAL_FIXTURE))
  })

  it('is the layout it claims to be: collapsed SEQUENTIAL and untagged', () => {
    const {json, bin} = parseGlb(bytes)
    const collapsed = json.nodes.find((node) =>
      Number.isInteger(node.extras?.bldrsTableNode) && !node.extensions?.EXT_mesh_gpu_instancing)
    const instanced = json.nodes.find((node) => node.extensions?.EXT_mesh_gpu_instancing)

    expect(dracoMethodsOf(json, bin, collapsed.mesh)).toEqual([DRACO_SEQUENTIAL])
    expect(dracoMethodsOf(json, bin, instanced.mesh)).toEqual([DRACO_EDGEBREAKER])
    expect(json.meshes.every((mesh) => mesh.primitives.every((p) => !(ROW_TAG_SEMANTIC in p.attributes))))
      .toBe(true)
  })

  it('hydrates, and picks every collapsed row and both instanced placements', async () => {
    const {centres} = hybridModel()
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))

    expect(model).not.toBeNull()
    centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
    expect(pickParent(model, new Vector3(OFFSET + 52, OFFSET + 2, 0))).toBe(1000 + ELEMENTS)
    expect(pickParent(model, new Vector3(OFFSET + 62, OFFSET + 2, 0))).toBe(1000 + ELEMENTS + 1)
  }, TIMEOUT_MS)
})


describe('a table too wide for a SCALAR row tag', () => {
  // 65,540 one-triangle rows, one past the 16-bit row numbers a SCALAR tag
  // can hold (and three more, so the high half is 1 on more than one row),
  // through the real encoder and decoder: the tag must be a VEC2, every
  // vertex's row must come back whole, and the table must reopen.
  const WIDE = 65540

  it('tags as VEC2, and every row past 65,535 reopens on its own triangle', async () => {
    const mesh = new BatchedMesh(WIDE, WIDE * 3, WIDE * 3)
    const corner = new Float32Array([0, 0, 0, EDGE, 0, 0, 0, EDGE, 0])
    const normal = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    for (let i = 0; i < WIDE; i++) {
      // A distinct shape per element (its own scale), so each is its own
      // single-placement group and collapses; laid out on a 256-wide grid.
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(corner.map((v) => v * (1 + (i / WIDE))), 3))
      geometry.setAttribute('normal', new BufferAttribute(normal, 3))
      geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(geometry)),
        new Matrix4().makeTranslation((i % 256) * 2 * EDGE, Math.floor(i / 256) * 2 * EDGE, 0))
    }
    mesh.instanceParents = Array.from({length: WIDE}, (_, i) => 100000 + i)
    mesh.instanceOccurrenceIds = Array.from({length: WIDE}, (_, i) => i)
    mesh.instanceSourceColors = Array.from({length: WIDE}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
    const bytes = (await compressExportGlb(
      await batchedArtifactBytes(mesh, {collapse: true}), COMPRESSION_DRACO)).withMetadata
    const {json, bin} = parseGlb(bytes)
    const primitive = json.meshes[0].primitives[0]

    expect(dracoMethodsOf(json, bin, 0)).toEqual([DRACO_EDGEBREAKER])
    expect(json.accessors[primitive.attributes[ROW_TAG_SEMANTIC]]).toMatchObject({componentType: 5123, type: 'VEC2'})
    const scene = await loadLikeGltfLoader(bytes)
    const tag = scene.children.find((obj) => obj.isMesh).geometry.getAttribute(ROW_TAG_ATTRIBUTE)
    expect(tag.itemSize).toBe(2)
    const perRow = new Uint8Array(WIDE)
    for (let v = 0; v < tag.count; v++) {
      perRow[rowOfTag(tag, v)]++
    }
    expect(perRow.every((n) => n === 3)).toBe(true)
    const model = hydrateBatchedModelFromInstancedGlb(scene)
    expect(model).not.toBeNull()
    // Rows either side of the boundary, where a dropped or swapped high half
    // would land a pick on the wrong element.
    for (const row of [0, 65535, 65536, WIDE - 1]) {
      const x = ((row % 256) * 2 * EDGE) + (EDGE / 4)
      const y = (Math.floor(row / 256) * 2 * EDGE) + (EDGE / 4)
      expect(pickParent(model, new Vector3(x, y, 0))).toBe(100000 + row)
    }
  }, TIMEOUT_MS * 5)
})


/**
 * @param {object} strip from `stripModel` or `gridRowsModel`
 * @return {Promise<Uint8Array>} its collapsed artifact, portable, then Draco
 */
async function portableDraco(strip) {
  const tree = {
    expressID: 1, type: 'PRODUCT', Name: {value: 'Strip'},
    children: strip.model.instanceParents.map((id, i) => ({
      expressID: id, type: 'PRODUCT', Name: {value: `E${i}`},
      occurrencePath: strip.model.instanceOccurrencePaths[i], children: [],
    })),
  }
  const withTree = injectGlbExtensions(await batchedArtifactBytes(strip.model, {collapse: true}),
    [{name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true}], null, null).bytes
  const portable = rewriteGlbPortable(withTree)
  return (await compressExportGlb(portable.bytes, COMPRESSION_DRACO)).withMetadata
}


/**
 * How many of a decoded geometry's triangles have two corners at one
 * position, bit for bit — the ones EDGEBREAKER drops on the way in.
 *
 * @param {BufferGeometry} geometry
 * @return {number}
 */
function zeroAreaTriangles(geometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const same = (a, b) => [0, 1, 2].every((c) =>
    Object.is(position.getComponent(a, c), position.getComponent(b, c)))
  let count = 0
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (same(a, b) || same(b, c) || same(a, c)) {
      count++
    }
  }
  return count
}


describe('a collapsed Draco file exported again (codex P1 on #1903)', () => {
  // `compressExportGlb` takes already-compressed sources (`transformGlb`
  // decodes them first), and a collapsed Draco file is one whose geometry
  // the export cannot verify against the exact canary: Draco quantized it.
  // Untagged, its rows exist only as triangle runs, which EDGEBREAKER would
  // scramble; tagged or portable, its rows may hold triangles the first
  // quantization made zero-area, which EDGEBREAKER would drop from under a
  // witness that counted them. So an unverifiable collapsed table keeps the
  // whole file SEQUENTIAL — whatever tag it already carries rides through
  // the re-encode — and keeps its witness. (No path in the app hands the
  // export such a source today: a reopened .glb publishes no artifact, and
  // the cache never compresses a batched one. The function promises it all
  // the same.)
  //
  // Each source is one shape a collapsed Draco file comes in. The two sliver
  // sources are what make the user-visible failure reachable for a TAGGED
  // file: the hybrid's rows have no triangle the first quantization
  // collapses, so a second EDGEBREAKER encode of it still regroups, and only
  // its method byte would tell the difference.
  const FIXTURE = 'the pre-tag SEQUENTIAL fixture'
  const TAGGED = 'a tagged export'
  const TAGGED_SLIVER = 'a tagged export whose row decodes a zero-area sliver'
  const PORTABLE_SLIVER = 'a portable export whose row decodes a zero-area sliver'
  /** name -> `{bytes, targets: Array<[Vector3, number]>}`: each target a point and the parent it picks */
  const sources = new Map()

  beforeAll(async () => {
    const hybrid = hybridModel()
    const hybridTargets = [
      ...hybrid.centres.map((centre, i) => [centre, 1000 + i]),
      [new Vector3(OFFSET + 52, OFFSET + 2, 0), 1000 + ELEMENTS],
    ]
    const sliver = gridRowsModel({sliver: true})
    const sliverTargets = sliver.centres.map((centre, i) => [centre, 2000 + i])
    sources.set(FIXTURE, {targets: hybridTargets,
      bytes: new Uint8Array(readFileSync(SEQUENTIAL_FIXTURE))})
    sources.set(TAGGED, {targets: hybridTargets,
      bytes: (await compressExportGlb(
        await batchedArtifactBytes(hybrid.model, {collapse: true}), COMPRESSION_DRACO)).withMetadata})
    sources.set(TAGGED_SLIVER, {targets: sliverTargets,
      bytes: (await compressExportGlb(
        await batchedArtifactBytes(sliver.model, {collapse: true}), COMPRESSION_DRACO)).withMetadata})
    sources.set(PORTABLE_SLIVER, {targets: sliverTargets,
      bytes: await portableDraco(sliver)})
  }, TIMEOUT_MS)

  /**
   * @param {object} source a value of `sources`
   * @param {Uint8Array} bytes reopened and checked
   */
  async function expectEveryRowPicks(source, bytes) {
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    for (const [point, parent] of source.targets) {
      expect(pickParent(model, point)).toBe(parent)
    }
  }

  it('starts the sliver sources with a triangle only the first quantization made zero-area', async () => {
    // The precondition the sliver sources exist for: if a Draco change ever
    // stopped collapsing the sliver, the Draco re-exports below would pass
    // without exercising anything. Exactly one such triangle: the sliver.
    for (const name of [TAGGED_SLIVER, PORTABLE_SLIVER]) {
      const source = sources.get(name)
      const scene = await loadLikeGltfLoader(source.bytes)
      let zeroArea = 0
      scene.traverse((obj) => {
        if (obj.isMesh) {
          zeroArea += zeroAreaTriangles(obj.geometry)
        }
      })
      expect(zeroArea).toBe(1)
      await expectEveryRowPicks(source, source.bytes)
    }
  }, TIMEOUT_MS)

  for (const label of [FIXTURE, TAGGED, TAGGED_SLIVER, PORTABLE_SLIVER]) {
    it(`re-exports ${label} through Draco, SEQUENTIAL, with every row still selectable`, async () => {
      const source = sources.get(label)
      const again = (await compressExportGlb(source.bytes, COMPRESSION_DRACO)).withMetadata
      const {json, bin} = parseGlb(again)
      const collapsedMeshes = json.nodes
        .filter((node) => Number.isInteger(node.mesh) && !node.extensions?.EXT_mesh_gpu_instancing)
        .map((node) => node.mesh)

      expect(collapsedMeshes.length).toBeGreaterThan(0)
      for (const mesh of collapsedMeshes) {
        expect(dracoMethodsOf(json, bin, mesh)).toEqual([DRACO_SEQUENTIAL])
      }
      await expectEveryRowPicks(source, again)
    }, TIMEOUT_MS)

    it(`re-exports ${label} through Meshopt with every row still selectable`, async () => {
      // Lossless from here on, but the geometry is still the Draco-decoded
      // one, so it is the witness — not the exact canary — that can vouch
      // for it (`bldrsInstanceTables.js#markLossyTables`).
      const source = sources.get(label)
      await expectEveryRowPicks(source, (await compressExportGlb(source.bytes, COMPRESSION_MESHOPT)).withMetadata)
    }, TIMEOUT_MS)

    it(`hands ${label} back untouched with no codec`, async () => {
      const source = sources.get(label)
      await expectEveryRowPicks(source, (await compressExportGlb(source.bytes, COMPRESSION_NONE)).withMetadata)
    }, TIMEOUT_MS)
  }
})


/**
 * `bytes` with one more mesh, of one triangle, carrying a per-vertex
 * `_EXPRESSID` — the merged layout's identity attribute, whose triangle
 * order is load-bearing, so its presence anywhere puts the whole Draco
 * export on SEQUENTIAL (`glbCompression.js#isTriangleOrderedLayout`). Placed
 * `EXPRESS_ID_MESH_AT` off, clear of every pick target. Appended at the raw
 * GLB level so the `BLDRS_*` payloads ride along untouched; the new accessors
 * are plain, so this works on a Draco file too.
 *
 * @param {Uint8Array} bytes a GLB
 * @return {Uint8Array} the same GLB plus the `_EXPRESSID` mesh
 */
function withExpressIdMesh(bytes) {
  const {json, bin} = parseGlb(bytes)
  const at = Math.ceil(bin.byteLength / 4) * 4
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const ids = new Uint32Array([7, 7, 7])
  const indices = new Uint16Array([0, 1, 2, 0])
  const grown = new Uint8Array(at + positions.byteLength + ids.byteLength + indices.byteLength)
  grown.set(bin)
  grown.set(new Uint8Array(positions.buffer), at)
  grown.set(new Uint8Array(ids.buffer), at + positions.byteLength)
  grown.set(new Uint8Array(indices.buffer), at + positions.byteLength + ids.byteLength)
  json.buffers[0].byteLength = grown.byteLength
  const view = (byteOffset, byteLength, target) => {
    json.bufferViews.push({buffer: 0, byteOffset, byteLength, target})
    return json.bufferViews.length - 1
  }
  const accessor = (entry) => {
    json.accessors.push(entry)
    return json.accessors.length - 1
  }
  const ARRAY_BUFFER = 34962
  const ELEMENT_ARRAY_BUFFER = 34963
  const position = accessor({bufferView: view(at, positions.byteLength, ARRAY_BUFFER),
    componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0]})
  const expressId = accessor({bufferView: view(at + positions.byteLength, ids.byteLength, ARRAY_BUFFER),
    componentType: 5125, count: 3, type: 'SCALAR'})
  const index = accessor({bufferView: view(at + positions.byteLength + ids.byteLength, 6, ELEMENT_ARRAY_BUFFER),
    componentType: 5123, count: 3, type: 'SCALAR'})
  json.meshes.push({primitives: [{attributes: {POSITION: position, _EXPRESSID: expressId}, indices: index}]})
  json.nodes.push({mesh: json.meshes.length - 1, translation: EXPRESS_ID_MESH_AT})
  json.scenes[json.scene ?? 0].nodes.push(json.nodes.length - 1)
  return serializeGlb(json, grown)
}


describe('a collapsed table beside a triangle-ordered mesh (codex P2 on #1903)', () => {
  // `_EXPRESSID` (or `BLDRS_face_ids`) anywhere in the file makes the Draco
  // export SEQUENTIAL. The collapsed tables beside it are still quantized,
  // so the reader still needs their lossy witness — SEQUENTIAL decides the
  // method, not whether the rows are vouched for. Share's own writer never
  // puts the two layouts in one file (`glbExport.js` captures face_ids only
  // when the batched-native writer declined), so this is a user-assembled
  // file; before #1903 the witness was added whatever the layout.
  it('witnesses the collapsed table, unstripped, and every collapsed row picks', async () => {
    const strip = stripModel()
    const source = withExpressIdMesh(await batchedArtifactBytes(strip.model, {collapse: true}))
    const bytes = (await compressExportGlb(source, COMPRESSION_DRACO)).withMetadata
    const {json, bin} = parseGlb(bytes)
    const collapsed = json.nodes.find((node) =>
      Number.isInteger(node.extras?.bldrsTableNode) && !node.extensions?.EXT_mesh_gpu_instancing)

    expect(dracoMethodsOf(json, bin, collapsed.mesh)).toEqual([DRACO_SEQUENTIAL])
    expect(rawTables(bytes).nodes.some((node) => node.witness)).toBe(true)
    expect(json.meshes[collapsed.mesh].primitives[0].attributes[ROW_TAG_SEMANTIC]).toBeUndefined()
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    strip.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
  }, TIMEOUT_MS)

  it('keeps an already-compressed source\'s own witness through the same re-export', async () => {
    // The P1 path with the same neighbour: the tagged Draco file cannot be
    // verified, so its witness and tag are what carry it, SEQUENTIAL.
    const strip = stripModel()
    const tagged = (await compressExportGlb(
      await batchedArtifactBytes(strip.model, {collapse: true}), COMPRESSION_DRACO)).withMetadata
    const bytes = (await compressExportGlb(withExpressIdMesh(tagged), COMPRESSION_DRACO)).withMetadata
    const {json, bin} = parseGlb(bytes)
    const collapsed = json.nodes.find((node) =>
      Number.isInteger(node.extras?.bldrsTableNode) && !node.extensions?.EXT_mesh_gpu_instancing)

    expect(dracoMethodsOf(json, bin, collapsed.mesh)).toEqual([DRACO_SEQUENTIAL])
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    strip.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
  }, TIMEOUT_MS)
})


describe('portable collapsed artifact through a Draco export', () => {
  it('re-opens pickable, and carries no row tag (each row is its own primitive)', async () => {
    const strip = stripModel()
    const bytes = await portableDraco(strip)
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))

    expect(parseGlb(bytes).json.meshes.every((mesh) =>
      mesh.primitives.every((primitive) => !(ROW_TAG_SEMANTIC in primitive.attributes)))).toBe(true)

    expect(model).not.toBeNull()
    strip.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(1000 + i)
    })
  }, TIMEOUT_MS)

  it('re-opens pickable when a row carries a zero-area triangle', async () => {
    // Each portable row is its own primitive, encoded EDGEBREAKER, which
    // drops the zero-area triangle in element 4 — so before the export
    // stripped portable rows too, that row decoded one triangle short of the
    // count the reader demanded and the whole table was refused (Snowdon and
    // dental_clinic both have such rows: their portable Draco downloads opened
    // without selection). The file now carries exactly the stripped count.
    const grid = gridRowsModel({zeroArea: true})
    const bytes = await portableDraco(grid)
    const {json, bin} = parseGlb(bytes)
    const rowNodes = json.nodes.filter((node) => Number.isInteger(node.extras?.bldrsInstance))
    const triangles = rowNodes.reduce((n, node) =>
      n + (json.accessors[json.meshes[node.mesh].primitives[0].indices].count / 3), 0)

    expect(rowNodes).toHaveLength(12)
    expect(rowNodes.every((node) => dracoMethodsOf(json, bin, node.mesh)[0] === DRACO_EDGEBREAKER)).toBe(true)
    expect(triangles).toBe(12 * 4)
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    grid.centres.forEach((centre, i) => {
      expect(pickParent(model, centre)).toBe(2000 + i)
    })
  }, TIMEOUT_MS)

  it('falls back to SEQUENTIAL, unstripped, when a portable row has no triangle of non-zero area', async () => {
    // The same fallback, for the same reason, as the merged primitive's: one
    // method per file, and EDGEBREAKER would erase element 7.
    const empty = gridRowsModel({allZeroArea: true})
    const bytes = await portableDraco(empty)
    const {json, bin} = parseGlb(bytes)
    const rowNodes = json.nodes.filter((node) => Number.isInteger(node.extras?.bldrsInstance))

    expect(rowNodes.every((node) => dracoMethodsOf(json, bin, node.mesh)[0] === DRACO_SEQUENTIAL)).toBe(true)
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    expect(pickParent(model, empty.centres[3])).toBe(2003)
  }, TIMEOUT_MS)

  it('holds each row to its OWN primitive\'s Draco step, not a slab\'s', async () => {
    // Codex round 3 on #1872. In a portable file each row is its own Draco
    // primitive, quantized on its own grid. Rows 0 and 6 of the strip are the
    // same triangle 3 × EDGE (1.11) apart; the slab's step at 14 bits is
    // 20000 / 16383 ≈ 1.2. Swap the two rows' stamps and a tolerance taken
    // from the table's largest primitive passes it — every pick on those two
    // would name the other element. Each row's own step refuses it.
    const strip = stripModel(true)
    const bytes = await portableDraco(strip)
    const model = hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(bytes))
    expect(model).not.toBeNull()
    expect(pickParent(model, strip.centres[6])).toBe(1006)

    const {json, bin} = parseGlb(bytes)
    const stamped = (row) => json.nodes.find((node) => node.extras?.bldrsInstance === row)
    const [a, b] = [stamped(0), stamped(6)]
    ;[a.extras.bldrsInstance, b.extras.bldrsInstance] = [6, 0]
    expect(hydrateBatchedModelFromInstancedGlb(await loadLikeGltfLoader(serializeGlb(json, bin))))
      .toBeNull()
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

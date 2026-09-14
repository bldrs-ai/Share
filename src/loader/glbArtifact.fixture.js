/* eslint-disable no-magic-numbers */
// Real Bldrs GLB artifact bytes for tests: the batched-native layout the cache
// writer produces today, and the merged layout it falls back to.
//
// Shared by the suites that need actual bytes rather than a hand-rolled
// userData stub: `glbBatchedRoundTrip.test.js` (writer → GLTFLoader → hydrate
// parity) and `Loader.userOpenedArtifact.test.js` (the same bytes arriving
// through `load()` as a file the user opened — #1844). One builder, so the
// second suite cannot drift into testing a shape the writer never emits.
import {BatchedMesh, BufferAttribute, BufferGeometry, Matrix4} from 'three'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  buildInstanceTablesExtensionData,
} from './bldrsInstanceTables'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {injectGlbExtensions, serializeGlb} from './injectGlbExtensions'


const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/** @return {BufferGeometry} one-triangle indexed geometry */
export function triangleGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * A decorated batched model as `assembleBatchedModel` leaves it: a shared
 * part instanced twice plus a second part, colorless (palette-eligible),
 * already palette-painted in `instanceColors` with the grey preserved in
 * `instanceSourceColors`.
 *
 * @return {object} model double
 */
export function liveBatchedModel() {
  // A REAL BatchedMesh: since Share#1810 the writer reads each shape back out
  // of the batch buffers rather than from a retained per-instance table, so
  // the geometry has to actually be in the batch.
  const mesh = new BatchedMesh(3, 6, 6)
  const sharedId = mesh.addGeometry(triangleGeometry())
  const otherId = mesh.addGeometry(triangleGeometry())
  const matrices = [
    new Matrix4().makeTranslation(1, 0, 0),
    new Matrix4().makeTranslation(2, 0, 0),
    new Matrix4().makeTranslation(0, 3, 0),
  ]
  for (const [i, geometryId] of [sharedId, sharedId, otherId].entries()) {
    mesh.setMatrixAt(mesh.addInstance(geometryId), matrices[i])
  }
  mesh.instanceParents = [11, 12, 20]
  mesh.instanceOccurrenceIds = [0, 1, 2]
  mesh.instanceGeometryIds = [500, 500, 600]
  mesh.instanceOccurrencePaths = [[3, 7], [3, 8], [4]]
  mesh.instanceSourceColors = [{...GREY}, {...GREY}, {...GREY}]
  // What the live scene shows after the palette ran — must NOT be what
  // gets baked.
  mesh.instanceColors = [
    {x: 0.306, y: 0.475, z: 0.655, w: 1},
    {x: 0.306, y: 0.475, z: 0.655, w: 1},
    {x: 0.949, y: 0.557, z: 0.169, w: 1},
  ]
  return mesh
}


/**
 * Serialize + inject the instance tables the way `exportAndCacheGlb` does.
 *
 * The result is one standalone GLB, not a Bldrs container — which is exactly
 * the shape the Export tab hands the user (`export/pro/glbExport.js` exports
 * the container's chunk 0), and therefore the shape #1844's read path sees.
 *
 * @param {object} model live batched model
 * @param {object} [opts]
 * @param {object} [opts.sceneExtras] the `scenes[0].extras` map the writer
 *   stamps in the same inject pass (title, applied coordination frame). Null
 *   for the table-only cases, which is what the writer passes when neither
 *   exists.
 * @param {function(object): object} [opts.mutatePayload] rewrite the
 *   extension payload before it is injected — how a suite fabricates an
 *   artifact from a different Share build (a schema version this reader
 *   rejects).
 * @return {Promise<Uint8Array>} the artifact bytes
 */
export async function batchedArtifactBytes(model, opts = {}) {
  const written = await exportBatchedModelAsInstancedGlb(model)
  if (!written) {
    throw new Error('batchedArtifactBytes: the writer declined this model')
  }
  const payload = buildInstanceTablesExtensionData(written.tableNodes)
  const {bytes} = injectGlbExtensions(written.bytes, [{
    name: BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
    data: opts.mutatePayload ? opts.mutatePayload(payload) : payload,
    compress: true,
  }], opts.sceneExtras ?? null, null)
  return bytes
}


// A hand-assembled merged-layout GLB. The batched writer above can produce
// its own bytes through `exportBatchedModelAsInstancedGlb` (gltf-transform,
// pure JS), but the MERGED writer goes through three's `GLTFExporter`, whose
// binary path calls `FileReader.readAsArrayBuffer` on a Blob and throws under
// jsdom — which is why `glbExport.test.js` mocks the exporter outright. So the
// merged artifact is written here directly against the same `serializeGlb`
// the injector uses, with the attribute names three's exporter would have
// produced (`_EXPRESSID` / `_INSTANCEID`: a custom attribute gets a `_`
// prefix and is uppercased on write, and GLTFLoader lowercases it back to
// `_expressid` on read, where `Loader.js#convertToShareModel` renames it).
const GLTF_FLOAT = 5126
const GLTF_UNSIGNED_INT = 5125
const GLTF_ARRAY_BUFFER = 34962
const GLTF_ELEMENT_ARRAY_BUFFER = 34963
const FLOATS_PER_POSITION = 3
// Two spatially separated triangles, one per element.
const POSITIONS = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  8, 0, 0, 9, 0, 0, 8, 1, 0,
])
const EXPRESS_IDS = new Uint32Array([100, 100, 100, 200, 200, 200])
const INSTANCE_IDS = new Uint32Array([0, 0, 0, 1, 1, 1])
const INDICES = new Uint32Array([0, 1, 2, 3, 4, 5])
const VERTEX_COUNT = EXPRESS_IDS.length


/**
 * One merged-layout GLB: a single indexed mesh, optionally carrying the
 * per-vertex element identity a Bldrs artifact bakes in.
 *
 * `withElementIds: false` is the third-party / plain-GLB control — the same
 * geometry with nothing of ours in it, so a test can tell "the artifact was
 * recognised" apart from "any GLB gets this treatment".
 *
 * @param {object} [opts]
 * @param {boolean} [opts.withElementIds] include `_EXPRESSID`/`_INSTANCEID`
 * @return {Uint8Array} the GLB bytes
 */
export function mergedGlbBytes({withElementIds = true} = {}) {
  const parts = [POSITIONS, INDICES]
  if (withElementIds) {
    parts.splice(1, 0, EXPRESS_IDS, INSTANCE_IDS)
  }
  const bin = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  const bufferViews = []
  let offset = 0
  for (const part of parts) {
    bin.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset)
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: part.byteLength,
      target: part === INDICES ? GLTF_ELEMENT_ARRAY_BUFFER : GLTF_ARRAY_BUFFER,
    })
    offset += part.byteLength
  }

  // POSITION's min/max are REQUIRED by the spec and by three's loader-side
  // bounding-box work; the id accessors need neither.
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < VERTEX_COUNT; v++) {
    for (let c = 0; c < FLOATS_PER_POSITION; c++) {
      const value = POSITIONS[(v * FLOATS_PER_POSITION) + c]
      min[c] = Math.min(min[c], value)
      max[c] = Math.max(max[c], value)
    }
  }

  const accessors = [
    {bufferView: 0, componentType: GLTF_FLOAT, count: VERTEX_COUNT, type: 'VEC3', min, max},
  ]
  const attributes = {POSITION: 0}
  if (withElementIds) {
    accessors.push(
      {bufferView: 1, componentType: GLTF_UNSIGNED_INT, count: VERTEX_COUNT, type: 'SCALAR'},
      {bufferView: 2, componentType: GLTF_UNSIGNED_INT, count: VERTEX_COUNT, type: 'SCALAR'})
    attributes._EXPRESSID = 1
    attributes._INSTANCEID = 2
  }
  const indicesAccessor = accessors.length
  accessors.push({
    bufferView: bufferViews.length - 1,
    componentType: GLTF_UNSIGNED_INT,
    count: INDICES.length,
    type: 'SCALAR',
  })

  return serializeGlb({
    asset: {version: '2.0', generator: 'batchedArtifact.fixture'},
    scene: 0,
    scenes: [{nodes: [0]}],
    // A container node above the mesh, as the writer's Group-rooted models
    // produce. It is load-bearing for this fixture rather than decoration:
    // `readModel` hoists `children[0].geometry` onto the scene root when the
    // root has none, and `convertToShareModel`'s decoration walk then visits
    // that one geometry twice — promoting `_expressid` on the first visit and
    // stamping its synthetic placeholder over the result on the second.
    nodes: [{children: [1], name: 'Model'}, {mesh: 0, name: 'Part'}],
    meshes: [{primitives: [{attributes, indices: indicesAccessor}]}],
    accessors,
    bufferViews,
    buffers: [{byteLength: bin.byteLength}],
  }, bin)
}


/** @return {number} vertices per merged fixture mesh, for count assertions */
export function mergedVertexCount() {
  return VERTEX_COUNT
}


/** @return {number[]} the element ids the merged fixture bakes in */
export function mergedElementIds() {
  return [EXPRESS_IDS[0], EXPRESS_IDS[EXPRESS_IDS.length - 1]]
}

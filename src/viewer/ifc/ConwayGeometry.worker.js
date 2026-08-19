// One shard of a model's geometry, extracted off the main thread.
//
// M3 item 4/5 (conway#394). Each worker holds its OWN conway instance, its
// own wasm heap and its own driver, and pumps a DISJOINT subset of the
// model's products. That is the parallelism axis the epic measured at 2.59x
// on PSB — not pthreads inside one instance, which shares a heap and a
// serial JS driver and nets zero (conway-geom#148).
//
// **Why the worker sends payloads, not handles.** The scene is built on the
// main thread by `incrementalBatchedBuilder`, which resolves each placement's
// vertices through `GetGeometry`. Those live in THIS worker's wasm heap and
// no other thread can read them, so the worker copies each new geometry out
// and transfers the buffers. `workerGeometryApi` re-serves them main-side
// through the same four-method surface the builder already expects, so the
// builder is untouched and one code path assembles both the worker and
// non-worker loads.
//
// **Why it reads the source through a File.** OPFS `createSyncAccessHandle`
// is exclusive per file, so N workers cannot each hold one. They do not need
// to: `makeBlobByteStore` reads through `blob.slice().arrayBuffer()`, and a
// `File` is structured-cloneable, so the main thread posts the same handle to
// every worker and each reads it independently. (This is what dissolved the
// blocker recorded as B4 on conway#394.)
import {IfcAPI} from 'web-ifc'

import {makeBlobByteStore} from '../../loader/opfsSourceByteStore'
import {forEachVectorItem} from './conwayVector'


/* Column-major mat4 elements per placement. */
const MATRIX_ELEMENTS = 16

/* eslint-disable-next-line no-magic-numbers */
const BYTES_PER_MB = 1024 * 1024

/* Interleaved floats per vertex (position + normal) — must match the
 * builder's VERT_STRIDE, since the builder divides by it to recover the
 * vertex count from the size this worker reports. */
const VERT_STRIDE = 6

let api = null
let modelID = -1
let shardLabel = 'unsharded'
let shardIndex = 0

/* geometryExpressIDs this worker has already transferred. A geometry is
 * copied out once and cached main-side by the same key, so re-sending it on
 * a later batch would be pure bandwidth. Shards can still each send the same
 * geometry — placement keeps that rare rather than impossible — and the main
 * side keeps whichever arrived first. */
const sentGeometries = new Set()


/**
 * Post a failure and leave the worker idle rather than dead, so the pool can
 * report which shard failed and fall back for the whole load.
 *
 * @param {Error|string} error what went wrong
 */
function postFailure(error) {
  self.postMessage({
    type: 'error',
    shard: shardLabel,
    shardIndex,
    message: error instanceof Error ? error.message : String(error),
  })
}


/**
 * Copy one geometry out of the wasm heap, or null when the shape is
 * degenerate.
 *
 * Mirrors `incrementalBatchedBuilder.resolveGeometry_`'s rejection rules
 * exactly — a zero-length or mis-strided shape is dropped HERE so the two
 * paths agree on which placements are skipped, rather than the worker
 * shipping a shape the builder would then reject.
 *
 * The arrays are copies, not views: `GetVertexArray` hands back a view into
 * the wasm heap, which the next extraction can grow (detaching it) and which
 * cannot be transferred anyway.
 *
 * @param {number} geometryExpressID conway geometry id
 * @return {?object} `{id, vertices, indices, vertCount}`
 */
function copyGeometry(geometryExpressID) {
  // eslint-disable-next-line new-cap
  const geom = api.GetGeometry(modelID, geometryExpressID)
  if (!geom) {
    return null
  }
  // eslint-disable-next-line new-cap
  const indexSize = geom.GetIndexDataSize()
  // eslint-disable-next-line new-cap
  const vertSize = geom.GetVertexDataSize()
  if (indexSize === 0 || vertSize === 0 || vertSize % VERT_STRIDE !== 0) {
    return null
  }
  // eslint-disable-next-line new-cap
  const rawVerts = api.GetVertexArray(geom.GetVertexData(), vertSize)
  // eslint-disable-next-line new-cap
  const rawIndices = api.GetIndexArray(geom.GetIndexData(), indexSize)
  return {
    id: geometryExpressID,
    vertices: new Float32Array(rawVerts),
    indices: new Uint32Array(rawIndices),
    vertCount: (vertSize / VERT_STRIDE) | 0,
  }
}


/**
 * Flatten one pump delta into transferable columns.
 *
 * Columns rather than an object per placement: PSB delivers ~23 000 of them,
 * and a structured clone of that many small objects is the kind of cost that
 * eats the parallelism this whole path exists to buy.
 *
 * @param {Array} flatMeshes the batch conway emitted
 * @return {object} `{placements, geometries}` plus the buffers to transfer
 */
function encodeBatch(flatMeshes) {
  const parents = []
  const geometryIds = []
  const transforms = []
  const colors = []
  const geometries = []

  for (const flatMesh of flatMeshes) {
    const parentExpressID = flatMesh?.expressID
    if (parentExpressID === undefined || !flatMesh.geometries) {
      continue
    }
    forEachVectorItem(flatMesh.geometries, (placed) => {
      const geometryExpressID = placed?.geometryExpressID
      if (geometryExpressID === undefined) {
        return
      }
      if (!sentGeometries.has(geometryExpressID)) {
        const copied = copyGeometry(geometryExpressID)
        // A degenerate shape is recorded as sent anyway: re-copying it on
        // every later placement that references it would repeat the same
        // rejection for nothing.
        sentGeometries.add(geometryExpressID)
        if (copied !== null) {
          geometries.push(copied)
        }
      }
      parents.push(parentExpressID)
      geometryIds.push(geometryExpressID)
      for (let where = 0; where < MATRIX_ELEMENTS; ++where) {
        transforms.push(placed.flatTransformation[where])
      }
      const color = placed.color
      colors.push(color?.x ?? 0, color?.y ?? 0, color?.z ?? 0, color?.w ?? 1)
    })
  }

  return {
    placements: {
      parents: Uint32Array.from(parents),
      geometryIds: Uint32Array.from(geometryIds),
      transforms: Float64Array.from(transforms),
      colors: Float32Array.from(colors),
    },
    geometries,
  }
}


/**
 * Tell conway it is on the web, because inside a Worker it cannot tell.
 *
 * conway picks its wasm build with
 * `process.env.PLATFORM === 'web' || (window && window.document)`
 * (`conway_geometry.js#isWebPlatform`). A Worker has no `window` AND no
 * `process`, so BOTH arms are false, conway concludes Node, and `Init()`
 * dies on `Dynamic require of "../Dist/ConwayGeomWasmNode.js"`. The main
 * thread never hits it because `window` is there.
 *
 * Not a build-config fix: `PLATFORM` is defined for dev/prod/cypress but the
 * first arm is guarded by `typeof process !== 'undefined'`, which no esbuild
 * define supplies — so a prod worker bundle fails the same way a playwright
 * one does.
 *
 * Remove this once conway recognises a `WorkerGlobalScope` (bldrs-ai/conway#540).
 */
function declareWebPlatform() {
  if (typeof globalThis.window !== 'undefined') {
    return
  }
  const existing = globalThis.process
  globalThis.process = {
    ...existing,
    env: {...existing?.env, PLATFORM: 'web'},
  }
}


/**
 * Open the model and pump this worker's shard to completion.
 *
 * @param {object} request the `load` message
 */
async function run(request) {
  const {file, settings, shard, coordination, batchSize} = request
  shardLabel = shard ? `${shard.index}/${shard.count}` : 'unsharded'
  shardIndex = shard?.index ?? 0

  declareWebPlatform()

  api = new IfcAPI()
  if (typeof api.SetWasmPath === 'function') {
    // eslint-disable-next-line new-cap
    api.SetWasmPath(request.wasmPath)
  }
  // eslint-disable-next-line new-cap
  await api.Init()

  // eslint-disable-next-line new-cap
  modelID = await api.OpenModelStream(makeBlobByteStore(file), settings)
  if (typeof modelID !== 'number' || modelID < 0) {
    throw new Error(`OpenModelStream returned ${modelID}`)
  }

  // Order matters and is enforced engine-side: a COORDINATE_TO_ORIGIN model
  // refuses a shard claim until it has been given a frame, because each
  // worker would otherwise derive its own recentre anchor from whichever
  // product it extracted first and the shards would merge shifted by whole
  // grid cells (conway#538).
  if (coordination && typeof api.SetCoordinationFrame === 'function') {
    // eslint-disable-next-line new-cap
    api.SetCoordinationFrame(modelID, coordination)
  }
  if (shard && shard.count > 1 && typeof api.SetGeometryShard === 'function') {
    // eslint-disable-next-line new-cap
    api.SetGeometryShard(modelID, shard)
  }

  self.postMessage({type: 'opened', shard: shardLabel, shardIndex})

  let meshes = 0
  for (;;) {
    const batch = []
    // eslint-disable-next-line new-cap
    const {extracted, remaining} = await api.ExtractGeometryBatchAsync(
      modelID, batchSize, (flatMesh) => batch.push(flatMesh))

    if (batch.length > 0) {
      const encoded = encodeBatch(batch)
      meshes += encoded.placements.parents.length
      const transfer = [
        encoded.placements.parents.buffer,
        encoded.placements.geometryIds.buffer,
        encoded.placements.transforms.buffer,
        encoded.placements.colors.buffer,
      ]
      for (const geometry of encoded.geometries) {
        transfer.push(geometry.vertices.buffer, geometry.indices.buffer)
      }
      self.postMessage({
        type: 'batch',
        shard: shardLabel,
        shardIndex,
        placements: encoded.placements,
        geometries: encoded.geometries,
        extracted,
        remaining,
      }, transfer)
    }

    if (remaining === 0 && extracted === 0) {
      break
    }
  }

  self.postMessage({
    type: 'done',
    shard: shardLabel,
    shardIndex,
    placements: meshes,
    geometries: sentGeometries.size,
    ...workerMemory(),
  })
}


/**
 * This worker's own memory, for the load report.
 *
 * Without it the report is actively flattering under a pool: its heap figures
 * come from `performance.memory` on the MAIN thread, and moving extraction
 * into workers moves the geometry allocations — JS heap and wasm heap both —
 * somewhere that sample cannot see. The Geometry line would show a large
 * improvement while real process memory went UP by N wasm heaps.
 *
 * `HEAPU8.byteLength` can lag the real heap by one growth step (conway#485),
 * so this is a floor rather than a high-water mark. It is reported as a
 * separate line rather than folded into the report's heap column, because
 * summing a main-thread sample with N worker samples would invent a number
 * neither engine measured.
 *
 * @return {object} `{wasmHeapMb, jsHeapMb}`, either possibly undefined
 */
function workerMemory() {
  const wasmBytes = api?.wasmModule?.HEAPU8?.byteLength
  const jsBytes = typeof performance !== 'undefined' ?
    performance.memory?.usedJSHeapSize : undefined
  return {
    wasmHeapMb: Number.isFinite(wasmBytes) ? wasmBytes / BYTES_PER_MB : undefined,
    jsHeapMb: Number.isFinite(jsBytes) ? jsBytes / BYTES_PER_MB : undefined,
  }
}


self.addEventListener('message', (event) => {
  const request = event.data
  if (!request || request.type !== 'load') {
    return
  }
  run(request).catch(postFailure)
})

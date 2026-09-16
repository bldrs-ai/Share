#!/usr/bin/env node
/**
 * Exhaustive byte budget for a GLB (or a Bldrs `.container`).
 *
 * Built for #1831's sizing question: on a large instanced model the file's
 * cost is STRUCTURE, not geometry, and the two candidate levers attack
 * different halves of it — #1857 quantizes/compresses the
 * `EXT_mesh_gpu_instancing` transforms, #1854 slims the JSON chunk. Nothing
 * existed that split the measured "container" figure between those two, so
 * the choice was being made by estimate. This prints the split instead.
 *
 * ## The partition contract
 *
 * Every byte of the input file lands in exactly ONE bucket, and the tool
 * checks it: `accounted + unaccounted === fileBytes`, with `unaccounted`
 * printed rather than swallowed. Two things make that harder than "sum the
 * bufferView byteLengths", and both are real in the wild:
 *
 * 1. **bufferViews are not a partition of the BIN chunk.** They may alias
 *    (two views over one range), interleave, leave gaps, or be orphaned.
 *    Summing byteLengths therefore double-counts or under-counts. So the
 *    BIN chunk is partitioned by an interval SWEEP over byte ranges: each
 *    elementary segment is awarded to the highest-priority owner covering
 *    it, contested segments are reported in `flags.overlaps`, and segments
 *    no view covers become `bin.uncovered` — a real number for files with
 *    dropped views, not an error.
 * 2. **A bufferView can be reachable from more than one owner** (a payload
 *    that is also an image; a view shared by two primitives). Ownership is
 *    resolved once, by the priority in `RANK`, and every multi-claim view
 *    is listed in `flags.sharedBufferViews`.
 *
 * ## Why this file re-reads the GLB chunk headers
 *
 * `src/loader/glbContainer.js` imports cleanly under plain Node (the root
 * package.json is `"type": "module"` and the module is dependency-free), so
 * the BLDR container header is read with the real reader rather than a
 * copy. `src/loader/injectGlbExtensions.js#parseGlb` is NOT reused: it
 * discards exactly what a byte budget is about (chunk offsets, chunk
 * padding, trailing bytes) and pulls in pako. The GLB chunk walk below is
 * therefore local, and deliberately tolerant — it reports a malformed tail
 * as `unaccounted` instead of throwing.
 *
 * Usage:
 *   node tools/glb/byteBudget.mjs <file.glb|file.container> [--json]
 *
 * @see design/new/glb-export-premium.md
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'
import {brotliCompressSync, gzipSync} from 'node:zlib'
import {isBldrsGlbContainer, readGlbContainerHeader, viewGlbContainerChunks} from '../../src/loader/glbContainer.js'


const GLB_MAGIC = 0x46546C67 // "glTF" LE
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON" LE
const BIN_CHUNK_TYPE = 0x004E4942 // "BIN\0" LE
// The GLB spec pads the JSON chunk with 0x20; writers in the wild also use
// NUL, and a pretty-printing writer leaves a trailing newline. All of it is
// structure rather than JSON, and is trimmed in the byte domain (not after
// decoding) so `json.chunk` is an exact on-disk length.
const PAD_SPACE = 0x20
const PAD_TAB = 0x09
const PAD_LF = 0x0A
const PAD_CR = 0x0D
const PAD_NUL = 0x00
const JSON_PAD_BYTES = new Set([PAD_SPACE, PAD_TAB, PAD_LF, PAD_CR, PAD_NUL])
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const CONTAINER_CHUNK_HEADER_BYTES = 4
const PERCENT = 100
const HEX_RADIX = 16
const DRACO_EXTENSION = 'KHR_draco_mesh_compression'
const MESHOPT_EXTENSION = 'EXT_meshopt_compression'
const INSTANCING_EXTENSION = 'EXT_mesh_gpu_instancing'

/**
 * Owner priority for a bufferView, and for a byte claimed twice. Lower
 * wins. The order encodes "which answer is more useful when a byte is
 * claimed twice": a payload a named extension owns is more informative
 * than the generic accessor role that also reaches it, and `unreferenced`
 * is last because it is a fallback, not a claim.
 */
const RANK = {
  extension: 10,
  instancing: 20,
  draco: 30,
  meshopt: 40,
  meshoptFallback: 45,
  indices: 50,
  position: 60,
  normal: 70,
  attribute: 80,
  image: 90,
  inverseBindMatrices: 100,
  animation: 110,
  sparse: 120,
  accessorOther: 130,
  unreferenced: 200,
}

/** Buckets whose sum is the "geometry" side of the headline comparison. */
const GEOMETRY_BUCKET_PREFIXES = ['bin.geometry.', 'bin.draco', 'bin.meshopt']
const INSTANCING_BUCKET_PREFIX = 'bin.instancing.'

/** Bytes per glTF `componentType`. */
const COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
/** Components per glTF accessor `type`. */
const TYPE_COMPONENTS = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16}

/**
 * Attribution happens at ACCESSOR granularity, not bufferView granularity,
 * and this is the reason the tool exists in the shape it does: Share's
 * batched writer (gltf-transform) packs a node's `EXT_mesh_gpu_instancing`
 * TRANSLATION, ROTATION and SCALE accessors into ONE bufferView, and packs
 * POSITION and NORMAL into another. Attributing by view would hand the
 * whole instancing view to TRANSLATION and report ROTATION and SCALE as
 * zero — the exact split #1857 needs, silently wrong.
 *
 * So each accessor's own sub-range is scored at `rank * RANK_SCALE`, and
 * the bufferView gets a "backdrop" interval at `rank * RANK_SCALE + 1`
 * that catches whatever the accessors leave over (alignment slack,
 * interleave gaps, views no accessor reaches). Owner priority still
 * dominates, because it is multiplied; accessor-over-backdrop only breaks
 * ties within one owner.
 */
const RANK_SCALE = 2
const BACKDROP_RANK_BUMP = 1


/**
 * @param {string} s
 * @return {number} UTF-8 length
 */
function byteLen(s) {
  return Buffer.byteLength(s, 'utf8')
}


/**
 * Walk a GLB's chunk table without parsing or validating its contents.
 *
 * Offsets are relative to `bytes`, so the caller can attribute chunk
 * padding and any trailing slack. A GLB that is short, mis-magicked or
 * truncated yields `ok: false` plus whatever was readable — the budget
 * still has to account for those bytes.
 *
 * @param {Uint8Array} bytes
 * @return {object} `{ok, error, version, declaredLength, chunks}`, where each
 *   chunk is `{type, dataOffset, dataLength}`
 */
export function scanGlbChunks(bytes) {
  const empty = {ok: false, error: null, version: 0, declaredLength: 0, chunks: []}
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    return {...empty, error: `too short (${bytes.byteLength}B)`}
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = dv.getUint32(0, true)
  if (magic !== GLB_MAGIC) {
    return {...empty, error: `bad magic 0x${magic.toString(HEX_RADIX)}`}
  }
  const version = dv.getUint32(4, true)
  const declaredLength = Math.min(dv.getUint32(8, true), bytes.byteLength)
  const chunks = []
  let offset = GLB_HEADER_BYTES
  let error = null
  while (offset + CHUNK_HEADER_BYTES <= declaredLength) {
    const dataLength = dv.getUint32(offset, true)
    const type = dv.getUint32(offset + 4, true)
    const dataOffset = offset + CHUNK_HEADER_BYTES
    if (dataOffset + dataLength > declaredLength) {
      error = `chunk at ${offset} overruns declared length`
      break
    }
    chunks.push({type, dataOffset, dataLength})
    offset = dataOffset + dataLength
  }
  return {ok: error === null && chunks.length > 0, error, version, declaredLength, chunks}
}


/**
 * Cost, in serialized JSON bytes, of `obj[key]` including its key, its
 * colon and the comma that disappears with it. That is what dropping the
 * field would actually save — the number #1854 is asking for.
 *
 * @param {object} obj
 * @param {string} key
 * @return {number}
 */
function fieldCost(obj, key) {
  if (!obj || typeof obj !== 'object' || !(key in obj) || obj[key] === undefined) {
    return 0
  }
  const COLON = 1
  const COMMA = Object.keys(obj).length > 1 ? 1 : 0
  return byteLen(JSON.stringify(key)) + COLON + byteLen(JSON.stringify(obj[key])) + COMMA
}


/**
 * @param {Array} list
 * @param {string} key
 * @return {number} summed `fieldCost` over a top-level array
 */
function fieldCostOver(list, key) {
  if (!Array.isArray(list)) {
    return 0
  }
  let total = 0
  for (const item of list) {
    total += fieldCost(item, key)
  }
  return total
}


/**
 * Break the JSON chunk down by top-level array, plus the two fields #1854
 * proposes to drop.
 *
 * Measured on a re-serialization of the parsed document, because a
 * subtree's "cost" is only well defined for canonical JSON.
 * `reserializedDelta` reports how far that is from the bytes actually in
 * the file (writer whitespace, key ordering), so the breakdown is never
 * silently passed off as the on-disk number.
 *
 * @param {object} json
 * @param {number} rawBytes on-disk JSON chunk data length, unpadded
 * @return {object}
 */
function jsonBreakdown(json, rawBytes) {
  const reserialized = JSON.stringify(json)
  const byKey = []
  let keyedBytes = 0
  for (const key of Object.keys(json)) {
    const COLON = 1
    const bytes = byteLen(JSON.stringify(key)) + COLON + byteLen(JSON.stringify(json[key]))
    keyedBytes += bytes
    byKey.push({key, bytes, count: Array.isArray(json[key]) ? json[key].length : null})
  }
  byKey.sort((a, b) => b.bytes - a.bytes)
  // Braces plus the separating commas: the only bytes of a canonical JSON
  // object that no top-level key owns. Keeps this breakdown exhaustive too.
  const punctuation = byteLen(reserialized) - keyedBytes
  return {
    rawBytes,
    reserializedBytes: byteLen(reserialized),
    reserializedDelta: byteLen(reserialized) - rawBytes,
    byTopLevelKey: byKey,
    punctuation,
    nodeNames: fieldCostOver(json.nodes, 'name'),
    meshNames: fieldCostOver(json.meshes, 'name'),
    materialNames: fieldCostOver(json.materials, 'name'),
    accessorMinMax: fieldCostOver(json.accessors, 'min') + fieldCostOver(json.accessors, 'max'),
  }
}


/**
 * Byte range an accessor occupies inside its bufferView, in buffer space.
 *
 * MAT2 / MAT3 accessors with 1- or 2-byte components have per-column
 * padding the spec defines separately; this formula under-reports those by
 * a few bytes per element, which then shows up honestly as `bin.uncovered`
 * or falls to the view's backdrop rather than silently vanishing.
 *
 * @param {object} json
 * @param {number} accessorIndex
 * @return {{viewIndex: number, buffer: number, start: number, length: number}|null}
 */
function accessorByteRange(json, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex]
  if (!accessor || typeof accessor.bufferView !== 'number') {
    return null
  }
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) {
    return null
  }
  const elementBytes = (COMPONENT_BYTES[accessor.componentType] ?? 0) * (TYPE_COMPONENTS[accessor.type] ?? 0)
  const count = accessor.count ?? 0
  if (elementBytes === 0 || count === 0) {
    return null
  }
  // A strided view interleaves attributes, so the accessor spans
  // (count - 1) strides plus one element, not count * elementBytes.
  const stride = view.byteStride ?? elementBytes
  return {
    viewIndex: accessor.bufferView,
    buffer: view.buffer ?? 0,
    start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    length: ((count - 1) * stride) + elementBytes,
  }
}


/**
 * Partition one stride period of an interleaved bufferView.
 *
 * Tiny sweep over `[0, periodBytes)`: each accessor's element slot wins its
 * own bytes, the best rank wins a contested byte, and whatever is left
 * (stride padding) goes to `backdropBucket`. The result covers the period
 * exactly, which is what lets the caller multiply it by a stride count.
 *
 * @param {Array<{offset: number, elementBytes: number, bucket: string, rank: number}>} live
 * @param {number} periodBytes
 * @param {string} backdropBucket
 * @return {{period: Array<{offset: number, length: number, bucket: string}>, contested: Array<object>}}
 */
function partitionPeriod(live, periodBytes, backdropBucket) {
  const marks = new Set([0, periodBytes])
  for (const a of live) {
    marks.add(Math.max(0, Math.min(a.offset, periodBytes)))
    marks.add(Math.max(0, Math.min(a.offset + a.elementBytes, periodBytes)))
  }
  const points = [...marks].sort((a, b) => a - b)
  const period = []
  const contested = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (end <= start) {
      continue
    }
    const covering = live.filter((a) => a.offset <= start && a.offset + a.elementBytes >= end)
    let bucket = backdropBucket
    if (covering.length > 0) {
      bucket = covering.reduce((a, b) => (b.rank < a.rank ? b : a)).bucket
      if (covering.length > 1) {
        contested.push({start, end, awardedTo: bucket, contenders: covering.map((a) => a.bucket)})
      }
    }
    // Merge with the previous run so the period stays as short as possible
    // — it is expanded once per stride when gathering bytes.
    const last = period[period.length - 1]
    if (last && last.bucket === bucket && last.offset + last.length === start) {
      last.length += end - start
    } else {
      period.push({offset: start, length: end - start, bucket})
    }
  }
  return {period, contested}
}


/**
 * Partition an INTERLEAVED bufferView (one with `byteStride`).
 *
 * An interleaved accessor's bytes are not a contiguous span: they are
 * `count` element slots, one per stride. Attributing the accessor's whole
 * span — first byte of element 0 to last byte of element n-1 — hands the
 * entire view to whichever attribute is declared first and reports the
 * others as zero. gltf-transform interleaves POSITION with NORMAL in
 * exactly this shape, so that error is not hypothetical.
 *
 * The periodic structure is exploited rather than expanded: one period
 * partition per distinct live-accessor set, multiplied by the number of
 * strides it applies to. Cost is independent of the vertex count.
 *
 * @param {object} view the bufferView
 * @param {Array<object>} viewAccessors `{offset, elementBytes, count, bucket, rank}`, offsets view-relative
 * @param {string} backdropBucket owner of the stride padding
 * @param {number} clippedLength view byteLength, already clipped into the BIN data
 * @return {{plan: object, buckets: Map<string, number>, contested: Array<object>}}
 */
function partitionStridedView(view, viewAccessors, backdropBucket, clippedLength) {
  const stride = view.byteStride
  const viewStart = view.byteOffset ?? 0
  const fullStrides = Math.floor(clippedLength / stride)
  const tail = clippedLength - (fullStrides * stride)
  const strideCount = fullStrides + (tail > 0 ? 1 : 0)

  // A run is a range of strides over which the set of live accessors (and
  // the period length) is constant. Accessors with a smaller `count` drop
  // out partway through, and a trailing partial stride is its own run.
  const marks = new Set([0, strideCount])
  for (const a of viewAccessors) {
    marks.add(Math.max(0, Math.min(a.count, strideCount)))
  }
  if (tail > 0) {
    marks.add(fullStrides)
  }
  const boundaries = [...marks].sort((a, b) => a - b)

  const buckets = new Map()
  const contested = []
  const runs = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const firstStride = boundaries[i]
    const runStrides = boundaries[i + 1] - firstStride
    if (runStrides <= 0) {
      continue
    }
    const live = viewAccessors.filter((a) => a.count > firstStride)
    const periodBytes = (tail > 0 && firstStride >= fullStrides) ? tail : stride
    const {period, contested: periodContested} = partitionPeriod(live, periodBytes, backdropBucket)
    for (const segment of period) {
      buckets.set(segment.bucket, (buckets.get(segment.bucket) ?? 0) + (segment.length * runStrides))
    }
    for (const c of periodContested) {
      contested.push({...c, bytes: (c.end - c.start) * runStrides, strides: runStrides})
    }
    runs.push({firstStride, strideCount: runStrides, period})
  }
  return {plan: {viewStart, stride, runs}, buckets, contested}
}


/**
 * Every claim on every accessor and bufferView, in one pass over the
 * document.
 *
 * A claim is kept per ACCESSOR wherever the reference goes through one, so
 * accessors that share a bufferView can still be told apart. Claims that
 * name a view directly (extension payloads, Draco streams, images) go in
 * `viewClaims`. Either may collect more than one claim; resolution happens
 * later so the multi-claim cases can be reported rather than silently
 * collapsed.
 *
 * @param {object} json
 * @return {object} `{accessorClaims, viewClaims, meshoptRanges, instanceCount,
 *   instancedNodes}` — the two claim maps are keyed by accessor and by view
 */
function collectClaims(json) {
  const viewClaims = new Map()
  const accessorClaims = new Map()
  /**
   * @param {number} viewIndex
   * @param {string} bucket
   * @param {number} rank
   * @param {string} via
   */
  const claim = (viewIndex, bucket, rank, via) => {
    if (typeof viewIndex !== 'number' || !json.bufferViews?.[viewIndex]) {
      return
    }
    const list = viewClaims.get(viewIndex) ?? []
    list.push({bucket, rank, via})
    viewClaims.set(viewIndex, list)
  }
  /**
   * @param {number} accessorIndex
   * @param {string} bucket
   * @param {number} rank
   * @param {string} via
   */
  const claimAccessor = (accessorIndex, bucket, rank, via) => {
    const accessor = json.accessors?.[accessorIndex]
    if (!accessor) {
      return
    }
    if (typeof accessor.bufferView === 'number') {
      const list = accessorClaims.get(accessorIndex) ?? []
      list.push({bucket, rank, via})
      accessorClaims.set(accessorIndex, list)
    }
    claim(accessor.sparse?.indices?.bufferView, 'bin.accessorSparse', RANK.sparse, `${via}.sparse.indices`)
    claim(accessor.sparse?.values?.bufferView, 'bin.accessorSparse', RANK.sparse, `${via}.sparse.values`)
  }

  // Top-level extension payloads — where every BLDRS_* table lives
  // (`injectGlbExtensions.js` writes `{compressed, bufferView}`).
  for (const [name, value] of Object.entries(json.extensions ?? {})) {
    if (value && typeof value.bufferView === 'number') {
      claim(value.bufferView, `bin.extension.${name}`, RANK.extension, `extensions.${name}`)
    }
  }

  let instanceCount = 0
  let instancedNodes = 0
  for (const [i, node] of (json.nodes ?? []).entries()) {
    const attributes = node?.extensions?.[INSTANCING_EXTENSION]?.attributes
    if (!attributes) {
      continue
    }
    instancedNodes++
    let nodeInstances = 0
    for (const [semantic, accessorIndex] of Object.entries(attributes)) {
      nodeInstances = Math.max(nodeInstances, json.accessors?.[accessorIndex]?.count ?? 0)
      claimAccessor(accessorIndex, `bin.instancing.${semantic}`, RANK.instancing, `nodes[${i}].${semantic}`)
    }
    instanceCount += nodeInstances
  }

  for (const [m, mesh] of (json.meshes ?? []).entries()) {
    for (const [p, prim] of (mesh?.primitives ?? []).entries()) {
      const where = `meshes[${m}].primitives[${p}]`
      const draco = prim?.extensions?.[DRACO_EXTENSION]
      if (draco && typeof draco.bufferView === 'number') {
        claim(draco.bufferView, 'bin.draco', RANK.draco, `${where}.${DRACO_EXTENSION}`)
      }
      if (typeof prim?.indices === 'number') {
        claimAccessor(prim.indices, 'bin.geometry.indices', RANK.indices, `${where}.indices`)
      }
      for (const [semantic, accessorIndex] of Object.entries(prim?.attributes ?? {})) {
        let bucket = `bin.geometry.other.${semantic}`
        let rank = RANK.attribute
        if (semantic === 'POSITION') {
          bucket = 'bin.geometry.POSITION'
          rank = RANK.position
        } else if (semantic === 'NORMAL') {
          bucket = 'bin.geometry.NORMAL'
          rank = RANK.normal
        }
        claimAccessor(accessorIndex, bucket, rank, `${where}.${semantic}`)
      }
      for (const [t, target] of (prim?.targets ?? []).entries()) {
        for (const [semantic, accessorIndex] of Object.entries(target ?? {})) {
          claimAccessor(accessorIndex, `bin.geometry.other.TARGET_${semantic}`, RANK.attribute,
            `${where}.targets[${t}].${semantic}`)
        }
      }
    }
  }

  for (const [i, image] of (json.images ?? []).entries()) {
    claim(image?.bufferView, 'bin.image', RANK.image, `images[${i}]`)
  }
  for (const [i, skin] of (json.skins ?? []).entries()) {
    claimAccessor(skin?.inverseBindMatrices, 'bin.inverseBindMatrices', RANK.inverseBindMatrices, `skins[${i}]`)
  }
  for (const [a, animation] of (json.animations ?? []).entries()) {
    for (const [s, sampler] of (animation?.samplers ?? []).entries()) {
      claimAccessor(sampler?.input, 'bin.animation', RANK.animation, `animations[${a}].samplers[${s}].input`)
      claimAccessor(sampler?.output, 'bin.animation', RANK.animation, `animations[${a}].samplers[${s}].output`)
    }
  }
  // Accessors nothing above reached still own real bytes (a loader may find
  // them through an extension this tool does not model). Claimed last, so
  // they never outrank a named owner.
  for (const [i, accessor] of (json.accessors ?? []).entries()) {
    if (typeof accessor?.bufferView === 'number' && !accessorClaims.has(i)) {
      claimAccessor(i, 'bin.accessorOther', RANK.accessorOther, `accessors[${i}]`)
    }
  }

  // EXT_meshopt_compression inverts the usual indirection: the bufferView's
  // own range addresses the (possibly zero-filled) FALLBACK buffer, while
  // the bytes actually in the file are the extension's own range. Both are
  // recorded; `binPartition` decides which of them lands in this file.
  const meshoptRanges = []
  for (const [i, view] of (json.bufferViews ?? []).entries()) {
    const ext = view?.extensions?.[MESHOPT_EXTENSION]
    if (ext) {
      meshoptRanges.push({
        viewIndex: i,
        buffer: ext.buffer ?? 0,
        byteOffset: ext.byteOffset ?? 0,
        byteLength: ext.byteLength ?? 0,
      })
    }
  }

  return {accessorClaims, viewClaims, meshoptRanges, instanceCount, instancedNodes}
}


/**
 * Resolve one bufferView's owner from its claims. Lowest rank wins; ties
 * keep the first claim, so the result is order-stable across runs.
 *
 * @param {Array<{bucket: string, rank: number, via: string}>} list
 * @return {{bucket: string, rank: number, via: string}}
 */
function resolveClaim(list) {
  let best = list[0]
  for (const candidate of list) {
    if (candidate.rank < best.rank) {
      best = candidate
    }
  }
  return best
}


/**
 * Partition the BIN chunk's data bytes among bufferView owners.
 *
 * The sweep is the whole point: bufferViews can alias and can leave holes,
 * so the only way to get a partition (rather than a sum that disagrees
 * with the file) is to award each elementary byte segment to exactly one
 * owner.
 *
 * @param {object} json
 * @param {number} binDataLength authoritative BIN data length, unpadded
 * @return {object} `{buckets, segments, stridedPlans, shared, overlaps, outOfRange,
 *   uncovered, instanceCount, instancedNodes}`
 */
function binPartition(json, binDataLength) {
  const {accessorClaims, viewClaims, meshoptRanges, instanceCount, instancedNodes} = collectClaims(json)
  const meshoptByView = new Map(meshoptRanges.map((r) => [r.viewIndex, r]))
  const fallbackBuffers = new Set()
  for (const [i, buffer] of (json.buffers ?? []).entries()) {
    if (buffer?.extensions?.[MESHOPT_EXTENSION]?.fallback) {
      fallbackBuffers.add(i)
    }
  }

  const intervals = []
  const outOfRange = []
  const overlaps = []
  // Interleaved views are partitioned periodically instead of by the sweep
  // (see `partitionStridedView`); the sweep only learns that their byte
  // range is already spoken for, via a sentinel interval.
  const stridedPlans = []
  const stridedBuckets = new Map()
  const stridedRanges = []
  let sequence = 0
  /**
   * @param {object} spec `{buffer, start, length, bucket, rank, viewIndex, backdrop}`
   */
  const addInterval = ({buffer, start, length, bucket, rank, viewIndex, backdrop = false}) => {
    if (length <= 0) {
      return
    }
    // Only buffer 0 is the GLB BIN chunk; any other buffer is external to
    // this file and contributes none of its bytes.
    if (buffer !== 0) {
      outOfRange.push({viewIndex, bucket, buffer, reason: 'external buffer'})
      return
    }
    const end = start + length
    if (start < 0 || end > binDataLength) {
      outOfRange.push({viewIndex, bucket, byteOffset: start, byteLength: length, reason: 'outside BIN data'})
    }
    const clippedStart = Math.max(0, Math.min(start, binDataLength))
    const clippedEnd = Math.max(0, Math.min(end, binDataLength))
    if (clippedEnd > clippedStart) {
      intervals.push({start: clippedStart, end: clippedEnd, bucket, rank, viewIndex, backdrop, sequence: sequence++})
    }
  }

  // Index the accessor claims by the view they land in, so each view can be
  // handed both its own claims and the accessors that sub-range it.
  const accessorsByView = new Map()
  const accessorRanges = new Map()
  for (const accessorIndex of accessorClaims.keys()) {
    const range = accessorByteRange(json, accessorIndex)
    if (!range) {
      continue
    }
    accessorRanges.set(accessorIndex, range)
    const list = accessorsByView.get(range.viewIndex) ?? []
    list.push(accessorIndex)
    accessorsByView.set(range.viewIndex, list)
  }

  const shared = []
  for (const [i, view] of (json.bufferViews ?? []).entries()) {
    const direct = viewClaims.get(i) ?? []
    const accessorIndices = accessorsByView.get(i) ?? []
    const allClaims = [...direct]
    for (const accessorIndex of accessorIndices) {
      allClaims.push(...accessorClaims.get(accessorIndex))
    }
    const owner = allClaims.length > 0 ?
      resolveClaim(allClaims) :
      {bucket: 'bin.unreferencedView', rank: RANK.unreferenced, via: 'none'}
    if (allClaims.length > 1) {
      shared.push({
        viewIndex: i,
        byteLength: view.byteLength ?? 0,
        countedAs: owner.bucket,
        splitAcrossAccessors: accessorIndices.length > 1,
        claims: allClaims.map((c) => `${c.bucket} <- ${c.via}`),
        crossOwner: new Set(allClaims.map((c) => c.bucket)).size > 1,
      })
    }

    const meshopt = meshoptByView.get(i)
    if (meshopt) {
      // The bytes in THIS file are the extension's range; the view's own
      // range addresses decoded space in the fallback buffer. Accessors
      // into a meshopt view therefore describe no file bytes at all, so
      // they are deliberately skipped here.
      addInterval({
        buffer: meshopt.buffer, start: meshopt.byteOffset, length: meshopt.byteLength,
        bucket: 'bin.meshopt', rank: RANK.meshopt * RANK_SCALE, viewIndex: i,
      })
      if (fallbackBuffers.has(view.buffer ?? 0)) {
        // A fallback buffer that IS the GLB BIN holds real (usually zero)
        // bytes of this file, and they still have to be accounted.
        addInterval({
          buffer: view.buffer ?? 0, start: view.byteOffset ?? 0, length: view.byteLength ?? 0,
          bucket: 'bin.meshoptFallback', rank: (RANK.meshoptFallback * RANK_SCALE) + BACKDROP_RANK_BUMP,
          viewIndex: i, backdrop: true,
        })
      }
      continue
    }

    if (typeof view.byteStride === 'number' && accessorIndices.length > 0 && (view.buffer ?? 0) === 0) {
      const viewStart = view.byteOffset ?? 0
      const clipped = Math.max(0, Math.min(viewStart + (view.byteLength ?? 0), binDataLength) - viewStart)
      if (clipped < (view.byteLength ?? 0)) {
        outOfRange.push({viewIndex: i, bucket: owner.bucket, reason: 'strided view truncated by BIN data end'})
      }
      const viewAccessors = accessorIndices.map((accessorIndex) => {
        const accessor = json.accessors[accessorIndex]
        const accessorOwner = resolveClaim(accessorClaims.get(accessorIndex))
        return {
          offset: accessor.byteOffset ?? 0,
          elementBytes: (COMPONENT_BYTES[accessor.componentType] ?? 0) * (TYPE_COMPONENTS[accessor.type] ?? 0),
          count: accessor.count ?? 0,
          bucket: accessorOwner.bucket,
          rank: accessorOwner.rank,
        }
      })
      const strided = partitionStridedView(view, viewAccessors, owner.bucket, clipped)
      stridedPlans.push(strided.plan)
      for (const [bucket, value] of strided.buckets) {
        stridedBuckets.set(bucket, (stridedBuckets.get(bucket) ?? 0) + value)
      }
      for (const c of strided.contested) {
        overlaps.push({
          start: viewStart,
          end: viewStart + clipped,
          bytes: c.bytes,
          awardedTo: c.awardedTo,
          contenders: c.contenders.map((b) => `bufferViews[${i}] ${b}`),
          interleaved: true,
        })
      }
      stridedRanges.push({start: viewStart, end: viewStart + clipped, viewIndex: i})
      continue
    }

    for (const accessorIndex of accessorIndices) {
      const range = accessorRanges.get(accessorIndex)
      const accessorOwner = resolveClaim(accessorClaims.get(accessorIndex))
      addInterval({
        buffer: range.buffer, start: range.start, length: range.length,
        bucket: accessorOwner.bucket, rank: accessorOwner.rank * RANK_SCALE, viewIndex: i,
      })
    }
    // The backdrop catches everything the accessors left over — alignment
    // slack, interleave gaps, and whole views no accessor reaches.
    addInterval({
      buffer: view.buffer ?? 0, start: view.byteOffset ?? 0, length: view.byteLength ?? 0,
      bucket: owner.bucket, rank: (owner.rank * RANK_SCALE) + BACKDROP_RANK_BUMP, viewIndex: i, backdrop: true,
    })
  }

  // Sweep: one segment per elementary interval between boundaries, awarded
  // to the best-ranked interval covering it.
  const eventsAt = new Map()
  /**
   * @param {number} at
   * @param {boolean} add
   * @param {object} interval
   */
  const pushEvent = (at, add, interval) => {
    const list = eventsAt.get(at) ?? []
    list.push({add, interval})
    eventsAt.set(at, list)
  }
  for (const interval of intervals) {
    pushEvent(interval.start, true, interval)
    pushEvent(interval.end, false, interval)
  }
  for (const range of stridedRanges) {
    const sentinel = {
      start: range.start, end: range.end, bucket: 'bin.interleaved',
      rank: -1, viewIndex: range.viewIndex, backdrop: true, stridedSentinel: true, sequence: sequence++,
    }
    pushEvent(sentinel.start, true, sentinel)
    pushEvent(sentinel.end, false, sentinel)
  }
  const points = [...new Set([0, binDataLength, ...eventsAt.keys()])].sort((a, b) => a - b)

  const buckets = new Map()
  const segments = []
  let uncovered = 0
  const active = new Set()
  let previous = null
  for (const at of points) {
    if (previous !== null && at > previous) {
      const length = at - previous
      let bucket = 'bin.uncovered'
      if (active.size === 0) {
        uncovered += length
      } else {
        const activeList = [...active]
        const winner = activeList.reduce((a, b) => {
          if (b.rank !== a.rank) {
            return b.rank < a.rank ? b : a
          }
          return b.sequence < a.sequence ? b : a
        })
        bucket = winner.bucket
        // An accessor sub-range always overlaps its own view's backdrop;
        // that is the design, not a conflict. A genuine contest is two
        // different views covering the byte, or two accessors of one view
        // aliasing each other.
        const distinctViews = new Set(activeList.map((iv) => iv.viewIndex))
        const nonBackdrop = activeList.filter((iv) => !iv.backdrop)
        if (distinctViews.size > 1 || nonBackdrop.length > 1) {
          overlaps.push({
            start: previous,
            end: at,
            bytes: length,
            awardedTo: winner.bucket,
            contenders: activeList.map((iv) => `bufferViews[${iv.viewIndex}] ${iv.bucket}${iv.backdrop ? ' (view)' : ''}`),
          })
        }
      }
      // A strided view's bytes are already in `stridedBuckets`; the
      // sentinel exists only to keep them out of `bin.uncovered`.
      if (![...active].some((iv) => iv.stridedSentinel)) {
        segments.push({start: previous, end: at, bucket})
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + length)
      }
    }
    for (const {add, interval} of eventsAt.get(at) ?? []) {
      if (add) {
        active.add(interval)
      } else {
        active.delete(interval)
      }
    }
    previous = at
  }

  for (const [bucket, value] of stridedBuckets) {
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + value)
  }

  return {buckets, segments, stridedPlans, shared, overlaps, outOfRange, uncovered, instanceCount, instancedNodes}
}


/**
 * Concatenate the BIN bytes whose bucket matches `predicate`.
 *
 * Works off the sweep's segments, not off bufferView byteLengths, so an
 * aliased or contested byte is included exactly once — the compressed
 * figure then describes the same bytes the bucket totals do.
 *
 * An interleaved view contributes one slice per element, expanded from its
 * periodic plan here rather than stored as millions of segments.
 *
 * @param {Uint8Array} bin
 * @param {Array<{start: number, end: number, bucket: string}>} segments
 * @param {Array<object>} stridedPlans
 * @param {function(string): boolean} predicate
 * @return {Uint8Array}
 */
function gatherSegments(bin, segments, stridedPlans, predicate) {
  const picked = []
  for (const s of segments) {
    if (predicate(s.bucket)) {
      picked.push([s.start, s.end])
    }
  }
  for (const plan of stridedPlans) {
    for (const run of plan.runs) {
      for (const segment of run.period) {
        if (!predicate(segment.bucket)) {
          continue
        }
        for (let s = 0; s < run.strideCount; s++) {
          const base = plan.viewStart + ((run.firstStride + s) * plan.stride) + segment.offset
          picked.push([base, base + segment.length])
        }
      }
    }
  }
  const total = picked.reduce((n, [start, end]) => n + (end - start), 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const [start, end] of picked) {
    out.set(bin.subarray(start, end), offset)
    offset += end - start
  }
  return out
}


/**
 * @param {Uint8Array} bytes
 * @return {number} gzip length, 0 for empty input
 */
function gzipLength(bytes) {
  return bytes.byteLength === 0 ? 0 : gzipSync(bytes).byteLength
}


/**
 * Budget one GLB — the whole file for a plain `.glb`, or one chunk of a
 * Bldrs container.
 *
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {boolean} [options.compress] measure gzip/brotli
 * @return {object}
 */
function glbBudget(bytes, {compress = true} = {}) {
  const scan = scanGlbChunks(bytes)
  const buckets = new Map()
  /**
   * @param {string} key
   * @param {number} value
   */
  const add = (key, value) => {
    if (value > 0) {
      buckets.set(key, (buckets.get(key) ?? 0) + value)
    }
  }

  if (scan.chunks.length === 0) {
    return {
      error: scan.error, buckets, accounted: 0, unaccounted: bytes.byteLength,
      jsonDetail: null, binDataLength: 0, flags: null, summary: null,
    }
  }

  add('glb.header', GLB_HEADER_BYTES)
  add('glb.chunkHeaders', CHUNK_HEADER_BYTES * scan.chunks.length)

  const jsonChunk = scan.chunks.find((c) => c.type === JSON_CHUNK_TYPE)
  const binChunk = scan.chunks.find((c) => c.type === BIN_CHUNK_TYPE)
  for (const chunk of scan.chunks) {
    if (chunk !== jsonChunk && chunk !== binChunk) {
      add('glb.extraChunks', chunk.dataLength)
    }
  }

  let json = null
  let jsonRawBytes = 0
  if (jsonChunk) {
    let end = jsonChunk.dataOffset + jsonChunk.dataLength
    while (end > jsonChunk.dataOffset && JSON_PAD_BYTES.has(bytes[end - 1])) {
      end--
    }
    jsonRawBytes = end - jsonChunk.dataOffset
    add('json.chunk', jsonRawBytes)
    add('glb.jsonPadding', jsonChunk.dataLength - jsonRawBytes)
    json = JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(jsonChunk.dataOffset, end)))
  }

  // The spec makes `buffers[0].byteLength` authoritative for the BIN data;
  // the chunk length is that rounded up to 4. The difference is padding,
  // and is attributed as such rather than folded into geometry.
  let binDataLength = 0
  let bin = new Uint8Array(0)
  if (binChunk) {
    const declared = json?.buffers?.[0]?.byteLength
    binDataLength = Math.min(typeof declared === 'number' ? declared : binChunk.dataLength, binChunk.dataLength)
    add('glb.binPadding', binChunk.dataLength - binDataLength)
    bin = bytes.subarray(binChunk.dataOffset, binChunk.dataOffset + binDataLength)
  }

  const partition = json ? binPartition(json, binDataLength) : null
  if (partition) {
    for (const [key, value] of partition.buckets) {
      add(key, value)
    }
  }

  let accounted = 0
  for (const value of buckets.values()) {
    accounted += value
  }

  const segments = partition?.segments ?? []
  const plans = partition?.stridedPlans ?? []
  const instanceBytes = gatherSegments(bin, segments, plans, (b) => b.startsWith(INSTANCING_BUCKET_PREFIX))
  const geometryBytes = gatherSegments(bin, segments, plans,
    (b) => GEOMETRY_BUCKET_PREFIXES.some((p) => b.startsWith(p)))
  const jsonBytes = jsonChunk ?
    bytes.subarray(jsonChunk.dataOffset, jsonChunk.dataOffset + jsonRawBytes) :
    new Uint8Array(0)

  const instanceCount = partition?.instanceCount ?? 0
  const summary = {
    nodeCount: json?.nodes?.length ?? 0,
    meshCount: json?.meshes?.length ?? 0,
    accessorCount: json?.accessors?.length ?? 0,
    bufferViewCount: json?.bufferViews?.length ?? 0,
    materialCount: json?.materials?.length ?? 0,
    instancedNodeCount: partition?.instancedNodes ?? 0,
    instanceCount,
    jsonChunk: {
      bytes: jsonRawBytes,
      gzip: compress ? gzipLength(jsonBytes) : null,
      brotli: compress && jsonBytes.byteLength > 0 ? brotliCompressSync(jsonBytes).byteLength : null,
    },
    instanceTransforms: {
      bytes: instanceBytes.byteLength,
      gzip: compress ? gzipLength(instanceBytes) : null,
      bytesPerInstance: instanceCount > 0 ? instanceBytes.byteLength / instanceCount : null,
    },
    geometry: {
      bytes: geometryBytes.byteLength,
      gzip: compress ? gzipLength(geometryBytes) : null,
    },
  }

  return {
    error: scan.error,
    buckets,
    accounted,
    unaccounted: bytes.byteLength - accounted,
    jsonDetail: json ? jsonBreakdown(json, jsonRawBytes) : null,
    binDataLength,
    flags: {
      sharedBufferViews: partition?.shared ?? [],
      overlaps: partition?.overlaps ?? [],
      outOfRangeViews: partition?.outOfRange ?? [],
      uncoveredBin: partition?.uncovered ?? 0,
    },
    summary,
  }
}


/**
 * Exhaustive byte budget for a plain GLB or a Bldrs `.container`.
 *
 * @param {Uint8Array} bytes whole file
 * @param {object} [options]
 * @param {string} [options.name] label for the report
 * @param {boolean} [options.compress]
 * @return {object} see the module doc for the partition contract
 */
export function computeBudget(bytes, {name = '<buffer>', compress = true} = {}) {
  const buckets = new Map()
  /**
   * @param {string} key
   * @param {number} value
   */
  const add = (key, value) => {
    if (value > 0) {
      buckets.set(key, (buckets.get(key) ?? 0) + value)
    }
  }

  let container = null
  let glbs = []
  if (isBldrsGlbContainer(bytes)) {
    const header = readGlbContainerHeader(bytes)
    const {chunks} = viewGlbContainerChunks(bytes)
    container = {
      version: header.version,
      chunkCount: header.chunkCount,
      mode: header.mode,
      headerBytes: header.headerBytes,
    }
    add('container.header', header.headerBytes)
    add('container.chunkHeaders', CONTAINER_CHUNK_HEADER_BYTES * chunks.length)
    glbs = chunks.map((chunk) => glbBudget(chunk, {compress}))
  } else {
    glbs = [glbBudget(bytes, {compress})]
  }

  for (const glb of glbs) {
    for (const [key, value] of glb.buckets) {
      add(key, value)
    }
  }

  let accounted = 0
  for (const value of buckets.values()) {
    accounted += value
  }
  // Container trailing slack, and any inner-GLB slack, surfaces here rather
  // than being absorbed — see the module doc's partition contract.
  const unaccounted = bytes.byteLength - accounted

  /**
   * @param {function(object): number} pick
   * @return {number}
   */
  const sumOverGlbs = (pick) => glbs.reduce((n, g) => n + (pick(g) ?? 0), 0)
  const instanceCount = sumOverGlbs((g) => g.summary?.instanceCount)
  const summary = {
    nodeCount: sumOverGlbs((g) => g.summary?.nodeCount),
    meshCount: sumOverGlbs((g) => g.summary?.meshCount),
    accessorCount: sumOverGlbs((g) => g.summary?.accessorCount),
    bufferViewCount: sumOverGlbs((g) => g.summary?.bufferViewCount),
    materialCount: sumOverGlbs((g) => g.summary?.materialCount),
    instancedNodeCount: sumOverGlbs((g) => g.summary?.instancedNodeCount),
    instanceCount,
    jsonChunk: {
      bytes: sumOverGlbs((g) => g.summary?.jsonChunk.bytes),
      gzip: compress ? sumOverGlbs((g) => g.summary?.jsonChunk.gzip) : null,
      brotli: compress ? sumOverGlbs((g) => g.summary?.jsonChunk.brotli) : null,
    },
    instanceTransforms: {
      bytes: sumOverGlbs((g) => g.summary?.instanceTransforms.bytes),
      gzip: compress ? sumOverGlbs((g) => g.summary?.instanceTransforms.gzip) : null,
      bytesPerInstance: null,
    },
    geometry: {
      bytes: sumOverGlbs((g) => g.summary?.geometry.bytes),
      gzip: compress ? sumOverGlbs((g) => g.summary?.geometry.gzip) : null,
    },
  }
  if (instanceCount > 0) {
    summary.instanceTransforms.bytesPerInstance = summary.instanceTransforms.bytes / instanceCount
  }

  const bucketList = [...buckets.entries()]
    .map(([key, value]) => ({key, bytes: value, pct: (value * PERCENT) / bytes.byteLength}))
    .sort((a, b) => b.bytes - a.bytes)

  return {
    file: {name, bytes: bytes.byteLength},
    container,
    buckets: bucketList,
    accounted,
    unaccounted,
    balanced: accounted + unaccounted === bytes.byteLength && unaccounted === 0,
    summary,
    glbs: glbs.map((g, i) => ({
      index: i,
      error: g.error,
      json: g.jsonDetail,
      binDataLength: g.binDataLength,
      flags: g.flags,
      summary: g.summary,
    })),
  }
}


/**
 * @param {number} n
 * @return {string}
 */
function commas(n) {
  return Math.round(n).toLocaleString('en-US')
}


/**
 * @param {number} n
 * @param {number} width
 * @return {string}
 */
function padLeft(n, width) {
  return commas(n).padStart(width)
}


/**
 * @param {number|null} n
 * @return {string}
 */
function orDash(n) {
  return (n === null || n === undefined) ? '-' : commas(n)
}


/**
 * Render the budget as the report a human reads.
 *
 * @param {object} budget from `computeBudget`
 * @return {string}
 */
export function formatBudget(budget) {
  const NUM_WIDTH = 14
  const KEY_WIDTH = 34
  const LABEL_WIDTH = 22
  const TOP_JSON_KEYS = 12
  const PCT_DECIMALS = 2
  const PCT_WIDTH = 6
  const lines = []
  const total = budget.file.bytes
  /**
   * @param {number} n
   * @return {string}
   */
  const pct = (n) => `${((n * PERCENT) / total).toFixed(PCT_DECIMALS).padStart(PCT_WIDTH)}%`

  lines.push(`file        ${budget.file.name}`)
  lines.push(`bytes       ${commas(total)}`)
  if (budget.container) {
    const c = budget.container
    lines.push(`container   BLDR v${c.version}  chunks=${c.chunkCount}  mode=${c.mode ?? 'none'}`)
  } else {
    lines.push('container   none (plain GLB)')
  }
  lines.push('')
  lines.push('--- partition (exhaustive, non-overlapping) ---')
  lines.push(`${'bucket'.padEnd(KEY_WIDTH)}${'bytes'.padStart(NUM_WIDTH)}   share`)
  for (const b of budget.buckets) {
    lines.push(`${b.key.padEnd(KEY_WIDTH)}${padLeft(b.bytes, NUM_WIDTH)}  ${pct(b.bytes)}`)
  }
  lines.push(`${'UNACCOUNTED'.padEnd(KEY_WIDTH)}${padLeft(budget.unaccounted, NUM_WIDTH)}  ${pct(budget.unaccounted)}`)
  lines.push(`${'accounted + unaccounted'.padEnd(KEY_WIDTH)}${padLeft(budget.accounted + budget.unaccounted, NUM_WIDTH)}` +
    `  (file ${commas(total)}) ${budget.accounted + budget.unaccounted === total ? 'OK' : 'MISMATCH'}`)

  const s = budget.summary
  lines.push('')
  lines.push('--- decision line ---')
  lines.push(`nodes ${commas(s.nodeCount)}   instanced nodes ${commas(s.instancedNodeCount)}` +
    `   instances ${commas(s.instanceCount)}   meshes ${commas(s.meshCount)}` +
    `   accessors ${commas(s.accessorCount)}   bufferViews ${commas(s.bufferViewCount)}`)
  lines.push(`${''.padEnd(LABEL_WIDTH)}${'raw'.padStart(NUM_WIDTH)}${'gzip'.padStart(NUM_WIDTH)}`)
  lines.push(`${'JSON chunk'.padEnd(LABEL_WIDTH)}${padLeft(s.jsonChunk.bytes, NUM_WIDTH)}` +
    `${orDash(s.jsonChunk.gzip).padStart(NUM_WIDTH)}`)
  lines.push(`${'instance transforms'.padEnd(LABEL_WIDTH)}${padLeft(s.instanceTransforms.bytes, NUM_WIDTH)}` +
    `${orDash(s.instanceTransforms.gzip).padStart(NUM_WIDTH)}`)
  lines.push(`${'geometry'.padEnd(LABEL_WIDTH)}${padLeft(s.geometry.bytes, NUM_WIDTH)}` +
    `${orDash(s.geometry.gzip).padStart(NUM_WIDTH)}`)
  if (s.jsonChunk.brotli !== null) {
    lines.push(`${'JSON chunk brotli'.padEnd(LABEL_WIDTH)}${padLeft(s.jsonChunk.brotli, NUM_WIDTH)}`)
  }
  if (s.instanceTransforms.bytesPerInstance !== null) {
    const perGzip = s.instanceTransforms.gzip === null ?
      '' :
      `   (${(s.instanceTransforms.gzip / s.instanceCount).toFixed(PCT_DECIMALS)} gzipped)`
    lines.push(`${'bytes per instance'.padEnd(LABEL_WIDTH)}` +
      `${s.instanceTransforms.bytesPerInstance.toFixed(PCT_DECIMALS).padStart(NUM_WIDTH)}${perGzip}`)
  }

  for (const glb of budget.glbs) {
    const label = budget.glbs.length > 1 ? ` [chunk ${glb.index}]` : ''
    if (glb.error) {
      lines.push('')
      lines.push(`--- GLB${label}: ${glb.error} ---`)
    }
    if (glb.json) {
      lines.push('')
      lines.push(`--- JSON chunk cost by top-level key${label} ---`)
      for (const entry of glb.json.byTopLevelKey.slice(0, TOP_JSON_KEYS)) {
        const count = entry.count === null ? '' : `  (${commas(entry.count)} entries)`
        lines.push(`  ${entry.key.padEnd(KEY_WIDTH - 2)}${padLeft(entry.bytes, NUM_WIDTH)}  ${pct(entry.bytes)}${count}`)
      }
      lines.push(`  ${'{} and , separators'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.punctuation, NUM_WIDTH)}`)
      lines.push(`  ${'re-serialized minus on-disk'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.reserializedDelta, NUM_WIDTH)}`)
      lines.push('  #1854 levers (bytes recovered by dropping the field):')
      lines.push(`  ${'nodes[].name'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.nodeNames, NUM_WIDTH)}  ${pct(glb.json.nodeNames)}`)
      lines.push(`  ${'accessors[].min/max'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.accessorMinMax, NUM_WIDTH)}` +
        `  ${pct(glb.json.accessorMinMax)}`)
      lines.push(`  ${'meshes[].name'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.meshNames, NUM_WIDTH)}`)
      lines.push(`  ${'materials[].name'.padEnd(KEY_WIDTH - 2)}${padLeft(glb.json.materialNames, NUM_WIDTH)}`)
    }
    const f = glb.flags
    if (f && (f.sharedBufferViews.length > 0 || f.overlaps.length > 0 ||
        f.outOfRangeViews.length > 0 || f.uncoveredBin > 0)) {
      lines.push('')
      lines.push(`--- flags${label} ---`)
      for (const sharedView of f.sharedBufferViews) {
        const how = sharedView.splitAcrossAccessors ?
          `split per accessor, slack to ${sharedView.countedAs}` :
          `counted once as ${sharedView.countedAs}`
        lines.push(`  bufferViews[${sharedView.viewIndex}] (${commas(sharedView.byteLength)}B) claimed ` +
          `${sharedView.claims.length}x${sharedView.crossOwner ? ' ACROSS OWNERS' : ''}, ` +
          `${how}: ${sharedView.claims.join(' | ')}`)
      }
      for (const overlap of f.overlaps) {
        lines.push(`  bytes [${overlap.start}, ${overlap.end}) contested by ` +
          `${overlap.contenders.join(' | ')} -> ${overlap.awardedTo}`)
      }
      for (const bad of f.outOfRangeViews) {
        lines.push(`  bufferViews[${bad.viewIndex}] ${bad.reason} (${bad.bucket})`)
      }
      if (f.uncoveredBin > 0) {
        lines.push(`  ${commas(f.uncoveredBin)}B of BIN covered by no bufferView`)
      }
    }
  }
  return lines.join('\n')
}


/**
 * @param {Array<string>} argv
 * @return {number} process exit code
 */
function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'))
  const asJson = argv.includes('--json')
  if (args.length !== 1) {
    process.stderr.write('usage: node tools/glb/byteBudget.mjs <file.glb|file.container> [--json]\n')
    return 1
  }
  const filePath = path.resolve(args[0])
  const bytes = new Uint8Array(fs.readFileSync(filePath))
  const budget = computeBudget(bytes, {name: path.basename(filePath)})
  process.stdout.write(asJson ? `${JSON.stringify(budget, null, 2)}\n` : `${formatBudget(budget)}\n`)
  // A non-zero unaccounted is the instrument telling on itself; make that
  // visible to a script, not only to a reader.
  return budget.unaccounted === 0 ? 0 : 2
}


if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}

import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Vector4,
} from 'three'
import debug, {WARN} from '../../utils/debug'
import {forEachVectorItem} from './conwayVector'
import {makeSurfaceMaterial} from '../lookMaterial'


/**
 * flatMeshToBatchedModel — Conway FlatMesh stream → `THREE.BatchedMesh`
 * batches.
 *
 * The GPU-instanced counterpart to `flatMeshToBufferGeometry` (the merge
 * path). Conway's compat surface already emits the web-ifc instancing
 * model: each `PlacedGeometry` references a shared, source-unit *local*-
 * space geometry by `geometryExpressID` plus its own `flatTransformation`
 * placement matrix. The merge path discards that sharing — it bakes each
 * matrix into a private vertex slab. This builder keeps it: each unique
 * `geometryExpressID` is fetched once and added to a `BatchedMesh` as one
 * geometry; every placement becomes an *instance* with its own matrix +
 * colour. So N placements of a shape cost 1 vertex copy + N matrices
 * instead of N vertex copies — the ~60% reduction §3b.iv measured.
 *
 * Why `BatchedMesh` and not `InstancedMesh`-per-shape: the §3b.iv numbers
 * showed naive per-shape instancing explodes the draw count (Snowdon
 * 1 → ~10k). `BatchedMesh` draws *all* its geometries + instances in one
 * multi-draw call.
 *
 * **Transparency:** opaque and transparent instances need different
 * material states (a transparent material disables `depthWrite` and goes
 * through the blended pass), so they cannot share one `BatchedMesh`.
 * Placements are split by alpha into an opaque batch and a transparent
 * batch, each with per-instance RGBA colour (`setColorAt(Vector4)` writes
 * alpha into the batch's RGBA colours texture). A shape used both ways has
 * its geometry in both batches. The caller wraps >1 batch in a Group.
 *
 * Picking: `BatchedMesh` raycasts return `intersection.batchId`, so each
 * batch carries `batchId → parentExpressId` / `batchId → occurrenceId`
 * tables. The occurrence id is a single emission-order id space across
 * both batches, so selection is consistent regardless of the split.
 *
 * @see flatMeshToInstancedModel — the grouping/measurement-only sibling.
 */


/** Fallback colour used when a PlacedGeometry has no `.color` field. */
export const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/** Interleaved vertex stride from Conway: `[px, py, pz, nx, ny, nz]`. */
export const VERT_STRIDE = 6

/** Floats per position / normal vector. */
const VEC3 = 3

/** Indices per triangle. */
export const INDICES_PER_TRIANGLE = 3

/** An instance is transparent (own blended batch) when alpha is below this. */
export const OPAQUE_ALPHA = 1

/**
 * Quantization for coincident-placement keys: 1e4 → 0.1 mm on translation,
 * 1e-4 on the rotation/scale terms. Fine enough that two genuinely distinct
 * placements never collide, coarse enough that float noise in an emitted
 * matrix can't split a true duplicate.
 */
const COINCIDENCE_QUANT = 1e4

/** Elements in a flat 4x4 matrix. */
const MAT4_LENGTH = 16


/** Int32 words that make up a placement's identity: 2 ids + 16 matrix + 4 colour. */
const COINCIDENCE_WORDS = 22

/**
 * Scratch for one placement's identity words, reused across every call —
 * the dedupe runs once per placement (562k times on a large model), so it
 * must not allocate. Single-threaded and consumed before `add` returns, so
 * one module-level buffer is safe.
 */
const coincidenceScratch = new Int32Array(COINCIDENCE_WORDS)

/**
 * Fingerprint seeds/multipliers. Three independently seeded FNV-1a-style
 * streams over the same words; combining two of them gives the 53-bit
 * secondary fingerprint (see CoincidenceSet).
 */
const FP_SEED_A = 0x811c9dc5
const FP_SEED_B = 0x9e3779b9
const FP_SEED_C = 0x7feb352d
const FP_MUL_A = 0x01000193
const FP_MUL_B = 0xcc9e2d51
const FP_MUL_C = 0x1b873593

/** Width of each hash stream. */
const HASH_BITS = 32

/** Rotate-left applied after each word so word *order* changes the hash. */
const FP_ROTATE = 13
const FP_ROTATE_BACK = HASH_BITS - FP_ROTATE

/** Bits of hash C packed under hash B to make the 53-bit secondary. 32 + 21 = 53. */
const FP_LOW_BITS = 21
const FP_LOW_SHIFT = HASH_BITS - FP_LOW_BITS
const FP_B_SCALE = 2 ** FP_LOW_BITS

/** Murmur3's published fmix32 avalanche schedule (shift, multiply, shift, …). */
const FMIX_SHIFT_A = 16
const FMIX_MUL_A = 0x85ebca6b
const FMIX_SHIFT_B = 13
const FMIX_MUL_B = 0xc2b2ae35


/**
 * Murmur3's 32-bit finalizer: avalanches the accumulator so neighbouring
 * inputs (adjacent express ids, matrices differing in one quantized unit)
 * land far apart in the output.
 *
 * @param {number} h 32-bit accumulator
 * @return {number} unsigned 32-bit
 */
function fmix32(h) {
  let x = h
  x ^= x >>> FMIX_SHIFT_A
  x = Math.imul(x, FMIX_MUL_A)
  x ^= x >>> FMIX_SHIFT_B
  x = Math.imul(x, FMIX_MUL_B)
  x ^= x >>> FMIX_SHIFT_A
  return x >>> 0
}


/**
 * One hash stream over the identity words.
 *
 * @param {Int32Array} words
 * @param {number} seed
 * @param {number} mul odd 32-bit multiplier
 * @return {number} unsigned 32-bit
 */
function hashWords(words, seed, mul) {
  let h = seed
  for (let i = 0; i < COINCIDENCE_WORDS; i++) {
    h = Math.imul(h ^ words[i], mul)
    h = (h << FP_ROTATE) | (h >>> FP_ROTATE_BACK)
  }
  return fmix32(h ^ COINCIDENCE_WORDS)
}


/**
 * A placement's identity as 22 int32 words: parent product + geometry +
 * (quantized) world transform + colour, written into the shared scratch.
 *
 * `| 0` collapses -0 and +0 to the same word so a signed-zero component
 * can't split a duplicate — the same collapse the old string key relied on.
 * (The `Int32Array` store would coerce identically; the explicit `| 0` keeps
 * that requirement visible where it is depended on rather than implicit in
 * the buffer's type.)
 * It also folds a missing `parentExpressId` to 0, which is harmless: the
 * geometry, transform and colour still discriminate, and a placement with no
 * parent id has no parent identity to tell it apart by.
 *
 * @param {number} parentExpressId
 * @param {number} geometryExpressId
 * @param {Array<number>} matrix 16-element flatTransformation
 * @param {?{x: number, y: number, z: number, w: number}} color
 * @return {Int32Array} `coincidenceScratch`, valid until the next call
 */
function coincidenceWords(parentExpressId, geometryExpressId, matrix, color) {
  const words = coincidenceScratch
  words[0] = parentExpressId | 0
  words[1] = geometryExpressId | 0
  for (let i = 0; i < MAT4_LENGTH; i++) {
    words[2 + i] = Math.round(matrix[i] * COINCIDENCE_QUANT) | 0
  }
  const c = color ?? DEFAULT_COLOR
  words[18] = Math.round(c.x * COINCIDENCE_QUANT) | 0
  words[19] = Math.round(c.y * COINCIDENCE_QUANT) | 0
  words[20] = Math.round(c.z * COINCIDENCE_QUANT) | 0
  words[21] = Math.round(c.w * COINCIDENCE_QUANT) | 0
  return words
}


/**
 * The set of placements already emitted, keyed on placement identity: parent
 * product + geometry + its (quantized) world transform + colour. Two
 * placements with the same identity are the SAME geometry drawn the SAME way
 * at the SAME spot — a coincident duplicate that renders as z-fighting (two
 * coplanar `DoubleSide` surfaces fighting per pixel, the winner flipping as
 * the camera moves). Conway's rel-aggregates re-extraction pass replaces a cut
 * part's geometry under its existing `geometryExpressID` but *appends* a
 * second placement instead of replacing the first, so georeferenced aggregate
 * models (e.g. romana/DOWA) emit hundreds of these. Dropping the repeat kills
 * the redundant draw; the proper fix is in the conway pass, this is the
 * belt-and-suspenders guard.
 *
 * Colour is part of the identity so a genuinely distinct draw of the same
 * shape at the same spot in a different colour (e.g. an opaque solid plus a
 * glass overlay) is kept — only an EXACT duplicate is dropped.
 *
 * **Why a fingerprint and not a string key** (conway#636): the identity used
 * to be a `:`-joined string built with seventeen successive `key += …`. On a
 * 562,351-placement model that measured **739 bytes per entry / 396.65 MB**
 * for ~96 B of content — the construction intermediates, not the content,
 * were the cost, and they survived forced full collections. Here each entry
 * is two numbers in a `Map` and the hashing allocates nothing at all, which
 * is tens of bytes per entry instead of 739.
 *
 * **Why that is safe.** A collision here silently deletes real geometry, so
 * 32 bits (a birthday collision is near-certain at 562k entries) is not
 * enough. Each placement gets **85 bits**: a 32-bit primary hash as the `Map`
 * key, and a 53-bit secondary (a second 32-bit hash scaled by 2^21 plus the
 * top 21 bits of a third — 53 bits is the exact-integer ceiling for a JS
 * number) as the value. Entries sharing a primary chain into an array and are
 * separated by the secondary, so only a full 85-bit match dedupes. The
 * birthday bound at n = 562,351 is n²/2 / 2^85 ≈ **4e-15** per load — many
 * orders of magnitude below the chance of the machine getting the arithmetic
 * wrong. The three streams are independently seeded with distinct odd
 * multipliers and separately avalanched, which is the standard double-hashing
 * construction; they are not *provably* independent, but nothing in the input
 * (adjacent express ids, matrices differing by one quantized unit) correlates
 * them.
 */
export class CoincidenceSet {
  /** Starts empty; one instance lives for the duration of one model load. */
  constructor() {
    // primary hash → secondary fingerprint, or an array of them when
    // distinct placements collide on the primary (~37 expected pairs at 562k).
    this.byPrimary_ = new Map()
    /** Distinct placements held. */
    this.size = 0
  }


  /**
   * Record a placement, reporting whether it is new.
   *
   * @param {number} parentExpressId
   * @param {number} geometryExpressId
   * @param {Array<number>} matrix 16-element flatTransformation
   * @param {?{x: number, y: number, z: number, w: number}} color
   * @return {boolean} true when newly added, false when an exact duplicate
   *   of a placement already recorded (the caller should drop it)
   */
  add(parentExpressId, geometryExpressId, matrix, color) {
    const words = coincidenceWords(parentExpressId, geometryExpressId, matrix, color)
    const primary = hashWords(words, FP_SEED_A, FP_MUL_A)
    const secondary =
      (hashWords(words, FP_SEED_B, FP_MUL_B) * FP_B_SCALE) +
      (hashWords(words, FP_SEED_C, FP_MUL_C) >>> FP_LOW_SHIFT)
    const existing = this.byPrimary_.get(primary)
    if (existing === undefined) {
      this.byPrimary_.set(primary, secondary)
      this.size++
      return true
    }
    if (typeof existing === 'number') {
      if (existing === secondary) {
        return false
      }
      this.byPrimary_.set(primary, [existing, secondary])
      this.size++
      return true
    }
    if (existing.includes(secondary)) {
      return false
    }
    existing.push(secondary)
    this.size++
    return true
  }


  /**
   * Drop every entry. The guard is load-time only — no consumer reads it —
   * so the builder releases it once the model is assembled (conway#636).
   */
  clear() {
    this.byPrimary_.clear()
    this.size = 0
  }
}


/**
 * Translation magnitude (metres) past which a placement is treated as
 * georeferenced and its whole model recentered to the origin for the render.
 *
 * Why: Conway's `COORDINATE_TO_ORIGIN` recenters a model's geometry to the
 * origin on the classic open, but the browser demand open (`OpenModelStreamed`,
 * shipped default-on in #1614) hands back RAW source-world placements. Swiss
 * LV95 and other national grids put those at ~1e6–1e7 m, where float32 (the
 * GPU vertex + BatchedMesh instance-matrix format) resolves to ~1 m — so the
 * whole model swims by up to a metre as the camera rotates. Subtracting a
 * single model-wide offset brings the render back to the origin (the local
 * geometry is only ~100 m), restoring float32 precision. Normal near-origin
 * models never cross this threshold, so the recenter is a strict no-op for
 * them.
 */
export const LARGE_COORD_THRESHOLD = 1e4


/**
 * The origin-recenter offset for a georeferenced placement, or null when the
 * placement is near enough to the origin to leave untouched. Rounded to whole
 * metres so the offset is exactly float-representable and stable across the
 * incremental demand batches (every batch subtracts the same value).
 *
 * @param {Array<number>} flatTransformation 16-element column-major matrix
 * @return {?Array<number>} `[x, y, z]` to subtract, or null
 */
export function coordinationOffsetFor(flatTransformation) {
  const x = flatTransformation[12]
  const y = flatTransformation[13]
  const z = flatTransformation[14]
  if (Math.abs(x) > LARGE_COORD_THRESHOLD ||
      Math.abs(y) > LARGE_COORD_THRESHOLD ||
      Math.abs(z) > LARGE_COORD_THRESHOLD) {
    return [Math.round(x), Math.round(y), Math.round(z)]
  }
  return null
}


/**
 * `coordinationOffsetFor` plus the one-time load-log line the Share#1632
 * retrospective asked for: the recenter used to fire completely silently,
 * including on the broken-engine stream (conway#680) whose vertex buffers
 * ALSO carried the offset, which baked the model ~2.9e6 m off-origin with
 * nothing in the log to explain it. Route the decision through here instead
 * of calling `coordinationOffsetFor` directly so a georeferenced model always
 * leaves a trace.
 *
 * Every caller below decides the offset from `undefined` exactly once per
 * load (`IncrementalBatchedBuilder#appendPlacement_`'s
 * `this.coordination.offset`, `collectGroups`'s `totals.coordOffset`,
 * `flatMeshToBufferGeometry`'s single top-level call on `entries[0]`) — so
 * this logs once per load too. `coordinationOffsetFor` itself stays pure and
 * unlogged, in case a future caller ever needs to probe it per-placement.
 *
 * WARN, not INFO, and that is the whole point rather than a severity
 * judgement: `debug()` prints only when the requested level is at or above
 * `DEBUG_LEVEL`, which defaults to WARN and is never lowered at runtime, so
 * an INFO line is a no-op in production and would have left exactly the
 * silence Share#1632 was about. The same builders already carry their skip
 * diagnostics on this channel (`IncrementalBatchedBuilder`'s append failure,
 * ShareIfcLoader's fallbacks). Console hygiene holds because this fires at
 * most once per load and only for a georeferenced model.
 *
 * @param {Array<number>} flatTransformation 16-element column-major matrix
 * @return {?Array<number>} same as `coordinationOffsetFor`
 */
export function decideCoordinationOffset(flatTransformation) {
  const offset = coordinationOffsetFor(flatTransformation)
  if (offset !== null) {
    debug(WARN).warn(`georeferenced model: recentering by [${offset.join(', ')}] m (see Share#1632)`)
  }
  return offset
}


/**
 * @typedef {object} BatchHandle
 * @property {BatchedMesh} mesh the batch (one geometry per unique shape it
 *   uses, one instance per placement).
 * @property {import('three').Material} material the batch material.
 * @property {boolean} transparent whether this is the blended batch.
 * @property {Uint32Array} instanceParents `batchId → parent IFC product
 *   expressID`.
 * @property {Uint32Array} instanceOccurrenceIds `batchId → synthetic 0-based
 *   occurrence id` (global emission order across both batches).
 * @property {Uint32Array} instanceGeometryIds `batchId → the placement's
 *   geometryExpressID` (the solid's own id for STEP). Lets per-solid
 *   selection narrow a multibody part's shared occurrence path to one body,
 *   mirroring the merged path's `getGeometryExpressIdByInstance`.
 * @property {Array<Array<number>|null>|null} instanceOccurrencePaths
 *   `batchId → STEP occurrence path` (NAUO express ids, root→leaf) off
 *   `PlacedGeometry.occurrencePath`. Null (whole table) for IFC / engines
 *   that don't emit paths, so nothing downstream pays; per-entry null when
 *   a single placement has no path.
 * @property {Array<BufferGeometry>} instanceGeometry `batchId → the shared
 *   local-space shape geometry` this instance was added from. Retained so
 *   `batchedSubset` can re-bake a selection/isolation subset (the packed
 *   batch buffers aren't conveniently re-readable per instance).
 * @property {Array<object>} instanceColors `batchId → original `{x,y,z,w}`
 *   RGBA`. Retained so `batchedHighlight` can recolor a selected instance
 *   via `setColorAt` and restore the exact original afterwards (alpha
 *   included — `getColorAt` would drop it).
 */


/**
 * @typedef {object} BatchedModel
 * @property {Array<BatchHandle>} batches 1-2 batches (opaque, transparent),
 *   non-empty only.
 * @property {object} stats `{uniqueGeometryCount, instanceCount, vertexCount,
 *   triangleCount, parentCount, materialCount, transparentInstanceCount,
 *   skippedFlatMeshes, skippedPlacedGeometries}`.
 */


/**
 * De-interleave a Conway `[p,n]` vertex buffer into a local-space
 * `BufferGeometry` (position + normal + index). No transform is applied —
 * placement is per-instance on the BatchedMesh.
 *
 * @param {Float32Array} rawVerts interleaved p+n, `vertCount * 6` floats
 * @param {Uint32Array} rawIndices u32 indices
 * @param {number} vertCount vertices
 * @return {BufferGeometry}
 */
export function localGeometry(rawVerts, rawIndices, vertCount) {
  const positions = new Float32Array(vertCount * VEC3)
  const normals = new Float32Array(vertCount * VEC3)
  for (let v = 0; v < vertCount; v++) {
    const src = v * VERT_STRIDE
    const dst = v * VEC3
    positions[dst] = rawVerts[src]
    positions[dst + 1] = rawVerts[src + 1]
    positions[dst + 2] = rawVerts[src + 2]
    normals[dst] = rawVerts[src + 3]
    normals[dst + 1] = rawVerts[src + 4]
    normals[dst + 2] = rawVerts[src + 5]
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, VEC3))
  geometry.setAttribute('normal', new BufferAttribute(normals, VEC3))
  geometry.setIndex(new BufferAttribute(Uint32Array.from(rawIndices), 1))
  return geometry
}


/**
 * Collect, per unique `geometryExpressID`, its local geometry (fetched once)
 * and the list of placements referencing it, tagging each placement with a
 * global emission-order occurrence id.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI
 * @param {number} modelID
 * @return {{groups: Map, totals: object}}
 */
function collectGroups(flatMeshes, api, modelID) {
  const groups = new Map()
  const bad = new Set() // geomExpressIDs that resolved to no usable geometry
  // Placement identities already emitted — drops exact overlaps (see CoincidenceSet).
  const seen = new CoincidenceSet()
  const totals = {
    placements: 0, transparentPlacements: 0, vertexCount: 0, indexCount: 0,
    skippedFlatMeshes: 0, skippedPlacedGeometries: 0, skippedCoincidentPlacements: 0,
    // Origin-recenter offset for georeferenced models, decided from the first
    // placement (see coordinationOffsetFor); null for near-origin models.
    coordOffset: undefined,
  }
  let occurrenceId = 0 // global, emission order — shared across both batches
  forEachVectorItem(flatMeshes, (flatMesh) => {
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      totals.skippedFlatMeshes++
      return
    }
    forEachVectorItem(placedVec, (placed) => {
      const geomExpressID = placed?.geometryExpressID
      // Skip a placement with no geometry id — mirrors the parent guard
      // above. Without it, an undefined id would key one shared "undefined"
      // group and cross the Conway boundary with a bogus id.
      if (geomExpressID === undefined) {
        totals.skippedPlacedGeometries++
        return
      }
      let group = groups.get(geomExpressID)
      if (group === undefined) {
        // Known-bad shape: count this placement as skipped (matching the
        // merged path's per-placement semantics) but don't re-cross the
        // Conway boundary for a geometry we already rejected.
        if (bad.has(geomExpressID)) {
          totals.skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const geom = api.GetGeometry(modelID, geomExpressID)
        if (!geom) {
          bad.add(geomExpressID)
          totals.skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const indexSize = geom.GetIndexDataSize()
        // eslint-disable-next-line new-cap
        const vertSize = geom.GetVertexDataSize()
        // vertSize must be a whole number of `[p,n]` vertices — otherwise the
        // truncated vertCount would leave indices pointing past the copied
        // vertices (a corrupt triangle in the shared batch buffer).
        if (indexSize === 0 || vertSize === 0 || vertSize % VERT_STRIDE !== 0) {
          bad.add(geomExpressID)
          totals.skippedPlacedGeometries++
          return
        }
        const vertCount = (vertSize / VERT_STRIDE) | 0
        // eslint-disable-next-line new-cap
        const rawVerts = api.GetVertexArray(geom.GetVertexData(), vertCount * VERT_STRIDE)
        // eslint-disable-next-line new-cap
        const rawIndices = api.GetIndexArray(geom.GetIndexData(), indexSize)
        group = {
          geometry: localGeometry(rawVerts, rawIndices, vertCount),
          vertCount,
          indexCount: indexSize,
          placements: [],
        }
        groups.set(geomExpressID, group)
        totals.vertexCount += vertCount
        totals.indexCount += indexSize
      }
      const color = placed.color ?? DEFAULT_COLOR
      // Drop an exact coincident duplicate (same part + geometry + transform +
      // colour): it would z-fight the one already placed. See CoincidenceSet.
      if (!seen.add(parentExpressId, geomExpressID, placed.flatTransformation, color)) {
        totals.skippedCoincidentPlacements++
        return
      }
      if (totals.coordOffset === undefined) {
        totals.coordOffset = decideCoordinationOffset(placed.flatTransformation)
      }
      group.placements.push({
        matrix: placed.flatTransformation,
        color,
        parentExpressId,
        occurrenceId,
        // Per-occurrence identity (STEP): the NAUO path disambiguates a
        // reused part's placements; the geometry id names the solid. Both
        // ride into the per-batch pick tables so the batched path can
        // narrow selection / hide to one occurrence like the merged path.
        occurrencePath: placed.occurrencePath ?? null,
        geometryExpressId: geomExpressID,
      })
      occurrenceId++
      totals.placements++
      if (color.w < OPAQUE_ALPHA) {
        totals.transparentPlacements++
      }
    })
  })
  return {groups, totals}
}


/**
 * Build one `BatchedMesh` from the placements of every group that match the
 * given transparency, or null when none do.
 *
 * @param {Map} groups geometryExpressID → group
 * @param {boolean} transparent select transparent (alpha<1) placements
 * @param {?Array<number>} coordOffset `[x,y,z]` origin-recenter offset to
 *   subtract from every instance matrix, or null for no recenter.
 * @return {BatchHandle|null}
 */
function buildBatch(groups, transparent, coordOffset) {
  // Size the batch up front: a geometry slot for each shape with a matching
  // placement, an instance slot per matching placement.
  let vertexCount = 0
  let indexCount = 0
  let instanceCount = 0
  const used = []
  for (const group of groups.values()) {
    const placements = group.placements.filter((p) => (p.color.w < OPAQUE_ALPHA) === transparent)
    if (placements.length === 0) {
      continue
    }
    used.push({group, placements})
    vertexCount += group.vertCount
    indexCount += group.indexCount
    instanceCount += placements.length
  }
  if (instanceCount === 0) {
    return null
  }

  const material = makeSurfaceMaterial({side: DoubleSide})
  if (transparent) {
    material.transparent = true
    // Don't occlude geometry behind the glass; per-instance alpha blends.
    material.depthWrite = false
  }
  const mesh = new BatchedMesh(instanceCount, vertexCount, indexCount, material)
  // Exactly-coplanar BIM interfaces (wall top vs roof underside, layer
  // faces) tie on depth, so the depth test resolves by draw order. The
  // opaque batch keeps insertion order — three's default per-frame
  // camera-distance sort would flip the winning surface as the camera
  // moves (visible speckle/shimmer at soffits, rakes, ridges). The
  // transparent batch must still sort for blend correctness.
  mesh.sortObjects = transparent
  const instanceParents = new Uint32Array(instanceCount)
  const instanceOccurrenceIds = new Uint32Array(instanceCount)
  const instanceGeometryIds = new Uint32Array(instanceCount)
  const instanceOccurrencePaths = new Array(instanceCount)
  let hasOccurrencePaths = false
  const instanceGeometry = new Array(instanceCount)
  const instanceColors = new Array(instanceCount)
  const matrix = new Matrix4()
  const rgba = new Vector4()

  for (const {group, placements} of used) {
    const geometryId = mesh.addGeometry(group.geometry)
    for (const placement of placements) {
      const batchId = mesh.addInstance(geometryId)
      matrix.fromArray(placement.matrix)
      if (coordOffset !== null && coordOffset !== undefined) {
        // Recenter a georeferenced model to the origin (see
        // coordinationOffsetFor) so its float32 render stays precise.
        matrix.elements[12] -= coordOffset[0]
        matrix.elements[13] -= coordOffset[1]
        matrix.elements[14] -= coordOffset[2]
      }
      mesh.setMatrixAt(batchId, matrix)
      // Vector4 carries alpha into the batch's RGBA colours texture.
      mesh.setColorAt(batchId, rgba.set(
        placement.color.x, placement.color.y, placement.color.z, placement.color.w))
      instanceParents[batchId] = placement.parentExpressId
      instanceOccurrenceIds[batchId] = placement.occurrenceId
      instanceGeometryIds[batchId] = placement.geometryExpressId
      instanceOccurrencePaths[batchId] = placement.occurrencePath
      if (placement.occurrencePath) {
        hasOccurrencePaths = true
      }
      instanceGeometry[batchId] = group.geometry
      instanceColors[batchId] = placement.color
    }
  }
  return {
    mesh, material, transparent,
    instanceParents, instanceOccurrenceIds, instanceGeometry, instanceColors,
    instanceGeometryIds,
    // Null (not an all-null array) for IFC so consumers can cheaply skip
    // occurrence lookups — mirrors the merged path's IfcInstanceMap.
    instanceOccurrencePaths: hasOccurrencePaths ? instanceOccurrencePaths : null,
  }
}


/**
 * Build `THREE.BatchedMesh` batches from a captured Conway FlatMesh stream.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI. Needs `GetGeometry`,
 *   `GetVertexArray`, `GetIndexArray`.
 * @param {number} modelID
 * @return {BatchedModel}
 */
export function flatMeshToBatchedModel(flatMeshes, api, modelID) {
  const {groups, totals} = collectGroups(flatMeshes, api, modelID)
  const coordOffset = totals.coordOffset ?? null

  const batches = [
    buildBatch(groups, false, coordOffset),
    buildBatch(groups, true, coordOffset),
  ].filter(Boolean)

  const parents = new Set()
  for (const batch of batches) {
    for (const p of batch.instanceParents) {
      parents.add(p)
    }
  }

  return {
    batches,
    stats: {
      uniqueGeometryCount: groups.size,
      instanceCount: totals.placements,
      vertexCount: totals.vertexCount,
      // Keys below mirror buildConwayIfcModel's stats so the shared
      // `[conwayDirect] parsed` log line works unchanged. triangleCount /
      // vertexCount are the *unique* (deduped) totals — the memory win.
      triangleCount: (totals.indexCount / INDICES_PER_TRIANGLE) | 0,
      parentCount: parents.size,
      materialCount: batches.length,
      transparentInstanceCount: totals.transparentPlacements,
      skippedFlatMeshes: totals.skippedFlatMeshes,
      skippedPlacedGeometries: totals.skippedPlacedGeometries,
      skippedCoincidentPlacements: totals.skippedCoincidentPlacements,
    },
    // `[x,y,z]` origin offset already subtracted from the batch matrices for a
    // georeferenced model (null for near-origin models). The caller stamps it
    // on the model root so a rendered point maps back to true world coords.
    coordinationOffset: coordOffset,
  }
}

import {BatchedMesh, Box3, DoubleSide, Group, Matrix4, Vector4} from 'three'
import debug, {WARN} from '../../utils/debug'
import {forEachVectorItem} from './conwayVector'
import {makeSurfaceMaterial} from '../lookMaterial'
import {
  CoincidenceSet,
  DEFAULT_COLOR,
  INDICES_PER_TRIANGLE,
  OPAQUE_ALPHA,
  VERT_STRIDE,
  decideCoordinationOffset,
  localGeometry,
} from './flatMeshToBatchedModel'


/* eslint-disable no-magic-numbers */
/**
 * Initial per-batch capacities; each grows 2x in place when exceeded
 * (three r167+ BatchedMesh.setInstanceCount / setGeometrySize).
 */
const INITIAL_INSTANCES = 1024
const INITIAL_VERTICES = 1 << 18
const INITIAL_INDICES = 1 << 19
const GROWTH = 2
// Upper bound for the spread probe below. Nothing is gained by knowing an
// engine tolerates more than this: the thresholds derived from it are
// already clamped by their own constants at that point.
const SPREAD_PROBE_CEILING = 200000
// Ceiling on the geometry count from which a batch stops doubling blindly
// and is sized for the whole model instead (see projectCapacity_), and on
// the count past which it is treated as having ONE resize left. Both are
// clamped down to a fraction of the ENGINE's measured spread limit; these
// are the caps that apply when the engine is roomy.
export const PRESIZE_FROM_GEOMETRIES = 50000
export const LAST_CHANCE_GEOMETRIES = 110000
// Fractions of the probed spread limit the two thresholds sit at.
//
// The presize crossing has to happen early enough that a batch reaches it
// before its FIRST natural resize, or the mechanism never runs at all: a
// model of single-triangle geometries fills the initial 262,144-vertex
// reservation at 87,382 geometries, which is above JavaScriptCore's spread
// limit, so on Safari the first resize is already the one that throws
// (codex round 4 on Share#1809). 0.6 puts it comfortably below any
// engine's ceiling; 0.85 leaves the last-chance reservation as late as is
// safe, so it projects from the largest sample it can get.
//
// Both also have to absorb the fact that the probe runs from a different
// stack depth than three's resize will. Measured on this V8: the limit
// falls from 125,263 at the probe's own depth to 122,851 with 200 extra
// frames beneath it — 1.9%. A 15% margin covers that with room to spare;
// sitting ON the probed number would not.
const PRESIZE_SPREAD_SAFETY = 0.6
const LAST_CHANCE_SPREAD_SAFETY = 0.85
// Over-provision the projected whole-model requirement by this much. The
// projection is re-run at every later growth, so this only has to cover
// the error of the LAST projection made before the ceiling above; measured
// over-shoot on sp-946MB was already +11% at the first trigger point, so
// this is margin on top of a conservative estimator, not the estimator.
const PRESIZE_HEADROOM = 1.15
// Pump progress below which the projection is not trusted: dividing a
// handful of dense products by a near-zero fraction reserves gigabytes.
const PRESIZE_MIN_FRACTION = 0.02
// Headroom the last-chance reservation uses in place of PRESIZE_HEADROOM.
//
// The projection is linear in products, which is only conservative when
// early products are at least as geometry-dense as late ones. A model that
// front-loads reuse and back-loads novel or denser shapes breaks that and
// the projection under-reserves (codex P1 on Share#1809). Below the
// threshold a later resize corrects it; past the threshold there is no
// later resize, so the estimate has to absorb the error instead. Read it
// as the tolerance it is: the remaining products may be up to 50% denser
// per product than everything seen so far.
const LAST_CHANCE_HEADROOM = 1.5
// Floor for the last-chance reservation as a multiple of what the batch
// needs right now, applied when there is no usable pump progress to
// project from. Unreachable in production — `onMeshBatch` only fires on
// the deferred pump path, which always reports totals — so this is what
// keeps the branch total rather than a second estimator.
const LAST_CHANCE_GROWTH = 2


// Memoised result of probeSpreadLimit().
let spreadLimitCache = null


/**
 * Largest argument count this engine's `Math.max(...)` survives.
 *
 * three r0.184's `BatchedMesh.setGeometrySize` spreads one argument per
 * ACTIVE geometry into `Math.max( ...validRanges.map( … ) )`
 * (node_modules/three/src/objects/BatchedMesh.js:1329 and :1339), so once a
 * batch holds more geometries than the engine's argument limit, EVERY
 * resize of it throws and the batch can never grow again. Everything this
 * module does about that — when to stop doubling and project, when to take
 * the last reservation — has to sit below this number.
 *
 * Probed rather than hard-coded because it is a property of the engine and
 * of stack depth at the call site, not of three: measured at 125,279 on the
 * V8 that root-caused Share#1809, while JavaScriptCore caps argument
 * spreads near 65k and SpiderMonkey allows more. A constant encodes one
 * engine, and the wrong one is not a smaller margin but no mechanism at
 * all — a model of single-triangle geometries needs its first resize at
 * 87,382 geometries, so on Safari a 110,000 threshold is never reached
 * before the throw (codex round 4 on Share#1809).
 *
 * Binary search over hole-y arrays: `new Array(n)` allocates no elements
 * and the spread reads holes as `undefined`, so each probe costs the spread
 * itself and nothing else. ~18 iterations, memoised, and deliberately
 * called from the builder's constructor rather than at import time so a
 * module load never pays for it.
 *
 * @return {number} the largest n for which `Math.max(...new Array(n))`
 *   does not throw, capped at SPREAD_PROBE_CEILING
 */
export function probeSpreadLimit() {
  if (spreadLimitCache !== null) {
    return spreadLimitCache
  }
  const survives = (n) => {
    try {
      Math.max(...new Array(n))
      return true
    } catch {
      // RangeError on every engine that has a limit; catching broadly
      // because the class of the throw is not part of any contract.
      return false
    }
  }
  let low = 1
  let high = SPREAD_PROBE_CEILING
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (survives(mid)) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  spreadLimitCache = low
  return spreadLimitCache
}
// Console cap for per-record skip warnings (see warnBadRecord_): a model
// with many budget-evicted geometries (conway#535) shouldn't flood the
// console one line per id -- the load report's skipped* counts already
// carry the full total (Sentry SHARE-1NK).
const MAX_BAD_RECORD_WARNINGS = 5
/* eslint-enable no-magic-numbers */


/**
 * IncrementalBatchedBuilder — slice B1 of
 * design/new/demand-tiled-rendering.md: assemble the DURABLE BatchedMesh
 * model incrementally from the demand pump's delta FlatMesh batches, so
 * there is no monolithic end-of-load build and no preview→model swap.
 *
 * Feed each pump delta to `appendBatch`; the builder deduplicates
 * geometry by `geometryExpressID` across batches (fetched from Conway
 * once), appends instances into an opaque and/or transparent
 * `THREE.BatchedMesh` (created lazily, grown in place with 2x
 * amortization), and accumulates the per-instance pick tables the
 * batched consumers read (`instanceParents`, `instanceOccurrenceIds`,
 * `instanceGeometryIds`, `instanceColors`). The SOURCE geometries are not
 * among them: the batch buffers already hold every byte, and the consumers
 * that need a shape back read it out of them (`batchedInstanceGeometry`),
 * so nothing here outlives `finalize` (Share#1810).
 *
 * `root` is a stable `Group` — install it in the scene on the first
 * batch and geometry simply appears as it extracts. `finalize`
 * stamps the pick tables, computes bounds + BVHs, and returns
 * `{batches, stats}` in exactly the `flatMeshToBatchedModel` shape, so
 * `buildBatchedConwayModel`'s decoration applies unchanged.
 *
 * Instance/table layout matches the one-shot builder given the same
 * stream: emission-order `occurrenceId`s, opaque/transparent split by
 * placement alpha, per-placement skip semantics.
 */
export class IncrementalBatchedBuilder {
  /**
   * @param {object} api Conway-compatible IfcAPI (`GetGeometry`,
   *   `GetVertexArray`, `GetIndexArray`).
   * @param {number} modelID
   * @param {object} [opts]
   * @param {Function} [opts.onBounds] called with a world-space `Box3`
   *   for every appended instance (drives the camera follow).
   * @param {number} [opts.initialInstances] test hook: initial capacity.
   * @param {number} [opts.initialVertices] test hook: initial capacity.
   * @param {number} [opts.initialIndices] test hook: initial capacity.
   * @param {number} [opts.presizeFromGeometries] test hook: geometry count
   *   at which projectCapacity_ takes over from doubling. Lowering it is
   *   the only way to exercise the projection without building a batch of
   *   PRESIZE_FROM_GEOMETRIES real geometries.
   * @param {number} [opts.lastChanceGeometries] test hook: geometry count
   *   at which a resize is treated as the last one this batch will get.
   * @param {number} [opts.spreadLimit] test hook: stand in for
   *   probeSpreadLimit(), so the thresholds derived from a JavaScriptCore-
   *   or V8-sized ceiling can be pinned without running on that engine.
   *   Ignored for whichever of the two thresholds is given explicitly.
   */
  constructor(api, modelID, opts = {}) {
    this.api = api
    this.modelID = modelID
    this.onBounds = opts.onBounds ?? null
    this.initialInstances = opts.initialInstances ?? INITIAL_INSTANCES
    this.initialVertices = opts.initialVertices ?? INITIAL_VERTICES
    this.initialIndices = opts.initialIndices ?? INITIAL_INDICES
    // Both thresholds are the smaller of their own cap and a fraction of
    // what this engine's `Math.max(...)` spread actually tolerates, so a
    // roomy engine keeps the tuned numbers (V8 here: 50,000 and 106,486)
    // and a tight one is pulled below its ceiling instead of past it
    // (JavaScriptCore at ~65,536: 39,321 and 55,705). See
    // probeSpreadLimit.
    const spreadLimit = opts.spreadLimit ?? probeSpreadLimit()
    this.presizeFromGeometries = opts.presizeFromGeometries ?? Math.min(
      PRESIZE_FROM_GEOMETRIES, Math.floor(spreadLimit * PRESIZE_SPREAD_SAFETY))
    this.lastChanceGeometries = opts.lastChanceGeometries ?? Math.min(
      LAST_CHANCE_GEOMETRIES, Math.floor(spreadLimit * LAST_CHANCE_SPREAD_SAFETY))
    this.root = new Group()
    // geometryExpressID → {geometry, vertCount, indexCount, box,
    // idByBatch: Map(batchState → geometryId)} — geometry fetched from
    // Conway exactly once per model.
    this.geometryCache = new Map()
    // Permanently unusable shapes: conway handed back nothing, or handed
    // back a degenerate buffer (zero-size, or a vertex size that isn't a
    // whole number of VERT_STRIDE verts). Those are properties of the
    // SHAPE, so no later batch can do better — never retried.
    this.badGeometry = new Set()
    // Ids whose Conway-boundary fetch THREW during the batch currently
    // being appended (GEOMETRY_BUDGET eviction, see resolveGeometry_'s
    // catch). Unlike badGeometry this is transient: cleared at the top of
    // every appendBatch so the next batch retries.
    this.failedThisBatch = new Set()
    // Running count backing warnBadRecord_'s console cap.
    this.badRecordWarnings = 0
    // Demand-pump product progress, the only whole-model quantity a
    // streaming builder can see (setPumpProgress). Zeroes mean "no pump
    // told us" — every one-shot and unit-test caller — and disable the
    // capacity projection, leaving the 2x doubling in charge.
    this.pumpDone = 0
    this.pumpTotal = 0
    // Placement identities already appended, across all batches — drops
    // exact duplicate placements that would z-fight (see CoincidenceSet).
    // Load-time only: `finalize` releases it (conway#636).
    this.seenPlacements = new CoincidenceSet()
    // Origin-recenter frame for georeferenced models (see
    // coordinationOffsetFor). `offset` is `undefined` until the first
    // placement decides it; then `[x,y,z]` (subtracted from every
    // instance) or null (no-op).
    //
    // Shared with the parse-time preview path when the caller passes
    // one, and THIS BUILDER IS THE ONLY WRITER: the preview channel can
    // emit payloads whose placement never resolved (conway#465), so the
    // frame must be decided by the durable stream's first placement —
    // the authoritative one — and previews only read it.
    this.coordination = opts.coordination ?? {offset: undefined}
    // Lazily created per transparency: see ensureBatch_.
    this.opaque = null
    this.transparent = null
    this.occurrenceId = 0
    this.totals = {
      placements: 0, transparentPlacements: 0, vertexCount: 0, indexCount: 0,
      skippedFlatMeshes: 0, skippedPlacedGeometries: 0, skippedCoincidentPlacements: 0,
    }
    this.scratchMatrix = new Matrix4()
    this.scratchRgba = new Vector4()
    this.scratchBox = new Box3()
  }


  /** @return {boolean} True once any instance has been appended. */
  hasContent() {
    return this.totals.placements > 0
  }


  /**
   * Record how far the demand pump has got through the model's products,
   * in the pump's own units (`geometryDone` / `geometryTotal` from
   * `conwayDirectIfcLoader`'s loop — products extracted, not FlatMeshes
   * delivered, which is a smaller number because not every product yields
   * geometry). This is the only signal that lets a builder assembling one
   * batch at a time size the batch for the WHOLE model instead of
   * doubling into it; see projectCapacity_ for what it is used for and
   * Share#1809 for why doubling into it is not survivable at scale.
   *
   * Called per batch rather than passed to the constructor because the
   * total is not known until the first `ExtractGeometryBatch` returns —
   * which is the same call that produces the first batch.
   *
   * @param {number} done products the pump has extracted so far
   * @param {number} total products the pump reported in the model
   */
  setPumpProgress(done, total) {
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
      return
    }
    this.pumpDone = done
    this.pumpTotal = total
  }


  /**
   * Append one pump delta (a FlatMesh vector or array). Never throws
   * on per-record problems — mirrors the one-shot builder's skip
   * accounting.
   *
   * Both loop bodies below are guarded individually rather than once
   * around the whole method: conway's GEOMETRY_BUDGET eviction
   * (conwayDirectIfcLoader.js, conway#535) can free a native asset
   * between delivery and our reading it, and embind then throws
   * "Cannot pass deleted object as a pointer of type IfcGeometry" from
   * whichever wrapper touches it next — a FlatMesh's own accessors, or
   * one of its PlacedGeometry entries inside appendPlacement_. Letting
   * either throw escape this method would abort the whole batch (up to
   * 64 products) instead of the one poisoned record, which is exactly
   * the Sentry SHARE-1NK regression: don't reintroduce it here.
   *
   * @param {object|Array} flatMeshes delta FlatMesh source
   */
  appendBatch(flatMeshes) {
    // Eviction state is a property of THIS pump call: whatever the budget
    // freed before it stays freed for its whole duration, and conway
    // re-extracts an evicted shape only when a later product maps it. So
    // a boundary throw suppresses further fetches of that id within this
    // batch (they would fail identically) and no further — see
    // resolveGeometry_.
    this.failedThisBatch.clear()
    forEachVectorItem(flatMeshes, (flatMesh) => {
      try {
        const parentExpressId = flatMesh?.expressID
        const placedVec = flatMesh?.geometries
        if (parentExpressId === undefined || !placedVec) {
          this.totals.skippedFlatMeshes++
          return
        }
        forEachVectorItem(placedVec, (placed) => {
          try {
            this.appendPlacement_(parentExpressId, placed)
          } catch (e) {
            this.totals.skippedPlacedGeometries++
            this.warnBadRecord_('appendPlacement_ failed; skipping placement:', e)
          }
        })
      } catch (e) {
        this.totals.skippedFlatMeshes++
        this.warnBadRecord_('FlatMesh read failed; skipping:', e)
      }
    })
  }


  /**
   * Log one per-record skip, deduped/capped so a model with many bad
   * records (e.g. every geometry evicted past the budget) doesn't flood
   * the console — see MAX_BAD_RECORD_WARNINGS. The load report's
   * skipped* totals (finalize()) carry the full count regardless of how
   * many lines actually printed.
   *
   * @param {string} message
   * @param {Error} e underlying error, logged so a Sentry load report
   *   still shows why geometry was skipped.
   */
  warnBadRecord_(message, e) {
    if (this.badRecordWarnings++ < MAX_BAD_RECORD_WARNINGS) {
      debug(WARN).warn(`IncrementalBatchedBuilder: ${message}`, e)
    }
  }


  /**
   * Stamp typed pick tables, compute bounds, and hand back the batches
   * + stats in the `flatMeshToBatchedModel` return shape.
   *
   * @return {{batches: Array, stats: object}}
   */
  finalize() {
    const batches = []
    for (const state of [this.opaque, this.transparent]) {
      if (state === null || state.cursor === 0) {
        continue
      }
      state.mesh.instanceParents = Uint32Array.from(state.instanceParents)
      state.mesh.instanceOccurrenceIds = Uint32Array.from(state.instanceOccurrenceIds)
      state.mesh.instanceGeometryIds = Uint32Array.from(state.instanceGeometryIds)
      // Null (not an all-null array) for IFC — matches the one-shot
      // builder so consumers can cheaply skip occurrence lookups.
      state.mesh.instanceOccurrencePaths =
        state.instanceOccurrencePaths.some((p) => p !== null) ?
          state.instanceOccurrencePaths.slice() : null
      state.mesh.instanceColors = state.instanceColors.slice()
      // The mesh has stopped growing, so its exact requirement is finally
      // known: release the reserved space nothing used (Share#1809).
      this.trimCapacity_(state)
      // The mesh has stopped growing, so a bounding volume is finally
      // meaningful. Compute it and hand culling back — see ensureBatch_
      // for why it had to be off while streaming. assembleBatchedModel
      // recomputes these too; doing it here keeps the invariant with the
      // builder that turned culling off, rather than relying on a
      // consumer that the fallback paths may not reach.
      state.mesh.computeBoundingBox?.()
      state.mesh.computeBoundingSphere?.()
      state.mesh.frustumCulled = true
      batches.push({
        mesh: state.mesh,
        material: state.material,
        transparent: state.transparentFlag,
        instanceParents: state.mesh.instanceParents,
        instanceOccurrenceIds: state.mesh.instanceOccurrenceIds,
        instanceGeometryIds: state.mesh.instanceGeometryIds,
        instanceOccurrencePaths: state.mesh.instanceOccurrencePaths,
        instanceColors: state.mesh.instanceColors,
      })
    }
    const parents = new Set()
    for (const batch of batches) {
      for (const parent of batch.instanceParents) {
        parents.add(parent)
      }
    }
    // The duplicate guard is load-time only and is at its maximum right here,
    // at the end of the load — nothing reads it afterwards, so release it
    // rather than retaining it for the life of the model (conway#636).
    this.seenPlacements.clear()
    // Same for the source geometries. `addGeometry` copied each one into the
    // batch buffers and kept no reference, so past this point the cache is
    // the ONLY owner of a full duplicate of the model's geometry — 171.5 MB
    // on sp-231MB.ifc, byte-lever 1 of the conway#679 attribution. Dropping
    // `mesh.instanceGeometry` alone would not have freed a byte of it
    // (Share#1810): the cache is reachable from `ShareIfcLoader.parse`'s
    // closure for as long as conway's proxy holds the open `settings`
    // object, so the release has to happen here, where the builder knows it
    // is done. Nothing re-enters the builder after finalize — the degraded
    // end-of-load rebuilds construct a fresh one from `recapture()`. Read
    // the count the load report wants BEFORE emptying it.
    const uniqueGeometryCount = this.geometryCache.size
    this.geometryCache.clear()
    return {
      batches,
      stats: {
        uniqueGeometryCount,
        instanceCount: this.totals.placements,
        vertexCount: this.totals.vertexCount,
        triangleCount: (this.totals.indexCount / INDICES_PER_TRIANGLE) | 0,
        parentCount: parents.size,
        materialCount: batches.length,
        transparentInstanceCount: this.totals.transparentPlacements,
        skippedFlatMeshes: this.totals.skippedFlatMeshes,
        skippedPlacedGeometries: this.totals.skippedPlacedGeometries,
        skippedCoincidentPlacements: this.totals.skippedCoincidentPlacements,
      },
    }
  }


  /**
   * Resolve (or reject) one placement and append its instance.
   *
   * ORDERING IS LOAD-BEARING (codex P2 on Share#1798). Every read that
   * crosses the Conway boundary — the PlacedGeometry's own accessors and
   * the GetGeometry/GetVertexArray/GetIndexArray calls behind
   * resolveGeometry_ — is staged into locals BEFORE the first mutation,
   * because any of them can throw embind's "Cannot pass deleted object"
   * when the geometry budget evicts the native asset (see appendBatch).
   * A throw between `addInstance` and the pick-table pushes would leave
   * the mesh holding an instance that `cursor` and the tables never
   * recorded, so every later instance id maps to the wrong row of
   * selection metadata — and appendBatch's per-placement guard would
   * cheerfully keep appending into the now-corrupt builder. Once staging
   * is done the rest is three.js writes into preallocated buffers and
   * JS array pushes, which don't throw in practice.
   *
   * @param {number} parentExpressId
   * @param {object} placed Conway PlacedGeometry
   */
  appendPlacement_(parentExpressId, placed) {
    const geomExpressID = placed?.geometryExpressID
    if (geomExpressID === undefined) {
      this.totals.skippedPlacedGeometries++
      return
    }
    const color = placed.color ?? DEFAULT_COLOR
    // One staged read of the transform serves both the dedup key and the
    // instance matrix: Matrix4.fromArray copies element-wise, so
    // `matrix.elements` is value-identical to the source array (and the
    // recenter offset is only subtracted from it further down, after the
    // key is taken — matching the one-shot builder, which keys on the raw
    // placement).
    const matrix = this.scratchMatrix.fromArray(placed.flatTransformation)
    const occurrencePath = placed.occurrencePath ?? null
    const entry = this.resolveGeometry_(geomExpressID)
    if (entry === null) {
      this.totals.skippedPlacedGeometries++
      return
    }
    // Drop an exact coincident duplicate (same part + geometry + transform +
    // colour): it would z-fight the one already appended. See CoincidenceSet.
    //
    // PROBE, CAPACITY, THEN COMMIT — the three-step is load-bearing at both
    // ends, and both ends are codex findings on Share#1809.
    //
    // Probing FIRST, before `ensureBatch_`/`ensureCapacity_`, keeps a
    // duplicate from mutating anything: a duplicate arriving at
    // `cursor === maxInstances` would otherwise double the instance
    // buffers to make room for an instance that is never added, and
    // `finalize`'s trim only reclaims geometry, so that doubling is
    // retained for the life of the model. It also keeps an allocation
    // failure from turning a harmless duplicate into a failed placement.
    //
    // Committing LAST, only once capacity is secured, keeps the reverse
    // from happening: `ensureCapacity_` is the one call left here that can
    // throw — that is the whole subject of Share#1809 — and a placement
    // marked seen but never appended would make a later re-emission a
    // duplicate of something that does not exist, counted as a coincident
    // skip instead of retried.
    //
    // How reachable that is depends on which source you believe, so assume
    // the worse one. Conway's DELTA CONTRACT (`ifc_api.d.ts`) promises
    // "each placed instance is emitted exactly once across all calls",
    // which would make it unreachable; but this file's own
    // "drops an exact coincident duplicate that arrives in a later delta
    // batch" test says the pump re-emits identical placements via
    // rel-aggregates re-extraction, and the whole cross-batch
    // CoincidenceSet exists because of that. If the test is right, this is
    // a live path, not a hypothetical one. (Either way the degraded
    // end-of-load builds are not it: they construct a FRESH builder from
    // `recapture()` and never see this `seenPlacements`.)
    //
    // The split exists so both can hold at once without hashing twice: the
    // probe runs on the STAGED matrix elements, after every Conway-boundary
    // read and the geometry fetch above, so a boundary throw still cannot
    // mark an identity as seen (codex P2 on Share#1798).
    const placementToken =
      this.seenPlacements.probe(parentExpressId, geomExpressID, matrix.elements, color)
    if (placementToken === null) {
      this.totals.skippedCoincidentPlacements++
      return
    }
    const isTransparent = color.w < OPAQUE_ALPHA
    const state = this.ensureBatch_(isTransparent)
    this.ensureCapacity_(state, entry)
    this.seenPlacements.commit(placementToken)

    let geometryId = entry.idByBatch.get(state)
    if (geometryId === undefined) {
      geometryId = state.mesh.addGeometry(entry.geometry)
      entry.idByBatch.set(state, geometryId)
      state.geometryCount++
    }
    const batchId = state.mesh.addInstance(geometryId)
    // Decide the model-wide origin-recenter offset from the first placement
    // that actually appends, then subtract it from every instance so a
    // georeferenced model renders at the origin (float32-precise) instead of
    // at ~1e7 m. See decideCoordinationOffset (also logs the decision once,
    // Share#1632). Stamped on the root for consumers that need to map a
    // rendered point back to true world coordinates.
    //
    // This is only SHARE's backstop half of that mapping, and since the
    // conway#680 fix chain (conway#685, pinned by Share#1816) it essentially
    // never fires — the engine recentres first, and its frame
    // is stamped alongside as `userData.appliedCoordination`. The two compose
    // as `rendered = (A * world) - coordinationOffset`; the whole contract is
    // written once, in `./appliedCoordination`.
    if (this.coordination.offset === undefined) {
      this.coordination.offset = decideCoordinationOffset(matrix.elements, this.coordination)
    }
    if (this.coordination.offset !== null) {
      this.root.userData.coordinationOffset = this.coordination.offset
      matrix.elements[12] -= this.coordination.offset[0]
      matrix.elements[13] -= this.coordination.offset[1]
      matrix.elements[14] -= this.coordination.offset[2]
    }
    state.mesh.setMatrixAt(batchId, matrix)
    state.mesh.setColorAt(batchId, this.scratchRgba.set(color.x, color.y, color.z, color.w))
    state.instanceParents.push(parentExpressId)
    state.instanceOccurrenceIds.push(this.occurrenceId)
    // Per-occurrence identity (STEP): NAUO path + solid geometry id, so
    // the batched consumers can narrow selection / hide to one occurrence.
    state.instanceGeometryIds.push(geomExpressID)
    state.instanceOccurrencePaths.push(occurrencePath)
    state.instanceColors.push(color)
    state.cursor++
    this.occurrenceId++
    this.totals.placements++
    if (isTransparent) {
      this.totals.transparentPlacements++
    }
    if (this.onBounds !== null) {
      try {
        this.onBounds(this.scratchBox.copy(entry.box).applyMatrix4(matrix))
      } catch {
        // Camera follow is best-effort — never break the append.
      }
    }
  }


  /**
   * Fetch-and-cache one geometry from Conway (once per model), or null
   * for known-bad/degenerate shapes.
   *
   * @param {number} geomExpressID
   * @return {object|null} cache entry
   */
  resolveGeometry_(geomExpressID) {
    const cached = this.geometryCache.get(geomExpressID)
    if (cached !== undefined) {
      return cached
    }
    if (this.badGeometry.has(geomExpressID) || this.failedThisBatch.has(geomExpressID)) {
      return null
    }
    let geom
    let indexSize
    let vertCount
    let rawVerts
    let rawIndices
    try {
      // eslint-disable-next-line new-cap
      geom = this.api.GetGeometry(this.modelID, geomExpressID)
      if (!geom) {
        this.badGeometry.add(geomExpressID)
        return null
      }
      // eslint-disable-next-line new-cap
      indexSize = geom.GetIndexDataSize()
      // eslint-disable-next-line new-cap
      const vertSize = geom.GetVertexDataSize()
      if (indexSize === 0 || vertSize === 0 || vertSize % VERT_STRIDE !== 0) {
        this.badGeometry.add(geomExpressID)
        return null
      }
      vertCount = (vertSize / VERT_STRIDE) | 0
      // eslint-disable-next-line new-cap
      rawVerts = this.api.GetVertexArray(geom.GetVertexData(), vertCount * VERT_STRIDE)
      // eslint-disable-next-line new-cap
      rawIndices = this.api.GetIndexArray(geom.GetIndexData(), indexSize)
    } catch (e) {
      // conway's GEOMETRY_BUDGET_MB (conwayDirectIfcLoader.js) evicts the
      // least-recently-used native geometry at each pump batch (conway#535).
      // If eviction lands between the demand pump delivering this id and
      // our copying it out here, embind throws "Cannot pass deleted object
      // as a pointer of type IfcGeometry" from whichever of the calls
      // above touches the freed wrapper. Degrade to one skipped placement
      // — never let it escape and take the whole batch with it
      // (Sentry SHARE-1NK).
      //
      // This failure is TRANSIENT, unlike the degenerate-shape branches
      // above, so it must NOT go in badGeometry: conway's contract is
      // that an evicted shape is gone from GetGeometry only until
      // something re-extracts it, which happens when a later product maps
      // it — a retry in a LATER batch can therefore succeed and recover
      // every placement that reuses the shape. Blacklisting it
      // permanently would drop them all. Scope the suppression to this
      // batch instead (cleared in appendBatch): within one pump call the
      // eviction state can't change, so re-fetching here is a guaranteed
      // second failure and only costs another boundary throw.
      this.failedThisBatch.add(geomExpressID)
      this.warnBadRecord_(`geometry ${geomExpressID} fetch failed; skipping:`, e)
      return null
    }
    const geometry = localGeometry(rawVerts, rawIndices, vertCount)
    geometry.computeBoundingBox()
    const entry = {
      geometry,
      vertCount,
      indexCount: indexSize,
      box: geometry.boundingBox,
      idByBatch: new Map(),
    }
    this.geometryCache.set(geomExpressID, entry)
    this.totals.vertexCount += vertCount
    this.totals.indexCount += indexSize
    return entry
  }


  /**
   * Get (or lazily create + parent) the batch state for a transparency.
   *
   * @param {boolean} transparent
   * @return {object} batch state
   */
  ensureBatch_(transparent) {
    const key = transparent ? 'transparent' : 'opaque'
    if (this[key] !== null) {
      return this[key]
    }
    const material = makeSurfaceMaterial({side: DoubleSide})
    if (transparent) {
      material.transparent = true
      material.depthWrite = false
    }
    const mesh = new BatchedMesh(
      this.initialInstances, this.initialVertices, this.initialIndices, material)
    // Exactly-coplanar BIM interfaces tie on depth and resolve by draw
    // order: keep insertion order for the opaque batch (three's default
    // per-frame camera sort flips the coplanar winner as the camera
    // moves); the transparent batch must still sort for blending.
    mesh.sortObjects = transparent
    // Culling is OFF for the whole streaming phase, and this is load-
    // bearing rather than an optimization opt-out.
    //
    // `BatchedMesh` declares `boundingSphere`, so three's
    // `Frustum.intersectsObject` computes it once on first render and
    // then CACHES it — nothing invalidates it when instances append.
    // Computed on the first frame, when a handful of instances occupy a
    // mesh reserved for thousands, it freezes at near-zero radius, and
    // every batch after that is culled against it. The model stays
    // invisible for the entire stream and only pops in at the end, when
    // assembleBatchedModel (buildBatchedConwayModel.js) finally calls
    // computeBoundingBox/Sphere. The camera follow looks correct
    // throughout because it derives its own bounds (onBounds below), so
    // the camera tracks a model that is never drawn.
    //
    // Recomputing per batch is the other option and it is O(instances)
    // each time — quadratic over a load. Skipping the test costs one
    // extra draw call for a mesh that is on screen anyway.
    // finalize() restores culling once the bounds are real.
    mesh.frustumCulled = false
    const state = {
      mesh,
      material,
      transparentFlag: transparent,
      cursor: 0,
      maxInstances: this.initialInstances,
      maxVertices: this.initialVertices,
      maxIndices: this.initialIndices,
      usedVertices: 0,
      usedIndices: 0,
      // Unique geometries added to THIS mesh. Tracked here rather than
      // read off three's `_geometryInfo` because it is the same number
      // (nothing ever deletes a geometry from these batches, so every
      // entry stays active) without reaching into a private field — and it
      // is what decides whether setGeometrySize can still be called, see
      // PRESIZE_FROM_GEOMETRIES.
      geometryCount: 0,
      // Whether the one-shot reservations at presizeFromGeometries and
      // lastChanceGeometries have been made (see ensureCapacity_). Without
      // these the crossings would re-trigger on every geometry past their
      // thresholds, one full buffer copy each.
      presizeReserved: false,
      lastChanceReserved: false,
      // Pump progress when this batch was created. The projection measures
      // from here, not from zero: the transparent batch's first placement
      // lands a third of the way through sp-946MB, and charging it for
      // that whole prefix would over-reserve it by ~1.4x.
      startDone: this.pumpDone,
      instanceParents: [],
      instanceOccurrenceIds: [],
      instanceGeometryIds: [],
      instanceOccurrencePaths: [],
      instanceColors: [],
    }
    this[key] = state
    this.root.add(mesh)
    return state
  }


  /**
   * Grow the batch in place so the next instance — and, when the geometry
   * is new to this batch, its vertex/index ranges — fit. three's
   * setInstanceCount/setGeometrySize copy the underlying buffers; growth
   * doubles so total copy work stays linear, except once the batch is
   * large enough to be sized for the whole model (projectCapacity_).
   *
   * BOOKKEEPING TRAILS THE three.js CALL, NEVER LEADS IT (Share#1809).
   * `setGeometrySize` can throw — on three's own spread limit
   * (PRESIZE_FROM_GEOMETRIES) and on an allocation failure — and it throws
   * from its shrink checks, BEFORE it has touched the mesh, so three's
   * real capacity is unchanged when it does. Raising
   * `state.maxVertices`/`maxIndices` first, as this did until Share#1809,
   * left Share believing in space three had never allocated: every later
   * placement then took the "no growth needed" branch straight into
   * `addGeometry`'s "Reserved space request exceeds the maximum buffer
   * size", for the rest of the load, and `usedVertices` kept climbing for
   * geometry that never landed. With warnBadRecord_ capped at 5 lines the
   * only surviving signal was a count: 298,305 of 496,280 placements
   * dropped on sp-946MB.ifc. Committing the numbers after the call returns
   * keeps Share and three agreeing — a throw skips the one placement that
   * could not fit, and every later placement that DOES fit still lands.
   *
   * @param {object} state batch state
   * @param {object} entry geometry cache entry
   */
  ensureCapacity_(state, entry) {
    if (state.cursor + 1 > state.maxInstances) {
      const nextInstances = Math.max(state.maxInstances * GROWTH, state.cursor + 1)
      state.mesh.setInstanceCount(nextInstances)
      state.maxInstances = nextInstances
    }
    if (entry.idByBatch.has(state)) {
      return
    }
    const needVertices = state.usedVertices + entry.vertCount
    const needIndices = state.usedIndices + entry.indexCount
    // Past the early return above, this geometry is NEW to the batch, so
    // the count it is about to reach is the one that matters here.
    const lastChance = state.geometryCount + 1 >= this.lastChanceGeometries
    // THREE things call for a resize, and only the first is obvious.
    //
    // Running out of room is the obvious one. The other two are threshold
    // crossings, and both exist because resizing is a privilege this batch
    // loses partway through the load — so a reservation that matters has to
    // be made while it still works, not when the batch happens to run out.
    //
    // `crossing` is the last-chance one: past lastChanceGeometries this is
    // in expectation the final resize, so it is taken with the widened
    // headroom. Hanging it off exhaustion — as this did until codex's
    // second round — hands the widening to whichever later placement runs
    // the reserve out, which an ample 1.15 projection can postpone past
    // the ceiling.
    //
    // `presizeCrossing` is the earlier one, and without it the whole
    // mechanism can be skipped on a tight engine: a model of
    // single-triangle geometries first exhausts its 262,144-vertex initial
    // reservation at 87,382 geometries, above JavaScriptCore's spread
    // limit, so there the FIRST natural resize is already the one that
    // throws and no projection is ever made (codex round 4). Crossing
    // presizeFromGeometries therefore forces a projected resize on its own,
    // whether or not the batch is short of room.
    //
    // Both are one-shot; the latches stop them becoming a resize per
    // geometry for the rest of the load.
    const exhausted = needVertices > state.maxVertices || needIndices > state.maxIndices
    const crossing = lastChance && !state.lastChanceReserved
    const presizeCrossing = !state.presizeReserved &&
      state.geometryCount + 1 >= this.presizeFromGeometries
    if (exhausted || crossing || presizeCrossing) {
      let nextVertices = state.maxVertices
      let nextIndices = state.maxIndices
      while (nextVertices < needVertices) {
        nextVertices *= GROWTH
      }
      while (nextIndices < needIndices) {
        nextIndices *= GROWTH
      }
      const projected = this.projectCapacity_(state, needVertices, needIndices, lastChance)
      if (projected !== null) {
        nextVertices = Math.max(nextVertices, projected.vertices)
        nextIndices = Math.max(nextIndices, projected.indices)
      }
      // A crossing whose widened reservation asks for no more than the
      // batch already holds must not pay a full buffer copy for nothing.
      if (nextVertices > state.maxVertices || nextIndices > state.maxIndices) {
        state.mesh.setGeometrySize(nextVertices, nextIndices)
        state.maxVertices = nextVertices
        state.maxIndices = nextIndices
      }
      // Spent whether or not they changed the size — the question "has
      // this batch taken its reservation" is about the crossing, not about
      // whether the crossing needed more room.
      if (crossing) {
        state.lastChanceReserved = true
      }
      if (presizeCrossing) {
        state.presizeReserved = true
      }
    }
    state.usedVertices = needVertices
    state.usedIndices = needIndices
  }


  /**
   * Project this batch's whole-model vertex/index requirement from the
   * demand pump's product progress, so a batch that is about to run out of
   * growths reserves once for the rest of the load instead of doubling
   * into a call that will throw (see PRESIZE_FROM_GEOMETRIES).
   *
   * The estimator is linear in products. It TENDS to land above the true
   * total, because geometry is deduplicated by `geometryExpressID` and so
   * products seen early contribute proportionally more new vertices than
   * products seen late — measured on sp-946MB.ifc at +11% over the true
   * requirement at the first trigger point and +12% at the last one before
   * three's ceiling. It is NOT a bound, and one model's overshoot does not
   * establish one for other product orderings: a file that front-loads
   * reuse and back-loads novel or denser shapes under-reserves here (codex
   * P1 on Share#1809). That is survivable while resizes still work — the
   * projection is re-run at every growth and corrects itself — which is
   * why LAST_CHANCE_GEOMETRIES exists to widen it at the point where they
   * stop working. Past that point the ceiling is steered around, not
   * removed: an under-reservation still degrades, but degrades HONESTLY,
   * because ensureCapacity_ leaves Share and three agreeing and the
   * placements that cannot fit are counted. Removing the ceiling means not
   * putting 125k geometries in one BatchedMesh.
   *
   * Returns null — leaving the doubling in charge — whenever the estimate
   * would be guesswork: no pump progress (every one-shot and unit-test
   * caller), a batch still small enough that doubling can safely correct
   * itself later, or too little of the model seen to divide by.
   *
   * @param {object} state batch state
   * @param {number} needVertices vertices this batch needs including the
   *   geometry being added
   * @param {number} needIndices indices this batch needs, likewise
   * @param {boolean} lastChance treat this as the last resize the batch
   *   will complete: widen the headroom, and stand in for the projection
   *   entirely when there is no pump progress to project from. Decided by
   *   the caller because it is the same predicate that decides whether to
   *   resize at all on a threshold crossing.
   * @return {?{vertices: number, indices: number}} projected capacity, or
   *   null when unprojectable
   */
  projectCapacity_(state, needVertices, needIndices, lastChance) {
    let scale = 0
    // `+ 1` for the same reason the caller's predicates use it: this runs
    // only when a new geometry is being added, so the count that decides is
    // the one it is about to reach. Without it the presize CROSSING would
    // arrive one geometry before this guard opened and reserve nothing.
    if (this.pumpTotal > 0 && state.geometryCount + 1 >= this.presizeFromGeometries) {
      const total = this.pumpTotal - state.startDone
      const fraction = total > 0 ?
        Math.min((this.pumpDone - state.startDone) / total, 1) : 0
      if (fraction >= PRESIZE_MIN_FRACTION) {
        scale = (lastChance ? LAST_CHANCE_HEADROOM : PRESIZE_HEADROOM) / fraction
      }
    }
    if (lastChance) {
      scale = Math.max(scale, LAST_CHANCE_GROWTH)
    }
    // Below 1 means "no usable estimate" (no pump, too small a sample, too
    // little of the model seen); the caller's doubling stays in charge.
    if (scale <= 1) {
      return null
    }
    return {
      vertices: Math.ceil(needVertices * scale),
      indices: Math.ceil(needIndices * scale),
    }
  }


  /**
   * Hand back a finished batch's reserved-but-unused vertex/index space.
   *
   * A streaming builder cannot know the exact requirement until the last
   * placement lands, so both sizing policies above deliberately reserve
   * too much: the projection by PRESIZE_HEADROOM, and a batch too small to
   * project by whatever power of two first clears its need. That slack is
   * retained for the life of the model — measured at 92.5 MB on
   * sp-231MB.ifc, byte-lever 2 of the conway#679 attribution report. Once
   * `finalize` runs the model has stopped growing and the exact figure is
   * known, so give the rest back.
   *
   * `usedVertices`/`usedIndices` are exactly three's own high-water marks:
   * `addGeometry` packs each geometry's reservation contiguously from 0
   * and nothing here ever removes one, so the sum of what was added IS
   * `max(vertexStart + reservedVertexCount)`, which is the figure
   * setGeometrySize checks a shrink against.
   *
   * The cost is deliberate: one reallocation and copy of the batch
   * buffers, so a steady-state saving is bought with a transient peak of
   * capacity + used at the end of the load, after the parse-time
   * transients have been released.
   *
   * BEST-EFFORT, BUT ONLY WHERE THE MESH SURVIVES (codex round 3 on
   * Share#1809). `setGeometrySize` has two failure regions and they are
   * not equivalent:
   *
   *   1. The shrink checks at the top — including the `Math.max(...)`
   *      spread that PRESIZE_FROM_GEOMETRIES exists for. These run before
   *      anything is mutated, so a batch past the spread limit throws with
   *      its mesh untouched. Swallow it: that batch keeps its slack rather
   *      than losing its geometry to a size optimisation.
   *   2. Everything after `oldGeometry.dispose()`
   *      (`node_modules/three/src/objects/BatchedMesh.js:1350` onwards):
   *      three disposes the old geometry, overwrites `_maxVertexCount` and
   *      `_maxIndexCount`, replaces `this.geometry` with a fresh
   *      `BufferGeometry`, and only THEN allocates the new typed arrays
   *      inside `_initializeGeometry`. An allocation failure there — the
   *      plausible one, since the trim's own peak is capacity + used on
   *      exactly the largest models — leaves a gutted mesh: disposed
   *      buffers, empty geometry, `_geometryInitialized` false. Swallowing
   *      THAT reports a destroyed model as a successful load.
   *
   * So the catch classifies by observable effect rather than by error
   * type: if the geometry object is the same one and its arrays are the
   * same length, nothing was mutated and the throw was benign. Otherwise
   * the batch is gone and the throw is re-raised, which fails `finalize`
   * and drops ShareIfcLoader into the degraded end-of-load rebuild from
   * `recapture()` — a complete model, re-extracted. A rare trim-OOM
   * landing in the fallback that exists for exactly this is the honest
   * outcome; silently returning a hollow BatchedMesh is not.
   *
   * @param {object} state batch state
   */
  trimCapacity_(state) {
    if (state.usedVertices >= state.maxVertices && state.usedIndices >= state.maxIndices) {
      return
    }
    // Captured for the classification below, before three can replace any
    // of it. Lengths as well as identity: `_initializeGeometry` assigns a
    // new geometry before it allocates, so a failure part-way through can
    // leave an object that exists but has nothing in it.
    const geometryBefore = state.mesh.geometry
    const positionsBefore = geometryBefore?.attributes?.position?.array?.length ?? 0
    const indicesBefore = geometryBefore?.index?.array?.length ?? 0
    try {
      state.mesh.setGeometrySize(state.usedVertices, state.usedIndices)
      state.maxVertices = state.usedVertices
      state.maxIndices = state.usedIndices
    } catch (e) {
      const geometryAfter = state.mesh.geometry
      const intact = geometryAfter === geometryBefore &&
        (geometryAfter?.attributes?.position?.array?.length ?? 0) === positionsBefore &&
        (geometryAfter?.index?.array?.length ?? 0) === indicesBefore
      if (!intact) {
        debug(WARN).warn(
          'IncrementalBatchedBuilder: batch capacity trim destroyed the mesh; ' +
          'failing the incremental assembly so the load rebuilds completely:', e)
        throw e
      }
      debug(WARN).warn('IncrementalBatchedBuilder: batch capacity trim skipped:', e)
    }
  }
}

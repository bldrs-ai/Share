import {BatchedMesh, Box3, DoubleSide, Group, Matrix4, Vector4} from 'three'
import debug, {WARN} from '../../utils/debug'
import {forEachVectorItem} from './conwayVector'
import {makeSurfaceMaterial} from '../lookMaterial'
import {
  DEFAULT_COLOR,
  INDICES_PER_TRIANGLE,
  OPAQUE_ALPHA,
  VERT_STRIDE,
  coincidenceKey,
  coordinationOffsetFor,
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
 * `instanceGeometry`, `instanceColors`).
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
   */
  constructor(api, modelID, opts = {}) {
    this.api = api
    this.modelID = modelID
    this.onBounds = opts.onBounds ?? null
    this.initialInstances = opts.initialInstances ?? INITIAL_INSTANCES
    this.initialVertices = opts.initialVertices ?? INITIAL_VERTICES
    this.initialIndices = opts.initialIndices ?? INITIAL_INDICES
    this.root = new Group()
    // geometryExpressID → {geometry, vertCount, indexCount, box,
    // idByBatch: Map(batchState → geometryId)} — geometry fetched from
    // Conway exactly once per model.
    this.geometryCache = new Map()
    this.badGeometry = new Set()
    // Running count backing warnBadRecord_'s console cap.
    this.badRecordWarnings = 0
    // coincidenceKeys already appended, across all batches — drops exact
    // duplicate placements that would z-fight (see coincidenceKey).
    this.seenPlacements = new Set()
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
      state.mesh.instanceGeometry = state.instanceGeometry.slice()
      state.mesh.instanceColors = state.instanceColors.slice()
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
        instanceGeometry: state.mesh.instanceGeometry,
        instanceColors: state.mesh.instanceColors,
      })
    }
    const parents = new Set()
    for (const batch of batches) {
      for (const parent of batch.instanceParents) {
        parents.add(parent)
      }
    }
    return {
      batches,
      stats: {
        uniqueGeometryCount: this.geometryCache.size,
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
   * @param {number} parentExpressId
   * @param {object} placed Conway PlacedGeometry
   */
  appendPlacement_(parentExpressId, placed) {
    const geomExpressID = placed?.geometryExpressID
    if (geomExpressID === undefined) {
      this.totals.skippedPlacedGeometries++
      return
    }
    const entry = this.resolveGeometry_(geomExpressID)
    if (entry === null) {
      this.totals.skippedPlacedGeometries++
      return
    }
    const color = placed.color ?? DEFAULT_COLOR
    // Drop an exact coincident duplicate (same part + geometry + transform +
    // colour): it would z-fight the one already appended. See coincidenceKey.
    const dedupKey = coincidenceKey(parentExpressId, geomExpressID, placed.flatTransformation, color)
    if (this.seenPlacements.has(dedupKey)) {
      this.totals.skippedCoincidentPlacements++
      return
    }
    this.seenPlacements.add(dedupKey)
    const isTransparent = color.w < OPAQUE_ALPHA
    const state = this.ensureBatch_(isTransparent)
    this.ensureCapacity_(state, entry)

    let geometryId = entry.idByBatch.get(state)
    if (geometryId === undefined) {
      geometryId = state.mesh.addGeometry(entry.geometry)
      entry.idByBatch.set(state, geometryId)
    }
    const batchId = state.mesh.addInstance(geometryId)
    const matrix = this.scratchMatrix.fromArray(placed.flatTransformation)
    // Decide the model-wide origin-recenter offset from the first placement,
    // then subtract it from every instance so a georeferenced model renders at
    // the origin (float32-precise) instead of at ~1e7 m. See
    // coordinationOffsetFor. Stamped on the root for consumers that need to
    // map a rendered point back to true world coordinates.
    if (this.coordination.offset === undefined) {
      this.coordination.offset = coordinationOffsetFor(placed.flatTransformation)
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
    state.instanceOccurrencePaths.push(placed.occurrencePath ?? null)
    state.instanceGeometry.push(entry.geometry)
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
    if (this.badGeometry.has(geomExpressID)) {
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
      // above touches the freed wrapper. Cache it as bad (so no batch
      // retries the same doomed id) and degrade to one skipped placement
      // — never let it escape and take the whole batch with it
      // (Sentry SHARE-1NK).
      this.badGeometry.add(geomExpressID)
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
      instanceParents: [],
      instanceOccurrenceIds: [],
      instanceGeometryIds: [],
      instanceOccurrencePaths: [],
      instanceGeometry: [],
      instanceColors: [],
    }
    this[key] = state
    this.root.add(mesh)
    return state
  }


  /**
   * Grow the batch in place (2x amortized) so the next instance — and,
   * when the geometry is new to this batch, its vertex/index ranges —
   * fit. three's setInstanceCount/setGeometrySize copy the underlying
   * buffers; growth doubles so total copy work stays linear.
   *
   * @param {object} state batch state
   * @param {object} entry geometry cache entry
   */
  ensureCapacity_(state, entry) {
    if (state.cursor + 1 > state.maxInstances) {
      state.maxInstances = Math.max(state.maxInstances * GROWTH, state.cursor + 1)
      state.mesh.setInstanceCount(state.maxInstances)
    }
    if (entry.idByBatch.has(state)) {
      return
    }
    const needVertices = state.usedVertices + entry.vertCount
    const needIndices = state.usedIndices + entry.indexCount
    if (needVertices > state.maxVertices || needIndices > state.maxIndices) {
      while (state.maxVertices < needVertices) {
        state.maxVertices *= GROWTH
      }
      while (state.maxIndices < needIndices) {
        state.maxIndices *= GROWTH
      }
      state.mesh.setGeometrySize(state.maxVertices, state.maxIndices)
    }
    state.usedVertices = needVertices
    state.usedIndices = needIndices
  }
}

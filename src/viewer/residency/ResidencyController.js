import {Matrix4, Sphere, Vector3} from 'three'
import {
  hasBatchedGeometry,
  instanceGeometryRangeAt,
} from '../ifc/batchedInstanceGeometry'
import {BatchEditKind, onBatchEdit} from '../ifc/batchedEdit'
import {forEachActiveInstance} from '../ifc/batchedInstanceTables'
import {requestPaint} from '../three/renderDemand'


/** Guard against division by zero when the eye sits on an instance. */
const MIN_EYE_DISTANCE = 1e-6

/** Byte weight per vertex for the MEMORY metric's amortized cost. */
const BYTES_PER_VERTEX = 32

/** Eviction-ordering metrics (design/new/demand-tiled-rendering.md §B2). */
export const ResidencyMetric = Object.freeze({
  /** Projected screen occupancy: biggest-on-screen parts stay longest. */
  OCCUPANCY: 'occupancy',
  /**
   * Amortized geometry bytes: the slider maps to a memory budget and
   * cheap parts (most parts per byte) stay longest.
   */
  MEMORY: 'memory',
  /** Distance from the selected part: nearest parts stay longest. */
  DISTANCE: 'distance',
})


/**
 * ResidencyController — slice B2 of demand/tiled rendering (#1613): a
 * user-dialable residency set over the batched model. `setTarget(1)`
 * shows the whole model; `setTarget(0)` evicts everything; fractions
 * in between keep the top of the current metric's ordering. Eviction
 * v1 is `BatchedMesh.setVisibleAt` — instant and fully reversible, so
 * the slider stays smooth; it trims draw/raster cost now and becomes
 * true tile release when the pool integration lands (slice C).
 *
 * The controller walks the model for BatchedMesh children carrying the
 * batched pick tables (`instanceParents`) and precomputes per-instance
 * centers/radii/amortized-bytes; metric evaluation is a flat array pass,
 * cheap enough to run per slider tick. Each batch's records are redone when
 * an edit changes it (`batchedEdit#onBatchEdit`; `onBatchEdit_` below): a
 * record names a batch id, and after a delete + paste that id can be a
 * different instance, or a paste can hold an id no record names (create-300
 * L0, #1915).
 *
 * Per-shape bounds and vertex counts come from the batch itself; see
 * {@link measureInstances}.
 *
 * **Two layers: at rest and in motion (B3).** `setTarget` / `setMetric` set
 * the AT-REST residency, the one the Display menu's slider has always driven,
 * and `apply` computes it exactly as before. On top of it a motion overlay
 * (`beginMotion` / `setMotionFraction` / `endMotion`, driven by
 * MotionResidency.js while the camera moves) keeps a smaller set: the top of
 * the motion metric's ordering, drawn only from what is resident at rest. So
 * the overlay can only take parts away, never add one, and `endMotion` puts
 * back exactly the at-rest set it found — the still picture is the one the
 * at-rest setting alone would draw. A record carries both verdicts
 * (`restKept`, `motionKept`); an instance is shown iff both say so.
 *
 * The overlay never sorts on the camera's critical path. Sorting is the one
 * expensive step here (about 150-270 ms for 300k records in V8, measured for
 * #2130), so a gesture starts from an ordering built beforehand: the at-rest
 * ordering filtered to what it kept (O(n)) when both layers use the same
 * metric, or one `prepareMotion` built in idle time when they differ. Changing
 * the motion fraction then moves one boundary along that ordering, flipping
 * only the instances between the old and new cut (bounded per call by
 * `maxFlips`, B2's bounded-churn rule).
 */
export class ResidencyController {
  /**
   * @param {object} model the loaded batched model (BatchedMesh or Group)
   * @param {object} [opts]
   * @param {Function} [opts.getCamera] () => camera, for OCCUPANCY.
   * @param {Function} [opts.getSelectionCenter] () => Vector3|null, for
   *   DISTANCE (falls back to OCCUPANCY ordering when null).
   */
  constructor(model, opts = {}) {
    this.getCamera = opts.getCamera ?? (() => null)
    this.getSelectionCenter = opts.getSelectionCenter ?? (() => null)
    this.metric = ResidencyMetric.OCCUPANCY
    this.target = 1
    // One entry per controlled batch: its records, whether an edit has
    // outdated them, and its edit subscription. `instances_` / `totalBytes`
    // are the flattened view the metric passes walk, recollected only when a
    // batch is remeasured.
    this.batches_ = []
    this.instances_ = []
    this.totalBytes = 0
    // The at-rest ordering `apply` last computed, best first, and its metric.
    // Null until the first apply, and after an edit remeasures (the records
    // it names are gone).
    this.restOrder_ = null
    this.restOrderMetric_ = null
    // Motion orderings built ahead of a gesture, by metric (`prepareMotion`).
    // Each is `{order, prefixBytes}` over the records `restOrder_` kept.
    // Dropped whenever the at-rest set or the records change.
    this.motionOrders_ = new Map()
    // The live motion overlay while the camera moves, else null:
    // `{metric, order, prefixBytes, keep, goal, fraction}`. `order[0..keep)`
    // are shown, `order[keep..)` evicted for motion; `goal` is where `keep`
    // is heading (`stepMotion`).
    this.motion_ = null
    const meshes = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((child) => {
      if (child?.isBatchedMesh) {
        meshes.push(child)
      }
    })
    for (const mesh of meshes) {
      if (!hasBatchedGeometry(mesh) || typeof mesh.setVisibleAt !== 'function' ||
          typeof mesh.getBoundingSphereAt !== 'function') {
        continue
      }
      // A batch without pick tables is not one the controller can name
      // parts of; skip it as the length-0 walk this replaced did.
      if (!mesh.instanceParents) {
        continue
      }
      // At construction every instance is taken to be showing, as it always
      // has been: nothing residency-owned has hidden anything yet.
      const batch = {mesh, stale: false, ...measureInstances(mesh, true)}
      batch.unsubscribe = onBatchEdit(mesh, (change) => {
        // A shape added with no instance on it changes no record.
        if (change.events.some((event) => event.kind !== BatchEditKind.ADD_GEOMETRY)) {
          this.onBatchEdit_(batch)
        }
      })
      this.batches_.push(batch)
    }
    this.collect_()
  }


  /**
   * The per-instance records, current with every batch's tables.
   *
   * @return {Array<object>} `{mesh, index, center, radius, bytes, expressID,
   *   visible, score, restKept, motionKept}`
   */
  get instances() {
    this.remeasureStale_()
    return this.instances_
  }


  /** @return {number} Instances under control. */
  get instanceCount() {
    return this.instances.length
  }


  /**
   * @param {number} fraction 0..1 residency target
   */
  setTarget(fraction) {
    this.target = Math.min(1, Math.max(0, fraction))
    this.apply()
  }


  /**
   * @param {string} metric a {@link ResidencyMetric}
   */
  setMetric(metric) {
    this.metric = metric
    this.apply()
  }


  /**
   * Re-score, re-order, and apply visibility for the current at-rest target.
   *
   * During motion the overlay is rebuilt over the new at-rest set at its
   * current fraction, and each instance is written once with both verdicts,
   * so an at-rest change mid-gesture (a selection under DISTANCE, an edit)
   * neither shows a frame of the full at-rest set nor loses the eviction.
   */
  apply() {
    const instances = this.instances
    if (instances.length === 0) {
      return
    }
    this.score_(this.metric)
    const ordered = instances.slice().sort((a, b) => b.score - a.score)
    if (this.metric === ResidencyMetric.MEMORY) {
      // The slider maps to a byte budget: keep instances in score order
      // until the budget is spent.
      const budget = this.target * this.totalBytes
      let spent = 0
      for (const instance of ordered) {
        const keep = spent + instance.bytes <= budget && this.target > 0
        if (keep) {
          spent += instance.bytes
        }
        instance.restKept = keep
      }
    } else {
      const keepCount = Math.round(this.target * ordered.length)
      for (let rank = 0; rank < ordered.length; rank++) {
        ordered[rank].restKept = rank < keepCount
      }
    }
    this.restOrder_ = ordered
    this.restOrderMetric_ = this.metric
    this.motionOrders_.clear()
    if (this.motion_) {
      this.restartMotion_()
    }
    for (const instance of ordered) {
      this.setVisible_(instance, this.shown_(instance))
    }
  }


  /** @return {boolean} Whether a camera-motion overlay is active. */
  get isInMotion() {
    return this.motion_ !== null
  }


  /**
   * The share of the model the at-rest set holds, in the motion metric's
   * measure: instance count for OCCUPANCY / DISTANCE, bytes for MEMORY. A
   * motion fraction at or above it evicts nothing, so it is the most an auto
   * policy can usefully ask for.
   *
   * @param {string} [metric] a {@link ResidencyMetric}; the live overlay's
   *   when in motion, else the at-rest metric
   * @return {number} 0..1
   */
  motionCapacity(metric = this.motion_?.metric ?? this.metric) {
    const instances = this.instances
    if (instances.length === 0) {
      return 1
    }
    const {order, prefixBytes} = this.motion_?.metric === metric ?
      this.motion_ : this.motionOrderFor_(metric, false)
    if (metric === ResidencyMetric.MEMORY) {
      return this.totalBytes > 0 ? prefixBytes[order.length] / this.totalBytes : 1
    }
    return order.length / instances.length
  }


  /**
   * Build a motion metric's ordering ahead of the gesture that needs it, so
   * `beginMotion` doesn't sort. Call from idle time; a no-op when it is
   * already built or is the at-rest metric (which reuses the at-rest order).
   *
   * @param {string} metric a {@link ResidencyMetric}
   */
  prepareMotion(metric) {
    if (this.instances.length > 0) {
      this.motionOrderFor_(metric, true)
    }
  }


  /**
   * Start a camera-motion overlay. Shows exactly what is shown now; the
   * first `setMotionFraction` evicts. Never sorts (class doc): with no
   * ordering prepared for `metric` the at-rest one is used for this gesture.
   *
   * @param {string} [metric] a {@link ResidencyMetric}
   */
  beginMotion(metric = this.metric) {
    if (this.motion_ || this.instances.length === 0) {
      return
    }
    this.startMotion_(metric)
  }


  /**
   * Set the share of the model to keep while the camera moves, in the
   * overlay's metric (count, or bytes for MEMORY). Fractions at or above
   * {@link motionCapacity} evict nothing.
   *
   * @param {number} fraction 0..1
   * @param {object} [opts]
   * @param {number} [opts.maxFlips] most instances to change this call; the
   *   rest follow on `stepMotion`
   * @return {boolean} whether the overlay reached the fraction
   */
  setMotionFraction(fraction, {maxFlips = Infinity} = {}) {
    if (!this.motion_) {
      return true
    }
    this.remeasureStale_()
    const clamped = Math.min(1, Math.max(0, fraction))
    this.motion_.fraction = clamped
    this.motion_.goal = this.motionKeepFor_(clamped)
    return this.stepMotion(maxFlips)
  }


  /**
   * Move the overlay's cut toward its goal by at most `maxFlips` instances.
   *
   * @param {number} [maxFlips]
   * @return {boolean} whether it got there
   */
  stepMotion(maxFlips = Infinity) {
    const motion = this.motion_
    if (!motion) {
      return true
    }
    const {order, goal} = motion
    let keep = motion.keep
    let flips = 0
    while (keep > goal && flips < maxFlips) {
      keep--
      order[keep].motionKept = false
      this.setVisible_(order[keep], this.shown_(order[keep]))
      flips++
    }
    while (keep < goal && flips < maxFlips) {
      order[keep].motionKept = true
      this.setVisible_(order[keep], this.shown_(order[keep]))
      keep++
      flips++
    }
    motion.keep = keep
    return keep === goal
  }


  /** End the overlay: everything the at-rest set holds is shown again. */
  endMotion() {
    const motion = this.motion_
    if (!motion) {
      return
    }
    this.remeasureStale_()
    if (this.motion_) {
      this.motion_.goal = this.motion_.order.length
      this.stepMotion(Infinity)
    }
    for (const instance of this.instances_) {
      instance.motionKept = true
    }
    this.motion_ = null
  }


  /**
   * The share the overlay currently keeps, in its own measure.
   *
   * @return {number} 0..1, or 1 with no overlay
   */
  get motionFraction() {
    const motion = this.motion_
    if (!motion || this.instances_.length === 0) {
      return 1
    }
    if (motion.metric === ResidencyMetric.MEMORY) {
      return this.totalBytes > 0 ? motion.prefixBytes[motion.keep] / this.totalBytes : 1
    }
    return motion.keep / this.instances_.length
  }


  /**
   * Install the overlay over the current at-rest set, showing all of it.
   *
   * @param {string} metric
   * @private
   */
  startMotion_(metric) {
    const {order, prefixBytes} = this.motionOrderFor_(metric, false)
    for (const instance of order) {
      instance.motionKept = true
    }
    this.motion_ = {
      metric, order, prefixBytes,
      keep: order.length, goal: order.length, fraction: 1,
    }
  }


  /**
   * Rebuild the live overlay over the current records and at-rest set, at
   * its fraction, with each record's `motionKept` set to the new cut. Writes
   * no visibility: the caller does (`apply`).
   *
   * @private
   */
  restartMotion_() {
    const {metric, fraction} = this.motion_
    this.motion_ = null
    this.startMotion_(metric)
    const motion = this.motion_
    motion.fraction = fraction
    motion.goal = this.motionKeepFor_(fraction)
    motion.keep = motion.goal
    for (let rank = 0; rank < motion.order.length; rank++) {
      motion.order[rank].motionKept = rank < motion.keep
    }
  }


  /**
   * The ordering a motion overlay over `metric` walks: the at-rest set, best
   * first by `metric`. Derived from the at-rest order when the metrics agree
   * (or, unless `allowSort`, when nothing better is prepared).
   *
   * @param {string} metric
   * @param {boolean} allowSort whether to sort for a metric that differs
   * @return {{order: Array<object>, prefixBytes: Float64Array}}
   * @private
   */
  motionOrderFor_(metric, allowSort) {
    const cached = this.motionOrders_.get(metric)
    if (cached) {
      return cached
    }
    let source = this.restOrder_
    if (source === null) {
      // Never applied (target 1 since construction, or remeasured since):
      // every record is resident at rest, in no particular order yet.
      for (const instance of this.instances_) {
        instance.restKept = true
      }
      source = this.instances_
    }
    let order = source.filter((instance) => instance.restKept)
    const reusesRest = metric === this.restOrderMetric_ && this.restOrder_ !== null
    if (!reusesRest && allowSort) {
      this.score_(metric, order)
      order = order.sort((a, b) => b.score - a.score)
    }
    const prefixBytes = new Float64Array(order.length + 1)
    for (let rank = 0; rank < order.length; rank++) {
      prefixBytes[rank + 1] = prefixBytes[rank] + order[rank].bytes
    }
    const built = {order, prefixBytes}
    // Cache only what is right for `metric`; a fallback is per gesture.
    if (reusesRest || allowSort) {
      this.motionOrders_.set(metric, built)
    }
    return built
  }


  /**
   * How far along the overlay's order a fraction reaches.
   *
   * @param {number} fraction 0..1
   * @return {number} instances to keep
   * @private
   */
  motionKeepFor_(fraction) {
    const {metric, order, prefixBytes} = this.motion_
    if (metric === ResidencyMetric.MEMORY) {
      // Largest prefix whose bytes fit the budget (prefixBytes is ascending).
      const budget = fraction * this.totalBytes
      let lo = 0
      let hi = order.length
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (prefixBytes[mid] <= budget) {
          lo = mid
        } else {
          hi = mid - 1
        }
      }
      return lo
    }
    return Math.min(order.length, Math.round(fraction * this.instances_.length))
  }


  /**
   * @param {object} instance a record
   * @return {boolean} whether both layers keep it
   * @private
   */
  shown_(instance) {
    return instance.restKept !== false && (this.motion_ === null || instance.motionKept !== false)
  }


  /** Restore every instance, stop following edits and drop references. */
  dispose() {
    this.motion_ = null
    for (const instance of this.instances) {
      this.setVisible_(instance, true)
    }
    for (const batch of this.batches_) {
      batch.unsubscribe()
    }
    this.batches_ = []
    this.instances_ = []
    this.totalBytes = 0
    this.restOrder_ = null
    this.motionOrders_.clear()
  }


  /**
   * An edit changed one of the controlled batches.
   *
   * Identity, not just liveness, is what goes stale. three recycles the
   * lowest freed id on `addInstance` (BatchedMesh.js:580-591), so after a
   * delete + paste a record can name a live id that is a different instance
   * — with the deleted one's center, bytes and expressID — and an appended
   * paste has no record at all.
   *
   * While residency is evicting anything (target below 1) the current target
   * is re-applied now, so a paste made at target 0 is hidden before the edit
   * returns rather than at the next slider tick; that costs one slider tick
   * per edit, and only while the slider is down. At target 1 nothing a record
   * holds can change what is drawn — every instance is shown, and three
   * issues a new one visible (BatchedMesh.js:571-575) — so the batch is only
   * marked, and remeasured (O(batch)) on the next read instead of on every
   * edit of a model nobody is evicting from.
   *
   * The same holds for the motion overlay (B3): an edit made while the
   * camera moves re-applies, which rebuilds the overlay over the fresh
   * records at its current fraction, so a paste mid-orbit is evicted or
   * shown by the same rule as everything else and `endMotion` restores
   * records that exist.
   *
   * @param {object} batch one of `batches_`
   * @private
   */
  onBatchEdit_(batch) {
    batch.stale = true
    if (this.target < 1 || this.motion_ !== null) {
      this.apply()
    }
  }


  /**
   * Remeasure every batch an edit has marked.
   *
   * A remeasured record's `visible` is unknown (null), not read back from
   * the batch: while IfcIsolator's mask is installed, three's bit is
   * residency's intent AND the isolator's verdict (IfcIsolator
   * `_ensureBatchedMask`), so an instance isolation hides would read as
   * "residency hid it" and a later eviction would be skipped — leaving the
   * mask's `base` saying "show" for when isolation lifts. Unknown makes the
   * next `setVisible_` write through, once per instance per edit.
   *
   * @private
   */
  remeasureStale_() {
    let changed = false
    for (const batch of this.batches_) {
      if (batch.stale) {
        Object.assign(batch, {stale: false}, measureInstances(batch.mesh, null))
        changed = true
      }
    }
    if (changed) {
      this.collect_()
      // Every ordering names records that were just replaced.
      this.restOrder_ = null
      this.restOrderMetric_ = null
      this.motionOrders_.clear()
      if (this.motion_) {
        // Rebuilt over the fresh records (all resident at rest until the
        // next apply, as at construction), keeping its fraction. Nothing is
        // written here: an edit during motion always re-applies
        // (`onBatchEdit_`), and `apply` writes every record once with both
        // verdicts.
        this.restartMotion_()
      }
    }
  }


  /** Flatten the batches' records into `instances_` and total their bytes. */
  collect_() {
    this.instances_ = this.batches_.flatMap((batch) => batch.records)
    this.totalBytes = this.batches_.reduce((sum, batch) => sum + batch.bytes, 0)
  }


  /**
   * Evaluate a metric into each instance's `score` (higher = kept longer).
   * Walks `instances_` by default: its callers have just synced it.
   *
   * @param {string} metric a {@link ResidencyMetric}
   * @param {Array<object>} [records] the records to score
   */
  score_(metric, records = this.instances_) {
    if (metric === ResidencyMetric.MEMORY) {
      // Most parts per byte: cheap instances first.
      for (const instance of records) {
        instance.score = -instance.bytes
      }
      return
    }
    if (metric === ResidencyMetric.DISTANCE) {
      const center = this.getSelectionCenter()
      if (center) {
        for (const instance of records) {
          instance.score = -instance.center.distanceTo(center)
        }
        return
      }
      // No selection: fall through to occupancy ordering.
    }
    const camera = this.getCamera()
    const eye = camera?.position ?? null
    for (const instance of records) {
      // Projected-size proxy: angular radius² ≈ (r / distance)².
      const distance = eye ? Math.max(instance.center.distanceTo(eye), MIN_EYE_DISTANCE) : 1
      const angular = instance.radius / distance
      instance.score = angular * angular
    }
  }


  /**
   * Apply one instance's visibility if it changed.
   *
   * @param {object} instance
   * @param {boolean} visible
   */
  setVisible_(instance, visible) {
    if (instance.visible === visible) {
      return
    }
    instance.visible = visible
    // Every record is live: callers reach here only through `instances`,
    // which remeasures a batch an edit has marked and so drops the record of
    // an instance deleted since (three's `setVisibleAt`
    // throws on one, BatchedMesh.js:1162-1164).
    instance.mesh.setVisibleAt(instance.index, visible)
    requestPaint()
  }
}


/**
 * Measure one batch's live instances: world-space center and radius for the
 * OCCUPANCY / DISTANCE metrics, amortized bytes for MEMORY.
 *
 * Per-shape bounds and vertex counts come from the batch itself
 * (`getBoundingSphereAt` / `getGeometryRangeAt`), not from a retained table
 * of the source geometries — Share#1810 dropped that table, and this
 * precompute never needed the vertex data, only two numbers per shape.
 *
 * @param {object} mesh a decorated BatchedMesh
 * @param {boolean|null} visible the records' initial visibility belief;
 *   null = unknown, so the controller's next write goes through
 * @return {object} `{records, bytes}`
 */
function measureInstances(mesh, visible) {
  const scratchMatrix = new Matrix4()
  const scratchRange = {}
  const scratchSphere = new Sphere()
  const records = []
  let bytesTotal = 0
  // Amortize each shape's bytes over its instance count so a heavily
  // shared shape is cheap per instance. Keyed by the batch's own
  // geometry id, which is what "the same shape" means within one mesh —
  // exactly the grouping the retained geometry objects gave by
  // reference identity.
  //
  // Both walks visit live instances only (batchedInstanceTables): a
  // deleted one has no geometry to count, and three throws on its matrix.
  const geometryUses = new Map()
  forEachActiveInstance(mesh, (index) => {
    const range = instanceGeometryRangeAt(mesh, index, scratchRange)
    if (range !== null) {
      geometryUses.set(range.geometryId, (geometryUses.get(range.geometryId) ?? 0) + 1)
    }
  })
  forEachActiveInstance(mesh, (index) => {
    const range = instanceGeometryRangeAt(mesh, index, scratchRange)
    // three computes (and caches on the batch) a per-geometry sphere
    // over the shape's own index range. It is the source geometry's
    // sphere for every shape whose vertices are all referenced — which
    // is every shape Conway emits; a shape with orphan vertices gets
    // the tighter, more correct sphere here rather than the source's.
    if (range === null || !mesh.getBoundingSphereAt(range.geometryId, scratchSphere)) {
      return
    }
    mesh.getMatrixAt(index, scratchMatrix)
    const center = new Vector3().copy(scratchSphere.center).applyMatrix4(scratchMatrix)
    const scale = new Vector3().setFromMatrixScale(scratchMatrix)
    const radius = scratchSphere.radius * Math.max(scale.x, scale.y, scale.z)
    const bytes = (range.vertexCount * BYTES_PER_VERTEX) /
      (geometryUses.get(range.geometryId) ?? 1)
    records.push({
      mesh, index, center, radius, bytes,
      expressID: mesh.instanceParents?.[index],
      // Resident at rest and in motion until a layer says otherwise.
      visible, score: 0, restKept: true, motionKept: true,
    })
    bytesTotal += bytes
  })
  return {records, bytes: bytesTotal}
}

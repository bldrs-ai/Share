import {Matrix4, Sphere, Vector3} from 'three'
import {
  hasBatchedGeometry,
  instanceGeometryRangeAt,
} from '../ifc/batchedInstanceGeometry'
import {forEachActiveInstance, tablesRevision} from '../ifc/batchedInstanceTables'


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
 * cheap enough to run per slider tick. The precompute is redone for a batch
 * only when an edit has moved its tables revision
 * (batchedInstanceTables `tablesRevision`): a record names a batch id, and
 * after a delete + paste that id can be a different instance, or a paste can
 * hold an id no record names (create-300 L0, #1915).
 *
 * Per-shape bounds and vertex counts come from the batch itself; see
 * {@link measureInstances}.
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
    // One entry per controlled batch: its records and the tables revision
    // they were measured at. `instances_` / `totalBytes` are the flattened
    // view the metric passes walk, recollected only when a batch is remeasured.
    this.batches_ = []
    this.instances_ = []
    this.totalBytes = 0
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
      this.batches_.push({
        mesh,
        revision: tablesRevision(mesh),
        ...measureInstances(mesh, true),
      })
    }
    this.collect_()
  }


  /**
   * The per-instance records, current with every batch's tables.
   *
   * @return {Array<object>} `{mesh, index, center, radius, bytes, expressID,
   *   visible, score}`
   */
  get instances() {
    this.sync_()
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


  /** Re-score, re-order, and apply visibility for the current target. */
  apply() {
    const instances = this.instances
    if (instances.length === 0) {
      return
    }
    this.score_()
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
        this.setVisible_(instance, keep)
      }
      return
    }
    const keepCount = Math.round(this.target * ordered.length)
    for (let rank = 0; rank < ordered.length; rank++) {
      this.setVisible_(ordered[rank], rank < keepCount)
    }
  }


  /** Restore every instance and drop references. */
  dispose() {
    for (const instance of this.instances) {
      this.setVisible_(instance, true)
    }
    this.batches_ = []
    this.instances_ = []
    this.totalBytes = 0
  }


  /**
   * Remeasure every batch an edit has touched since its records were taken.
   *
   * Identity, not just liveness, is what goes stale. three recycles the
   * lowest freed id on `addInstance` (BatchedMesh.js:580-591), so after a
   * delete + paste a record can name a live id that is a different instance
   * — with the deleted one's center, bytes and expressID — and an appended
   * paste has no record at all. Every row change bumps the batch's
   * `tablesRevision`; an unedited batch costs one comparison here.
   *
   * A remeasured record's `visible` is unknown (null), not read back from
   * the batch: while IfcIsolator's mask is installed, three's bit is
   * residency's intent AND the isolator's verdict (IfcIsolator
   * `_ensureBatchedMask`), so an instance isolation hides would read as
   * "residency hid it" and a later eviction would be skipped — leaving the
   * mask's `base` saying "show" for when isolation lifts. Unknown makes the
   * next `setVisible_` write through, once per instance per edit.
   */
  sync_() {
    let changed = false
    for (const batch of this.batches_) {
      const revision = tablesRevision(batch.mesh)
      if (revision !== batch.revision) {
        Object.assign(batch, {revision}, measureInstances(batch.mesh, null))
        changed = true
      }
    }
    if (changed) {
      this.collect_()
    }
  }


  /** Flatten the batches' records into `instances_` and total their bytes. */
  collect_() {
    this.instances_ = this.batches_.flatMap((batch) => batch.records)
    this.totalBytes = this.batches_.reduce((sum, batch) => sum + batch.bytes, 0)
  }


  /**
   * Evaluate the current metric into each instance's `score` (higher =
   * kept longer). Walks `instances_` directly: `apply`, the only caller,
   * has just synced it.
   */
  score_() {
    const metric = this.metric
    if (metric === ResidencyMetric.MEMORY) {
      // Most parts per byte: cheap instances first.
      for (const instance of this.instances_) {
        instance.score = -instance.bytes
      }
      return
    }
    if (metric === ResidencyMetric.DISTANCE) {
      const center = this.getSelectionCenter()
      if (center) {
        for (const instance of this.instances_) {
          instance.score = -instance.center.distanceTo(center)
        }
        return
      }
      // No selection: fall through to occupancy ordering.
    }
    const camera = this.getCamera()
    const eye = camera?.position ?? null
    for (const instance of this.instances_) {
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
    // Every record is live: callers reach here only after `sync_`, which
    // drops the record of an instance deleted since (three's `setVisibleAt`
    // throws on one, BatchedMesh.js:1162-1164).
    instance.mesh.setVisibleAt(instance.index, visible)
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
      visible, score: 0,
    })
    bytesTotal += bytes
  })
  return {records, bytes: bytesTotal}
}

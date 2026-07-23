import {Matrix4, Vector3} from 'three'


/** Guard against division by zero when the eye sits on an instance. */
const MIN_EYE_DISTANCE = 1e-6

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
 * batched pick tables (`instanceParents`, `instanceGeometry`) and
 * precomputes per-instance centers/radii/amortized-bytes once; metric
 * evaluation is a flat array pass, cheap enough to run per slider tick.
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
    this.instances = []
    this.totalBytes = 0
    const scratchMatrix = new Matrix4()
    const meshes = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((child) => {
      if (child?.isBatchedMesh) {
        meshes.push(child)
      }
    })
    const BYTES_PER_VERTEX = 32
    for (const mesh of meshes) {
      const geometries = mesh.instanceGeometry
      if (!geometries || typeof mesh.setVisibleAt !== 'function') {
        continue
      }
      // Amortize each geometry's bytes over its instance count so a
      // heavily shared shape is cheap per instance.
      const geometryUses = new Map()
      for (const geometry of geometries) {
        geometryUses.set(geometry, (geometryUses.get(geometry) ?? 0) + 1)
      }
      for (let index = 0; index < geometries.length; index++) {
        const geometry = geometries[index]
        if (!geometry) {
          continue
        }
        if (!geometry.boundingSphere) {
          geometry.computeBoundingSphere()
        }
        const sphere = geometry.boundingSphere
        mesh.getMatrixAt(index, scratchMatrix)
        const center = new Vector3().copy(sphere.center).applyMatrix4(scratchMatrix)
        const scale = new Vector3().setFromMatrixScale(scratchMatrix)
        const radius = sphere.radius * Math.max(scale.x, scale.y, scale.z)
        const vertexCount = geometry.getAttribute('position')?.count ?? 0
        const bytes =
          (vertexCount * BYTES_PER_VERTEX) / (geometryUses.get(geometry) ?? 1)
        this.instances.push({
          mesh, index, center, radius, bytes,
          expressID: mesh.instanceParents?.[index],
          visible: true, score: 0,
        })
        this.totalBytes += bytes
      }
    }
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
    if (this.instances.length === 0) {
      return
    }
    this.score_()
    const ordered = this.instances.slice().sort((a, b) => b.score - a.score)
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
    this.instances = []
  }


  /**
   * Evaluate the current metric into each instance's `score` (higher =
   * kept longer).
   */
  score_() {
    const metric = this.metric
    if (metric === ResidencyMetric.MEMORY) {
      // Most parts per byte: cheap instances first.
      for (const instance of this.instances) {
        instance.score = -instance.bytes
      }
      return
    }
    if (metric === ResidencyMetric.DISTANCE) {
      const center = this.getSelectionCenter()
      if (center) {
        for (const instance of this.instances) {
          instance.score = -instance.center.distanceTo(center)
        }
        return
      }
      // No selection: fall through to occupancy ordering.
    }
    const camera = this.getCamera()
    const eye = camera?.position ?? null
    for (const instance of this.instances) {
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
    instance.mesh.setVisibleAt(instance.index, visible)
  }
}

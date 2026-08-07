import {Box3, Matrix4} from 'three'


/**
 * Outlier-robust world-space bounds for a model.
 *
 * Some models carry a handful of tiny fragments flung far from the real
 * geometry — e.g. test-models-private#26's ArchiCAD export, where three
 * sliver breps arc ~1.9 km into the sky and drag `Box3().setFromObject`
 * to a ~2 km cube around a ~100 m building, so the camera frames the
 * strays instead of the model. This is the "robust auto-framing"
 * candidate in conway `design/new/model-diagnostics.md` §4.3.
 *
 * Two entry points share one criterion, so the camera never changes its
 * mind about what the model is between the streaming preview and the
 * final frame:
 *
 * - `computeRobustBounds(object)` measures a loaded Object3D — the
 *   end-of-load framing, the ground/shadow rig.
 * - `robustBoundsFromElements(stores)` measures boxes accumulated as
 *   they stream (`ElementBoxes`), for ProgressiveLoadSession's camera
 *   follow. Re-walking a half-built `BatchedMesh` per refit would cost
 *   a full vertex pass each time; the loader already hands the session
 *   one world box per placed instance, so the streaming path keeps them
 *   and pays nothing extra.
 *
 * Granularity follows the scene type. The conway-direct path places one
 * `BatchedMesh` instance per shape — instances are measured (and
 * excluded) whole, via their world AABBs. Other meshes (the web-ifc path
 * merges every product into one geometry) offer no per-element seam, so
 * their vertices are classified individually.
 *
 * Deliberately conservative — "only extreme outliers" (issue #26 triage):
 * geometry is excluded only when it falls more than one whole model-span
 * (PAD_FACTOR × the largest axis span of the 99.9% envelope) outside that
 * envelope on some axis. Anything a rooftop antenna, site wing, or crane
 * could plausibly reach stays in. On a clean model nothing trips the
 * fence and the result matches `Box3().setFromObject` (vertex-exact, so
 * marginally tighter for rotated meshes, whose world-transformed local
 * AABBs over-cover); as a second guard, if more of the model lands
 * outside the fences than MAX_EXCLUDED_FRACTION allows, the distribution
 * isn't "model + strays" and the exact box is returned instead.
 *
 * Two passes: pass 1 takes exact bounds plus a coordinate sample for the
 * quantiles; pass 2 reclassifies everything and grows the robust box only
 * from in-fence geometry — so the box hugs the surviving model rather
 * than stopping at the fence line. Only the *envelope* reads a strided
 * sample; classification always sees every element and vertex, so a
 * stray can never be missed by sampling.
 */

/** Envelope quantile: the fences bracket the central 99.9% of the model. */
const ENVELOPE_QUANTILE = 0.999
/**
 * Envelope trim floor: at least this many extreme samples per side are
 * set aside when locating the envelope, so a stray too small to register
 * at ENVELOPE_QUANTILE (a handful of vertices in a small sample) still
 * can't inflate it. Trimmed samples are only excluded from the *box* if
 * they also land beyond the padded fences.
 */
const MIN_TRIM_SAMPLES = 8
/** Below this sample count the statistics are noise — no filtering. */
const MIN_SAMPLES = 80
/** Fence distance beyond the envelope, in units of the largest axis span. */
const PAD_FACTOR = 1
/**
 * More excluded geometry than this means the model isn't "core + strays"
 * — refuse to filter rather than carve up real geometry.
 */
const MAX_EXCLUDED_FRACTION = 0.02
/**
 * Absolute element allowance, applied when the fraction is stricter.
 * Without it the streaming follow can't act until the model is large
 * enough for 2% to reach 1 (50 instances) — the window in which an early
 * stray pops the camera out and a later refit has to pull it back. A
 * handful of elements is what "model + strays" looks like (issue #26's
 * model has 5 of 37,502); the fence test remains the real gate.
 */
const MIN_EXCLUDED_ELEMENTS = 4
/**
 * Per-axis envelope sample budget. The quantile only needs an estimate,
 * and the streaming follow re-derives it per refit — a strided sample
 * keeps that sort at a few milliseconds on a 37k-instance model.
 */
const MAX_SAMPLES_PER_AXIS = 20_000

const X = 0
const Y = 1
const Z = 2
const AXES = [X, Y, Z]
/** min[3] + max[3] per element in ElementBoxes' flat store. */
const BOX_FLOATS = 6
/** Offset of the max triple within one element's slot. */
const MAX_OFFSET = 3
const HALF = 0.5

/**
 * Cache: framing recomputes bounds at least twice per load (explicit
 * limit-sizing + fitModelToFrame), and the ground/shadow rig reads them
 * again — one walk is enough. Invalidated by element/vertex-count drift
 * (progressive loads growing the model), not by transform changes, which
 * don't occur between the load-time calls this serves.
 */
const cache = new WeakMap()


/**
 * A growable flat store of world-space element AABBs (6 doubles each).
 *
 * Flat rather than `Box3[]` because the streaming follow appends one box
 * per placed instance — tens of thousands during a load, in the phase
 * where allocation pressure is most visible. Doubles, not floats:
 * georeferenced models carry coordinates large enough to lose meaningful
 * precision in float32.
 */
export class ElementBoxes {
  /**
   * @param {number} [capacity] initial element capacity
   */
  constructor(capacity = 256) {
    this.data = new Float64Array(capacity * BOX_FLOATS)
    this.count = 0
  }

  /**
   * Append one box's bounds. The source is copied, so callers may pass a
   * scratch box they mutate afterwards (IncrementalBatchedBuilder does).
   *
   * @param {Box3} box world-space bounds
   */
  push(box) {
    const needed = (this.count + 1) * BOX_FLOATS
    if (needed > this.data.length) {
      const grown = new Float64Array(Math.max(needed, this.data.length * 2))
      grown.set(this.data)
      this.data = grown
    }
    const offset = this.count * BOX_FLOATS
    this.data[offset + X] = box.min.x
    this.data[offset + Y] = box.min.y
    this.data[offset + Z] = box.min.z
    this.data[offset + MAX_OFFSET + X] = box.max.x
    this.data[offset + MAX_OFFSET + Y] = box.max.y
    this.data[offset + MAX_OFFSET + Z] = box.max.z
    this.count++
  }

  /** Drop every element, keeping the allocated buffer. */
  clear() {
    this.count = 0
  }
}


/**
 * World-space bounds of `object` with extreme stray geometry excluded.
 *
 * @param {object} object three.js Object3D (the loaded model root)
 * @return {object|null} see robustBoundsCore; null when the object has
 *   no measurable geometry
 */
export function computeRobustBounds(object) {
  const {vertexEntries, elementBoxes} = collectParts(object)
  return robustBoundsCore([elementBoxes], vertexEntries)
}


/**
 * Robust bounds over element boxes gathered incrementally.
 *
 * Takes a list of stores rather than one so a caller can keep sources
 * with different lifetimes apart — ProgressiveLoadSession rebuilds its
 * preview-group store when the group's coordination transform is
 * stamped, while the streamed-instance store only ever appends.
 *
 * @param {Array<ElementBoxes>} stores
 * @return {object|null} see robustBoundsCore
 */
export function robustBoundsFromElements(stores) {
  return robustBoundsCore(stores, [])
}


/**
 * Cached wrapper around computeRobustBounds. The cache is validated by
 * element + vertex counts, so a progressively growing model recomputes.
 *
 * @param {object} object three.js Object3D
 * @return {object|null} see robustBoundsCore
 */
export function robustBoundsFor(object) {
  const cached = cache.get(object)
  if (cached) {
    const {vertexEntries, elementBoxes} = collectParts(object)
    if (countVertices(vertexEntries) === cached.totalVertices &&
        elementBoxes.count === cached.totalElements) {
      return cached
    }
  }
  const result = computeRobustBounds(object)
  if (result) {
    cache.set(object, result)
  } else {
    cache.delete(object)
  }
  return result
}


/**
 * The shared criterion. See the module doc for what it decides and why.
 *
 * @param {Array<ElementBoxes>} stores per-element world AABBs
 * @param {Array<object>} vertexEntries {position, matrixWorld} sources
 * @return {{
 *   box: Box3,
 *   exactBox: Box3,
 *   excludedElements: number,
 *   excludedVertices: number,
 *   totalElements: number,
 *   totalVertices: number,
 *   maxDistance: number,
 * }|null} `box` is the framing box; `exactBox` the unfiltered union.
 *   `maxDistance` is how far the farthest excluded point sits from the
 *   robust box's center (0 when nothing was excluded). Null when there
 *   is no measurable geometry.
 */
function robustBoundsCore(stores, vertexEntries) {
  const totalVertices = countVertices(vertexEntries)
  let totalElements = 0
  for (const store of stores) {
    totalElements += store.count
  }
  if (totalVertices === 0 && totalElements === 0) {
    return null
  }

  // Pass 1: exact bounds + a coordinate sample for the quantile envelope.
  // An element contributes its min and max per axis — one weight per
  // placed shape, so one vertex-heavy slab can't dominate the statistics.
  const exactBox = new Box3()
  const samples = [[], [], []]
  const elementStride = Math.max(1, Math.floor(totalElements / MAX_SAMPLES_PER_AXIS))
  let elementIndex = 0
  forEachElement(stores, (data, offset) => {
    expandBoxByElement(exactBox, data, offset)
    if (elementIndex % elementStride === 0) {
      for (const axis of AXES) {
        samples[axis].push(data[offset + axis], data[offset + MAX_OFFSET + axis])
      }
    }
    elementIndex++
  })
  const vertexStride = Math.max(1, Math.floor(totalVertices / MAX_SAMPLES_PER_AXIS))
  const world = [0, 0, 0]
  let vertexIndex = 0
  forEachWorldVertex(vertexEntries, world, () => {
    expandBox(exactBox, world)
    if (vertexIndex % vertexStride === 0) {
      samples[X].push(world[X])
      samples[Y].push(world[Y])
      samples[Z].push(world[Z])
    }
    vertexIndex++
  })

  const fences = computeFences(samples)
  if (fences === null) {
    return unfilteredResult(exactBox, totalElements, totalVertices)
  }
  const {fenceLows, fenceHighs} = fences

  // Pass 2: the robust box grows only from in-fence geometry, so it hugs
  // the surviving model instead of stopping at the fence line. An element
  // is excluded whole as soon as any part of it crosses a fence — a shape
  // reaching a model-span past the envelope is a stray even if it starts
  // inside (the issue-26 catenaries run from the building into the sky).
  const robustBox = new Box3()
  const excludedBox = new Box3()
  let excludedElements = 0
  forEachElement(stores, (data, offset) => {
    if (elementCrossesFences(data, offset, fenceLows, fenceHighs)) {
      excludedElements++
      expandBoxByElement(excludedBox, data, offset)
    } else {
      expandBoxByElement(robustBox, data, offset)
    }
  })
  let excludedVertices = 0
  forEachWorldVertex(vertexEntries, world, () => {
    if (crossesFences(world, fenceLows, fenceHighs)) {
      excludedVertices++
      expandBox(excludedBox, world)
    } else {
      expandBox(robustBox, world)
    }
  })

  const elementBudget = Math.max(
    MIN_EXCLUDED_ELEMENTS, totalElements * MAX_EXCLUDED_FRACTION)
  const overElementBudget = excludedElements > elementBudget
  const overVertexBudget = excludedVertices > totalVertices * MAX_EXCLUDED_FRACTION
  if ((excludedElements === 0 && excludedVertices === 0) ||
      overElementBudget || overVertexBudget || robustBox.isEmpty()) {
    return unfilteredResult(exactBox, totalElements, totalVertices)
  }

  return {
    box: robustBox,
    exactBox,
    excludedElements,
    excludedVertices,
    totalElements,
    totalVertices,
    // The excluded geometry's own bounds put an outer corner on the
    // farthest stray — enough for the load report's "up to N units out".
    maxDistance: farthestCornerDistance(excludedBox, robustBox),
  }
}


/**
 * Locate the padded fences from the per-axis sample distributions.
 *
 * @param {Array<Array<number>>} samples per-axis coordinate samples
 *   (sorted in place)
 * @return {{fenceLows: Array<number>, fenceHighs: Array<number>}|null}
 *   null when there is too little data, or the model is point-like
 */
function computeFences(samples) {
  const sampleCount = samples[X].length
  if (sampleCount < MIN_SAMPLES) {
    return null
  }
  const trim = Math.max(MIN_TRIM_SAMPLES, Math.floor((1 - ENVELOPE_QUANTILE) * sampleCount))
  const lows = []
  const highs = []
  let maxSpan = 0
  for (const axis of AXES) {
    samples[axis].sort((a, b) => a - b)
    lows[axis] = samples[axis][trim]
    highs[axis] = samples[axis][sampleCount - 1 - trim]
    maxSpan = Math.max(maxSpan, highs[axis] - lows[axis])
  }
  if (!(maxSpan > 0)) {
    // Degenerate (point-like) model — nothing to distinguish strays from.
    return null
  }
  const pad = PAD_FACTOR * maxSpan
  return {
    fenceLows: AXES.map((axis) => lows[axis] - pad),
    fenceHighs: AXES.map((axis) => highs[axis] + pad),
  }
}


/**
 * Split `object`'s renderable geometry into per-element world boxes
 * (BatchedMesh instances) and raw vertex sources (everything else with a
 * position attribute — the same set `Box3.setFromObject` measures, so the
 * no-outlier result matches it).
 *
 * @param {object} object three.js Object3D
 * @return {{vertexEntries: Array<object>, elementBoxes: ElementBoxes}}
 */
function collectParts(object) {
  object.updateWorldMatrix(true, true)
  const vertexEntries = []
  const elementBoxes = new ElementBoxes()
  object.traverse((node) => {
    if (node.isBatchedMesh) {
      collectBatchedElementBoxes(node, elementBoxes)
      return
    }
    const position = node.geometry?.attributes?.position
    if (position) {
      vertexEntries.push({position, matrixWorld: node.matrixWorld})
    }
  })
  return {vertexEntries, elementBoxes}
}


/**
 * One world-space box per BatchedMesh instance. Geometry-local boxes are
 * computed once per shared shape (getBoundingBoxAt walks the vertex
 * range), then placed by instance matrix × mesh matrixWorld.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {ElementBoxes} out world boxes are appended here
 */
function collectBatchedElementBoxes(mesh, out) {
  const geometryBoxes = new Map()
  const instanceMatrix = new Matrix4()
  const placed = new Matrix4()
  const worldBox = new Box3()
  // Same iteration as BatchedMesh#computeBoundingBox: _instanceInfo with
  // an active check (there is no public instance iterator — getGeometryIdAt
  // throws on deleted ids), so our exact box matches setFromObject's.
  const instanceInfo = mesh._instanceInfo
  for (let i = 0; i < instanceInfo.length; i++) {
    if (instanceInfo[i].active === false) {
      continue
    }
    const geometryId = instanceInfo[i].geometryIndex
    let geometryBox = geometryBoxes.get(geometryId)
    if (geometryBox === undefined) {
      geometryBox = new Box3()
      mesh.getBoundingBoxAt(geometryId, geometryBox)
      geometryBoxes.set(geometryId, geometryBox)
    }
    if (geometryBox.isEmpty()) {
      continue
    }
    mesh.getMatrixAt(i, instanceMatrix)
    placed.multiplyMatrices(mesh.matrixWorld, instanceMatrix)
    out.push(worldBox.copy(geometryBox).applyMatrix4(placed))
  }
}


/**
 * Invoke `visit(data, offset)` once per element across every store.
 *
 * @param {Array<ElementBoxes>} stores
 * @param {Function} visit
 */
function forEachElement(stores, visit) {
  for (const store of stores) {
    const {data, count} = store
    for (let i = 0; i < count; i++) {
      visit(data, i * BOX_FLOATS)
    }
  }
}


/**
 * @param {Array<object>} vertexEntries
 * @return {number} total vertex count
 */
function countVertices(vertexEntries) {
  return vertexEntries.reduce((sum, {position}) => sum + position.count, 0)
}


/**
 * The no-filtering result shape (clean model, degenerate model, or a
 * budget guard tripping).
 *
 * @param {Box3} exactBox
 * @param {number} totalElements
 * @param {number} totalVertices
 * @return {object}
 */
function unfilteredResult(exactBox, totalElements, totalVertices) {
  return {
    box: exactBox.clone(),
    exactBox,
    excludedElements: 0,
    excludedVertices: 0,
    totalElements,
    totalVertices,
    maxDistance: 0,
  }
}


/**
 * Does an element cross either fence on any axis?
 *
 * @param {Float64Array} data
 * @param {number} offset element slot offset
 * @param {Array<number>} fenceLows
 * @param {Array<number>} fenceHighs
 * @return {boolean}
 */
function elementCrossesFences(data, offset, fenceLows, fenceHighs) {
  for (const axis of AXES) {
    if (data[offset + axis] < fenceLows[axis] ||
        data[offset + MAX_OFFSET + axis] > fenceHighs[axis]) {
      return true
    }
  }
  return false
}


/**
 * Does a point lie outside the fences on any axis?
 *
 * @param {Array<number>} world [x, y, z]
 * @param {Array<number>} fenceLows
 * @param {Array<number>} fenceHighs
 * @return {boolean}
 */
function crossesFences(world, fenceLows, fenceHighs) {
  for (const axis of AXES) {
    if (world[axis] < fenceLows[axis] || world[axis] > fenceHighs[axis]) {
      return true
    }
  }
  return false
}


/**
 * Distance from `inner`'s center to the farthest corner of `outer`.
 *
 * @param {Box3} outer excluded geometry's bounds (may be empty)
 * @param {Box3} inner the robust box
 * @return {number} 0 when `outer` is empty
 */
function farthestCornerDistance(outer, inner) {
  if (outer.isEmpty()) {
    return 0
  }
  const center = [
    (inner.min.x + inner.max.x) * HALF,
    (inner.min.y + inner.max.y) * HALF,
    (inner.min.z + inner.max.z) * HALF,
  ]
  const lows = [outer.min.x, outer.min.y, outer.min.z]
  const highs = [outer.max.x, outer.max.y, outer.max.z]
  let sum = 0
  for (const axis of AXES) {
    const reach = Math.max(
      Math.abs(highs[axis] - center[axis]), Math.abs(center[axis] - lows[axis]))
    sum += reach * reach
  }
  return Math.sqrt(sum)
}


/**
 * Invoke `visit` once per vertex with `out` holding its world position.
 * The callback reads `out` synchronously — one shared array, no per-vertex
 * allocation across the millions of vertices a large model carries.
 *
 * @param {Array<object>} entries {position, matrixWorld}
 * @param {Array<number>} out [x, y, z] scratch, written before each visit
 * @param {Function} visit
 */
function forEachWorldVertex(entries, out, visit) {
  for (const {position, matrixWorld} of entries) {
    const e = matrixWorld.elements
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)

      out[X] = (e[0] * x) + (e[4] * y) + (e[8] * z) + e[12]
      out[Y] = (e[1] * x) + (e[5] * y) + (e[9] * z) + e[13]
      out[Z] = (e[2] * x) + (e[6] * y) + (e[10] * z) + e[14]
      /* eslint-enable no-magic-numbers */
      visit(out)
    }
  }
}


/**
 * Grow `box` to include the point in `world`.
 *
 * @param {Box3} box
 * @param {Array<number>} world [x, y, z]
 */
function expandBox(box, world) {
  box.min.x = Math.min(box.min.x, world[X])
  box.min.y = Math.min(box.min.y, world[Y])
  box.min.z = Math.min(box.min.z, world[Z])
  box.max.x = Math.max(box.max.x, world[X])
  box.max.y = Math.max(box.max.y, world[Y])
  box.max.z = Math.max(box.max.z, world[Z])
}


/**
 * Grow `box` to include one element's stored AABB.
 *
 * @param {Box3} box
 * @param {Float64Array} data
 * @param {number} offset element slot offset
 */
function expandBoxByElement(box, data, offset) {
  box.min.x = Math.min(box.min.x, data[offset + X])
  box.min.y = Math.min(box.min.y, data[offset + Y])
  box.min.z = Math.min(box.min.z, data[offset + Z])
  box.max.x = Math.max(box.max.x, data[offset + MAX_OFFSET + X])
  box.max.y = Math.max(box.max.y, data[offset + MAX_OFFSET + Y])
  box.max.z = Math.max(box.max.z, data[offset + MAX_OFFSET + Z])
}

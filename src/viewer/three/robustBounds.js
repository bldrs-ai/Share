import {Box3, Matrix4} from 'three'


/**
 * Outlier-robust world-space bounds for a model Object3D.
 *
 * Some models carry a handful of tiny fragments flung far from the real
 * geometry — e.g. test-models-private#26's ArchiCAD export, where three
 * sliver breps arc ~1.9 km into the sky and drag `Box3().setFromObject`
 * to a ~2 km cube around a ~100 m building, so the default camera frames
 * the strays instead of the model. This is the "robust auto-framing"
 * candidate in conway `design/new/model-diagnostics.md` §4.3.
 *
 * Granularity follows the scene type. The conway-direct path renders
 * `BatchedMesh`, where each instance is one placed shape — instances are
 * measured (and excluded) whole, via their world AABBs. Other meshes
 * (the web-ifc path merges every product into one geometry) offer no
 * per-element seam, so their vertices are classified individually.
 *
 * Deliberately conservative — "only extreme outliers" (issue #26 triage):
 * geometry is excluded only when it falls more than one whole model-span
 * (PAD_FACTOR × the largest axis span of the 99.9% envelope) outside that
 * envelope on some axis. Anything a rooftop antenna, site wing, or crane
 * could plausibly reach stays in. On a clean model nothing trips the
 * fence and the result matches `Box3().setFromObject` (vertex-exact, so
 * marginally tighter for rotated meshes, whose world-transformed local
 * AABBs over-cover); as a second guard,
 * if more than MAX_EXCLUDED_FRACTION of the model lands outside the
 * fences the distribution isn't "model + strays" and the exact box is
 * returned instead.
 *
 * Two passes: pass 1 takes exact bounds plus a coordinate sample for the
 * quantiles; pass 2 reclassifies everything and grows the robust box only
 * from in-fence geometry — so the box hugs the surviving model rather
 * than stopping at the fence line.
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
/** Per-axis cap on the strided quantile sample (memory + sort time). */
const SAMPLE_TARGET = 100_000

const X = 0
const Y = 1
const Z = 2
const AXES = [X, Y, Z]

/**
 * Cache: framing recomputes bounds at least twice per load (explicit
 * limit-sizing + fitModelToFrame), and the ground/shadow rig reads them
 * again — one walk is enough. Invalidated by element/vertex-count drift
 * (progressive loads growing the model), not by transform changes, which
 * don't occur between the load-time calls this serves.
 */
const cache = new WeakMap()


/**
 * World-space bounds of `object` with extreme stray geometry excluded.
 *
 * @param {object} object three.js Object3D (the loaded model root)
 * @return {{
 *   box: Box3,
 *   exactBox: Box3,
 *   excludedElements: number,
 *   excludedVertices: number,
 *   totalElements: number,
 *   totalVertices: number,
 *   maxDistance: number,
 * }|null} `box` is the framing box; `exactBox` the unfiltered union.
 *   Elements are BatchedMesh instances; vertices belong to ordinary
 *   meshes. `maxDistance` is how far the farthest excluded point sits
 *   from the robust box's center (0 when nothing was excluded). Null
 *   when the object has no measurable geometry.
 */
export function computeRobustBounds(object) {
  const {vertexEntries, elementBoxes} = collectParts(object)
  const totalVertices = countVertices(vertexEntries)
  const totalElements = elementBoxes.length
  if (totalVertices === 0 && totalElements === 0) {
    return null
  }

  // Pass 1: exact bounds + a coordinate sample for the quantile envelope.
  // Elements are sampled by their 8 box corners — equal weight per placed
  // shape, so one vertex-heavy slab doesn't dominate the statistics.
  const exactBox = new Box3()
  const samples = [[], [], []]
  const world = [0, 0, 0]
  for (const elementBox of elementBoxes) {
    exactBox.union(elementBox)
    forEachBoxCorner(elementBox, world, () => {
      samples[X].push(world[X])
      samples[Y].push(world[Y])
      samples[Z].push(world[Z])
    })
  }
  const stride = Math.max(1, Math.floor(totalVertices / SAMPLE_TARGET))
  let index = 0
  forEachWorldVertex(vertexEntries, world, () => {
    expandBox(exactBox, world)
    if (index % stride === 0) {
      samples[X].push(world[X])
      samples[Y].push(world[Y])
      samples[Z].push(world[Z])
    }
    index++
  })

  const sampleCount = samples[X].length
  if (sampleCount < MIN_SAMPLES) {
    return unfilteredResult(exactBox, totalElements, totalVertices)
  }
  const trim = Math.max(MIN_TRIM_SAMPLES, Math.floor((1 - ENVELOPE_QUANTILE) * sampleCount))
  const fenceLows = []
  const fenceHighs = []
  let maxSpan = 0
  const lows = []
  const highs = []
  for (const axis of AXES) {
    samples[axis].sort((a, b) => a - b)
    lows[axis] = samples[axis][trim]
    highs[axis] = samples[axis][sampleCount - 1 - trim]
    maxSpan = Math.max(maxSpan, highs[axis] - lows[axis])
  }
  if (!(maxSpan > 0)) {
    // Degenerate (point-like) model — nothing to distinguish strays from.
    return unfilteredResult(exactBox, totalElements, totalVertices)
  }
  const pad = PAD_FACTOR * maxSpan
  for (const axis of AXES) {
    fenceLows[axis] = lows[axis] - pad
    fenceHighs[axis] = highs[axis] + pad
  }

  // Pass 2: the robust box grows only from in-fence geometry, so it hugs
  // the surviving model instead of stopping at the fence line. An element
  // is excluded whole as soon as any part of it crosses a fence — a shape
  // reaching a model-span past the envelope is a stray even if it starts
  // inside (the issue-26 catenaries run from the building into the sky).
  const robustBox = new Box3()
  const excludedBoxes = []
  for (const elementBox of elementBoxes) {
    if (elementBox.min.x < fenceLows[X] || elementBox.max.x > fenceHighs[X] ||
        elementBox.min.y < fenceLows[Y] || elementBox.max.y > fenceHighs[Y] ||
        elementBox.min.z < fenceLows[Z] || elementBox.max.z > fenceHighs[Z]) {
      excludedBoxes.push(elementBox)
    } else {
      robustBox.union(elementBox)
    }
  }
  let excludedVertices = 0
  let maxVertexDistanceSq = 0
  const fencedMin = [0, 0, 0]
  const fencedMax = [0, 0, 0]
  forEachWorldVertex(vertexEntries, world, () => {
    if (world[X] < fenceLows[X] || world[X] > fenceHighs[X] ||
        world[Y] < fenceLows[Y] || world[Y] > fenceHighs[Y] ||
        world[Z] < fenceLows[Z] || world[Z] > fenceHighs[Z]) {
      excludedVertices++
      if (excludedVertices === 1) {
        fencedMin[X] = fencedMax[X] = world[X]
        fencedMin[Y] = fencedMax[Y] = world[Y]
        fencedMin[Z] = fencedMax[Z] = world[Z]
      } else {
        for (const axis of AXES) {
          fencedMin[axis] = Math.min(fencedMin[axis], world[axis])
          fencedMax[axis] = Math.max(fencedMax[axis], world[axis])
        }
      }
    } else {
      expandBox(robustBox, world)
    }
  })

  const excludedElements = excludedBoxes.length
  const overElementBudget = totalElements > 0 &&
    excludedElements > totalElements * MAX_EXCLUDED_FRACTION
  const overVertexBudget = totalVertices > 0 &&
    excludedVertices > totalVertices * MAX_EXCLUDED_FRACTION
  if ((excludedElements === 0 && excludedVertices === 0) ||
      overElementBudget || overVertexBudget || robustBox.isEmpty()) {
    return unfilteredResult(exactBox, totalElements, totalVertices)
  }

  // How far out the worst stray sat — for the load-report health line.
  const center = [
    (robustBox.min.x + robustBox.max.x) / 2,
    (robustBox.min.y + robustBox.max.y) / 2,
    (robustBox.min.z + robustBox.max.z) / 2,
  ]
  let maxDistanceSq = 0
  const recordCornerDistance = () => {
    maxDistanceSq = Math.max(maxDistanceSq, distanceSq(world, center))
  }
  for (const excluded of excludedBoxes) {
    forEachBoxCorner(excluded, world, recordCornerDistance)
  }
  if (excludedVertices > 0) {
    // The excluded-vertex extremes bound the farthest vertex per axis.
    for (const corner of [fencedMin, fencedMax]) {
      maxVertexDistanceSq = Math.max(maxVertexDistanceSq, distanceSq(corner, center))
    }
    maxDistanceSq = Math.max(maxDistanceSq, maxVertexDistanceSq)
  }

  return {
    box: robustBox,
    exactBox,
    excludedElements,
    excludedVertices,
    totalElements,
    totalVertices,
    maxDistance: Math.sqrt(maxDistanceSq),
  }
}


/**
 * Cached wrapper around computeRobustBounds. The cache is validated by
 * element + vertex counts, so a progressively growing model recomputes.
 *
 * @param {object} object three.js Object3D
 * @return {object|null} see computeRobustBounds
 */
export function robustBoundsFor(object) {
  const cached = cache.get(object)
  if (cached) {
    const {vertexEntries, elementBoxes} = collectParts(object)
    if (countVertices(vertexEntries) === cached.totalVertices &&
        elementBoxes.length === cached.totalElements) {
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
 * Split `object`'s renderable geometry into per-element world boxes
 * (BatchedMesh instances) and raw vertex sources (everything else with a
 * position attribute — the same set `Box3.setFromObject` measures, so the
 * no-outlier result matches it).
 *
 * @param {object} object three.js Object3D
 * @return {{vertexEntries: Array<object>, elementBoxes: Array<Box3>}}
 */
function collectParts(object) {
  object.updateWorldMatrix(true, true)
  const vertexEntries = []
  const elementBoxes = []
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
 * One world-space Box3 per BatchedMesh instance. Geometry-local boxes are
 * computed once per shared shape (getBoundingBoxAt walks the vertex
 * range), then placed by instance matrix × mesh matrixWorld.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {Array<Box3>} out world boxes are pushed here
 */
function collectBatchedElementBoxes(mesh, out) {
  const geometryBoxes = new Map()
  const instanceMatrix = new Matrix4()
  const placed = new Matrix4()
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
    out.push(geometryBox.clone().applyMatrix4(placed))
  }
}


/**
 * @param {Array<{position: object}>} vertexEntries
 * @return {number} total vertex count
 */
function countVertices(vertexEntries) {
  return vertexEntries.reduce((sum, {position}) => sum + position.count, 0)
}


/**
 * The no-filtering result shape (clean model, degenerate model, or the
 * excluded-fraction guard tripping).
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
 * Invoke `visit` once per vertex with `out` holding its world position.
 * The callback reads `out` synchronously — one shared array, no per-vertex
 * allocation across the millions of vertices a large model carries.
 *
 * @param {Array<{position: object, matrixWorld: object}>} entries
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
 * Invoke `visit` once per corner of `box` with `out` holding the corner.
 *
 * @param {Box3} box
 * @param {Array<number>} out [x, y, z] scratch, written before each visit
 * @param {Function} visit
 */
function forEachBoxCorner(box, out, visit) {
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        out[X] = x
        out[Y] = y
        out[Z] = z
        visit(out)
      }
    }
  }
}


/**
 * Grow `box` to include the point in `world` (min/max update without a
 * Vector3 allocation).
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
 * Squared distance between two [x, y, z] triples.
 *
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @return {number}
 */
function distanceSq(a, b) {
  const dx = a[X] - b[X]
  const dy = a[Y] - b[Y]
  const dz = a[Z] - b[Z]
  return (dx * dx) + (dy * dy) + (dz * dz)
}

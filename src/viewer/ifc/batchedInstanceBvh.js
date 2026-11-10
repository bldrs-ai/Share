import {Box3, Matrix4, Ray} from 'three'
import {batchEditRevision, BatchEditKind, onBatchEdit} from './batchedEdit'


/**
 * A bounding-volume tree over a BatchedMesh's INSTANCES, so a ray visits only
 * the instances whose box it crosses (hover picking).
 *
 * three-mesh-bvh's batched raycast walks every instance id the batch has
 * issued, and for each one reads its matrix, multiplies and inverts it, and
 * transforms the ray, before the instance's own per-geometry tree can reject
 * it (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:110-152 and
 * src/core/MeshBVH.js:447-464). That is O(instances) per ray with or without
 * the per-geometry trees, and on PSB it is most of a hover pick: the trees
 * #2117 builds after load leave a ray at 6-8 ms on an M2. This tree answers
 * "which instances can this ray hit" in O(log instances + hits), and
 * `batchedRaycast.js` then runs the library's per-instance raycast on just
 * those ids, in ascending id order, so the hit list — and so the pick — is
 * the library's own, entry for entry.
 *
 * **Conservative, never exact.** A box only ever ADDS a candidate: every
 * candidate is still tested triangle by triangle, as before. So the boxes
 * are padded (see `padOf`) against the rounding between the box transform
 * here and the library's inverse ray transform, and a ray's near/far are
 * ignored. A box that is too big costs a candidate; one too small would lose
 * a hit, which is the only way this could change a pick.
 *
 * **Batch-local space.** Boxes are each instance's geometry box under its
 * instance matrix, NOT under the batch's `matrixWorld`; the ray is brought
 * into the batch's space per query instead. A model moved after load
 * (coordination, a placement edit on the root) keeps its tree.
 *
 * **Built after the model is shown**, in the idle slices
 * `deferredBatchedBvh.js` schedules, before that job's per-geometry trees:
 * this tree is a few milliseconds where they are seconds, and it is the one
 * hover needs. Until it is done {@link instanceCandidates} returns null and
 * the raycast walks every instance as it always has. Picks stay correct.
 *
 * **Edits.** `batchedEdit.js` is the only thing that changes a loaded batch,
 * and it tells its listeners synchronously (design/new/model-edit.md, L0).
 * The tree is never rebuilt for one: an id an edit adds, moves or reshapes
 * goes on an `extra` list that every query walks besides the tree's own
 * candidates, so a stale box can only add a candidate. Three reuses a
 * deleted id on the next add (BatchedMesh.js:580-591), which arrives as an
 * `addInstance` event, so it goes on the list too. A delete needs nothing:
 * the raycast skips an inactive id, as it skips a hidden one, at query time.
 * Any id past what the tree was built over is walked as well, as is any
 * instance whose box came out non-finite (a NaN vertex), and if the
 * batch's edit revision is ever ahead of what the listener has seen, the
 * tree is not used at all. Past `MAX_EXTRA_FRACTION` of the batch on
 * the list, the tree is dropped and picks walk every instance again; a bulk
 * edit (L2) that wants it back can schedule a fresh build.
 *
 * Held in a WeakMap keyed by the mesh, like batchedEdit's own state: an
 * unloaded model takes its tree, and its edit listener, with it.
 */


/** Instances per leaf. Small: a leaf's instances are each box-tested too. */
const LEAF_SIZE = 4

/**
 * Past this share of the batch walked as edit `extra`s, the tree is no
 * longer worth its upkeep (see module doc, Edits).
 */
const MAX_EXTRA_FRACTION = 0.25

/** Smallest `extra` list ever counted as too long, so a tiny batch keeps its tree. */
const MIN_EXTRA_LIMIT = 64

/**
 * Relative padding of each box: far above the ~1e-16 relative error of a
 * double-precision transform, far below anything a candidate count notices.
 */
const PAD_RELATIVE = 1e-6

/** Absolute padding floor, for a box at the origin of zero extent. */
const PAD_ABSOLUTE = 1e-9

/** How many instances or nodes a build step does between deadline checks. */
const STEP_WORK = 256

/** `instanceBox` results. */
const IN_TREE = 0
const OUT_OF_TREE = 1
const UNBOXED = 2

/**
 * Set on `mesh.userData` while the mesh has a built tree: a read-only
 * diagnostic, so an E2E can tell a leg that used the tree from one that
 * walked (`hoverPick.spec.ts`). Nothing reads it to decide anything.
 */
export const INSTANCE_TREE_FLAG = 'instanceBoundsTree'


const trees = new WeakMap()
const _box = new Box3()
const _matrix = new Matrix4()
const _inverse = new Matrix4()
const _ray = new Ray()


/**
 * Start building `mesh`'s instance tree. Returns a builder whose `step` the
 * caller (deferredBatchedBvh's job) runs until it reports done; picks use the
 * tree from the moment it does. Replaces any tree the mesh already had.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @return {object} `{step(isSpent): boolean, cancel()}` — `step` returns
 *   true once the tree is built (or the build was cancelled)
 */
export function beginInstanceBoundsTree(mesh) {
  disposeInstanceBoundsTree(mesh)
  const state = newState(mesh)
  trees.set(mesh, state)
  const build = newBuild(mesh, state)
  return {
    step: (isSpent) => {
      if (state.disposed) {
        return true
      }
      return build.step(isSpent)
    },
    // A build cancelled before it finished leaves no tree. One that finished
    // is left alone: it is correct whatever happens to the job that built it,
    // and goes with the mesh (or its own `disposeInstanceBoundsTree`).
    cancel: () => {
      if (!state.built && trees.get(mesh) === state) {
        disposeInstanceBoundsTree(mesh)
      }
    },
  }
}


/**
 * Drop `mesh`'s instance tree and stop listening to its edits. Picks walk
 * every instance again.
 *
 * @param {object} mesh THREE.BatchedMesh
 */
export function disposeInstanceBoundsTree(mesh) {
  const state = trees.get(mesh)
  if (!state) {
    return
  }
  state.disposed = true
  state.unsubscribe()
  trees.delete(mesh)
  if (mesh.userData) {
    delete mesh.userData[INSTANCE_TREE_FLAG]
  }
}


/**
 * @param {object} mesh THREE.BatchedMesh
 * @return {boolean} whether picks on `mesh` go through its instance tree now
 */
export function hasInstanceBoundsTree(mesh) {
  return usable(trees.get(mesh), mesh)
}


/**
 * The ids of every instance `ray` can hit, ascending and without repeats,
 * or null when the tree is not there to say (not built yet, dropped, or
 * behind an edit), in which case the caller walks every instance.
 *
 * Inactive and hidden ids may be included: the raycast checks those at
 * query time, as it always has.
 *
 * @param {object} mesh THREE.BatchedMesh, `matrixWorld` current
 * @param {object} ray THREE.Ray in world space
 * @return {Array<number>|null}
 */
export function instanceCandidates(mesh, ray) {
  const state = trees.get(mesh)
  if (!usable(state, mesh)) {
    return null
  }
  _inverse.copy(mesh.matrixWorld).invert()
  _ray.copy(ray).applyMatrix4(_inverse)
  const out = []
  collectHits(state, _ray, out)
  const span = mesh._instanceInfo?.length ?? 0
  for (let id = state.span; id < span; id++) {
    out.push(id)
  }
  for (const id of state.extra) {
    out.push(id)
  }
  for (const id of state.unboxed) {
    out.push(id)
  }
  out.sort(ascending)
  return dedupeSorted(out)
}


/**
 * @param {object} state
 * @param {object} mesh
 * @return {boolean}
 */
function usable(state, mesh) {
  return Boolean(state) && state.built && !state.disposed &&
    state.seenRevision === batchEditRevision(mesh)
}


/**
 * @param {object} mesh
 * @return {object} the tree's state, empty until the build finishes
 */
function newState(mesh) {
  const state = {
    built: false,
    disposed: false,
    // One past the largest id the tree was built over.
    span: 0,
    extra: new Set(),
    // Ids whose box came out non-finite at build (see `instanceBox`), walked
    // on every ray. Not edits, so they don't count toward the `extra` limit.
    unboxed: [],
    seenRevision: batchEditRevision(mesh),
    // Per-instance boxes, 6 doubles each (min xyz, max xyz); an instance
    // left out of the tree (inactive or empty at build) is never read.
    boxes: null,
    // The tree: per node, its box (6 doubles), and either its first child
    // (internal; the second is the next node) or its range of `order`
    // (leaf, count > 0).
    nodeBoxes: null,
    nodeFirst: null,
    nodeCount: null,
    order: null,
    unsubscribe: null,
  }
  state.unsubscribe = onBatchEdit(mesh, (change) => noteEdit(mesh, state, change))
  return state
}


/**
 * The edit listener (module doc, Edits). Runs during the build as well, so
 * an id edited before its box is computed is still walked.
 *
 * @param {object} mesh
 * @param {object} state
 * @param {object} change `{revision, events}` from batchedEdit
 */
function noteEdit(mesh, state, change) {
  for (const event of change.events) {
    if (event.kind === BatchEditKind.ADD_INSTANCE ||
        event.kind === BatchEditKind.SET_MATRIX ||
        event.kind === BatchEditKind.SET_GEOMETRY) {
      state.extra.add(event.batchId)
    }
  }
  state.seenRevision = change.revision
  const limit = Math.max(MIN_EXTRA_LIMIT, Math.ceil(state.span * MAX_EXTRA_FRACTION))
  if (state.built && state.extra.size > limit) {
    disposeInstanceBoundsTree(mesh)
  }
}


/**
 * The resumable build: every instance's box, then the tree, top down, a node
 * at a time from a work stack, so either phase can stop at a deadline.
 *
 * @param {object} mesh
 * @param {object} state
 * @return {object} `{step(isSpent): boolean}`
 */
function newBuild(mesh, state) {
  const span = mesh._instanceInfo?.length ?? 0
  const boxes = new Float64Array(span * 6)
  const order = new Uint32Array(span)
  let inTree = 0
  let nextId = 0
  // Phase 2 state, allocated once the in-tree count is known.
  let stack = null
  let nodes = 0

  /**
   * @param {Function} isSpent `() => boolean`
   * @return {boolean} done
   */
  function step(isSpent) {
    while (nextId < span) {
      const end = Math.min(span, nextId + STEP_WORK)
      for (; nextId < end; nextId++) {
        const kind = instanceBox(mesh, nextId, boxes)
        if (kind === IN_TREE) {
          order[inTree++] = nextId
        } else if (kind === UNBOXED) {
          state.unboxed.push(nextId)
        }
      }
      if (nextId < span && isSpent()) {
        return false
      }
    }
    if (stack === null) {
      // A median split leaves each leaf at least half full, so a tree over
      // n instances has fewer than n nodes for n >= LEAF_SIZE; +1 covers a
      // lone root over fewer.
      const capacity = Math.max(1, inTree) + 1
      state.nodeBoxes = new Float64Array(capacity * 6)
      state.nodeFirst = new Uint32Array(capacity)
      state.nodeCount = new Uint32Array(capacity)
      nodes = 1
      stack = inTree > 0 ? [0, 0, inTree] : []
    }
    while (stack.length > 0) {
      for (let work = 0; work < STEP_WORK && stack.length > 0; work++) {
        const end = stack.pop()
        const start = stack.pop()
        const node = stack.pop()
        nodes = buildNode(state, boxes, order, node, start, end, nodes, stack)
      }
      if (stack.length > 0 && isSpent()) {
        return false
      }
    }
    state.span = span
    state.boxes = boxes
    state.order = order
    state.inTree = inTree
    state.built = true
    if (mesh.userData) {
      mesh.userData[INSTANCE_TREE_FLAG] = true
    }
    return true
  }

  return {step}
}


/**
 * Write instance `id`'s padded batch-local box into `boxes`.
 *
 * A box with a NaN or infinite coordinate is never put in the tree: one bad
 * vertex makes three's `getBoundingBoxAt` box all NaN (`Box3#expandByPoint`),
 * every slab comparison against NaN is false, and the instance would never
 * be a candidate, while the library still hits its sound triangles through
 * the per-geometry tree (whose builder skips NaN with `<`/`>`). Such an
 * instance is walked on every ray instead.
 *
 * @param {object} mesh
 * @param {number} id
 * @param {Float64Array} boxes
 * @return {number} IN_TREE; OUT_OF_TREE when no ray can hit it: inactive
 *   (three reuses its id through an `addInstance` the listener sees) or an
 *   empty geometry; or UNBOXED
 */
function instanceBox(mesh, id, boxes) {
  const info = mesh._instanceInfo[id]
  if (!info || info.active === false) {
    return OUT_OF_TREE
  }
  // `isEmpty` is false for a NaN box (every comparison with NaN is), so this
  // only drops a geometry with no vertices.
  if (mesh.getBoundingBoxAt(info.geometryIndex, _box) === null || _box.isEmpty()) {
    return OUT_OF_TREE
  }
  _box.applyMatrix4(mesh.getMatrixAt(id, _matrix))
  const {min, max} = _box
  const finite = Number.isFinite(min.x) && Number.isFinite(min.y) && Number.isFinite(min.z) &&
    Number.isFinite(max.x) && Number.isFinite(max.y) && Number.isFinite(max.z)
  if (!finite) {
    return UNBOXED
  }
  const pad = padOf(min, max)
  const o = id * 6
  boxes[o] = min.x - pad
  boxes[o + 1] = min.y - pad
  boxes[o + 2] = min.z - pad
  boxes[o + 3] = max.x + pad
  boxes[o + 4] = max.y + pad
  boxes[o + 5] = max.z + pad
  return IN_TREE
}


/**
 * Padding for one box: relative to its largest coordinate magnitude and its
 * extent, so a model placed far from the origin, and a flat box (a slab face,
 * a plate) whose thickness is zero, both keep the hits the library finds.
 *
 * @param {object} min Vector3
 * @param {object} max Vector3
 * @return {number}
 */
function padOf(min, max) {
  const magnitude = Math.max(
    Math.abs(min.x), Math.abs(min.y), Math.abs(min.z),
    Math.abs(max.x), Math.abs(max.y), Math.abs(max.z),
    max.x - min.x, max.y - min.y, max.z - min.z)
  return (magnitude * PAD_RELATIVE) + PAD_ABSOLUTE
}


/**
 * Make `node` the box over `order[start, end)`, as a leaf, or split it at the
 * median centroid on its widest centroid axis and push both halves.
 *
 * @param {object} state
 * @param {Float64Array} boxes
 * @param {Uint32Array} order
 * @param {number} node
 * @param {number} start
 * @param {number} end
 * @param {number} nodes how many nodes are allocated
 * @param {Array<number>} stack `[node, start, end, ...]`
 * @return {number} how many nodes are allocated now
 */
function buildNode(state, boxes, order, node, start, end, nodes, stack) {
  const nb = state.nodeBoxes
  const n6 = node * 6
  nb[n6] = nb[n6 + 1] = nb[n6 + 2] = Infinity
  nb[n6 + 3] = nb[n6 + 4] = nb[n6 + 5] = -Infinity
  // Centroid bounds (doubled centres: the halving cancels out of the split).
  let cMinX = Infinity
  let cMinY = Infinity
  let cMinZ = Infinity
  let cMaxX = -Infinity
  let cMaxY = -Infinity
  let cMaxZ = -Infinity
  for (let i = start; i < end; i++) {
    const o = order[i] * 6
    for (let a = 0; a < 3; a++) {
      if (boxes[o + a] < nb[n6 + a]) {
        nb[n6 + a] = boxes[o + a]
      }
      if (boxes[o + 3 + a] > nb[n6 + 3 + a]) {
        nb[n6 + 3 + a] = boxes[o + 3 + a]
      }
    }
    const cx = boxes[o] + boxes[o + 3]
    const cy = boxes[o + 1] + boxes[o + 4]
    const cz = boxes[o + 2] + boxes[o + 5]
    cMinX = Math.min(cMinX, cx)
    cMaxX = Math.max(cMaxX, cx)
    cMinY = Math.min(cMinY, cy)
    cMaxY = Math.max(cMaxY, cy)
    cMinZ = Math.min(cMinZ, cz)
    cMaxZ = Math.max(cMaxZ, cz)
  }
  if (end - start <= LEAF_SIZE) {
    state.nodeFirst[node] = start
    state.nodeCount[node] = end - start
    return nodes
  }
  const ex = cMaxX - cMinX
  const ey = cMaxY - cMinY
  const ez = cMaxZ - cMinZ
  const axis = (ex >= ey && ex >= ez) ? 0 : (ey >= ez ? 1 : 2)
  const mid = (start + end) >>> 1
  selectNth(order, boxes, axis, start, end - 1, mid)
  const left = nodes
  state.nodeFirst[node] = left
  state.nodeCount[node] = 0
  stack.push(left, start, mid, left + 1, mid, end)
  return nodes + 2
}


/**
 * Partially sort `order[lo, hi]` so position `k` holds the instance whose
 * centroid on `axis` would be there in full order, with no larger one before
 * it and no smaller one after (Hoare's quickselect, median-of-three pivot).
 *
 * @param {Uint32Array} order
 * @param {Float64Array} boxes
 * @param {number} axis 0, 1 or 2
 * @param {number} lo inclusive
 * @param {number} hi inclusive
 * @param {number} k
 */
function selectNth(order, boxes, axis, lo, hi, k) {
  const key = (i) => boxes[(order[i] * 6) + axis] + boxes[(order[i] * 6) + 3 + axis]
  while (hi > lo) {
    const m = (lo + hi) >>> 1
    // Median of three as pivot, so sorted input (a grid, emission order)
    // doesn't degrade to quadratic.
    const a = key(lo)
    const b = key(m)
    const c = key(hi)
    const pivot = (a < b) ? ((b < c) ? b : Math.max(a, c)) : ((a < c) ? a : Math.max(b, c))
    let i = lo
    let j = hi
    while (i <= j) {
      while (key(i) < pivot) {
        i++
      }
      while (key(j) > pivot) {
        j--
      }
      if (i <= j) {
        const t = order[i]
        order[i] = order[j]
        order[j] = t
        i++
        j--
      }
    }
    if (k <= j) {
      hi = j
    } else if (k >= i) {
      lo = i
    } else {
      return
    }
  }
}


/**
 * Push every in-tree instance whose box `ray` (batch-local) crosses at or
 * ahead of its origin.
 *
 * @param {object} state
 * @param {object} ray THREE.Ray
 * @param {Array<number>} out
 */
function collectHits(state, ray, out) {
  if (state.inTree === 0) {
    return
  }
  const {origin, direction} = ray
  const ox = origin.x
  const oy = origin.y
  const oz = origin.z
  const dx = direction.x
  const dy = direction.y
  const dz = direction.z
  const {nodeBoxes, nodeFirst, nodeCount, order, boxes} = state
  const stack = [0]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!rayCrossesBox(nodeBoxes, node * 6, ox, oy, oz, dx, dy, dz)) {
      continue
    }
    const count = nodeCount[node]
    if (count === 0) {
      const first = nodeFirst[node]
      stack.push(first, first + 1)
      continue
    }
    const first = nodeFirst[node]
    for (let i = first; i < first + count; i++) {
      const id = order[i]
      if (rayCrossesBox(boxes, id * 6, ox, oy, oz, dx, dy, dz)) {
        out.push(id)
      }
    }
  }
}


/**
 * Slab test of a ray against the box at `b[o..o+5]`, for t in [0, ∞). The
 * direction need not be unit length (a batch-local ray is scaled). A zero
 * component is handled explicitly rather than through ±Infinity, whose
 * product with a zero offset is NaN.
 *
 * @param {Float64Array} b
 * @param {number} o
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @return {boolean}
 */
function rayCrossesBox(b, o, ox, oy, oz, dx, dy, dz) {
  // Unrolled per axis: this is the inner loop of every hover pick.
  let tMin = 0
  let tMax = Infinity
  let t1
  let t2
  if (dx === 0) {
    if (ox < b[o] || ox > b[o + 3]) {
      return false
    }
  } else {
    t1 = (b[o] - ox) / dx
    t2 = (b[o + 3] - ox) / dx
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
    if (tMin > tMax) {
      return false
    }
  }
  if (dy === 0) {
    if (oy < b[o + 1] || oy > b[o + 4]) {
      return false
    }
  } else {
    t1 = (b[o + 1] - oy) / dy
    t2 = (b[o + 4] - oy) / dy
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
    if (tMin > tMax) {
      return false
    }
  }
  if (dz === 0) {
    return oz >= b[o + 2] && oz <= b[o + 5]
  }
  t1 = (b[o + 2] - oz) / dz
  t2 = (b[o + 5] - oz) / dz
  tMin = Math.max(tMin, Math.min(t1, t2))
  tMax = Math.min(tMax, Math.max(t1, t2))
  return tMin <= tMax
}


/**
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
function ascending(a, b) {
  return a - b
}


/**
 * @param {Array<number>} sorted
 * @return {Array<number>} the same array, repeats removed in place
 */
function dedupeSorted(sorted) {
  let w = 0
  for (let r = 0; r < sorted.length; r++) {
    if (r === 0 || sorted[r] !== sorted[r - 1]) {
      sorted[w++] = sorted[r]
    }
  }
  sorted.length = w
  return sorted
}

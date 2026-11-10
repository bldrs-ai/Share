/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3} from 'three'
import {
  addBatchedGeometry,
  addBatchedInstance,
  deleteBatchedInstance,
  mintGeometryId,
  mintOccurrenceId,
  setBatchedInstanceGeometry,
  setBatchedInstanceMatrix,
} from './batchedEdit'
import {
  beginInstanceBoundsTree,
  disposeInstanceBoundsTree,
  hasInstanceBoundsTree,
  instanceCandidates,
} from './batchedInstanceBvh'
import {withBvhPrototypes} from './batchedModel.fixture'
import {raycastActiveInstances} from './batchedRaycast'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {
  disposeDeferredBatchedBoundsTree,
  finishBatchedBoundsTrees,
  scheduleBatchedBoundsTrees,
} from './deferredBatchedBvh'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


// Shapes, by Conway geometry express id. Chosen for the cases a box test can
// get wrong: a closed solid, a long thin member, and a plate of zero
// thickness, whose box is flat in one axis and which an axis-aligned ray
// meets exactly on that box's face.
const CUBE = 1001
const BEAM = 1002
const PLATE = 1003

const GRID = 9
const STEP = 3
const RANDOM_RAYS = 600
const SCREEN_RAYS = 16
const POINT_TOLERANCE = 1e-9


/**
 * @param {Array<number>} positions xyz triples
 * @param {Array<number>} indices
 * @return {{verts: Float32Array, indices: Uint32Array}} Conway's interleaved
 *   position + normal layout (the normals are not read by the raycast)
 */
function shape(positions, indices) {
  const verts = new Float32Array((positions.length / 3) * 6)
  for (let v = 0; v < positions.length / 3; v++) {
    verts.set(positions.slice(v * 3, (v * 3) + 3), v * 6)
    verts[(v * 6) + 5] = 1
  }
  return {verts, indices: new Uint32Array(indices)}
}


/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @return {object} a closed axis-aligned box from the origin to (sx, sy, sz)
 */
function boxShape(sx, sy, sz) {
  const p = []
  for (let i = 0; i < 8; i++) {
    p.push((i & 1) ? sx : 0, (i & 2) ? sy : 0, (i & 4) ? sz : 0)
  }
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
  const idx = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])
  return shape(p, idx)
}


/** @return {object} mock Conway IfcAPI serving CUBE, BEAM and PLATE */
function shapesApi() {
  const shapes = {
    [CUBE]: boxShape(1, 1, 1),
    [BEAM]: boxShape(2.5, 0.2, 0.3),
    [PLATE]: shape([0, 0, 0, 1.5, 0, 0, 1.5, 1.5, 0, 0, 1.5, 0], [0, 1, 2, 0, 2, 3]),
  }
  return {
    GetGeometry: (_modelID, id) => (shapes[id] ? {
      GetVertexData: () => id,
      GetIndexData: () => id,
      GetVertexDataSize: () => shapes[id].verts.length,
      GetIndexDataSize: () => shapes[id].indices.length,
    } : null),
    GetVertexArray: (id) => shapes[id].verts,
    GetIndexArray: (id) => shapes[id].indices,
  }
}


/**
 * A deterministic pseudo-random source, so a failure reproduces.
 *
 * @param {number} seed
 * @return {Function} `() => number` in [0, 1)
 */
function lcg(seed) {
  let state = seed
  return () => {
    state = ((state * 1103515245) + 12345) % 2147483648
    return state / 2147483648
  }
}


/**
 * A GRID³ lattice of placements, rotated and scaled at random, three shapes
 * mixed, plus a second product placed exactly over every seventh one, so
 * coplanar faces tie on distance and the hit list's order among them decides
 * the pick. Decorated by the production `decorateBatchMeshes`, so the tables
 * an edit needs are the ones a load leaves.
 *
 * @return {object} the decorated THREE.BatchedMesh, under a non-identity
 *   `matrixWorld` (rotated, scaled, far from the origin)
 */
function latticeBatch() {
  const rand = lcg(7)
  const shapes = [CUBE, BEAM, PLATE]
  const flatMeshes = []
  let expressID = 1
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      for (let z = 0; z < GRID; z++) {
        const q = new Quaternion().setFromAxisAngle(
          new Vector3(rand(), rand(), rand()).normalize(), rand() * Math.PI)
        // Every other one stays axis-aligned, so rays down the lattice axes
        // meet faces (and the plate) exactly on their boxes' planes.
        if ((x + y + z) % 2 === 0) {
          q.identity()
        }
        const s = 0.5 + rand()
        const m = new Matrix4().compose(
          new Vector3(x * STEP, y * STEP, z * STEP), q, new Vector3(s, s, s))
        const geometryExpressID = shapes[(x + (y * 2) + z) % shapes.length]
        const color = {x: rand(), y: rand(), z: rand(), w: 1}
        flatMeshes.push({
          expressID: expressID++,
          geometries: [{geometryExpressID, flatTransformation: m.toArray(), color}],
        })
        if ((x + y + z) % 7 === 0) {
          flatMeshes.push({
            expressID: expressID++,
            geometries: [{geometryExpressID, flatTransformation: m.toArray(), color: {...color}}],
          })
        }
      }
    }
  }
  const {batches} = flatMeshToBatchedModel(flatMeshes, shapesApi(), 0)
  decorateBatchMeshes(batches)
  const mesh = batches[0].mesh
  mesh.position.set(1.0e4, -2.0e3, 5.0e2)
  mesh.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
  mesh.scale.set(1.5, 1.5, 1.5)
  mesh.updateMatrixWorld(true)
  return mesh
}


/**
 * Rays at the lattice: from outside it toward points inside it; along each
 * lattice axis through cell centres and through the planes the axis-aligned
 * placements' faces lie on; and a perspective camera's screen grid, the way
 * a hover pick builds its ray.
 *
 * @param {object} mesh
 * @return {Array<object>} THREE.Raycaster list
 */
function raysAt(mesh) {
  const rand = lcg(11)
  const extent = GRID * STEP
  const toWorld = (v) => v.applyMatrix4(mesh.matrixWorld)
  const rays = []
  for (let i = 0; i < RANDOM_RAYS; i++) {
    const target = toWorld(new Vector3(rand() * extent, rand() * extent, rand() * extent))
    const from = toWorld(new Vector3(
      (rand() * 3 * extent) - extent, (rand() * 3 * extent) - extent, (rand() * 3 * extent) - extent))
    rays.push(new Raycaster(from, target.sub(from).normalize()))
  }
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
  const worldDir = (d) => d.clone().transformDirection(mesh.matrixWorld)
  for (let a = 0; a < 3; a++) {
    const [u, v] = [axes[(a + 1) % 3], axes[(a + 2) % 3]]
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        // Through cell centres, and through the exact plane of a lattice
        // point (where an unrotated plate lies, and the faces of the boxes
        // that start there).
        for (const offset of [0.5, 0, 0.25]) {
          const origin = axes[a].clone().multiplyScalar(-STEP)
            .addScaledVector(u, (i + offset) * STEP)
            .addScaledVector(v, (j + offset) * STEP)
          rays.push(new Raycaster(toWorld(origin), worldDir(axes[a])))
        }
      }
    }
  }
  const camera = new PerspectiveCamera(50, 1.5, 0.1, 1e6)
  camera.position.copy(toWorld(new Vector3(-extent, -0.7 * extent, 1.6 * extent)))
  camera.up.set(0, 0, 1)
  camera.lookAt(toWorld(new Vector3(extent / 2, extent / 2, extent / 2)))
  camera.updateMatrixWorld(true)
  for (let i = 0; i < SCREEN_RAYS; i++) {
    for (let j = 0; j < SCREEN_RAYS; j++) {
      const r = new Raycaster()
      r.setFromCamera(new Vector2(((i + 0.5) / SCREEN_RAYS * 2) - 1, ((j + 0.5) / SCREEN_RAYS * 2) - 1), camera)
      rays.push(r)
    }
  }
  return rays
}


/**
 * Every hit of one ray, nearest first, as `intersectObject` (and so
 * `castRayIfc`) returns them.
 *
 * @param {object} mesh
 * @param {object} raycaster
 * @return {Array<object>} `{batchId, faceIndex, distance, point}`
 */
function hitsOf(mesh, raycaster) {
  return raycaster.intersectObject(mesh, false).map((h) => ({
    batchId: h.batchId, faceIndex: h.faceIndex, distance: h.distance, point: h.point,
  }))
}


/**
 * Assert that two batches built and edited alike — one picking through its
 * instance tree, the other walking every instance as the code did before it
 * — return the same hits, in the same order, for every ray.
 *
 * @param {object} accelerated
 * @param {object} reference
 * @param {Array<object>} rays
 * @return {{hits: number, ties: number}} how many rays hit anything, and how
 *   many had a tie for nearest, so a caller can prove the rays exercised it
 */
function expectSamePicks(accelerated, reference, rays) {
  // Mismatches are collected and asserted once: an expect per hit is
  // hundreds of thousands of expects, and minutes of a suite.
  const mismatches = []
  let hits = 0
  let ties = 0
  for (const [n, ray] of rays.entries()) {
    const got = hitsOf(accelerated, ray)
    const want = hitsOf(reference, ray)
    if (got.length !== want.length) {
      mismatches.push(`ray ${n}: ${got.length} hits, want ${want.length}`)
      continue
    }
    for (let i = 0; i < want.length; i++) {
      const [g, w] = [got[i], want[i]]
      if (g.batchId !== w.batchId || g.faceIndex !== w.faceIndex ||
          !(Math.abs(g.distance - w.distance) < POINT_TOLERANCE) ||
          !(g.point.distanceTo(w.point) < POINT_TOLERANCE)) {
        mismatches.push(`ray ${n}, hit ${i}: batchId ${g.batchId} face ${g.faceIndex} at ${g.distance}, ` +
          `want batchId ${w.batchId} face ${w.faceIndex} at ${w.distance}`)
      }
    }
    if (want.length > 0) {
      hits++
    }
    if (want.length > 1 && want[0].distance === want[1].distance && want[0].batchId !== want[1].batchId) {
      ties++
    }
  }
  expect(mismatches.slice(0, 10)).toEqual([])
  return {hits, ties}
}


/**
 * @param {object} mesh
 * @return {object} the same mesh, its deferred trees all built
 */
function built(mesh) {
  finishBatchedBoundsTrees(mesh)
  return mesh
}


/**
 * @param {object} mesh
 * @return {object} the same mesh with no instance tree: every pick walks
 *   every instance, which is what picking did before the tree existed
 */
function walking(mesh) {
  finishBatchedBoundsTrees(mesh)
  disposeInstanceBoundsTree(mesh)
  return mesh
}


/**
 * @param {object} mesh
 * @param {number} batchId
 * @return {object} the instance's row, for a paste of it
 */
function rowOf(mesh, batchId) {
  return {
    parent: mesh.instanceParents[batchId],
    occurrenceId: mintOccurrenceId(mesh),
    geometryId: mesh.instanceGeometryIds?.[batchId] ?? mintGeometryId(mesh),
    color: {x: 1, y: 0, z: 1, w: 1},
  }
}


describe('viewer/ifc/batchedInstanceBvh', () => {
  it('picks exactly as the full walk does, once built', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const accelerated = built(latticeBatch())
      const reference = walking(latticeBatch())
      expect(hasInstanceBoundsTree(accelerated)).toBe(true)
      expect(hasInstanceBoundsTree(reference)).toBe(false)
      const rays = raysAt(accelerated)
      const {hits, ties} = expectSamePicks(accelerated, reference, rays)
      // The rays did reach the cases the comparison is about.
      expect(hits).toBeGreaterThan(rays.length / 3)
      expect(ties).toBeGreaterThan(10)
    })
  })

  it('names far fewer candidates than the batch has instances', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const mesh = built(latticeBatch())
      const instances = mesh._instanceInfo.length
      const rays = raysAt(mesh)
      let total = 0
      let unordered = 0
      let missing = 0
      for (const ray of rays) {
        const ids = instanceCandidates(mesh, ray.ray)
        if (ids === null) {
          missing++
          continue
        }
        // Ascending, no repeats: the order the full walk pushes hits in.
        if (!ids.every((id, i) => i === 0 || id > ids[i - 1])) {
          unordered++
        }
        total += ids.length
      }
      expect(missing).toBe(0)
      expect(unordered).toBe(0)
      expect(total / rays.length).toBeLessThan(instances / 10)
    })
  })

  it('picks exactly as the full walk does at every slice of the build', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const accelerated = latticeBatch()
      const reference = walking(latticeBatch())
      // Rebuild under a manual scheduler with no idle time, a slice at a time.
      const queue = []
      scheduleBatchedBoundsTrees([accelerated], {schedule: (run) => queue.push(run)})
      const rays = raysAt(accelerated).filter((_, i) => i % 9 === 0)
      let slices = 0
      let sawPartial = false
      while (queue.length > 0) {
        expectSamePicks(accelerated, reference, rays)
        sawPartial = sawPartial || !hasInstanceBoundsTree(accelerated)
        queue.shift()({timeRemaining: () => 0})
        slices++
      }
      expect(sawPartial).toBe(true)
      expect(slices).toBeGreaterThan(2)
      expect(hasInstanceBoundsTree(accelerated)).toBe(true)
      expectSamePicks(accelerated, reference, rays)
    })
  })

  it('picks exactly as the full walk does after hide, delete, add, move and reshape', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const accelerated = built(latticeBatch())
      const reference = walking(latticeBatch())
      // A third of the rays, each kind still represented: the reference walk
      // is the slow side, and this compares after each of six edits.
      const rays = raysAt(accelerated).filter((_, i) => i % 3 === 0)
      const far = new Matrix4().makeTranslation(GRID * STEP * 0.5, GRID * STEP * 0.5, -2 * STEP)
      const extraShape = new BufferGeometry()
      extraShape.setAttribute('position', new BufferAttribute(new Float32Array(
        [0, 0, 0, 4, 0, 0, 0, 4, 0]), 3))
      extraShape.setAttribute('normal', new BufferAttribute(new Float32Array(9), 3))
      extraShape.setIndex([0, 1, 2])
      const sequence = [
        // Hidden: a view op, not an edit; the raycast checks it per pick.
        (mesh) => {
          for (let id = 0; id < 40; id += 3) {
            mesh.setVisibleAt(id, false)
          }
        },
        (mesh) => {
          for (let id = 1; id < 60; id += 5) {
            deleteBatchedInstance(mesh, id)
          }
        },
        // A paste: the first takes a deleted id back (three reuses the
        // lowest), put somewhere no box of the tree covers.
        (mesh) => {
          addBatchedInstance(mesh, mesh._instanceInfo[2].geometryIndex, rowOf(mesh, 2), far)
          addBatchedInstance(mesh, mesh._instanceInfo[3].geometryIndex, rowOf(mesh, 3),
            new Matrix4().makeTranslation(-STEP, -STEP, -STEP))
        },
        // Moved off its box, to where a ray meets nothing else.
        (mesh) => setBatchedInstanceMatrix(mesh, 100,
          new Matrix4().makeTranslation(GRID * STEP * 0.25, GRID * STEP * 1.5, GRID * STEP * 0.5)),
        // Reshaped into something larger than its box.
        (mesh) => setBatchedInstanceGeometry(mesh, 200,
          mesh._instanceInfo[201].geometryIndex, mesh.instanceGeometryIds?.[201] ?? 0),
        // A new shape, placed by a fresh instance.
        (mesh) => {
          const geometryId = addBatchedGeometry(mesh, extraShape.clone())
          addBatchedInstance(mesh, geometryId, {...rowOf(mesh, 5), geometryId: mintGeometryId(mesh)},
            new Matrix4().makeTranslation(GRID * STEP * 0.5, -STEP, GRID * STEP * 0.5))
        },
      ]
      for (const edit of sequence) {
        edit(accelerated)
        edit(reference)
        expect(hasInstanceBoundsTree(accelerated)).toBe(true)
        expectSamePicks(accelerated, reference, rays)
      }
      // The aimed rays do hit what was moved and added outside the boxes.
      const movedAt = new Vector3((GRID * STEP * 0.25) + 0.1, (GRID * STEP * 1.5) + 0.1, -STEP)
        .applyMatrix4(accelerated.matrixWorld)
      const up = new Vector3(0, 0, 1).transformDirection(accelerated.matrixWorld)
      expect(hitsOf(accelerated, new Raycaster(movedAt, up))[0]?.batchId).toBe(100)
    })
  })

  it('walks an id issued past the tree without an edit event', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      // Nothing after load may do this (batchedEditGuard.test.js), but the
      // tree is not the place to find out: an id it was not built over is
      // walked on every ray rather than missed.
      const mesh = built(latticeBatch())
      const span = mesh._instanceInfo.length
      mesh.setInstanceCount(mesh.maxInstanceCount + 8)
      const id = mesh.addInstance(mesh._instanceInfo[0].geometryIndex)
      expect(id).toBe(span)
      mesh.setMatrixAt(id, new Matrix4().makeTranslation(-4 * STEP, -4 * STEP, -4 * STEP))
      const origin = new Vector3((-4 * STEP) + 0.5, (-4 * STEP) + 0.5, -10 * STEP).applyMatrix4(mesh.matrixWorld)
      const up = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
      expect(hasInstanceBoundsTree(mesh)).toBe(true)
      expect(hitsOf(mesh, new Raycaster(origin, up))[0]?.batchId).toBe(id)
    })
  })

  it('stands aside once edits have put too much of the batch on its walk list', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const mesh = built(latticeBatch())
      const ray = raysAt(mesh)[0].ray
      expect(instanceCandidates(mesh, ray)).not.toBeNull()
      const limit = Math.max(64, Math.ceil(mesh._instanceInfo.length * 0.25))
      for (let i = 0; i < limit; i++) {
        setBatchedInstanceMatrix(mesh, i, mesh.getMatrixAt(i, new Matrix4()))
      }
      expect(hasInstanceBoundsTree(mesh)).toBe(true)
      setBatchedInstanceMatrix(mesh, limit, mesh.getMatrixAt(limit, new Matrix4()))
      expect(hasInstanceBoundsTree(mesh)).toBe(false)
      expect(instanceCandidates(mesh, ray)).toBeNull()
    })
  })

  it('a build begun again replaces the tree, and its edits are tracked', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const mesh = built(latticeBatch())
      const builder = beginInstanceBoundsTree(mesh)
      expect(hasInstanceBoundsTree(mesh)).toBe(false)
      while (!builder.step(() => true)) {
        // a step at a time, as an idle slice with no time left runs it
      }
      expect(hasInstanceBoundsTree(mesh)).toBe(true)
      builder.cancel()
      expect(hasInstanceBoundsTree(mesh)).toBe(false)
    })
  })

  it('is not built under the disableInstanceBvh kill switch', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      window.history.pushState({}, '', '/?feature=disableInstanceBvh')
      try {
        const mesh = built(latticeBatch())
        expect(mesh.boundsTrees.every(Boolean)).toBe(true)
        expect(hasInstanceBoundsTree(mesh)).toBe(false)
      } finally {
        window.history.pushState({}, '', '/')
      }
    })
  })

  it('is dropped with the per-geometry trees', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const mesh = built(latticeBatch())
      expect(hasInstanceBoundsTree(mesh)).toBe(true)
      disposeDeferredBatchedBoundsTree.call(mesh)
      expect(hasInstanceBoundsTree(mesh)).toBe(false)
    })
  })
})

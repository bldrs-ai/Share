import {captureException} from '@sentry/react'
import {Box3} from 'three'
import {computeBatchedBoundsTree, disposeBatchedBoundsTree} from 'three-mesh-bvh'
import {isFeatureEnabled} from '../../FeatureFlags'
import debug from '../../utils/debug'
import {loadReportToken, reportBvhDepthCap} from '../../loader/loadProgress'
import {beginInstanceBoundsTree, disposeInstanceBoundsTree} from './batchedInstanceBvh'
import {BVH_MAX_DEPTH, depthCapExtremes} from './bvhBuild'


/**
 * Per-geometry BVHs for a batched model, built after the model is on screen
 * instead of before it (Share#2101).
 *
 * `decorateBatchMeshes` used to build every tree synchronously before it
 * returned. On PSB's GLB cache hit that was 2.73 s of the 4.05 s "Applying
 * model fixups" stage, and nothing on screen needed it: the trees only speed
 * up picking. So the model is shown first, and the trees are built in idle
 * time afterwards, one geometry id at a time.
 *
 * Picking stays correct while the build runs. `boundsTrees` is armed as an
 * array of nulls at once, and three-mesh-bvh's batched raycast walks each
 * instance and, for a geometry whose slot is still null, tests that
 * geometry's triangles directly over its draw range
 * (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:110-136). A
 * pick during the build is slower on the geometries the ray reaches, never
 * wrong. (The fallback reads the batch geometry's `boundingBox`, which no
 * tree has set yet; `batchedRaycast.js` makes sure there is one.)
 *
 * The trees are built INDIRECT, which the synchronous build was not. A
 * direct build sorts the batch's index in place, a range at a time. Before,
 * that happened before anything else could read the index. Deferred, it
 * would happen between the slices of anything reading the index across
 * yields, and `snapshotBatchedModel` (the GLB writer's copy) does exactly
 * that, in chunks, on the promise that `batchedEdit.js` is the only thing
 * that changes a loaded batch (design/new/model-edit.md, L0) — a sort is not
 * an edit it can see. A torn copy would write an artifact with triangles
 * missing or doubled. Indirect mode leaves the index alone and keeps its own
 * order in a Uint32 buffer per tree: 4 bytes per triangle. On PSB the model
 * retains 848 MB after a forced GC against 805 MB before, the price of the
 * index never changing under a reader. Picks resolve the same.
 *
 * Each batch's instance tree (`batchedInstanceBvh.js`) is built first, in the
 * same slices: it is milliseconds where the per-geometry trees are seconds,
 * and it is what takes a hover pick from walking every instance to visiting
 * the few the ray reaches.
 *
 * The depth-cap Health line still reaches the load report: the job adds up
 * its trees' caps and reports once when it finishes, which is usually after
 * the load has ended (`reportBvhDepthCap` handles that case).
 */


/**
 * A slice's budget where there is no idle deadline to go by (no
 * requestIdleCallback: Safari, jsdom). With one, the slice runs until the
 * deadline's time is spent: up to 50 ms when nothing else wants the frame,
 * much less while the camera moves. Either way one tree is never split, so a
 * slice can overrun by the largest single geometry's build.
 */
export const SLICE_MS = 8


/** How long a slice may wait for idle time before running anyway. */
const IDLE_TIMEOUT_MS = 1000


/** The job building each mesh's trees, so a dispose can stop it. */
const jobs = new WeakMap()


/**
 * Arm `boundsTrees` on each mesh now and build the trees in idle slices.
 *
 * Meshes are one model's batches (opaque + transparent), built as one job so
 * the model gets one depth-cap report. Safe to call on meshes without the
 * three-mesh-bvh patches (the Jest harness): those are skipped, as the old
 * `computeBoundsTree?.()` call skipped them.
 *
 * @param {Array<object>} meshes THREE.BatchedMesh list
 * @param {object} [opts]
 * @param {Function} [opts.schedule] `(run) => void`, calling `run(deadline)`
 *   later with `{timeRemaining(): number}`; defaults to requestIdleCallback,
 *   or a timer where there is none (Safari)
 * @return {object|null} the job, or null when no mesh takes trees
 */
export function scheduleBatchedBoundsTrees(meshes, {schedule = scheduleIdle} = {}) {
  const targets = meshes.filter(takesBoundsTrees)
  if (targets.length === 0) {
    return null
  }
  for (const mesh of targets) {
    jobs.get(mesh)?.cancel()
    armBoundsTrees(mesh)
  }
  const job = makeJob(targets, schedule)
  for (const mesh of targets) {
    jobs.set(mesh, job)
  }
  job.next()
  return job
}


/**
 * Build whatever trees `mesh`'s job has left, now. For tests, and for any
 * caller that needs every tree before it goes on.
 *
 * @param {object} mesh THREE.BatchedMesh
 */
export function finishBatchedBoundsTrees(mesh) {
  jobs.get(mesh)?.finish()
}


/**
 * Stop `mesh`'s job, if it has one. Called from the patched
 * `disposeBoundsTree` (ShareIfc.js), so a model torn down mid-build stops
 * building trees for a scene that is gone.
 *
 * @param {object} mesh THREE.BatchedMesh
 */
export function cancelBatchedBoundsTrees(mesh) {
  jobs.get(mesh)?.cancel()
}


/**
 * `BatchedMesh.prototype.disposeBoundsTree`, as ShareIfc installs it:
 * three-mesh-bvh's, after stopping the mesh's deferred build when every tree
 * goes (index -1), which would otherwise go on filling the slots the dispose
 * just emptied.
 *
 * Installed as a prototype method, so `this` is the BatchedMesh.
 *
 * @this {object}
 * @param {number} [index] geometry id, or -1 for every geometry
 */
export function disposeDeferredBatchedBoundsTree(index = -1) {
  // One tree disposed leaves the rest of the build to carry on.
  if (index < 0) {
    cancelBatchedBoundsTrees(this)
    disposeInstanceBoundsTree(this)
  }
  disposeBatchedBoundsTree.call(this, index)
}


/**
 * @param {object} mesh THREE.BatchedMesh
 * @return {boolean} whether its trees are all built (or it has no job)
 */
export function isBatchedBoundsTreeBuildDone(mesh) {
  const job = jobs.get(mesh)
  return !job || job.done
}


/**
 * @param {object} mesh
 * @return {boolean}
 */
function takesBoundsTrees(mesh) {
  return Boolean(mesh?.isBatchedMesh) && typeof mesh.computeBoundsTree === 'function'
}


/**
 * One null slot per geometry id, so the raycast takes the per-geometry
 * fallback (see module doc) rather than three's whole-batch one, and
 * batchedEdit's "build the new id's tree" check sees an armed batch.
 *
 * @param {object} mesh THREE.BatchedMesh
 */
function armBoundsTrees(mesh) {
  const count = mesh._geometryCount ?? 0
  if (!Array.isArray(mesh.boundsTrees)) {
    mesh.boundsTrees = new Array(count).fill(null)
  }
  while (mesh.boundsTrees.length < count) {
    mesh.boundsTrees.push(null)
  }
  // The fallback writes each geometry's box into this and throws if it is
  // null; until now the first tree's build set it. See batchedRaycast.js
  // #ensureFallbackBoundingBox, which covers a geometry swapped in later.
  if (mesh.geometry && mesh.geometry.boundingBox === null) {
    mesh.geometry.boundingBox = new Box3()
  }
}


/**
 * @param {Array<object>} meshes
 * @param {Function} schedule
 * @return {object} the job
 */
function makeJob(meshes, schedule) {
  const token = loadReportToken()
  let meshIndex = 0
  let geometryId = 0
  let trees = 0
  let maxLeafTriangles = 0
  let cancelled = false
  let pending = false
  let failures = 0
  // Begun now, not at the first slice, so each tree's edit listener is
  // registered before anything can edit the batch. `disableInstanceBvh` is
  // the kill switch (FeatureFlags.js): no tree, and every pick walks.
  const instanceTrees = isFeatureEnabled('disableInstanceBvh') ? [] :
    meshes.map((mesh) => beginInstanceBoundsTree(mesh))
  let instanceTreeIndex = 0
  let instanceTreeFailed = false

  const job = {
    done: false,
    next() {
      if (job.done || cancelled || pending) {
        return
      }
      pending = true
      schedule((deadline) => {
        pending = false
        runSlice(deadline)
      })
    },
    finish() {
      runSlice(null)
    },
    cancel() {
      cancelled = true
      job.done = true
      // An instance tree still building goes; a finished one stays, being
      // correct whatever becomes of this job. So disposing one batch's trees
      // (`disposeDeferredBatchedBoundsTree`, which drops that batch's own
      // instance tree itself) doesn't take its siblings' hover speed with it.
      for (const tree of instanceTrees) {
        tree.cancel()
      }
      for (const mesh of meshes) {
        if (jobs.get(mesh) === job) {
          jobs.delete(mesh)
        }
      }
    },
  }

  /**
   * Build trees until the slice's time is spent (`deadline` null: until
   * done), then schedule the next slice or report.
   *
   * @param {object|null} deadline
   */
  function runSlice(deadline) {
    if (cancelled || job.done) {
      return
    }
    const start = now()
    const spent = () => deadline !== null && isSpent(deadline, start)
    while (instanceTreeIndex < instanceTrees.length) {
      if (stepInstanceTree(instanceTreeIndex, spent)) {
        instanceTreeIndex++
      } else {
        job.next()
        return
      }
    }
    while (hasMore()) {
      buildOne(meshes[meshIndex], geometryId++)
      if (deadline && isSpent(deadline, start) && hasMore()) {
        job.next()
        return
      }
    }
    job.done = true
    for (const mesh of meshes) {
      if (jobs.get(mesh) === job) {
        jobs.delete(mesh)
      }
    }
    if (trees > 0) {
      reportBvhDepthCap({trees, maxLeafTriangles, maxDepth: BVH_MAX_DEPTH}, token)
    }
  }

  /**
   * One step of mesh `index`'s instance tree.
   *
   * A build that throws drops that tree and carries on: its batch's picks
   * walk every instance, as they did before the tree, and the per-geometry
   * trees after it still get built (an exception escaping the slice would
   * stop them too). Like a failed tree below, it is ours to fix and nothing
   * the user sees, so it goes to Sentry once per model, as a warning, with
   * its size and no names.
   *
   * @param {number} index
   * @param {Function} spent
   * @return {boolean} whether this mesh's instance tree is finished with
   */
  function stepInstanceTree(index, spent) {
    try {
      return instanceTrees[index].step(spent)
    } catch (e) {
      instanceTrees[index].cancel()
      debug().log('deferredBatchedBvh: instance tree build failed:', e)
      if (!instanceTreeFailed) {
        instanceTreeFailed = true
        captureException(e, {
          level: 'warning',
          fingerprint: ['instance-bvh-build-failed'],
          tags: {bvh_build: 'instance'},
          extra: {instanceCount: meshes[index]._instanceInfo?.length ?? null},
        })
      }
      return true
    }
  }

  /**
   * Step past finished meshes to the next geometry id there is to build.
   * The count is read each time: an edit can add ids between slices
   * (batchedEdit builds an added id's tree itself).
   *
   * @return {boolean} whether one is left
   */
  function hasMore() {
    while (meshIndex < meshes.length && geometryId >= (meshes[meshIndex]._geometryCount ?? 0)) {
      meshIndex++
      geometryId = 0
    }
    return meshIndex < meshes.length
  }

  /**
   * @param {object} mesh
   * @param {number} id
   */
  function buildOne(mesh, id) {
    const info = mesh._geometryInfo?.[id]
    if (!Array.isArray(mesh.boundsTrees) || mesh.boundsTrees[id] || info?.active === false) {
      return
    }
    try {
      const tree = computeBatchedBoundsTree.call(mesh, id, {
        verbose: false, maxDepth: BVH_MAX_DEPTH, indirect: true,
      })
      const capped = depthCapExtremes([tree], BVH_MAX_DEPTH)
      if (capped) {
        trees += capped.trees
        maxLeafTriangles = Math.max(maxLeafTriangles, capped.maxLeafTriangles)
      }
    } catch (e) {
      // The slot stays null, so this geometry is picked by the per-triangle
      // fallback: slower, still correct, and nothing for the user to do. It
      // is ours to fix, though. Built synchronously, this throw failed the
      // load and CadView reported it; deferred, nothing would. So the first
      // failure of each model goes to Sentry as a warning (the rest would be
      // the same bug again), with its size and no names.
      failures++
      debug().log('deferredBatchedBvh: tree build failed for one geometry:', e)
      if (failures === 1) {
        captureException(e, {
          level: 'warning',
          fingerprint: ['deferred-bvh-build-failed'],
          tags: {bvh_build: 'deferred'},
          extra: {geometryId: id, indexCount: info?.count ?? null},
        })
      }
    }
  }

  return job
}


/**
 * Whether a slice has used its time. Normally the idle deadline's. A
 * callback that ran because its `timeout` passed, the page never having gone
 * idle (the user orbiting the whole time), has no idle time left
 * (`timeRemaining()` is 0) yet must still make progress, or a model with
 * thousands of geometries builds one tree a second: it gets `SLICE_MS`.
 *
 * @param {object} deadline `{timeRemaining(): number, didTimeout?: boolean}`
 * @param {number} start `now()` when the slice began
 * @return {boolean}
 */
function isSpent(deadline, start) {
  if (deadline.didTimeout) {
    return now() - start >= SLICE_MS
  }
  return deadline.timeRemaining() <= 0
}


/** @return {number} ms */
function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}


/**
 * requestIdleCallback where there is one. Elsewhere (Safari, jsdom) a short
 * timer, with a `SLICE_MS` budget standing in for the idle deadline, so a
 * frame still fits between slices.
 *
 * @param {Function} run `(deadline) => void`
 */
function scheduleIdle(run) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, {timeout: IDLE_TIMEOUT_MS})
    return
  }
  const FRAME_MS = 16
  setTimeout(() => {
    const begun = now()
    run({timeRemaining: () => SLICE_MS - (now() - begun)})
  }, FRAME_MS)
}

/* eslint-disable no-magic-numbers */
import {Color, Matrix4, Raycaster, Vector3, Vector4} from 'three'
import {acceleratedRaycast} from 'three-mesh-bvh'
import {
  ColorMode,
  activeColorMode,
  hasAutoColor,
  setColorMode,
} from '../display/colorMode'
import {ResidencyController} from '../residency/ResidencyController'
import {
  applyBatchedInstanceSelection,
  applyBatchedPreselection,
  applyBatchedSelection,
  clearBatchedPreselection,
  clearBatchedSelection,
  repaintBatchedColors,
} from './batchedHighlight'
import {
  addBatchedInstance,
  clearRow,
  deleteBatchedInstance,
  ensureInstanceCapacity,
  forEachActiveInstance,
  hasInactiveInstances,
  instanceIdSpan,
  isActive,
  tablesRevision,
  writeRow,
} from './batchedInstanceTables'
import {
  BLUE,
  GREEN,
  GREY,
  RED,
  SPACING,
  decoratedStepBatch,
  withBvhPrototypes,
} from './batchedModel.fixture'
import {raycastActiveInstances} from './batchedRaycast'
import {buildBatchedSubsetMesh} from './batchedSubset'
import {batchedModelOccurrenceTables} from './batchedToMergedMesh'
import {exportBatchedModelAsInstancedGlb} from '../../loader/glbBatchedExport'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


const PURPLE = {x: 0.5, y: 0, z: 0.5, w: 1}


/**
 * @param {object} mesh BatchedMesh
 * @return {Array<number>} the live batch ids, ascending
 */
function liveIds(mesh) {
  const ids = []
  forEachActiveInstance(mesh, (batchId) => {
    ids.push(batchId)
  })
  return ids
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} batchId
 * @return {Array<number>} the RGBA three is drawing the instance with
 */
function drawnColor(mesh, batchId) {
  return mesh.getColorAt(batchId, new Vector4()).toArray()
}


/**
 * Cast straight down onto placement `k` of the fixture.
 *
 * @param {object} mesh BatchedMesh
 * @param {number} k placement index (x = k * SPACING)
 * @return {Array<number>} batch ids hit, nearest first
 */
function castOnto(mesh, k) {
  mesh.updateMatrixWorld(true)
  const raycaster = new Raycaster(new Vector3((k * SPACING) + 0.2, 0.2, 5), new Vector3(0, 0, -1))
  const hits = []
  mesh.raycast(raycaster, hits)
  return hits.sort((a, b) => a.distance - b.distance).map((hit) => hit.batchId)
}


describe('viewer/ifc/batchedInstanceTables', () => {
  describe('the owner', () => {
    it('reports the live ids, and only those, after a delete', () => {
      const mesh = decoratedStepBatch()
      expect(hasInactiveInstances(mesh)).toBe(false)
      expect(liveIds(mesh)).toEqual([0, 1, 2, 3])

      deleteBatchedInstance(mesh, 2)

      expect(hasInactiveInstances(mesh)).toBe(true)
      expect(isActive(mesh, 2)).toBe(false)
      expect(isActive(mesh, 3)).toBe(true)
      expect(isActive(mesh, 4)).toBe(false)
      expect(liveIds(mesh)).toEqual([0, 1, 3])
    })

    it('retires a deleted row: columns emptied, path unindexed, revision bumped', () => {
      const mesh = decoratedStepBatch()
      expect(mesh.occurrencePathToBatchIds.get('20')).toEqual([2])
      const before = tablesRevision(mesh)

      deleteBatchedInstance(mesh, 2)

      expect(mesh.instanceParents[2]).toBe(0)
      expect(mesh.instanceOccurrencePaths[2]).toBeNull()
      expect(mesh.instanceColors[2]).toBeNull()
      expect(mesh.instanceSourceColors[2]).toBeNull()
      // The NavTree→scene join must not resolve the deleted occurrence.
      expect(mesh.occurrencePathToBatchIds.has('20')).toBe(false)
      expect(mesh.occurrencePathToBatchIds.get('10/11')).toEqual([0])
      expect(tablesRevision(mesh)).toBe(before + 1)
    })

    it('gives a paste into a recycled id a clean row, none of the deleted one\'s', () => {
      const mesh = decoratedStepBatch()
      deleteBatchedInstance(mesh, 2)

      const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
        parent: 400, occurrenceId: 9, geometryId: 777, occurrencePath: [40], color: PURPLE,
      }, new Matrix4().makeTranslation(50, 0, 0))

      // three hands back the lowest freed id (BatchedMesh.js:580-591)...
      expect(batchId).toBe(2)
      // ...and every column is the new instance's.
      expect(mesh.instanceParents[2]).toBe(400)
      expect(mesh.instanceOccurrenceIds[2]).toBe(9)
      expect(mesh.instanceGeometryIds[2]).toBe(777)
      expect(mesh.instanceOccurrencePaths[2]).toEqual([40])
      expect(mesh.instanceColors[2]).toEqual(PURPLE)
      expect(mesh.instanceSourceColors[2]).toEqual(PURPLE)
      expect(mesh.occurrencePathToBatchIds.get('40')).toEqual([2])
      expect(mesh.occurrencePathToBatchIds.has('20')).toBe(false)
      // Drawn as described from the first frame, not three's default white.
      expect(drawnColor(mesh, 2)).toEqual([0.5, 0, 0.5, 1])
      expect(mesh.getMatrixAt(2, new Matrix4()).elements[12]).toBe(50)
      // The colors are the instance's own objects: a later write to the live
      // table must not reach through to the source snapshot.
      expect(mesh.instanceColors[2]).not.toBe(mesh.instanceSourceColors[2])
      expect(liveIds(mesh)).toEqual([0, 1, 2, 3])
    })

    it('grows the tables for a paste past the load-time instance count', () => {
      const mesh = decoratedStepBatch()
      // The builder sized both three and the tables exactly.
      expect(mesh.maxInstanceCount).toBe(4)
      expect(mesh.instanceParents).toHaveLength(4)

      const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
        parent: 400, occurrenceId: 9, geometryId: 999, occurrencePath: [40], color: PURPLE,
      }, new Matrix4().makeTranslation(50, 0, 0))

      expect(batchId).toBe(4)
      expect(mesh.maxInstanceCount).toBeGreaterThan(4)
      // A write at [4] into the load-time Uint32Array(4) would have been
      // dropped silently and read back as undefined.
      expect(mesh.instanceParents[4]).toBe(400)
      expect(mesh.instanceOccurrenceIds[4]).toBe(9)
      expect(mesh.instanceOccurrencePaths[4]).toEqual([40])
      // Existing rows survived the reallocation.
      expect(Array.from(mesh.instanceParents.subarray(0, 4))).toEqual([100, 100, 200, 300])
      // Spare rows the geometric growth added are not instances.
      expect(instanceIdSpan(mesh)).toBe(5)
      expect(liveIds(mesh)).toEqual([0, 1, 2, 3, 4])
    })

    it('refuses a row past the tables instead of losing it', () => {
      const mesh = decoratedStepBatch()
      expect(() => writeRow(mesh, 4, {parent: 1, color: RED})).toThrow(RangeError)
      ensureInstanceCapacity(mesh, 5)
      writeRow(mesh, 4, {parent: 1, color: RED})
      expect(mesh.instanceParents[4]).toBe(1)
    })

    it('leaves absent tables absent when it grows the others', () => {
      const mesh = decoratedStepBatch()
      mesh.instanceOccurrencePaths = null
      mesh.instanceGeometryIds = null
      ensureInstanceCapacity(mesh, 10)
      expect(mesh.instanceOccurrencePaths).toBeNull()
      expect(mesh.instanceGeometryIds).toBeNull()
      expect(mesh.instanceParents.length).toBeGreaterThanOrEqual(10)
      expect(mesh.instanceColors.length).toBeGreaterThanOrEqual(10)
      clearRow(mesh, 9)
      expect(mesh.instanceColors[9]).toBeNull()
    })
  })

  // #1915 §Test: delete an instance, then run each consumer. Each must not
  // throw, and the deleted instance must be skipped.
  describe('consumers after a delete', () => {
    it('highlight: selects, narrows, clears and repaints around the deleted instance', () => {
      const mesh = decoratedStepBatch()
      applyBatchedSelection(mesh, [100, 200])
      // Instance 2 (product 200) is in the selection layer when it goes.
      deleteBatchedInstance(mesh, 2)

      expect(() => clearBatchedSelection(mesh)).not.toThrow()
      expect(() => applyBatchedSelection(mesh, [200, 300])).not.toThrow()
      expect(drawnColor(mesh, 3)).not.toEqual([0, 0, 1, 1])
      expect(() => applyBatchedInstanceSelection(mesh, [2, 0])).not.toThrow()
      // Narrowed to occurrence 0; 3 is back to its own blue.
      expect(drawnColor(mesh, 3)).toEqual([0, 0, 1, 1])
      expect(() => repaintBatchedColors(mesh)).not.toThrow()
      expect(drawnColor(mesh, 1)).toEqual([1, 0, 0, 1])
    })

    it('highlight: a paste is selectable by its product the moment it lands', () => {
      const mesh = decoratedStepBatch()
      // Build the parent index BEFORE the paste — the cache that has to notice.
      applyBatchedSelection(mesh, [100])
      clearBatchedSelection(mesh)
      const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
        parent: 400, occurrenceId: 9, color: PURPLE,
      }, new Matrix4().makeTranslation(50, 0, 0))

      applyBatchedSelection(mesh, [400], {r: 0, g: 1, b: 1})

      expect(drawnColor(mesh, batchId)).toEqual([0, 1, 1, 1])
    })

    // The layer sets hold batch ids. After a delete + paste the same id can be
    // a different instance (three recycles the lowest freed id,
    // BatchedMesh.js:580-591), so membership has to be re-derived from what the
    // caller selected — not carried over by id — before anything repaints.
    describe('highlight: a paste into a highlighted id', () => {
      const CYAN = {r: 0, g: 1, b: 1}
      const PURPLE_RGBA = [0.5, 0, 0.5, 1]

      /**
       * Delete instance 2 (product 200) and paste product 400 into its id.
       *
       * @param {object} mesh decorated batch
       * @return {number} the paste's batch id
       */
      function recyclePlacement2(mesh) {
        deleteBatchedInstance(mesh, 2)
        const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
          parent: 400, occurrenceId: 9, occurrencePath: [40], color: PURPLE,
        }, new Matrix4().makeTranslation(50, 0, 0))
        expect(batchId).toBe(2)
        return batchId
      }

      it('a repaint draws the paste in its own color, not the deleted part\'s selection', () => {
        const mesh = decoratedStepBatch()
        applyBatchedSelection(mesh, [200], CYAN)
        const batchId = recyclePlacement2(mesh)

        repaintBatchedColors(mesh)

        expect(drawnColor(mesh, batchId)).toEqual(PURPLE_RGBA)
      })

      it('clearing a hover on the paste does not reveal the deleted part\'s selection', () => {
        const mesh = decoratedStepBatch()
        applyBatchedSelection(mesh, [200], CYAN)
        const batchId = recyclePlacement2(mesh)

        applyBatchedPreselection(mesh, [400], {r: 1, g: 1, b: 0})
        clearBatchedPreselection(mesh)

        expect(drawnColor(mesh, batchId)).toEqual(PURPLE_RGBA)
      })

      it('an occurrence selection does not follow its id onto the paste', () => {
        const mesh = decoratedStepBatch()
        applyBatchedInstanceSelection(mesh, [2], CYAN)
        const batchId = recyclePlacement2(mesh)

        repaintBatchedColors(mesh)

        expect(drawnColor(mesh, batchId)).toEqual(PURPLE_RGBA)
      })

      it('a selected product keeps its surviving instances lit and gains a pasted one', () => {
        const mesh = decoratedStepBatch()
        applyBatchedSelection(mesh, [100], CYAN)
        deleteBatchedInstance(mesh, 1)
        // Appended (id 4 — the free id 1 is reused first, so fill it with
        // another product before pasting 100 again).
        addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
          parent: 300, occurrenceId: 8, color: BLUE,
        }, new Matrix4().makeTranslation(60, 0, 0))
        const pasted = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
          parent: 100, occurrenceId: 9, color: PURPLE,
        }, new Matrix4().makeTranslation(50, 0, 0))
        expect(pasted).toBe(4)

        repaintBatchedColors(mesh)

        // Selection is "product 100", so it covers 100's live instances now:
        // the survivor at 0 and the paste at 4 — and not the product-300
        // instance that took over id 1.
        expect(drawnColor(mesh, 0)).toEqual([0, 1, 1, 1])
        expect(drawnColor(mesh, 4)).toEqual([0, 1, 1, 1])
        expect(drawnColor(mesh, 1)).toEqual([0, 0, 1, 1])
      })
    })

    it('color mode: toggles and reads the mode around the deleted instance', () => {
      const mesh = decoratedStepBatch({colors: [GREY, GREY, GREY, GREY]})
      // Every placement shares one shape, so key the palette by product
      // (three parts) the way a table-less model does.
      mesh.instanceGeometryIds = null
      setColorMode(mesh, ColorMode.AUTO)
      expect(activeColorMode(mesh)).toBe(ColorMode.AUTO)
      deleteBatchedInstance(mesh, 2)

      expect(hasAutoColor(mesh)).toBe(true)
      expect(() => setColorMode(mesh, ColorMode.SOURCE)).not.toThrow()
      expect(activeColorMode(mesh)).toBe(ColorMode.SOURCE)
      expect(drawnColor(mesh, 3).slice(0, 3).map((c) => +c.toFixed(3))).toEqual([0.8, 0.8, 0.8])
      expect(() => setColorMode(mesh, ColorMode.AUTO)).not.toThrow()
      expect(activeColorMode(mesh)).toBe(ColorMode.AUTO)
      expect(mesh.instanceColors[2]).toBeNull()
    })

    it('residency: precomputes around a deleted instance and never touches it', () => {
      const mesh = decoratedStepBatch()
      deleteBatchedInstance(mesh, 2)

      const residency = new ResidencyController(mesh)

      expect(residency.instanceCount).toBe(3)
      expect(residency.instances.map((i) => i.index)).toEqual([0, 1, 3])
      expect(() => residency.setTarget(0)).not.toThrow()
      expect([0, 1, 3].map((b) => mesh.getVisibleAt(b))).toEqual([false, false, false])
    })

    it('residency: a controller built before the delete does not throw after it', () => {
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      expect(residency.instanceCount).toBe(4)
      deleteBatchedInstance(mesh, 2)

      expect(() => residency.setTarget(0)).not.toThrow()
      expect(() => residency.dispose()).not.toThrow()
      expect([0, 1, 3].map((b) => mesh.getVisibleAt(b))).toEqual([true, true, true])
    })

    // The two residency cases above only prove the controller does not THROW
    // across an edit. These prove it still rules on what the batch now holds:
    // its per-instance records are a snapshot, and a recycled id (three reuses
    // the lowest freed one, BatchedMesh.js:580-591) or an appended one is a
    // different instance from anything in it.
    it('residency: a controller that outlives a delete + paste evicts the instance on the recycled id', () => {
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      // Residency hides everything, the old instance 2 included, and caches
      // that belief per record.
      residency.setTarget(0)
      deleteBatchedInstance(mesh, 2)
      const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
        parent: 400, occurrenceId: 9, occurrencePath: [40], color: PURPLE,
      }, new Matrix4().makeTranslation(50, 0, 0))
      expect(batchId).toBe(2)
      // three issues the recycled id visible (BatchedMesh.js:571-575)...
      expect(mesh.getVisibleAt(2)).toBe(true)

      residency.setTarget(0)

      // ...so a target of zero has to write it, not trust the deleted
      // instance's cached "already hidden".
      expect([0, 1, 2, 3].map((b) => mesh.getVisibleAt(b))).toEqual([false, false, false, false])
      // And the record behind id 2 is the paste's, not the deleted part's
      // (product 200 at x = 20).
      const record = residency.instances.find((entry) => entry.index === 2)
      expect(record.expressID).toBe(400)
      expect(record.center.x).toBeCloseTo(50.5)
      expect(residency.instanceCount).toBe(4)
    })

    it('residency: a controller built before a paste evicts and restores the appended instance', () => {
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      const batchId = addBatchedInstance(mesh, mesh.getGeometryIdAt(0), {
        parent: 400, occurrenceId: 9, occurrencePath: [40], color: PURPLE,
      }, new Matrix4().makeTranslation(50, 0, 0))
      expect(batchId).toBe(4)

      residency.setTarget(0)

      expect([0, 1, 2, 3, 4].map((b) => mesh.getVisibleAt(b)))
        .toEqual([false, false, false, false, false])
      expect(residency.instanceCount).toBe(5)
      residency.setTarget(1)
      expect([0, 1, 2, 3, 4].map((b) => mesh.getVisibleAt(b)))
        .toEqual([true, true, true, true, true])
    })

    it('residency: an unedited batch keeps its records across slider ticks', () => {
      // The revision check is the whole cost of the fix on the unedited path:
      // the records are the construction-time ones, not rebuilt per tick.
      const mesh = decoratedStepBatch()
      const residency = new ResidencyController(mesh)
      const records = residency.instances
      residency.setTarget(0.5)
      residency.setTarget(0)
      expect(residency.instances).toBe(records)
    })

    it('isolation subset: a deleted instance is never baked', () => {
      const mesh = decoratedStepBatch()
      deleteBatchedInstance(mesh, 2)

      expect(buildBatchedSubsetMesh(mesh, new Set([200]))).toBeNull()
      // Cleared rows read parent 0; that id must not pick up the hole.
      expect(buildBatchedSubsetMesh(mesh, new Set([0]))).toBeNull()
      const subset = buildBatchedSubsetMesh(mesh, new Set([100, 300]))
      expect(subset.geometry.getAttribute('position').count).toBe(9)
    })

    it('occurrence tables: a deleted row does not overwrite occurrence 0', () => {
      const mesh = decoratedStepBatch()
      deleteBatchedInstance(mesh, 2)

      const {occurrencePaths, geometryExpressIds} = batchedModelOccurrenceTables(mesh)

      // The cleared row reads as occurrence 0 with no path; visiting it would
      // erase product 100's first placement from the cache-hit tables.
      expect(occurrencePaths[0]).toEqual([10, 11])
      expect(occurrencePaths[2]).toBeNull()
      expect(occurrencePaths[3]).toEqual([30])
      expect(geometryExpressIds[0]).toBe(999)
    })

    it('export: writes the live instances BATCHED instead of failing over to merged', async () => {
      const mesh = decoratedStepBatch()
      deleteBatchedInstance(mesh, 2)

      const written = await exportBatchedModelAsInstancedGlb(mesh)

      // null is the "fall back to the merged writer" answer.
      expect(written).not.toBeNull()
      const parents = written.tableNodes.flatMap((node) => node.parents)
      expect(parents.sort((a, b) => a - b)).toEqual([100, 100, 300])
    })

    it('raycast (BVH path): picks around a deleted instance instead of throwing', () => {
      withBvhPrototypes(raycastActiveInstances, () => {
        const mesh = decoratedStepBatch()
        mesh.computeBoundsTree()
        deleteBatchedInstance(mesh, 2)

        expect(castOnto(mesh, 2)).toEqual([])
        expect(castOnto(mesh, 3)).toEqual([3])
        // The shadow is gone again: three's validator is strict for everyone
        // else.
        expect(Object.prototype.hasOwnProperty.call(mesh, 'getVisibleAt')).toBe(false)
        expect(() => mesh.getVisibleAt(2)).toThrow(/Invalid instanceId/)
      })
    })

    it('raycast (BVH path): the library call alone throws on a deleted instance', () => {
      // The finding behind batchedRaycast.js, pinned so a three-mesh-bvh
      // upgrade that fixes it upstream shows up here as a red test — at which
      // point the wrapper can go.
      withBvhPrototypes(acceleratedRaycast, () => {
        const mesh = decoratedStepBatch()
        mesh.computeBoundsTree()
        deleteBatchedInstance(mesh, 2)
        expect(() => castOnto(mesh, 3)).toThrow(/Invalid instanceId 2/)
      })
    })
  })

  it('reads the fixture colors back the way the consumers above assume', () => {
    // Guards the assertions above against a fixture that silently stopped
    // carrying distinct colors (every "back to blue" check would pass on a
    // model that was blue everywhere).
    const mesh = decoratedStepBatch()
    expect(mesh.getColorAt(0, new Color()).toArray()).toEqual([RED.x, RED.y, RED.z])
    expect(mesh.getColorAt(2, new Color()).toArray()).toEqual([GREEN.x, GREEN.y, GREEN.z])
    expect(mesh.getColorAt(3, new Color()).toArray()).toEqual([BLUE.x, BLUE.y, BLUE.z])
  })
})

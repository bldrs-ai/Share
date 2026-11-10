/* eslint-disable no-magic-numbers */
import {BatchedMesh, BoxGeometry, Group, Matrix4, Vector3} from 'three'
import {addBatchedInstance, deleteBatchedInstance} from '../ifc/batchedEdit'
import {ResidencyController, ResidencyMetric} from './ResidencyController'


/**
 * The camera-motion overlay (B3, design/new/demand-tiled-rendering.md): the
 * at-rest set is what `setTarget` / `setMetric` keep, the overlay keeps a
 * subset of it while the camera moves, and `endMotion` puts back exactly the
 * at-rest set.
 */


/**
 * Boxes along X, each its own shape, in a decorated batch.
 *
 * @param {Array<number>} sizes box edge per instance
 * @return {{group: Group, mesh: BatchedMesh}}
 */
function makeModel(sizes) {
  // Headroom for pastes: one spare instance, one spare geometry's worth.
  const count = sizes.length + 2
  const mesh = new BatchedMesh(count, 24 * count, 36 * count)
  mesh.instanceParents = new Uint32Array(sizes.map((_, i) => 100 + i))
  mesh.instanceOccurrenceIds = new Uint32Array(sizes.map((_, i) => i))
  mesh.instanceGeometryIds = new Uint32Array(sizes.map((_, i) => 900 + i))
  mesh.instanceColors = sizes.map(() => ({x: 1, y: 1, z: 1, w: 1}))
  sizes.forEach((size, i) => {
    const geometryId = mesh.addGeometry(new BoxGeometry(size, size, size))
    const instanceId = mesh.addInstance(geometryId)
    mesh.setMatrixAt(instanceId, new Matrix4().makeTranslation(i * 10, 0, 0))
  })
  const group = new Group()
  group.add(mesh)
  return {group, mesh}
}


/**
 * @param {object} mesh
 * @param {number} count
 * @return {Array<boolean>}
 */
function visibility(mesh, count) {
  return Array.from({length: count}, (_, i) => mesh.getVisibleAt(i))
}


const camera = {position: new Vector3(0, 0, 100)}


describe('ResidencyController motion overlay', () => {
  it('evicts only from the at-rest set and restores exactly it at rest', () => {
    // Bigger boxes score higher under occupancy: order is 3, 2, 1, 0.
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.setTarget(0.5)
    const atRest = visibility(mesh, 4)
    expect(atRest).toEqual([false, false, true, true])

    controller.beginMotion()
    expect(controller.isInMotion).toBe(true)
    // Nothing changes until a fraction is set.
    expect(visibility(mesh, 4)).toEqual(atRest)
    controller.setMotionFraction(0.25)
    expect(visibility(mesh, 4)).toEqual([false, false, false, true])
    // A motion fraction above the at-rest share adds nothing back.
    controller.setMotionFraction(1)
    expect(visibility(mesh, 4)).toEqual(atRest)
    controller.setMotionFraction(0)
    expect(visibility(mesh, 4)).toEqual([false, false, false, false])

    controller.endMotion()
    expect(controller.isInMotion).toBe(false)
    expect(visibility(mesh, 4)).toEqual(atRest)
  })

  it('reports the at-rest set as the most a motion fraction can keep', () => {
    const {group} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    expect(controller.motionCapacity()).toBe(1)
    controller.setTarget(0.5)
    expect(controller.motionCapacity()).toBe(0.5)
  })

  it('bounds the instances one step flips and finishes on later steps', () => {
    const {group, mesh} = makeModel([1, 2, 3, 4, 5, 6])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.beginMotion()
    expect(controller.setMotionFraction(0, {maxFlips: 2})).toBe(false)
    expect(visibility(mesh, 6).filter(Boolean)).toHaveLength(4)
    expect(controller.stepMotion(2)).toBe(false)
    expect(controller.stepMotion(2)).toBe(true)
    expect(visibility(mesh, 6).filter(Boolean)).toHaveLength(0)
    // The restore is never bounded: the still frame is the full set.
    controller.endMotion()
    expect(visibility(mesh, 6).filter(Boolean)).toHaveLength(6)
  })

  it('keeps the motion metric\'s best parts when an ordering was prepared', () => {
    // A selection at instance 1 (x = 10) orders distance 1 first, which is
    // neither the index order (0 first) nor the occupancy order (3 first),
    // so only the prepared distance ordering keeps it.
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const selection = new Vector3(10, 0, 0)
    const controller = new ResidencyController(group, {
      getCamera: () => camera,
      getSelectionCenter: () => selection,
    })
    controller.prepareMotion(ResidencyMetric.DISTANCE)
    controller.beginMotion(ResidencyMetric.DISTANCE)
    controller.setMotionFraction(0.25)
    expect(visibility(mesh, 4)).toEqual([false, true, false, false])
    controller.endMotion()
    expect(visibility(mesh, 4)).toEqual([true, true, true, true])
  })

  it('orders a never-applied controller by its metric once prepared', () => {
    // Target 1 since construction: there is no at-rest order to reuse, and
    // without the prepared one a gesture would drop parts in batch order.
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.prepareMotion(ResidencyMetric.OCCUPANCY)
    controller.beginMotion(ResidencyMetric.OCCUPANCY)
    controller.setMotionFraction(0.25)
    expect(visibility(mesh, 4)).toEqual([false, false, false, true])
    controller.endMotion()
  })

  it('never sorts at a gesture\'s start: an unprepared metric walks the at-rest order', () => {
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const selection = new Vector3(0, 0, 0)
    const controller = new ResidencyController(group, {
      getCamera: () => camera,
      getSelectionCenter: () => selection,
    })
    controller.setTarget(1)
    const sort = jest.spyOn(Array.prototype, 'sort')
    controller.beginMotion(ResidencyMetric.DISTANCE)
    controller.setMotionFraction(0.25)
    expect(sort).not.toHaveBeenCalled()
    sort.mockRestore()
    // The at-rest (occupancy) order: the biggest box survives.
    expect(visibility(mesh, 4)).toEqual([false, false, false, true])
    controller.endMotion()
  })

  it('spends a memory motion budget on a prefix of the cheapest parts', () => {
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.setMetric(ResidencyMetric.MEMORY)
    controller.beginMotion(ResidencyMetric.MEMORY)
    // Equal bytes per box: half the bytes is two boxes.
    controller.setMotionFraction(0.5)
    expect(visibility(mesh, 4).filter(Boolean)).toHaveLength(2)
    expect(controller.motionFraction).toBeCloseTo(0.5)
    controller.endMotion()
    expect(visibility(mesh, 4).filter(Boolean)).toHaveLength(4)
  })

  it('re-applies an at-rest change mid-gesture without showing the full set', () => {
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.prepareMotion(ResidencyMetric.OCCUPANCY)
    controller.beginMotion()
    controller.setMotionFraction(0.25)
    expect(visibility(mesh, 4)).toEqual([false, false, false, true])
    const writes = []
    const native = mesh.setVisibleAt.bind(mesh)
    mesh.setVisibleAt = (index, visible) => {
      writes.push([index, visible])
      return native(index, visible)
    }
    controller.setTarget(0.5)
    // Each instance is written at most once, and no evicted one is shown.
    expect(writes.filter(([, visible]) => visible)).toEqual([])
    expect(visibility(mesh, 4)).toEqual([false, false, false, true])
    controller.endMotion()
    expect(visibility(mesh, 4)).toEqual([false, false, true, true])
  })

  describe('edits during motion', () => {
    const paste = (mesh, x) => addBatchedInstance(mesh, mesh.getGeometryIdAt(0),
      {parent: 777, occurrenceId: 50, geometryId: 900, color: {x: 1, y: 0, z: 0, w: 1}},
      new Matrix4().makeTranslation(x, 0, 0))

    it('evicts a paste made mid-gesture and shows it at rest', () => {
      const {group, mesh} = makeModel([1, 2, 3, 4])
      const controller = new ResidencyController(group, {getCamera: () => camera})
      controller.beginMotion()
      controller.setMotionFraction(0.25)
      const pasted = paste(mesh, 50)
      // The overlay was rebuilt over five records at 25%: one kept.
      expect(controller.instanceCount).toBe(5)
      expect(visibility(mesh, 5).filter(Boolean)).toHaveLength(1)
      expect(controller.isInMotion).toBe(true)
      controller.endMotion()
      expect(visibility(mesh, 5)).toEqual([true, true, true, true, true])
      expect(mesh.getVisibleAt(pasted)).toBe(true)
    })

    it('restores at rest without touching an instance deleted mid-gesture', () => {
      const {group, mesh} = makeModel([1, 2, 3, 4])
      const controller = new ResidencyController(group, {getCamera: () => camera})
      controller.setTarget(0.75)
      controller.beginMotion()
      controller.setMotionFraction(0.25)
      deleteBatchedInstance(mesh, 3)
      // three throws on `setVisibleAt` of a deleted id; the restore must not
      // reach it.
      expect(() => controller.endMotion()).not.toThrow()
      expect(controller.instanceCount).toBe(3)
      // Three left at 75%: round(2.25) = 2 kept, the two biggest still there.
      expect(visibility(mesh, 3)).toEqual([false, true, true])
    })
  })

  it('dispose ends the overlay and shows everything', () => {
    const {group, mesh} = makeModel([1, 2, 3, 4])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.beginMotion()
    controller.setMotionFraction(0)
    controller.dispose()
    expect(controller.isInMotion).toBe(false)
    expect(visibility(mesh, 4)).toEqual([true, true, true, true])
  })
})

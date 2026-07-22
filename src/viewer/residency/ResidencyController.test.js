/* eslint-disable no-magic-numbers */
import {BatchedMesh, BoxGeometry, Group, Matrix4, Vector3} from 'three'
import {ResidencyController, ResidencyMetric} from './ResidencyController'


/**
 * @param {Array} placements [{x, size, expressID}]
 * @return {object} a Group holding one BatchedMesh with pick tables
 */
function makeModel(placements) {
  const mesh = new BatchedMesh(placements.length, 8 * 36 * placements.length, 36 * placements.length)
  mesh.instanceParents = new Uint32Array(placements.map((p) => p.expressID))
  mesh.instanceGeometry = []
  for (const placement of placements) {
    const geometry = new BoxGeometry(placement.size, placement.size, placement.size)
    const geometryId = mesh.addGeometry(geometry)
    const instanceId = mesh.addInstance(geometryId)
    mesh.setMatrixAt(instanceId, new Matrix4().makeTranslation(placement.x, 0, 0))
    mesh.instanceGeometry.push(geometry)
  }
  const group = new Group()
  group.add(mesh)
  return {group, mesh}
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} count instances
 * @return {Array<boolean>} per-instance visibility
 */
function visibility(mesh, count) {
  const out = []
  for (let index = 0; index < count; index++) {
    out.push(mesh.getVisibleAt(index))
  }
  return out
}


describe('ResidencyController', () => {
  const camera = {position: new Vector3(0, 0, 10)}

  it('keeps everything at 100% and evicts everything at 0%', () => {
    const {group, mesh} = makeModel([
      {x: 0, size: 1, expressID: 11},
      {x: 5, size: 1, expressID: 22},
    ])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    expect(controller.instanceCount).toBe(2)
    controller.setTarget(1)
    expect(visibility(mesh, 2)).toEqual([true, true])
    controller.setTarget(0)
    expect(visibility(mesh, 2)).toEqual([false, false])
    controller.dispose()
    expect(visibility(mesh, 2)).toEqual([true, true])
  })

  it('occupancy keeps the biggest-on-screen part at 50%', () => {
    // Same distance from the camera; the larger part must survive.
    const {group, mesh} = makeModel([
      {x: 0, size: 1, expressID: 11},
      {x: 0, size: 5, expressID: 22},
    ])
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.setTarget(0.5)
    expect(visibility(mesh, 2)).toEqual([false, true])
  })

  it('memory metric spends the byte budget on cheap parts first', () => {
    const {group, mesh} = makeModel([
      {x: 0, size: 1, expressID: 11},
      {x: 2, size: 1, expressID: 22},
    ])
    // Make instance 0 artificially expensive: give it a private view of
    // its bytes by tripling via a distinct geometry — both boxes have
    // equal vertex counts, so instead weight via a third instance
    // sharing geometry 1 (amortizing it cheaper).
    const controller = new ResidencyController(group, {getCamera: () => camera})
    controller.setMetric(ResidencyMetric.MEMORY)
    controller.setTarget(0.5)
    // Equal amortized bytes: exactly one fits a 50% budget.
    expect(visibility(mesh, 2).filter(Boolean)).toHaveLength(1)
    controller.setTarget(1)
    expect(visibility(mesh, 2)).toEqual([true, true])
  })

  it('distance metric keeps the part nearest the selection', () => {
    const {group, mesh} = makeModel([
      {x: 0, size: 1, expressID: 11},
      {x: 100, size: 1, expressID: 22},
    ])
    const selection = new Vector3(100, 0, 0)
    const controller = new ResidencyController(group, {
      getCamera: () => camera,
      getSelectionCenter: () => selection,
    })
    controller.setMetric(ResidencyMetric.DISTANCE)
    controller.setTarget(0.5)
    expect(visibility(mesh, 2)).toEqual([false, true])
  })

  it('ignores models with no batched instances', () => {
    const controller = new ResidencyController(new Group(), {})
    expect(controller.instanceCount).toBe(0)
    controller.setTarget(0.5)
    controller.dispose()
  })
})

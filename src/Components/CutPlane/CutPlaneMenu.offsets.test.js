import {Box3, BatchedMesh, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Plane, Vector3} from 'three'
import useStore from '../../store/useStore'
import {getModelCenter, getPlaneSceneInfo, getPlanes, getPlanesOffset, writeDraggedPlanes} from './CutPlaneMenu'


/* eslint-disable no-magic-numbers */


/**
 * Owner on #2171: a `#cp:` link kept which planes were on but not where they
 * had been dragged to, so a new tab replayed every cut at the model centre.
 * These hold the offset's round trip, through the real three: a plane placed
 * from an offset (getPlaneSceneInfo, as a link is replayed), moved, written
 * back (writeDraggedPlanes) and read again (getPlanes).
 */
describe('CutPlaneMenu: a dragged plane\'s offset in the permalink', () => {
  /** @return {object} a model centred at (1, 2, 3) */
  function makeModel() {
    const geometry = new BoxGeometry(2, 2, 2)
    geometry.translate(1, 2, 3)
    geometry.computeBoundingBox()
    return new Mesh(geometry, new MeshBasicMaterial())
  }

  /**
   * @param {object} model
   * @param {string} direction
   * @param {number} offset
   * @return {object} a MeshClipper plane entry, as the menu makes it
   */
  function menuPlane(model, direction, offset) {
    const modelCenter = new Vector3()
    model.geometry.boundingBox.getCenter(modelCenter)
    const {normal, modelCenterOffset} = getPlaneSceneInfo({modelCenter, direction, offset})
    return {plane: new Plane().setFromNormalAndCoplanarPoint(normal, modelCenterOffset), direction, normal}
  }

  beforeEach(() => {
    delete global.window.location
    global.window.location = {hash: ''}
    useStore.setState({cutPlanes: []})
  })

  it('round-trips each axis\'s offset, from a plane moved by a drag', () => {
    const model = makeModel()
    for (const [direction, offset] of [['x', 0.75], ['y', -0.5], ['z', 1.25]]) {
      const planeData = menuPlane(model, direction, 0)
      // A drag moves the plane along its normal (MeshClipper#onMouseMove);
      // the normal points to the cut-away side, so -offset along it.
      const point = new Vector3()
      planeData.plane.coplanarPoint(point)
      point.addScaledVector(planeData.normal, -offset)
      planeData.plane.setFromNormalAndCoplanarPoint(planeData.normal, point)
      expect(getPlanesOffset({clipper: {planes: [planeData]}}, model)).toEqual({[direction]: offset})
    }
  })

  it('writes the offsets into the #cp: hash and the store, which a new tab reads back', () => {
    const model = makeModel()
    useStore.setState({cutPlanes: [{direction: 'x', offset: 0}, {direction: 'y', offset: 0}]})
    const viewer = {clipper: {planes: [menuPlane(model, 'x', 0.75), menuPlane(model, 'y', -0.5)]}}
    writeDraggedPlanes(viewer, model)
    expect(window.location.hash).toContain('cp:')
    const hash = window.location.hash.split('#').pop().split('::').find((set) => set.startsWith('cp:'))
    expect(getPlanes(hash)).toEqual([{direction: 'x', offset: 0.75}, {direction: 'y', offset: -0.5}])
    expect(useStore.getState().cutPlanes).toEqual([{direction: 'x', offset: 0.75}, {direction: 'y', offset: -0.5}])
  })

  // The E2E's replay tab opened the model from the GLB cache: a BatchedMesh
  // whose packed geometry's box is empty, which read as the origin.
  it('centres a batched model on its placed instances, not its packed geometry\'s box', () => {
    const batch = new BatchedMesh(2, 64, 128, new MeshBasicMaterial())
    const geometryId = batch.addGeometry(new BoxGeometry(2, 2, 2))
    batch.setMatrixAt(batch.addInstance(geometryId), new Matrix4().makeTranslation(4, 0, 0))
    batch.setMatrixAt(batch.addInstance(geometryId), new Matrix4().makeTranslation(6, 2, 0))
    batch.geometry.boundingBox = new Box3()
    expect(getModelCenter(batch).toArray()).toEqual([5, 1, 0])
  })

  it('centres a plain mesh on its geometry\'s box, and an empty box falls back to the object\'s', () => {
    expect(getModelCenter(makeModel()).toArray()).toEqual([1, 2, 3])
    expect(getModelCenter(null).toArray()).toEqual([0, 0, 0])
  })


  it('leaves out a Q-shortcut plane, which has no axis to write', () => {
    const model = makeModel()
    const slanted = {plane: new Plane(new Vector3(1, 1, 0).normalize(), 0), direction: undefined}
    expect(getPlanesOffset({clipper: {planes: [slanted, menuPlane(model, 'z', 0.25)]}}, model)).toEqual({z: 0.25})
    writeDraggedPlanes({clipper: {planes: [slanted]}}, model)
    expect(window.location.hash).toBe('')
  })
})

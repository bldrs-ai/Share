/* eslint-disable no-magic-numbers */
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Vector2,
  Vector3,
} from 'three'
import Picker from './Picker'
import {isClippedAway, unclippedHits} from './clippedHits'
import {IfcRaycaster} from './context/raycaster'
import {disposeInstanceBoundsTree, hasInstanceBoundsTree} from '../ifc/batchedInstanceBvh'
import {SHAPE_ID, unitTriangleApi, withBvhPrototypes} from '../ifc/batchedModel.fixture'
import {raycastActiveInstances} from '../ifc/batchedRaycast'
import {decorateBatchMeshes} from '../ifc/buildBatchedConwayModel'
import {finishBatchedBoundsTrees} from '../ifc/deferredBatchedBvh'
import {flatMeshToBatchedModel} from '../ifc/flatMeshToBatchedModel'


// The scene every pick below is made in, looking down -z from z = 10: an
// "exterior" at z = 0 in front of an "interior" at z = -5, and a cut at
// z = -2.5 whose normal (0, 0, -1) keeps z <= -2.5 — the way the cut-plane
// menu's planes point at the half they keep (CutPlaneMenu.jsx
// getPlaneSceneInfo). So the cut removes the exterior and leaves the interior.
const EXTERIOR_Z = 0
const INTERIOR_Z = -5
const EXTERIOR_ID = 100
const INTERIOR_ID = 200


/** @return {Plane} the cut between exterior and interior */
function cutBetween() {
  return new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 0, -1), new Vector3(0, 0, -2.5))
}


/** @return {PerspectiveCamera} at z = 10, looking down -z at the origin */
function cameraAbove() {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}


/**
 * @param {number} z
 * @param {object} material
 * @return {Mesh} a thin box centred on (0, 0, z)
 */
function slab(z, material) {
  const mesh = new Mesh(new BoxGeometry(2, 2, 0.2), material)
  mesh.position.set(0, 0, z)
  mesh.updateMatrixWorld(true)
  return mesh
}


/**
 * @param {Array<object>} pickable
 * @param {Array<object>} [globalPlanes]
 * @return {Picker} over a ThreeContext double with the pointer at the canvas
 *   centre
 */
function pickerOver(pickable, globalPlanes = []) {
  const camera = cameraAbove()
  return new Picker({
    getCamera: () => camera,
    getNormalizedMousePosition: () => new Vector2(0, 0),
    getClippingPlanes: () => globalPlanes,
    getPickableModels: () => pickable,
  })
}


/**
 * A decorated batch from the production builder: the fixture's unit triangle
 * placed once at the exterior's depth (product EXTERIOR_ID) and once at the
 * interior's (INTERIOR_ID), both shifted so the canvas-centre ray crosses the
 * triangle's inside, not its corner.
 *
 * @return {object} THREE.BatchedMesh
 */
function exteriorAndInteriorBatch() {
  const at = (z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.25, -0.25, z, 1]
  const color = {x: 0.5, y: 0.5, z: 0.5, w: 1}
  const flatMeshes = [[EXTERIOR_ID, EXTERIOR_Z], [INTERIOR_ID, INTERIOR_Z]].map(([expressID, z]) => ({
    expressID,
    geometries: [{geometryExpressID: SHAPE_ID, flatTransformation: at(z), color: {...color}}],
  }))
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
  decorateBatchMeshes(batches)
  const mesh = batches[0].mesh
  mesh.updateMatrixWorld(true)
  finishBatchedBoundsTrees(mesh)
  return mesh
}


/**
 * @param {Array<object>} pickable
 * @return {IfcRaycaster} the hover's raycaster, over a fork-context double
 *   with the pointer at the canvas centre
 */
function hoverRaycasterOver(pickable) {
  const camera = cameraAbove()
  return new IfcRaycaster({
    getCamera: () => camera,
    addComponent: () => undefined,
    mouse: {position: new Vector2(0, 0)},
    getClippingPlanes: () => [],
    items: {pickableIfcModels: pickable},
  })
}


describe('viewer/three/clippedHits', () => {
  describe('unclippedHits', () => {
    it('returns the same array when no hit is clipped', () => {
      const material = new MeshBasicMaterial()
      const hits = [{point: new Vector3(0, 0, 0), object: {material}}]
      expect(unclippedHits(hits)).toBe(hits)
      material.clippingPlanes = [new Plane(new Vector3(0, 0, 1), 1)]
      expect(unclippedHits(hits)).toBe(hits)
    })

    it('drops hits behind any one of a material\'s planes and keeps the order of the rest', () => {
      const material = new MeshBasicMaterial({
        clippingPlanes: [cutBetween(), new Plane(new Vector3(1, 0, 0), 0)],
      })
      const hit = (x, z) => ({point: new Vector3(x, 0, z), object: {material}})
      const hits = [hit(1, 0), hit(1, -3), hit(-1, -4), hit(1, -5)]
      expect(unclippedHits(hits)).toEqual([hits[1], hits[3]])
    })

    it('keeps a point lying on the plane, as the shader does', () => {
      const material = new MeshBasicMaterial({clippingPlanes: [cutBetween()]})
      expect(isClippedAway({point: new Vector3(0, 0, -2.5), object: {material}})).toBe(false)
    })

    it('clips only behind every plane when the material asks for the intersection', () => {
      const material = new MeshBasicMaterial({
        clippingPlanes: [cutBetween(), new Plane(new Vector3(1, 0, 0), 0)],
        clipIntersection: true,
      })
      expect(isClippedAway({point: new Vector3(1, 0, 0), object: {material}})).toBe(false)
      expect(isClippedAway({point: new Vector3(-1, 0, 0), object: {material}})).toBe(true)
    })

    it('reads a material array by the hit face\'s material index', () => {
      const clipped = new MeshBasicMaterial({clippingPlanes: [cutBetween()]})
      const object = {material: [new MeshBasicMaterial(), clipped]}
      const point = new Vector3(0, 0, 0)
      expect(isClippedAway({point, object, face: {materialIndex: 0}})).toBe(false)
      expect(isClippedAway({point, object, face: {materialIndex: 1}})).toBe(true)
    })

    it('clips every material by the global planes', () => {
      const hit = {point: new Vector3(0, 0, 0), object: {material: new MeshBasicMaterial()}}
      expect(isClippedAway(hit, [cutBetween()])).toBe(true)
      expect(isClippedAway(hit, [])).toBe(false)
    })

    it('keeps a hit with no point or no material', () => {
      expect(isClippedAway({object: {}}, [cutBetween()])).toBe(false)
      expect(isClippedAway({point: new Vector3(), object: {}})).toBe(false)
    })
  })


  describe('non-batched picks (Picker#castRay, the click)', () => {
    it('picks the interior behind a clipped-away exterior', () => {
      const material = new MeshBasicMaterial()
      const exterior = slab(EXTERIOR_Z, material)
      const interior = slab(INTERIOR_Z, material)
      const picker = pickerOver([exterior, interior])
      expect(picker.castRayIfc().object).toBe(exterior)
      // As MeshClipper binds a plane: one array on every material.
      material.clippingPlanes = [cutBetween()]
      const hits = picker.castRay([exterior, interior])
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((h) => h.object === interior)).toBe(true)
      expect(picker.castRayIfc().object).toBe(interior)
    })

    it('still picks what no plane clips, such as an unbound material', () => {
      const exterior = slab(EXTERIOR_Z, new MeshBasicMaterial())
      const interior = slab(INTERIOR_Z, new MeshBasicMaterial({clippingPlanes: [cutBetween()]}))
      expect(pickerOver([exterior, interior]).castRayIfc().object).toBe(exterior)
    })

    it('honours the context\'s global planes', () => {
      const material = new MeshBasicMaterial()
      const exterior = slab(EXTERIOR_Z, material)
      const interior = slab(INTERIOR_Z, material)
      expect(pickerOver([exterior, interior], [cutBetween()]).castRayIfc().object).toBe(interior)
    })

    it('picks nothing when the plane clips everything on the ray', () => {
      const material = new MeshBasicMaterial({clippingPlanes: [new Plane(new Vector3(0, 0, -1), -10)]})
      const picker = pickerOver([slab(EXTERIOR_Z, material), slab(INTERIOR_Z, material)])
      expect(picker.castRay(picker.context.getPickableModels())).toEqual([])
      expect(picker.castRayIfc()).toBeNull()
    })
  })


  describe('batched picks (IfcRaycaster#castRayIfc, the hover)', () => {
    it('picks the interior instance through the instance tree', () => {
      withBvhPrototypes(raycastActiveInstances, () => {
        const mesh = exteriorAndInteriorBatch()
        expect(hasInstanceBoundsTree(mesh)).toBe(true)
        const hover = hoverRaycasterOver([mesh])
        expect(mesh.instanceParents[hover.castRayIfc().batchId]).toBe(EXTERIOR_ID)
        mesh.material.clippingPlanes = [cutBetween()]
        expect(mesh.instanceParents[hover.castRayIfc().batchId]).toBe(INTERIOR_ID)
      })
    })

    it('picks the interior instance when every instance is walked', () => {
      withBvhPrototypes(raycastActiveInstances, () => {
        const mesh = exteriorAndInteriorBatch()
        disposeInstanceBoundsTree(mesh)
        expect(hasInstanceBoundsTree(mesh)).toBe(false)
        mesh.material.clippingPlanes = [cutBetween()]
        expect(mesh.instanceParents[hoverRaycasterOver([mesh]).castRayIfc().batchId]).toBe(INTERIOR_ID)
      })
    })

    it('picks the same through the click\'s Picker', () => {
      withBvhPrototypes(raycastActiveInstances, () => {
        const mesh = exteriorAndInteriorBatch()
        mesh.material.clippingPlanes = [cutBetween()]
        expect(mesh.instanceParents[pickerOver([mesh]).castRayIfc().batchId]).toBe(INTERIOR_ID)
      })
    })
  })
})

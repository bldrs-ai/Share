/* eslint-disable no-magic-numbers */
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three'
import MeshClipper from './MeshClipper'
import Picker from './Picker'
import {IfcRaycaster} from './context/raycaster'
import {hitsInFrontOfControls, isOnControl} from './pickControls'


// The camera looks down -z from z = 10 at the origin, where MeshClipper puts
// the arrow of a plane through the origin. The model is a slab at z = -3
// behind the arrow, and a second slab at z = 3 in front of it: the arrow is
// drawn over both (depthTest off), so it must be the pick either way.
const CANVAS_W = 800
const CANVAS_H = 600


/** @return {PerspectiveCamera} */
function cameraAbove() {
  const camera = new PerspectiveCamera(50, CANVAS_W / CANVAS_H, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}


/**
 * @param {number} z
 * @return {Mesh} a 2x2 slab centred on (0, 0, z)
 */
function slab(z) {
  const mesh = new Mesh(new BoxGeometry(2, 2, 0.2), new MeshBasicMaterial())
  mesh.position.set(0, 0, z)
  mesh.updateMatrixWorld(true)
  return mesh
}


/**
 * A scene with the two slabs and a MeshClipper that has made one plane
 * through the origin, its arrow viewed side-on (normal +x), so a ray through
 * the canvas centre crosses the arrow's shaft and a ray near the edge misses
 * it.
 *
 * @return {object} {scene, camera, clipper, model, viewer, arrow}
 */
function sceneWithCutPlane() {
  const scene = new Scene()
  const camera = cameraAbove()
  const front = slab(3)
  const back = slab(-3)
  const model = new Group()
  model.add(front, back)
  scene.add(model)
  model.updateMatrixWorld(true)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: CANVAS_W, height: CANVAS_H})
  const viewer = {
    context: {
      getDomElement: () => canvas,
      getScene: () => scene,
      getLegacyRendererWrapper: () => ({clippingPlanes: [], localClippingEnabled: false}),
      getCamera: () => camera,
      getCameraControls: () => null,
    },
    highlightIfcItem: jest.fn(),
  }
  const clipper = new MeshClipper(viewer, model)
  const {arrow} = clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
  arrow.updateMatrixWorld(true)
  return {scene, camera, clipper, model, viewer, arrow, front, back}
}


/**
 * @param {object} camera
 * @param {number} x NDC
 * @param {number} y NDC
 * @return {Raycaster}
 */
function rayAt(camera, x, y) {
  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(x, y), camera)
  return raycaster
}


/**
 * @param {object} scene
 * @param {object} camera
 * @param {Vector2} pointer NDC, mutated by the caller to move it
 * @return {Picker} over a ThreeContext double
 */
function pickerIn(scene, camera, pointer) {
  return new Picker({
    getCamera: () => camera,
    getNormalizedMousePosition: () => pointer,
    getClippingPlanes: () => [],
    getScene: () => scene,
  })
}


describe('viewer/three/pickControls', () => {
  it('passes an empty hit list straight through, without casting at the arrows', () => {
    const {scene, arrow} = sceneWithCutPlane()
    arrow.userData.isDragging = true
    const raycaster = {intersectObjects: jest.fn(() => [])}
    const none = []
    expect(hitsInFrontOfControls(none, raycaster, scene)).toBe(none)
    expect(raycaster.intersectObjects).not.toHaveBeenCalled()
  })

  it('leaves the hits alone in a scene with no cut-plane control', () => {
    const scene = new Scene()
    const back = slab(-3)
    scene.add(back)
    const raycaster = rayAt(cameraAbove(), 0, 0)
    const hits = raycaster.intersectObjects([back])
    expect(hits.length).toBeGreaterThan(0)
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toBe(hits)
    expect(hitsInFrontOfControls(hits, raycaster, null)).toBe(hits)
  })

  it('drops every model hit, nearer or farther than the arrow, where the ray crosses it', () => {
    const {scene, camera, front, back} = sceneWithCutPlane()
    const raycaster = rayAt(camera, 0, 0)
    const hits = raycaster.intersectObjects([front, back])
    expect(hits.map((h) => h.object)).toContain(front)
    expect(hits.map((h) => h.object)).toContain(back)
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toEqual([])
  })

  it('keeps the model hits where the ray misses the arrow', () => {
    const {scene, camera, back} = sceneWithCutPlane()
    // Off the arrow, still on the 2x2 slab.
    const raycaster = rayAt(camera, 0.1, 0.1)
    const hits = raycaster.intersectObjects([back])
    expect(hits.length).toBeGreaterThan(0)
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toBe(hits)
  })

  it('keeps the hits on the arrow itself, for a cast at the arrows (the W shortcut)', () => {
    const {scene, camera, arrow} = sceneWithCutPlane()
    const raycaster = rayAt(camera, 0, 0)
    const hits = raycaster.intersectObjects(scene.children, true)
    const kept = hitsInFrontOfControls(hits, raycaster, scene)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(hits.length)
    expect(kept.every(isOnControl)).toBe(true)
    expect(isOnControl(kept[0])).toBe(true)
    expect(kept[0].object.parent).toBe(arrow)
  })

  it('drops every model hit while an arrow is dragged, wherever the pointer is', () => {
    const {scene, camera, back, arrow} = sceneWithCutPlane()
    const raycaster = rayAt(camera, 0.1, 0.1)
    const hits = raycaster.intersectObjects([back])
    arrow.userData.isDragging = true
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toEqual([])
    arrow.userData.isDragging = false
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toBe(hits)
  })

  it('stops blocking once the plane is deleted', () => {
    const {scene, camera, clipper, back} = sceneWithCutPlane()
    clipper.deleteAllPlanes()
    const raycaster = rayAt(camera, 0, 0)
    const hits = raycaster.intersectObjects([back])
    expect(hitsInFrontOfControls(hits, raycaster, scene)).toBe(hits)
  })

  it('isOnControl is false for a model hit and for no hit', () => {
    expect(isOnControl({object: slab(0)})).toBe(false)
    expect(isOnControl(undefined)).toBe(false)
  })


  describe('through the raycasters', () => {
    it('the click\'s Picker: the model on the arrow\'s ray is not picked, the model beside it is', () => {
      const {scene, camera, model} = sceneWithCutPlane()
      const pointer = new Vector2(0, 0)
      const picker = pickerIn(scene, camera, pointer)
      expect(picker.castRay([model])).toEqual([])
      // CadView casts at the whole scene: the nearest hit is the arrow's.
      expect(isOnControl(picker.castRay(scene.children)[0])).toBe(true)
      pointer.set(0.1, 0.1)
      expect(picker.castRay([model]).length).toBeGreaterThan(0)
    })

    it('the hover\'s IfcRaycaster: no hover on the arrow\'s ray', () => {
      const {scene, camera, model} = sceneWithCutPlane()
      const pointer = new Vector2(0, 0)
      const hover = new IfcRaycaster({
        addComponent: () => undefined,
        getCamera: () => camera,
        mouse: {position: pointer},
        getClippingPlanes: () => [],
        getScene: () => scene,
        items: {pickableIfcModels: [model]},
      })
      expect(hover.castRayIfc()).toBeNull()
      pointer.set(0.1, 0.1)
      expect(hover.castRayIfc()).not.toBeNull()
    })
  })


  describe('MeshClipper\'s drag flag', () => {
    const atCentre = {clientX: CANVAS_W / 2, clientY: CANVAS_H / 2}

    it('is set for the length of a drag, and the press re-runs the hover pick', () => {
      const {clipper, arrow, viewer} = sceneWithCutPlane()
      clipper.setInteractionEnabled(true)
      clipper.onMouseDown(atCentre)
      expect(clipper.draggingArrow).not.toBeNull()
      expect(arrow.userData.isDragging).toBe(true)
      expect(viewer.highlightIfcItem).toHaveBeenCalledTimes(1)
      clipper.onMouseUp()
      expect(arrow.userData.isDragging).toBe(false)
    })

    it('is cleared when interaction is turned off mid-drag', () => {
      const {clipper, arrow} = sceneWithCutPlane()
      clipper.setInteractionEnabled(true)
      clipper.onMouseDown(atCentre)
      expect(arrow.userData.isDragging).toBe(true)
      clipper.setInteractionEnabled(false)
      expect(arrow.userData.isDragging).toBe(false)
    })

    it('is cleared by a release off the canvas', () => {
      const {clipper, arrow} = sceneWithCutPlane()
      clipper.setInteractionEnabled(true)
      clipper.onMouseDown(atCentre)
      expect(arrow.userData.isDragging).toBe(true)
      window.dispatchEvent(new MouseEvent('pointerup'))
      expect(arrow.userData.isDragging).toBe(false)
      expect(clipper.draggingArrow).toBeNull()
    })

    it('is not set by a press off the arrow', () => {
      const {clipper, arrow, viewer} = sceneWithCutPlane()
      clipper.setInteractionEnabled(true)
      clipper.onMouseDown({clientX: 10, clientY: 10})
      expect(arrow.userData.isDragging).not.toBe(true)
      expect(viewer.highlightIfcItem).not.toHaveBeenCalled()
    })
  })
})

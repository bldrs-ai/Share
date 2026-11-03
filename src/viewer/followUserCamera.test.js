import * as THREE from 'three'
import {BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three'
import CameraControls from 'camera-controls'
import {snapToDirection} from '../Components/ViewCube/ViewCube'
import ProgressiveLoadSession from './ProgressiveLoadSession'
import RenderDemand, {noteUserCamera} from './three/renderDemand'


/* eslint-disable no-magic-numbers */


const FRAME_S = 1 / 60


/**
 * @param {number} x
 * @return {Mesh} a unit cube at (x, 0, 0), matrix stamped as a preview's is
 */
function cubeAt(x) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
  mesh.matrixAutoUpdate = false
  mesh.matrix = new Matrix4().makeTranslation(x, 0, 0)
  return mesh
}


/**
 * open-205 #2043, codex review on #2052 (rounds 1-3): a camera command from a
 * UI of ours — the ViewCube here — sends no camera-controls control event, so
 * the load's camera follow could refit between the command and the frame that
 * applies it, flushing the queued move inside its own attribution
 * (`RenderDemand#runFollowMove`) or overwriting it. The rule that closes the
 * class: the UI notes the user's camera at the moment of input
 * (`noteUserCamera`), which stops the follow for good before anything is
 * queued. This drives the real camera-controls queue in the real order:
 * ViewCube input → follow refit attempt → next frame.
 */
describe('viewer: the user\'s camera against the load\'s follow', () => {
  let camera
  let controls
  let demand
  let session
  let endLoad
  let warnSpy

  let hadDomRect

  beforeAll(() => {
    CameraControls.install({THREE})
    // jsdom has no DOMRect, which camera-controls' constructor makes one of
    // for its element's bounds; nothing here reads them.
    hadDomRect = typeof globalThis.DOMRect === 'function'
    if (!hadDomRect) {
      globalThis.DOMRect = class {
        /**
         * @param {number} [x]
         * @param {number} [y]
         * @param {number} [width]
         * @param {number} [height]
         */
        constructor(x = 0, y = 0, width = 0, height = 0) {
          Object.assign(this, {x, y, width, height, left: x, top: y, right: x + width, bottom: y + height})
        }
      }
    }
  })

  afterAll(() => {
    if (!hadDomRect) {
      delete globalThis.DOMRect
    }
  })

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    camera = new PerspectiveCamera(45, 1.5, 0.1, 2000)
    controls = new CameraControls(camera, document.createElement('div'))
    controls.update(0)
    demand = new RenderDemand()
    endLoad = demand.begin(controls)
    session = new ProgressiveLoadSession({
      scene: new Scene(),
      getControls: () => controls,
      getCamera: () => camera,
      renderDemand: demand,
    })
    // The follow's first fit: a snap, already applied.
    session.addPreviewMesh(cubeAt(0))
    // Let the loop paint, so the next ask is measured from a quiet loop.
    demand.shouldRender()
    demand.rendered(1)
    demand.shouldRender()
  })

  afterEach(() => {
    session.finish()
    endLoad()
    controls.dispose()
    warnSpy.mockRestore()
  })

  /**
   * A follow refit attempt: geometry far outside the framed volume, with the
   * cadence gate open, as the next streamed batch would bring.
   */
  function streamFarGeometry() {
    session.lastFitMs = 0
    session.addPreviewMesh(cubeAt(500))
    session.followTick_()
  }

  /**
   * One animation frame: the renderer's turn, then camera-controls' update (the
   * fork's component order, IfcContext#updateAllComponents), then the next
   * frame's paint decision.
   *
   * @return {boolean} whether that next frame paints
   */
  function nextFrame() {
    controls.update(FRAME_S)
    return demand.shouldRender()
  }

  it('a ViewCube snap made while geometry streams is the user\'s: the follow stays off it, and it paints at once', () => {
    const azimuthBefore = controls.azimuthAngle
    const targetBefore = controls.getTarget(new THREE.Vector3())
    const distanceBefore = controls.distance

    // The ViewCube's pointerdown, then its snap (rotateTo, transition on).
    noteUserCamera(controls)
    snapToDirection(controls, new THREE.Vector3(1, 0, 0))
    // The next streamed geometry asks the follow to refit.
    streamFarGeometry()

    expect(nextFrame()).toBe(true)
    // The follow never moved the camera: no refit to the far geometry.
    expect(controls.getTarget(new THREE.Vector3()).distanceTo(targetBefore)).toBeLessThan(1e-6)
    expect(controls.distance).toBeCloseTo(distanceBefore, 6)
    // The snap is under way, toward the view it asked for.
    expect(controls.azimuthAngle).not.toBeCloseTo(azimuthBefore, 6)
    for (let frame = 0; frame < 600; frame++) {
      controls.update(FRAME_S)
    }
    expect(controls.azimuthAngle).toBeCloseTo(Math.PI / 2, 2)
    expect(controls.getTarget(new THREE.Vector3()).distanceTo(targetBefore)).toBeLessThan(1e-6)
  })

  it('a ViewCube drag\'s queued rotation is not flushed by a follow refit', () => {
    const azimuthBefore = controls.azimuthAngle
    const distanceBefore = controls.distance
    // The ViewCube's pointerdown, then a drag step: rotate(…, false), queued
    // until camera-controls' next update.
    noteUserCamera(controls)
    controls.rotate(0.5, 0, false)
    streamFarGeometry()

    expect(nextFrame()).toBe(true)
    expect(controls.azimuthAngle).toBeCloseTo(azimuthBefore + 0.5, 6)
    expect(controls.distance).toBeCloseTo(distanceBefore, 6)
  })

  it('without the user\'s camera, the same geometry does move the follow', () => {
    // The other half of the assertion above: this refit is real.
    const distanceBefore = controls.distance
    streamFarGeometry()
    controls.update(FRAME_S)
    expect(controls.distance).toBeGreaterThan(distanceBefore * 2)
  })
})

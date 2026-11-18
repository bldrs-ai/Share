import {BoxGeometry, Mesh, MeshBasicMaterial, Scene, Vector2} from 'three'
import {isCollected} from '../../../../utils/gc.fixture'
import {IfcCamera} from './camera'


/**
 * The IfcContext surface IfcCamera and its nav modes read at construction
 * and when framing a model.
 *
 * @param {Scene} scene
 * @return {object}
 */
function makeContext(scene) {
  const canvas = document.createElement('canvas')
  return {
    addComponent: () => undefined,
    getDimensions: () => new Vector2(800, 600),
    getDomElement: () => canvas,
    getScene: () => scene,
  }
}


/**
 * Start framing a model that nothing else holds, the way a load does
 * (OrbitControl#fitModelToFrame awaits the camera's transition). Its own
 * function so this file's scope never holds the model.
 *
 * @param {IfcCamera} camera
 * @param {Scene} scene
 * @return {WeakRef} to the model being framed
 */
function startFraming(camera, scene) {
  const model = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial())
  scene.add(model)
  // Never settles here: nothing calls the controls' update, as nothing does
  // once a disposed viewer's render loop has stopped.
  camera.currentNavMode.fitModelToFrame(model)
  scene.remove(model)
  return new WeakRef(model)
}


describe('viewer/three/context/camera/IfcCamera', () => {
  // camera-controls builds a DOMRect for its viewport; jsdom has none.
  const hadDomRect = 'DOMRect' in global
  beforeAll(() => {
    if (!hadDomRect) {
      global.DOMRect = class {
        /**
         * @param {number} x
         * @param {number} y
         * @param {number} width
         * @param {number} height
         */
        constructor(x = 0, y = 0, width = 0, height = 0) {
          Object.assign(this, {x, y, width, height, left: x, top: y, right: x + width, bottom: y + height})
        }
      }
    }
  })
  afterAll(() => {
    if (!hadDomRect) {
      delete global.DOMRect
    }
  })

  // open-205 (#2019): a disposed viewer can stay reachable for a while after
  // an in-app model switch (stale React render scopes keep it), and its
  // camera controls with it. A camera transition still running at dispose
  // never reaches 'rest', so camera-controls kept its `rest` listener, and
  // through that promise the suspended fitModelToFrame kept the model.
  it('lets a model being framed at dispose go, though the controls stay reachable', async () => {
    const scene = new Scene()
    const camera = new IfcCamera(makeContext(scene))
    const controls = camera.cameraControls
    const modelRef = startFraming(camera, scene)

    camera.dispose()

    expect(await isCollected(modelRef)).toBe(true)
    // What still holds the controls after a real dispose (MotionAO's
    // `controls`, a stale render scope) is stood in for by this reference.
    expect(controls).toBeDefined()
  })
})

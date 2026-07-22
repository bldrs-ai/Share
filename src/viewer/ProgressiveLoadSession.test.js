import {BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Scene} from 'three'
import ProgressiveLoadSession, {SessionState} from './ProgressiveLoadSession'


/* eslint-disable no-magic-numbers */


/** @return {object} A camera-controls stand-in recording fit calls. */
function makeControls() {
  return {
    fits: [],
    listeners: {},
    fitToSphere(sphere, withTransition) {
      this.fits.push({center: sphere.center.clone(), radius: sphere.radius, withTransition})
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn
    },
    removeEventListener(name) {
      delete this.listeners[name]
    },
  }
}


/** @return {object} A perspective-camera stand-in. */
function makeCamera() {
  return {
    fov: 45,
    aspect: 1.5,
    far: 100,
    updateProjectionMatrix() {/* no-op */},
  }
}


/**
 * @param {number} x mesh center x
 * @param {number} [size] cube edge length
 * @return {Mesh} A unit-ish cube mesh at (x, 0, 0).
 */
function cubeAt(x, size = 1) {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial())
  mesh.matrixAutoUpdate = false
  mesh.matrix = new Matrix4().makeTranslation(x, 0, 0)
  return mesh
}


describe('ProgressiveLoadSession', () => {
  let scene
  let controls
  let camera
  let session

  beforeEach(() => {
    scene = new Scene()
    controls = makeControls()
    camera = makeCamera()
    session = new ProgressiveLoadSession({
      scene,
      getControls: () => controls,
      getCamera: () => camera,
      onProgress: jest.fn(),
    })
  })

  afterEach(() => {
    session.finish()
  })

  it('walks idle → previewing → assembling → finished', () => {
    expect(session.state).toBe(SessionState.IDLE)
    session.addPreviewMesh(cubeAt(0))
    expect(session.state).toBe(SessionState.PREVIEWING)
    session.beginAssembly()
    expect(session.state).toBe(SessionState.ASSEMBLING)
    expect(session.onProgress).toHaveBeenCalledWith('Assembling render mesh...')
    session.finish()
    expect(session.state).toBe(SessionState.FINISHED)
    expect(scene.children).toHaveLength(0)
  })

  it('installs the preview group on first mesh and fits instantly', () => {
    session.addPreviewMesh(cubeAt(0))
    expect(scene.children).toContain(session.previewGroup)
    expect(controls.fits).toHaveLength(1)
    expect(controls.fits[0].withTransition).toBe(false)
  })

  it('strictly frames the union: an escaping mesh triggers a tweened refit', () => {
    session.addPreviewMesh(cubeAt(0))
    expect(controls.fits).toHaveLength(1)
    // Make the refit gate pass immediately.
    session.lastFitMs = Date.now() - 10000
    // Far outside the first fitted sphere.
    session.addPreviewMesh(cubeAt(100))
    expect(controls.fits).toHaveLength(2)
    expect(controls.fits[1].withTransition).toBe(true)
    // The refit's sphere covers BOTH meshes — center between them,
    // radius spanning the whole union.
    const fit = controls.fits[1]
    expect(fit.center.x).toBeCloseTo(50, 0)
    expect(fit.radius).toBeGreaterThan(50)
  })

  it('does not refit while new geometry stays inside the framed volume', () => {
    session.addPreviewMesh(cubeAt(0))
    session.lastFitMs = Date.now() - 10000
    // Well inside the margined sphere of the first fit.
    session.addPreviewMesh(cubeAt(0.1))
    expect(controls.fits).toHaveLength(1)
  })

  it('stops following forever when the user takes the camera', () => {
    session.addPreviewMesh(cubeAt(0))
    controls.listeners['controlstart']()
    session.lastFitMs = Date.now() - 10000
    session.addPreviewMesh(cubeAt(100))
    expect(controls.fits).toHaveLength(1)
  })

  it('abort tears the preview down and lands in aborted', () => {
    session.addPreviewMesh(cubeAt(0))
    session.abort()
    expect(session.state).toBe(SessionState.ABORTED)
    expect(scene.children).toHaveLength(0)
  })

  it('a scene-less session reports but never previews', () => {
    const bare = new ProgressiveLoadSession({onProgress: jest.fn()})
    bare.report('Opening model...')
    expect(bare.onProgress).toHaveBeenCalledWith('Opening model...')
    expect(bare.previewGroup).toBeNull()
    bare.addPreviewMesh(cubeAt(0))
    bare.finish()
    expect(bare.state).toBe(SessionState.FINISHED)
  })

  it('stampCoordination re-frames the union under the group transform', () => {
    session.addPreviewMesh(cubeAt(0))
    session.lastFitMs = Date.now() - 10000
    const shift = new Matrix4().makeTranslation(500, 0, 0)
    session.stampCoordination(shift.toArray())
    expect(controls.fits.length).toBeGreaterThanOrEqual(2)
    const fit = controls.fits[controls.fits.length - 1]
    expect(fit.center.x).toBeCloseTo(500, 0)
  })
})

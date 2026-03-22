import {
  DirectionalLight, PlaneGeometry, Mesh, ShadowMaterial,
  MeshBasicMaterial, CanvasTexture,
  Box3, Vector3,
} from 'three'


const DEG2RAD = Math.PI / 180
const DEFAULT_AZIMUTH = 315 // Northwest — shadows fall toward camera
const DEFAULT_ELEVATION = 25 // Low sun for long dramatic shadows
const LIGHT_RADIUS = 25
const ROTATION_SPEED = 30 // degrees per second


/**
 * Manages a directional light with shadow casting for the viewer.
 * Light position is controlled via azimuth (compass direction) and elevation (height angle).
 */
export default class LightManager {
  constructor(viewer) {
    this.viewer = viewer
    this.light = null
    this.groundPlane = null
    this.groundText = null
    this.enabled = false
    this.azimuth = DEFAULT_AZIMUTH
    this.elevation = DEFAULT_ELEVATION
    this._animFrameId = null
    this._onUpdate = null
  }

  /**
   * Enable directional light with shadows.
   */
  enable(azimuth = this.azimuth, elevation = this.elevation) {
    if (this.enabled) return
    const scene = this.viewer.context.getScene()
    const renderer = this.viewer.context.getRenderer()

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = 1 // PCFShadowMap

    this.light = new DirectionalLight(0xffffff, 2.0)
    this.light.castShadow = true
    this.light.shadow.mapSize.width = 2048
    this.light.shadow.mapSize.height = 2048
    this.light.shadow.camera.near = 0.1
    this.light.shadow.camera.far = 100
    this.light.shadow.bias = -0.002
    scene.add(this.light)
    scene.add(this.light.target)

    // Ground plane to receive shadows — large enough for long shadows
    const groundGeom = new PlaneGeometry(300, 300)
    const groundMat = new ShadowMaterial({opacity: 0.4})
    this.groundPlane = new Mesh(groundGeom, groundMat)
    this.groundPlane.rotation.x = -Math.PI / 2
    this.groundPlane.position.y = -0.01
    this.groundPlane.receiveShadow = true
    this.groundPlane.name = 'ShadowGroundPlane'
    scene.add(this.groundPlane)

    // Enable shadow casting on all model meshes
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name !== 'ShadowGroundPlane' && obj.name !== 'GroundText') {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    this.enabled = true
    this.azimuth = azimuth
    this.elevation = elevation
    this._updatePosition()
    this._createGroundText()
  }

  /**
   * Disable light and shadows.
   */
  disable() {
    if (!this.enabled) return
    this.stopRotation()
    const scene = this.viewer.context.getScene()
    const renderer = this.viewer.context.getRenderer()

    if (this.light) {
      scene.remove(this.light.target)
      scene.remove(this.light)
      this.light.dispose()
      this.light = null
    }

    if (this.groundPlane) {
      scene.remove(this.groundPlane)
      this.groundPlane.geometry.dispose()
      this.groundPlane.material.dispose()
      this.groundPlane = null
    }

    this._removeGroundText()

    renderer.shadowMap.enabled = false

    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false
        obj.receiveShadow = false
      }
    })

    this.enabled = false
  }

  toggle() {
    if (this.enabled) {
      this.disable()
    } else {
      this.enable()
    }
    return this.enabled
  }

  getAzimuth() {
    return this.azimuth
  }

  getElevation() {
    return this.elevation
  }

  setAzimuth(degrees) {
    this.azimuth = ((degrees % 360) + 360) % 360
    if (this.enabled) this._updatePosition()
  }

  setElevation(degrees) {
    this.elevation = Math.max(5, Math.min(85, degrees))
    if (this.enabled) this._updatePosition()
  }

  /**
   * Start continuous rotation. Calls onUpdate(azimuth) each frame.
   */
  startRotation(onUpdate) {
    if (this._animFrameId) return
    this._onUpdate = onUpdate
    let lastTime = performance.now()
    const animate = (now) => {
      const dt = (now - lastTime) / 1000
      lastTime = now
      this.azimuth = ((this.azimuth + ROTATION_SPEED * dt) % 360 + 360) % 360
      this._updatePosition()
      if (this._onUpdate) this._onUpdate(this.azimuth)
      this._animFrameId = requestAnimationFrame(animate)
    }
    this._animFrameId = requestAnimationFrame(animate)
  }

  stopRotation() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
    this._onUpdate = null
  }

  dispose() {
    this.disable()
  }

  /** Recalculate light position from azimuth + elevation and fit shadow camera. */
  _updatePosition() {
    if (!this.light) return
    const az = this.azimuth * DEG2RAD
    const el = this.elevation * DEG2RAD
    const r = LIGHT_RADIUS
    const x = r * Math.cos(el) * Math.sin(az)
    const y = r * Math.sin(el)
    const z = r * Math.cos(el) * Math.cos(az)
    this.light.position.set(x, y, z)
    this._fitShadowCamera()
  }

  /** Fit the shadow camera frustum to the scene bounding box. */
  _fitShadowCamera() {
    if (!this.light) return
    const scene = this.viewer.context.getScene()
    const box = new Box3()
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name !== 'ShadowGroundPlane' && obj.name !== 'GroundText') {
        box.expandByObject(obj)
      }
    })
    if (box.isEmpty()) return
    const center = new Vector3()
    box.getCenter(center)
    const size = new Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const halfSize = maxDim * 0.75

    this.light.target.position.copy(center)
    this.light.target.updateMatrixWorld()

    const cam = this.light.shadow.camera
    cam.left = -halfSize
    cam.right = halfSize
    cam.top = halfSize
    cam.bottom = -halfSize
    cam.far = LIGHT_RADIUS * 2 + maxDim
    cam.updateProjectionMatrix()
  }

  /** Create "bldrs" text on the ground plane using canvas texture. */
  _createGroundText() {
    const scene = this.viewer.context.getScene()
    const box = new Box3()
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name !== 'ShadowGroundPlane' && obj.name !== 'GroundText') {
        box.expandByObject(obj)
      }
    })
    if (box.isEmpty()) return

    const center = new Vector3()
    box.getCenter(center)
    const size = new Vector3()
    box.getSize(size)

    // Canvas with "bldrs" text
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw text — bldrs green, subtle
    ctx.font = 'bold 360px sans-serif'
    ctx.fillStyle = 'rgba(0, 255, 0, 0.08)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('bldrs', canvas.width / 2, canvas.height / 2)

    const texture = new CanvasTexture(canvas)
    const textWidth = size.x * 1.5
    const textHeight = textWidth * (canvas.height / canvas.width)
    const geom = new PlaneGeometry(textWidth, textHeight)
    const mat = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })

    this.groundText = new Mesh(geom, mat)
    this.groundText.rotation.x = -Math.PI / 2
    // Place centered on model X, on the ground, slightly forward in Z (toward typical camera)
    this.groundText.position.set(center.x, 0.02, center.z + size.z * 0.6)
    this.groundText.name = 'GroundText'
    scene.add(this.groundText)
  }

  /** Remove ground text mesh. */
  _removeGroundText() {
    if (!this.groundText) return
    const scene = this.viewer.context.getScene()
    scene.remove(this.groundText)
    this.groundText.geometry.dispose()
    this.groundText.material.map.dispose()
    this.groundText.material.dispose()
    this.groundText = null
  }
}

import {DirectionalLight, PlaneGeometry, Mesh, MeshStandardMaterial, ShadowMaterial} from 'three'


/**
 * Manages a directional light with shadow casting for the viewer.
 * Light comes from behind/above and casts shadows onto a ground plane.
 */
export default class LightManager {
  constructor(viewer) {
    this.viewer = viewer
    this.light = null
    this.groundPlane = null
    this.enabled = false
  }

  /**
   * Enable directional light with shadows.
   */
  enable() {
    if (this.enabled) return
    const scene = this.viewer.context.getScene()
    const renderer = this.viewer.context.getRenderer()

    // Enable shadows on renderer
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = 1 // PCFShadowMap

    // Directional light from back-top
    this.light = new DirectionalLight(0xffffff, 2.0)
    this.light.position.set(-15, 20, -10)
    this.light.castShadow = true
    this.light.shadow.mapSize.width = 2048
    this.light.shadow.mapSize.height = 2048
    this.light.shadow.camera.near = 0.1
    this.light.shadow.camera.far = 100
    this.light.shadow.camera.left = -30
    this.light.shadow.camera.right = 30
    this.light.shadow.camera.top = 30
    this.light.shadow.camera.bottom = -30
    this.light.shadow.bias = -0.002
    scene.add(this.light)

    // Ground plane to receive shadows
    const groundGeom = new PlaneGeometry(100, 100)
    const groundMat = new ShadowMaterial({opacity: 0.3})
    this.groundPlane = new Mesh(groundGeom, groundMat)
    this.groundPlane.rotation.x = -Math.PI / 2
    this.groundPlane.position.y = -0.01
    this.groundPlane.receiveShadow = true
    this.groundPlane.name = 'ShadowGroundPlane'
    scene.add(this.groundPlane)

    // Enable shadow casting on all model meshes
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name !== 'ShadowGroundPlane') {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    this.enabled = true
  }

  /**
   * Disable light and shadows.
   */
  disable() {
    if (!this.enabled) return
    const scene = this.viewer.context.getScene()
    const renderer = this.viewer.context.getRenderer()

    if (this.light) {
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

    renderer.shadowMap.enabled = false

    // Disable shadow casting
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

  dispose() {
    this.disable()
  }
}

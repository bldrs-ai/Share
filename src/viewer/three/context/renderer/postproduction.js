import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer'
import {Color, DepthTexture, MeshLambertMaterial, Vector2, WebGLRenderTarget} from 'three'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass'
import {SAOPass} from 'three/examples/jsm/postprocessing/SAOPass'
import {FXAAShader} from 'three/examples/jsm/shaders/FXAAShader'
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass'
import {CustomOutlinePass} from './custom-outline-pass'

// source: https://discourse.threejs.org/t/how-to-render-full-outlines-as-a-post-process-tutorial/22674
export class Postproduction {
  constructor(context, renderer) {
    this.context = context
    this.renderer = renderer
    this.htmlOverlay = document.createElement('img')
    this.excludedItems = new Set()
    this.initialized = false
    this.visibilityField = 'ifcjsPostproductionVisible'
    this.isUserControllingCamera = false
    this.isControlSleeping = true
    this.lastWheelUsed = 0
    this.lastResized = 0
    this.resizeDelay = 500
    this.isActive = false
    this.isVisible = false
    this.white = new Color(255, 255, 255)
    this.tempMaterial = new MeshLambertMaterial({
      colorWrite: false,
      opacity: 0,
      transparent: true,
    })
    this.outlineParams = {
      mode: {Mode: 0},
      FXAA: true,
      outlineColor: 0x777777,
      depthBias: 16,
      depthMult: 83,
      normalBias: 5,
      normalMult: 1.0,
    }
    this.onControlStart = () => (this.isUserControllingCamera = true)
    this.onWake = () => (this.isControlSleeping = false)
    this.onResize = () => {
      this.lastResized = performance.now()
      this.visible = false
      setTimeout(() => {
        if (performance.now() - this.lastResized >= this.resizeDelay) {
          this.visible = true
        }
      }, this.resizeDelay)
    }
    this.onControl = () => {
      this.visible = false
    }
    this.onControlEnd = () => {
      this.isUserControllingCamera = false
      if (!this.isUserControllingCamera && this.isControlSleeping) {
        this.visible = true
      }
    }
    this.onWheel = () => {
      this.lastWheelUsed = performance.now()
    }
    this.onSleep = () => {
      // This prevents that this gets triggered a million times when zooming with the wheel
      this.isControlSleeping = true
      const currentWheel = performance.now()
      setTimeout(() => {
        if (this.lastWheelUsed > currentWheel) {
          return
        }
        if (!this.isUserControllingCamera && this.isControlSleeping) {
          this.visible = true
        }
      }, 200)
    }
    this.onChangeProjection = (camera) => {
      this.composer.passes.forEach((pass) => {
        // @ts-ignore
        pass.camera = camera
      })
      this.update()
    }
    this.renderTarget = this.newRenderTarget()
    this.composer = new EffectComposer(renderer, this.renderTarget)
    this.composer.setSize(window.innerWidth, window.innerHeight)
  }
  get active() {
    return this.isActive
  }
  set active(active) {
    if (this.isActive === active) {
      return
    }
    if (!this.initialized) {
      this.tryToInitialize()
    }
    this.visible = active
    this.isActive = active
  }
  get visible() {
    return this.isVisible
  }
  set visible(visible) {
    if (!this.isActive) {
      return
    }
    this.isVisible = visible
    if (visible) {
      this.update()
    }
    this.htmlOverlay.style.visibility = visible ? 'visible' : 'collapse'
  }
  get outlineColor() {
    return this.outlineParams.outlineColor
  }
  set outlineColor(color) {
    this.outlineParams.outlineColor = color
    this.outlineUniforms.outlineColor.value.set(color)
  }
  get sao() {
    var _a
    return (_a = this.saoPass) === null || _a === void 0 ? void 0 : _a.params
  }
  dispose() {
    var _a; var _b
    this.active = false
    window.removeEventListener('resize', this.onResize)
    this.renderTarget.dispose()
    this.renderTarget = null;
    (_a = this.depthTexture) === null || _a === void 0 ? void 0 : _a.dispose()
    this.depthTexture = null;
    (_b = this.customOutline) === null || _b === void 0 ? void 0 : _b.dispose()
    this.customOutline = null
    this.composer = null
    this.excludedItems.clear()
    this.excludedItems = null
    this.composer = null
    this.htmlOverlay.remove()
    this.htmlOverlay = null
    this.outlineParams = null
    this.context = null
    this.renderer = null
    this.saoPass = null
    this.outlineUniforms = null
    this.scene = null
  }
  setSize(width, height) {
    this.composer.setSize(width, height)
  }
  update() {
    var _a; var _b; var _c
    if (!this.initialized || !this.isActive) {
      return
    }
    this.hideExcludedItems()
    this.context.getScene().traverse((object) => {
      // @ts-ignore
      object.userData.prevMaterial = object.material
      // @ts-ignore
      object.material = this.tempMaterial
    })
    const background = (_a = this.scene) === null || _a === void 0 ? void 0 : _a.background
    if (((_b = this.scene) === null || _b === void 0 ? void 0 : _b.background) && background) {
      this.scene.background = this.white
    }
    this.composer.render()
    if (((_c = this.scene) === null || _c === void 0 ? void 0 : _c.background) && background) {
      this.scene.background = background
    }
    this.context.getScene().traverse((object) => {
      // @ts-ignore
      object.material = object.userData.prevMaterial
      delete object.userData.prevMaterial
    })
    this.htmlOverlay.src = this.renderer.domElement.toDataURL()
    this.showExcludedItems()
  }
  hideExcludedItems() {
    for (const object of this.excludedItems) {
      object.userData[this.visibilityField] = object.visible
      object.visible = false
    }
  }
  showExcludedItems() {
    for (const object of this.excludedItems) {
      if (object.userData[this.visibilityField] !== undefined) {
        object.visible = object.userData[this.visibilityField]
      }
    }
  }
  tryToInitialize() {
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    if (!scene || !camera) {
      return
    }
    this.scene = scene
    this.renderer.clippingPlanes = this.context.getClippingPlanes()
    this.setupEvents()
    this.addBasePass(scene, camera)
    this.addSaoPass(scene, camera)
    this.addOutlinePass(scene, camera)
    this.addAntialiasPass()
    this.setupHtmlOverlay()
    this.initialized = true
  }
  setupEvents() {
    const controls = this.context.ifcCamera.cameraControls
    const domElement = this.context.getDomElement()
    controls.addEventListener('control', this.onControl)
    controls.addEventListener('controlstart', this.onControlStart)
    controls.addEventListener('wake', this.onWake)
    controls.addEventListener('controlend', this.onControlEnd)
    domElement.addEventListener('wheel', this.onWheel)
    controls.addEventListener('sleep', this.onSleep)
    window.addEventListener('resize', this.onResize)
    this.context.ifcCamera.onChangeProjection.on(this.onChangeProjection)
  }
  setupHtmlOverlay() {
    this.context.getContainerElement().appendChild(this.htmlOverlay)
    // @ts-ignore
    this.htmlOverlay.style.mixBlendMode = 'multiply'
    this.htmlOverlay.style.position = 'absolute'
    this.htmlOverlay.style.height = '100%'
    this.htmlOverlay.style.userSelect = 'none'
    this.htmlOverlay.style.pointerEvents = 'none'
    this.htmlOverlay.style.top = '0'
    this.htmlOverlay.style.left = '0'
  }
  addAntialiasPass() {
    this.fxaaPass = new ShaderPass(FXAAShader)
    this.fxaaPass.uniforms.resolution.value.set((1 / this.renderer.domElement.offsetWidth) * this.renderer.getPixelRatio(), (1 / this.renderer.domElement.offsetHeight) * this.renderer.getPixelRatio())
    this.composer.addPass(this.fxaaPass)
  }
  addOutlinePass(scene, camera) {
    this.customOutline = new CustomOutlinePass(new Vector2(window.innerWidth, window.innerHeight), scene, camera)
    // Initial values
    // @ts-ignore
    this.outlineUniforms = this.customOutline.fsQuad.material.uniforms
    this.outlineUniforms.outlineColor.value.set(this.outlineParams.outlineColor)
    this.outlineUniforms.multiplierParameters.value.x = this.outlineParams.depthBias
    this.outlineUniforms.multiplierParameters.value.y = this.outlineParams.depthMult
    this.outlineUniforms.multiplierParameters.value.z = this.outlineParams.normalBias
    this.outlineUniforms.multiplierParameters.value.w = this.outlineParams.normalMult
    this.composer.addPass(this.customOutline)
  }
  addSaoPass(scene, camera) {
    this.saoPass = new SAOPass(scene, camera, false, true)
    this.composer.addPass(this.saoPass)
    this.saoPass.enabled = true
    this.saoPass.params.saoIntensity = 0.01
    this.saoPass.params.saoBias = 0.5
    this.saoPass.params.saoBlurRadius = 8
    this.saoPass.params.saoBlurDepthCutoff = 0.0015
    this.saoPass.params.saoScale = 30
    this.saoPass.params.saoKernelRadius = 30
  }
  addBasePass(scene, camera) {
    this.basePass = new RenderPass(scene, camera)
    this.composer.addPass(this.basePass)
  }
  newRenderTarget() {
    this.depthTexture = new DepthTexture(window.innerWidth, window.innerHeight)
    return new WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      depthTexture: this.depthTexture,
      depthBuffer: true,
    })
  }
}
// # sourceMappingURL=postproduction.js.map

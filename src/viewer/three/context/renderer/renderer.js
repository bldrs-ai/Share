// IfcRenderer — vendored from
// `web-ifc-viewer/dist/components/context/renderer/renderer.js` in
// slice 5d.3. Postproduction is now the local stub (we use
// CustomPostProcessor for outlines); the screenshot path stays.

import {Vector2, WebGLRenderer} from 'three'
import {CSS2DRenderer} from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import {IfcComponent} from '../base-types'
import {Postproduction} from './postproduction'


export class IfcRenderer extends IfcComponent {
  constructor(context) {
    super(context)
    this.renderer2D = new CSS2DRenderer()
    this.blocked = false
    this.context = context
    this.container = context.options.container
    const pdbEnabled = process.env.THREE_PDB_IS_ENABLED || false
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: pdbEnabled,
      // three r163 flipped the default to false, and without a stencil
      // ANGLE/Chrome may allocate a 16-bit depth buffer (~2.4mm depth
      // resolution at 15m under log-depth, vs ~9µm with the packed
      // 24-bit D24S8) — coplanar BIM interfaces (soffits, rakes,
      // ridges) z-fight visibly. Explicit so a default change can't
      // silently downgrade depth precision again.
      stencil: true,
    })
    // For debugger tracing
    this.renderer.preserveDrawingBufferENABLED = pdbEnabled
    // Z-fight probe: report the depth/stencil format the driver actually
    // granted, so real-GPU preview tests can read it from the console.
    try {
      const gl = this.renderer.getContext()
      console.log('[zfight-probe] depthBits=', gl.getParameter(gl.DEPTH_BITS),
        'stencilBits=', gl.getParameter(gl.STENCIL_BITS),
        'samples=', gl.getParameter(gl.SAMPLES),
        'contextAttributes=', JSON.stringify(gl.getContextAttributes()))
    } catch (e) {
      console.warn('[zfight-probe] context query failed', e)
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.setupRenderers()
    this.postProduction = new Postproduction(this.context, this.renderer)
    this.adjustRendererSize()
  }
  dispose() {
    let _a; let _b
    this.renderer.domElement.remove()
    this.renderer.dispose()
    this.postProduction.dispose()
    this.postProduction = null
    this.renderer = null
    this.renderer2D = null
    this.container = null
    this.context = null;
    (_a = this.tempRenderer) === null || _a === void 0 ? void 0 : _a.dispose();
    (_b = this.tempCanvas) === null || _b === void 0 ? void 0 : _b.remove()
  }
  update(_delta) {
    if (this.blocked) {
      return
    }
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    this.renderer.render(scene, camera)
    this.renderer2D.render(scene, camera)
  }
  getSize() {
    return new Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight)
  }
  adjustRendererSize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.renderer.setSize(width, height)
    this.postProduction.setSize(width, height)
    this.renderer2D.setSize(width, height)
  }
  newScreenshot(camera, dimensions) {
    const previousDimensions = this.getSize()
    const domElement = this.renderer.domElement
    const tempCanvas = domElement.cloneNode(true)
    // Using a new renderer to make screenshots without updating what the user sees in the canvas
    if (!this.tempRenderer) {
      this.tempRenderer = new WebGLRenderer({
        canvas: tempCanvas,
        antialias: true,
        logarithmicDepthBuffer: true,
        preserveDrawingBuffer: process.env.THREE_PDB_IS_ENABLED || false,
        // Same depth-precision requirement as the main renderer above:
        // screenshots must not z-fight where the live view doesn't.
        stencil: true,
      })
      this.tempRenderer.localClippingEnabled = true
    }
    if (dimensions) {
      this.tempRenderer.setSize(dimensions.x, dimensions.y)
      this.context.ifcCamera.updateAspect(dimensions)
    }
    // todo add this later to have a centered screenshot
    // await this.context.getIfcCamera().currentNavMode.fitModelToFrame();
    const scene = this.context.getScene()
    const cameraToRender = camera || this.context.getCamera()
    this.tempRenderer.render(scene, cameraToRender)
    const result = this.tempRenderer.domElement.toDataURL()
    if (dimensions) {
      this.context.ifcCamera.updateAspect(previousDimensions)
    }
    return result
  }
  setupRenderers() {
    this.renderer.localClippingEnabled = true
    this.container.appendChild(this.renderer.domElement)
    this.renderer2D.domElement.style.position = 'absolute'
    this.renderer2D.domElement.style.top = '0px'
    this.renderer2D.domElement.style.pointerEvents = 'none'
    this.container.appendChild(this.renderer2D.domElement)
  }
}
// # sourceMappingURL=renderer.js.map

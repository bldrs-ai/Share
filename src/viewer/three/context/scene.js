// IfcScene — vendored from `web-ifc-viewer/dist/components/context/scene.js`
// in slice 5d.3. The light intensity values (DirectionalLight 0.8,
// AmbientLight 0.25) are scaled by Math.PI inline to match the
// pre-r157 visual under three's `useLegacyLights=false` default —
// previously applied by `tools/esbuild/plugins.js#scaleLightIntensities`.

import {AmbientLight, Color, DirectionalLight, Scene} from 'three'
import {IfcComponent} from './base-types'


export class IfcScene extends IfcComponent {
  constructor(context) {
    super(context)
    this.context = context
    this.defaultBackgroundColor = new Color(0xa9a9a9)
    this.scene = new Scene()
    this.setupScene(context.options)
    this.setupLights()
  }
  dispose() {
    this.scene.children.length = 0
    this.scene = null
  }
  add(item) {
    this.scene.add(item)
  }
  remove(item) {
    this.scene.remove(item)
  }
  addModel(model) {
    this.context.items.ifcModels.push(model)
    this.context.items.pickableIfcModels.push(model)
    this.scene.add(model)
  }
  removeModel(model) {
    let index = this.context.items.ifcModels.indexOf(model)
    if (index >= 0) {
      this.context.items.ifcModels.splice(index, 1)
    }
    index = this.context.items.pickableIfcModels.indexOf(model)
    if (index >= 0) {
      this.context.items.pickableIfcModels.splice(index, 1)
    }
    if (model.parent) {
      model.removeFromParent()
    }
  }
  setupScene(options) {
    this.scene.background = (options === null || options === void 0 ? void 0 : options.backgroundColor) || this.defaultBackgroundColor
  }
  setupLights() {
    const light1 = new DirectionalLight(0xffeeff, 0.8 * Math.PI)
    light1.position.set(1, 1, 1)
    this.scene.add(light1)
    const light2 = new DirectionalLight(0xffffff, 0.8 * Math.PI)
    light2.position.set(-1, 0.5, -1)
    this.scene.add(light2)
    const ambientLight = new AmbientLight(0xffffee, 0.25 * Math.PI)
    this.scene.add(ambientLight)
  }
}
// # sourceMappingURL=scene.js.map

// IfcScene — vendored from `web-ifc-viewer/dist/components/context/scene.js`
// in slice 5d.3. Light intensities re-tuned for the §6e filmic/PBR
// pipeline: the scene env map (RoomEnvironment IBL, set in ShareViewer)
// now carries the fill + grounding, so these direct lights are lower than
// the legacy `× Math.PI` values and mainly give directional shape. Tune
// against the deploy preview.

import {AmbientLight, Color, DirectionalLight, Scene} from 'three'
import {IfcComponent} from './base-types'


// Direct-light intensities (§6e). Low because the env map carries the
// ambient/fill now; these are a key + fill directional pair plus a small
// ambient lift. Named for the deferred §6e settings panel.
const KEY_LIGHT_INTENSITY = 1.5
const FILL_LIGHT_INTENSITY = 1.0
const AMBIENT_LIGHT_INTENSITY = 0.2


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
    const light1 = new DirectionalLight(0xffeeff, KEY_LIGHT_INTENSITY)
    light1.position.set(1, 1, 1)
    this.scene.add(light1)
    const light2 = new DirectionalLight(0xffffff, FILL_LIGHT_INTENSITY)
    light2.position.set(-1, 0.5, -1)
    this.scene.add(light2)
    const ambientLight = new AmbientLight(0xffffee, AMBIENT_LIGHT_INTENSITY)
    this.scene.add(ambientLight)
  }
}
// # sourceMappingURL=scene.js.map

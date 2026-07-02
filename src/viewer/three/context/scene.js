// IfcScene — vendored from `web-ifc-viewer/dist/components/context/scene.js`
// in slice 5d.3. Light intensities re-tuned for the §6e filmic/PBR
// pipeline: the scene env map (RoomEnvironment IBL, set in ShareViewer)
// now carries the fill + grounding, so these direct lights are lower than
// the legacy `× Math.PI` values and mainly give directional shape. Tune
// against the deploy preview.

import {AmbientLight, Color, DirectionalLight, Scene} from 'three'
import {IfcComponent} from './base-types'
import {LOOKS} from '../../looks'
import {isFeatureEnabled} from '../../../FeatureFlags'


// Direct-light intensities. The whole §6e look sits behind `?feature=look`
// (default off): with the flag ON, the Neutral look's values (single source of
// truth: src/viewer/looks.js LOOKS.neutral) — the gradient studio IBL (scaled
// by `scene.environmentIntensity` in ShareViewer) carries most of the ambient
// + fill, so these direct lights are a key + fill pair plus an ambient lift.
// With the flag OFF, main's legacy `× Math.PI` intensities, so default
// rendering is unchanged until the flag is flipped. `ShareViewer.applyLook`
// overrides these at runtime on a render-mode toggle.
const USE_LOOK = isFeatureEnabled('look')
const KEY_LIGHT_INTENSITY = USE_LOOK ? LOOKS.neutral.keyLight : 0.8 * Math.PI
const FILL_LIGHT_INTENSITY = USE_LOOK ? LOOKS.neutral.fillLight : 0.8 * Math.PI
const AMBIENT_LIGHT_INTENSITY = USE_LOOK ? LOOKS.neutral.ambient : 0.25 * Math.PI


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
    // Named so the `?feature=look` GUI (LightingGui) can look them up via
    // `scene.getObjectByName(...)` to live-tune intensities.
    const light1 = new DirectionalLight(0xffeeff, KEY_LIGHT_INTENSITY)
    light1.name = 'keyLight'
    light1.position.set(1, 1, 1)
    this.scene.add(light1)
    const light2 = new DirectionalLight(0xffffff, FILL_LIGHT_INTENSITY)
    light2.name = 'fillLight'
    light2.position.set(-1, 0.5, -1)
    this.scene.add(light2)
    const ambientLight = new AmbientLight(0xffffee, AMBIENT_LIGHT_INTENSITY)
    ambientLight.name = 'ambientLight'
    this.scene.add(ambientLight)
  }
}
// # sourceMappingURL=scene.js.map

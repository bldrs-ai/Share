import {Object3D} from 'three'
import {load} from './Loader.js'


/** Similar to https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4 */
export default class BLDLoader {
  /**
   * @param {object} viewer
   */
  constructor(viewer) {
    this.viewer = viewer
  }


  /**
   * @param {string|Buffer} data
   * @param {string} basePath
   * @param {Function} onLoad
   * @param {Function} onError
   * @return {Object3D}
   */
  async parse(data, basePath, onLoad, onError) {
    const model = JSON.parse(data)
    const root = new Object3D
    // Model's base overrides system hint
    if (model.base) {
      basePath = model.base
    }
    if (model.scale) {
      root.scale.setScalar(model.scale)
    }

    for (const objRef of model.objects) {
      // TODO(pablo):
      if (basePath.startsWith('blob:')) {
        basePath = basePath.substring('blob:'.length)
        basePath = 'http://localhost:8081/'
      }
      const subUrl = new URL(objRef.href, basePath)
      // TODO(pablo): error handling
      // eslint-disable-next-line no-empty-function
      const subModel = await load(subUrl.toString(), this.viewer, () => {}, () => {}, () => {})
      root.add(subModel)

      if (objRef.pos) {
        if (objRef.pos.length !== 3) {
          continue
        }
        subModel.position.set(objRef.pos[0], objRef.pos[1], objRef.pos[2])
      }

      // Object scale property overrides base
      if (objRef.scale) {
        subModel.scale.setScalar(objRef.scale)
      } else if (model.objScale) {
        subModel.scale.setScalar(model.objScale)
      }
    }
    return root
  }
}

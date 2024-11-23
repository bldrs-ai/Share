import {Object3D} from 'three'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import {load} from './Loader'


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
    assertDefined(data)
    const model = JSON.parse(data)
    const root = new Object3D
    // Model's base overrides system hint
    if (model.base) {
      basePath = model.base
    }
    if (model.scale) {
      root.scale.setScalar(model.scale)
    }
    debug().log(`BLDLoader#parse: basePath(${basePath}), data:`, data)

    for (const objRef of model.objects) {
      // TODO(pablo):
      if (basePath && basePath.startsWith('blob:')) {
        basePath = basePath.substring('blob:'.length)
      }
      const subUrl = basePath ? new URL(objRef.href, basePath) : new URL(objRef.href)
      // TODO(pablo): error handling
      const subUrlStr = subUrl.toString()
      debug().log('subUrlStr', subUrlStr, 'should be from these:', objRef.href, basePath)
      // eslint-disable-next-line no-empty-function
      const subModel = await load(subUrlStr, this.viewer, () => {}, () => {}, () => {})
      debug().log('adding submodel:', subModel)
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
    debug().trace('returning root:')
    return root
  }
}

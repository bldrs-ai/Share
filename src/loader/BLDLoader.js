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
    if (model.scale) {
      root.scale.setScalar(model.scale)
    }

    for (const objRef of model.objects) {
      if (basePath.startsWith('blob:')) {
        basePath = basePath.substring('blob:'.length)
        basePath = 'http://localhost:8081/'
      }
      console.log('objRef.href', objRef.href, basePath)
      const subUrl = new URL(objRef.href, basePath)
      console.log('subUrl', subUrl)
      const subModel = await load(subUrl, this.viewer, () => {}, () => {}, () => {})
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

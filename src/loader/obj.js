import {BufferGeometry} from 'three'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils'


/**
 * @param {BufferGeometry} objGroup
 * @return {BufferGeometry}
 */
export default function objToThree(objGroup) {
  objGroup.children[0].geometry = mergeVertices(objGroup.children[0].geometry)
  objGroup.children[0].modelID = 0
  objGroup.mesh = objGroup.children[0]
  return objGroup
}

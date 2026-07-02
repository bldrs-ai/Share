import {BufferGeometry, Group, Mesh} from 'three'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {makeSurfaceMaterial} from '../viewer/lookMaterial'


/**
 * @param {BufferGeometry} stlGeometry
 * @return {Mesh}
 */
export default function stlToThree(stlGeometry) {
  stlGeometry = mergeVertices(stlGeometry)
  const mesh = new Mesh(
    stlGeometry,
    makeSurfaceMaterial({color: 0xabcdef}),
  )
  const root = new Group()
  root.add(mesh)
  mesh.modelID = 0
  root.mesh = mesh
  return root
}

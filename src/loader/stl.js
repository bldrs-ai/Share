import {BufferGeometry, Group, Mesh, MeshLambertMaterial} from 'three'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils'


/**
 * @param {BufferGeometry} stlGeometry
 * @return {Mesh}
 */
export default function stlToThree(stlGeometry) {
  stlGeometry = mergeVertices(stlGeometry)
  const mesh = new Mesh(
    stlGeometry,
    new MeshLambertMaterial({
      color: 0xabcdef,
    }),
  )
  const root = new Group()
  root.add(mesh)
  mesh.modelID = 0
  root.mesh = mesh
  return root
}

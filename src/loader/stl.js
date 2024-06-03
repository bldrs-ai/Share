import {BufferGeometry, Mesh, MeshLambertMaterial} from 'three'


/**
 * @param {BufferGeometry} stlGeometry
 * @return {Mesh}
 */
export default function stlToThree(stlGeometry) {
  return new Mesh(
    stlGeometry,
    new MeshLambertMaterial({
      color: 0xabcdef,
    }),
  )
}

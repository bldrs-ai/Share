import {BufferGeometry, Points, PointsMaterial} from 'three'


/**
 * @param {BufferGeometry} xyzGeometry
 * @return {Points}
 * @see https://threejs.org/examples/webgl_loader_xyz.html
 */
export default function xyzToThree(xyzGeometry) {
  return new Points(
    xyzGeometry,
    new PointsMaterial({
      size: 0.1,
      color: 0xabcdef,
    }),
  )
}

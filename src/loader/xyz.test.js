import {BufferAttribute, BufferGeometry, Points, PointsMaterial} from 'three'
import xyzToThree from './xyz'


/** @return {BufferGeometry} three-point cloud geometry */
function makePointCloud() {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return geometry
}


describe('loader/xyz', () => {
  it('wraps the geometry in a three.js Points object', () => {
    const result = xyzToThree(makePointCloud())
    expect(result).toBeInstanceOf(Points)
  })


  it('keeps the original geometry reference', () => {
    const geometry = makePointCloud()
    const result = xyzToThree(geometry)
    expect(result.geometry).toBe(geometry)
  })


  it('uses a PointsMaterial', () => {
    const result = xyzToThree(makePointCloud())
    expect(result.material).toBeInstanceOf(PointsMaterial)
  })
})

import {BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial} from 'three'
import stlToThree from './stl'


/** @return {BufferGeometry} minimal indexed geometry with a duplicate vertex */
function makeDedupableGeometry() {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 0, // duplicate of vertex 0
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 3, 1, 2])
  return geometry
}


describe('loader/stl', () => {
  it('wraps the geometry in a Group containing a single Mesh', () => {
    const root = stlToThree(makeDedupableGeometry())

    expect(root).toBeInstanceOf(Group)
    expect(root.children.length).toBe(1)
    expect(root.children[0]).toBeInstanceOf(Mesh)
  })


  it('tags the mesh with modelID=0 and exposes it as root.mesh', () => {
    const root = stlToThree(makeDedupableGeometry())

    expect(root.mesh).toBe(root.children[0])
    expect(root.children[0].modelID).toBe(0)
  })


  it('uses a MeshLambertMaterial', () => {
    const root = stlToThree(makeDedupableGeometry())
    expect(root.children[0].material).toBeInstanceOf(MeshLambertMaterial)
  })


  it('de-duplicates coincident vertices via mergeVertices', () => {
    const geometry = makeDedupableGeometry()
    expect(geometry.attributes.position.count).toBe(4)

    const root = stlToThree(geometry)
    expect(root.children[0].geometry.attributes.position.count).toBe(3)
  })
})

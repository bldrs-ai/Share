import {BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial} from 'three'
import objToThree from './obj'


/**
 * Build a minimal indexed BufferGeometry — four vertices where #0 and #3
 * are spatially identical so mergeVertices can de-duplicate them.
 *
 * @return {BufferGeometry}
 */
function makeDedupableGeometry() {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0, // 0
    1, 0, 0, // 1
    0, 1, 0, // 2
    0, 0, 0, // 3 -- duplicate of 0
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 3, 1, 2])
  return geometry
}


describe('loader/obj', () => {
  it('wires the first child as the group mesh and gives it modelID=0', () => {
    const group = new Group()
    const mesh = new Mesh(makeDedupableGeometry(), new MeshBasicMaterial())
    group.add(mesh)

    const result = objToThree(group)

    expect(result).toBe(group)
    expect(result.mesh).toBe(mesh)
    expect(result.children[0].modelID).toBe(0)
  })


  it('de-duplicates coincident vertices via mergeVertices', () => {
    const group = new Group()
    const mesh = new Mesh(makeDedupableGeometry(), new MeshBasicMaterial())
    group.add(mesh)

    expect(mesh.geometry.attributes.position.count).toBe(4)
    objToThree(group)
    // After merge the coincident vertex pair collapses to one.
    expect(group.children[0].geometry.attributes.position.count).toBe(3)
  })
})

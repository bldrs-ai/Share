import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three'
import {
  applySceneGraphVisibility,
  initiallyHiddenIds,
  isSceneGraphModel,
  sceneGraphElementIds,
} from './sceneGraphVisibility'


/**
 * An ADF-shaped scene graph, tagged the way `convertToShareModel` tags one:
 *
 *   root 0 ─ jaw 1 ─┬─ facc 2 (hidden by the loader) ─ curve 3
 *                   └─ teeth 4 ─┬─ tooth 5 ─ crown 6
 *                               └─ tooth 7 ─ crown 8
 *
 * Each crown is one triangle at the origin, facing +z, so a ray down −z
 * from above the origin hits both.
 *
 * @return {object} the root and the named nodes
 */
function makeModel() {
  const tag = (obj, id, name) => {
    obj.expressID = id
    obj.name = name
    return obj
  }
  const triangle = () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), 3))
    // convertToShareModel's single-entry placeholder, not per-vertex IDs.
    geometry.setAttribute('expressID', new BufferAttribute(new Int8Array(1), 1))
    return geometry
  }
  const root = tag(new Group(), 0, 'root')
  const jaw = tag(new Group(), 1, 'jaw')
  const facc = tag(new Group(), 2, 'facc')
  const curve = tag(new Line(triangle()), 3, 'curve')
  const teeth = tag(new Group(), 4, 'teeth')
  const tooth5 = tag(new Group(), 5, 'tooth5')
  const crown6 = tag(new Mesh(triangle(), new MeshBasicMaterial()), 6, 'crown6')
  const tooth7 = tag(new Group(), 7, 'tooth7')
  const crown8 = tag(new Mesh(triangle(), new MeshBasicMaterial()), 8, 'crown8')
  facc.visible = false
  facc.add(curve)
  tooth5.add(crown6)
  tooth7.add(crown8)
  teeth.add(tooth5, tooth7)
  jaw.add(facc, teeth)
  root.add(jaw)
  root.updateMatrixWorld(true)
  return {root, facc, curve, tooth5, crown6, tooth7, crown8}
}


/**
 * @param {object} root
 * @return {Array<string>} names of the meshes a ray down onto the origin hits
 */
function hits(root) {
  const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1))
  return ray.intersectObject(root, true).filter((hit) => hit.object.isMesh).map((hit) => hit.object.name).sort()
}


describe('viewer/three/sceneGraphVisibility', () => {
  it('recognizes a tagged scene graph, and nothing the subset or batch paths own', () => {
    expect(isSceneGraphModel(makeModel().root)).toBe(true)
    const withSubsets = makeModel().root
    withSubsets.createSubset = () => []
    expect(isSceneGraphModel(withSubsets)).toBe(false)
    const perVertex = makeModel()
    perVertex.crown6.geometry.setAttribute('expressID', new BufferAttribute(new Uint32Array([9, 9, 9]), 1))
    expect(isSceneGraphModel(perVertex.root)).toBe(false)
    const untagged = new Group()
    untagged.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()))
    expect(isSceneGraphModel(untagged)).toBe(false)
  })

  it('lists every element and the ones the loader left hidden', () => {
    const {root} = makeModel()
    expect(sceneGraphElementIds(root)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(initiallyHiddenIds(root)).toEqual([2])
  })

  it('hides one element without touching its siblings, and stops it taking picks', () => {
    const {root, crown6, crown8} = makeModel()
    expect(hits(root)).toEqual(['crown6', 'crown8'])
    applySceneGraphVisibility(root, {hiddenIds: [5, 6]})
    expect(crown6.visible).toBe(false)
    expect(crown8.visible).toBe(true)
    expect(hits(root)).toEqual(['crown8'])
    // Unhiding restores the object's own raycast, not a copy.
    const own = Mesh.prototype.raycast
    applySceneGraphVisibility(root, {hiddenIds: []})
    expect(crown6.visible).toBe(true)
    expect(crown6.raycast).toBe(own)
    expect(hits(root)).toEqual(['crown6', 'crown8'])
  })

  it('a hidden container stops its subtree taking picks too', () => {
    const {root, crown6} = makeModel()
    applySceneGraphVisibility(root, {hiddenIds: [5]})
    // The crown keeps its own flag; its container hides it.
    expect(crown6.visible).toBe(true)
    expect(hits(root)).toEqual(['crown8'])
  })

  it('isolates an element, keeping its containers shown and outlining its meshes', () => {
    const {root, facc, tooth5, crown6, tooth7, crown8} = makeModel()
    const outlined = applySceneGraphVisibility(root, {hiddenIds: [2, 3], isolatedIds: [6]})
    expect(outlined).toEqual([crown6])
    expect([root.visible, tooth5.visible, crown6.visible]).toEqual([true, true, true])
    expect([tooth7.visible, crown8.visible, facc.visible]).toEqual([false, false, false])
    expect(hits(root)).toEqual(['crown6'])
    // Isolating a container shows everything inside it.
    applySceneGraphVisibility(root, {hiddenIds: [], isolatedIds: [7]})
    expect([tooth7.visible, crown8.visible, tooth5.visible]).toEqual([true, true, false])
  })

  it('keeps a loader\'s own raycast override when a hidden overlay is shown', () => {
    const {root, curve} = makeModel()
    const loaderNoPick = () => {}
    curve.raycast = loaderNoPick
    applySceneGraphVisibility(root, {hiddenIds: [2, 3]})
    applySceneGraphVisibility(root, {hiddenIds: []})
    expect(curve.raycast).toBe(loaderNoPick)
  })
})

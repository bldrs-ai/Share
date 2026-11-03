import {Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, BoxGeometry, Vector2} from 'three'
import {
  LOAD_PREVIEW_GROUP_KEY,
  PREVIEW_BASE_MATERIAL_KEY,
  PREVIEW_EXPRESS_ID_KEY,
  loadPreviewGroups,
  paintPreviewSelection,
  pickPreviewExpressId,
} from './previewSelection'


/* eslint-disable no-magic-numbers */


/**
 * @param {number|undefined} id
 * @param {object} material
 * @param {number} [z] depth along -z, for raycast order
 * @return {Mesh} a preview-shaped mesh
 */
function previewMesh(id, material, z = -5) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
  mesh.position.set(0, 0, z)
  if (id !== undefined) {
    mesh.userData[PREVIEW_EXPRESS_ID_KEY] = id
  }
  return mesh
}


/**
 * @param {Array<Mesh>} meshes
 * @return {{scene: Scene, group: Group}} a scene holding one preview group
 */
function sceneWithPreview(meshes) {
  const scene = new Scene()
  const group = new Group()
  group.userData[LOAD_PREVIEW_GROUP_KEY] = true
  meshes.forEach((mesh) => group.add(mesh))
  scene.add(group)
  // Another top-level object, which is no preview.
  scene.add(new Group())
  return {scene, group}
}


describe('viewer/previewSelection', () => {
  it('finds the preview group among the scene children, and nothing in a scene without one', () => {
    const {scene, group} = sceneWithPreview([])
    expect(loadPreviewGroups(scene)).toEqual([group])
    expect(loadPreviewGroups(new Scene())).toEqual([])
    expect(loadPreviewGroups(null)).toEqual([])
    expect(loadPreviewGroups({add: () => undefined})).toEqual([])
  })

  describe('pickPreviewExpressId', () => {
    it('takes the nearest hit that names an element', () => {
      const material = new MeshBasicMaterial()
      const plate = previewMesh(undefined, material, -3)
      const near = previewMesh(11, material, -5)
      const far = previewMesh(22, material, -8)
      const {group} = sceneWithPreview([far, plate, near])
      group.updateMatrixWorld(true)
      const camera = new PerspectiveCamera()
      camera.updateMatrixWorld(true)
      const raycaster = new Raycaster()
      raycaster.setFromCamera(new Vector2(0, 0), camera)
      const hits = raycaster.intersectObjects([group])
      // The id-less plate is in front and is passed over.
      expect(hits[0].object).toBe(plate)
      expect(pickPreviewExpressId(hits)).toBe(11)
    })

    it('answers null for no hits or no named hit', () => {
      expect(pickPreviewExpressId([])).toBeNull()
      expect(pickPreviewExpressId(undefined)).toBeNull()
      expect(pickPreviewExpressId([{object: previewMesh(undefined, new MeshBasicMaterial())}])).toBeNull()
    })
  })

  describe('paintPreviewSelection', () => {
    it('paints every preview mesh of the selected element, and restores them when deselected', () => {
      const red = new MeshBasicMaterial({color: 0xff0000})
      const blue = new MeshBasicMaterial({color: 0x0000ff})
      const selection = new MeshBasicMaterial({color: 0x00ffff})
      const a1 = previewMesh(1, red)
      const a2 = previewMesh(1, blue)
      const b = previewMesh(2, red)
      const plate = previewMesh(undefined, red)
      const {scene} = sceneWithPreview([a1, a2, b, plate])

      expect(paintPreviewSelection(scene, ['1'], selection)).toBe(2)
      expect(a1.material).toBe(selection)
      expect(a2.material).toBe(selection)
      expect(a1.userData[PREVIEW_BASE_MATERIAL_KEY]).toBe(red)
      expect(a2.userData[PREVIEW_BASE_MATERIAL_KEY]).toBe(blue)
      // The pooled material itself is untouched: b still shows its own red.
      expect(b.material).toBe(red)
      expect(red.color.getHex()).toBe(0xff0000)
      expect(plate.material).toBe(red)

      // Painting again keeps the original, not the selection material.
      expect(paintPreviewSelection(scene, [1, 2], selection)).toBe(3)
      expect(a1.userData[PREVIEW_BASE_MATERIAL_KEY]).toBe(red)

      expect(paintPreviewSelection(scene, [], selection)).toBe(0)
      expect(a1.material).toBe(red)
      expect(a2.material).toBe(blue)
      expect(b.material).toBe(red)
      expect(a1.userData[PREVIEW_BASE_MATERIAL_KEY]).toBeUndefined()
    })

    it('without a selection material restores what is painted and paints nothing', () => {
      const red = new MeshBasicMaterial()
      const selection = new MeshBasicMaterial()
      const mesh = previewMesh(1, red)
      const {scene} = sceneWithPreview([mesh])
      paintPreviewSelection(scene, [1], selection)
      expect(paintPreviewSelection(scene, [1], null)).toBe(0)
      expect(mesh.material).toBe(red)
    })
  })
})

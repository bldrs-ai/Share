import {Scene, Mesh, Group, BoxGeometry, MeshBasicMaterial} from 'three'
import {findMeshesByElementIds, findMeshesByExpressIds} from './selectionUtils'


describe('selectionUtils', () => {
  describe('findMeshesByElementIds', () => {
    let scene
    const EXPRESS_ID_1 = 1
    const EXPRESS_ID_2 = 2
    const EXPRESS_ID_3 = 3
    const EXPRESS_ID_10 = 10
    const EXPRESS_ID_20 = 20
    const EXPRESS_ID_99 = 99
    const EXPRESS_ID_100 = 100

    beforeEach(() => {
      scene = new Scene()
    })

    it('should return empty array for empty elementIds', () => {
      const result = findMeshesByElementIds(scene, [])
      expect(result).toEqual([])
    })

    it('should return empty array for null scene', () => {
      const result = findMeshesByElementIds(null, [EXPRESS_ID_1, EXPRESS_ID_2, EXPRESS_ID_3])
      expect(result).toEqual([])
    })

    it('should return empty array for undefined elementIds', () => {
      const result = findMeshesByElementIds(scene, undefined)
      expect(result).toEqual([])
    })

    it('should find meshes with matching expressIDs', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1
      const mesh2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh2.expressID = EXPRESS_ID_2
      const mesh3 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh3.expressID = EXPRESS_ID_3

      scene.add(mesh1)
      scene.add(mesh2)
      scene.add(mesh3)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_1, EXPRESS_ID_3])
      expect(result).toHaveLength(2)
      expect(result).toContain(mesh1)
      expect(result).toContain(mesh3)
      expect(result).not.toContain(mesh2)
    })

    it('should find meshes nested in groups', () => {
      const group = new Group()
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_10
      const mesh2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh2.expressID = EXPRESS_ID_20

      group.add(mesh1)
      group.add(mesh2)
      scene.add(group)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_10, EXPRESS_ID_20])
      expect(result).toHaveLength(2)
      expect(result).toContain(mesh1)
      expect(result).toContain(mesh2)
    })

    it('should ignore meshes without expressID', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1
      const mesh2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      // mesh2 has no expressID

      scene.add(mesh1)
      scene.add(mesh2)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_1, EXPRESS_ID_2])
      expect(result).toHaveLength(1)
      expect(result).toContain(mesh1)
      expect(result).not.toContain(mesh2)
    })

    it('should ignore non-mesh objects', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1
      const group = new Group()
      group.expressID = EXPRESS_ID_2 // Groups can have expressID but aren't meshes

      scene.add(mesh1)
      scene.add(group)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_1, EXPRESS_ID_2])
      expect(result).toHaveLength(1)
      expect(result).toContain(mesh1)
      expect(result).not.toContain(group)
    })

    it('should work with deprecated findMeshesByExpressIds alias', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1

      scene.add(mesh1)

      const result = findMeshesByExpressIds(scene, [EXPRESS_ID_1])
      expect(result).toHaveLength(1)
      expect(result).toContain(mesh1)
    })

    it('should handle duplicate expressIDs in search array', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1

      scene.add(mesh1)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_1, EXPRESS_ID_1, EXPRESS_ID_1])
      expect(result).toHaveLength(1)
      expect(result).toContain(mesh1)
    })

    it('should return empty array when no meshes match', () => {
      const mesh1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
      mesh1.expressID = EXPRESS_ID_1

      scene.add(mesh1)

      const result = findMeshesByElementIds(scene, [EXPRESS_ID_99, EXPRESS_ID_100])
      expect(result).toEqual([])
    })
  })
})


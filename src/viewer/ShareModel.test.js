import {BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Object3D} from 'three'
import {
  capabilitiesForFormat,
  decorateShareModel,
  getMeshMaterials,
  inferModelCapabilities,
  modelHasCapability,
  modelHasUnstructuredMeshClipper,
} from './ShareModel'


describe('viewer/ShareModel', () => {
  describe('capabilitiesForFormat', () => {
    it.each(['ifc', 'step', 'stp'])('treats %s as full IFC capability set', (format) => {
      const caps = capabilitiesForFormat(format)
      expect(caps).toEqual({
        expressIdPicking: true,
        spatialStructure: true,
        typedProperties: true,
        ifcSubsets: true,
        // off by default; Loader's Conway-direct path flips it on after
        // attaching an IfcInstanceMap.
        instancePicking: false,
        useIfcClipper: true,
      })
    })

    it.each(['glb', 'gltf', 'obj', 'stl', 'pdb', 'xyz', 'fbx', 'bld'])(
      'treats %s as unstructured mesh (no IFC capabilities)',
      (format) => {
        const caps = capabilitiesForFormat(format)
        expect(caps.expressIdPicking).toBe(false)
        expect(caps.spatialStructure).toBe(false)
        expect(caps.typedProperties).toBe(false)
        expect(caps.ifcSubsets).toBe(false)
        expect(caps.instancePicking).toBe(false)
        expect(caps.useIfcClipper).toBe(false)
      },
    )

    it('returns all-false for an unknown format', () => {
      const caps = capabilitiesForFormat('xxx-unknown')
      expect(Object.values(caps).every((v) => v === false)).toBe(true)
    })
  })

  describe('decorateShareModel', () => {
    it('attaches format and capabilities to the model', () => {
      const model = new Object3D()
      decorateShareModel(model, 'ifc')
      expect(model.format).toBe('ifc')
      expect(model.capabilities.expressIdPicking).toBe(true)
    })

    it('is idempotent — running twice does not corrupt state', () => {
      const model = new Object3D()
      decorateShareModel(model, 'glb')
      decorateShareModel(model, 'glb')
      expect(model.capabilities.useIfcClipper).toBe(false)
    })

    it('does not throw on a null model', () => {
      expect(() => decorateShareModel(null, 'ifc')).not.toThrow()
    })

    it('leaves legacy fields untouched', () => {
      const model = new Object3D()
      model.type = 'Object3D'
      model.mimeType = 'glb'
      decorateShareModel(model, 'glb')
      expect(model.type).toBe('Object3D')
      expect(model.mimeType).toBe('glb')
    })
  })

  describe('modelHasCapability', () => {
    it('returns the capability when present', () => {
      const model = decorateShareModel(new Object3D(), 'ifc')
      expect(modelHasCapability(model, 'expressIdPicking')).toBe(true)
      expect(modelHasCapability(model, 'useIfcClipper')).toBe(true)
    })

    it('returns false when the capability is off', () => {
      const model = decorateShareModel(new Object3D(), 'glb')
      expect(modelHasCapability(model, 'expressIdPicking')).toBe(false)
    })

    it('returns false for a missing model', () => {
      expect(modelHasCapability(null, 'expressIdPicking')).toBe(false)
      expect(modelHasCapability(undefined, 'expressIdPicking')).toBe(false)
    })

    it('returns false for a model that has not been decorated', () => {
      const model = new Object3D()
      expect(modelHasCapability(model, 'expressIdPicking')).toBe(false)
    })
  })

  describe('inferModelCapabilities', () => {
    /**
     * @param {string} [attrName]
     * @param {number} [count]
     * @return {Mesh}
     */
    function makeMeshWithIdAttr(attrName = 'expressID', count = 3) {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
      geom.setAttribute(attrName, new BufferAttribute(new Int32Array(count), 1))
      return new Mesh(geom)
    }

    it('promotes expressIdPicking when any mesh has per-vertex expressID', () => {
      const root = new Group()
      root.add(makeMeshWithIdAttr())
      const caps = inferModelCapabilities(root)
      expect(caps.expressIdPicking).toBe(true)
    })

    it('does not promote on a single-vertex (count===1) attribute (mesh-level fallback)', () => {
      const caps = inferModelCapabilities(makeMeshWithIdAttr('expressID', 1))
      expect(caps.expressIdPicking).toBeUndefined()
    })

    it('returns empty object when no mesh carries the attribute', () => {
      const root = new Group()
      const mesh = new Mesh(new BufferGeometry())
      root.add(mesh)
      expect(inferModelCapabilities(root)).toEqual({})
    })

    it('supports a custom attribute name for non-IFC formats', () => {
      const root = makeMeshWithIdAttr('_FEATURE_ID_0', 3)
      const caps = inferModelCapabilities(root, {attrName: '_FEATURE_ID_0'})
      expect(caps.expressIdPicking).toBe(true)
    })

    it('does not throw on null / non-Object3D inputs', () => {
      expect(() => inferModelCapabilities(null)).not.toThrow()
      expect(inferModelCapabilities(null)).toEqual({})
      expect(inferModelCapabilities({})).toEqual({})
    })

    /**
     * Build a mesh with both `expressID` and `instanceID` per-vertex
     * attributes — the shape a cache-hit GLB carries after the
     * Conway-direct round-trip.
     *
     * @param {number} [count]
     * @return {Mesh}
     */
    function makeMeshWithBothIdAttrs(count = 3) {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int32Array(count), 1))
      geom.setAttribute('instanceID', new BufferAttribute(new Int32Array(count), 1))
      return new Mesh(geom)
    }

    it('promotes instancePicking when per-vertex instanceID is present', () => {
      const root = new Group()
      root.add(makeMeshWithBothIdAttrs())
      const caps = inferModelCapabilities(root)
      expect(caps.expressIdPicking).toBe(true)
      expect(caps.instancePicking).toBe(true)
    })

    it('leaves instancePicking off when only expressID is present', () => {
      // Today's pre-Conway-direct GLB cache shape. Element-level
      // picking works (createSubset via attachElementSubsets); per-
      // instance picking does not.
      const caps = inferModelCapabilities(makeMeshWithIdAttr('expressID', 5))
      expect(caps.expressIdPicking).toBe(true)
      expect(caps.instancePicking).toBeUndefined()
    })

    it('leaves instancePicking off on a single-vertex (count===1) attribute', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int32Array(1), 1))
      geom.setAttribute('instanceID', new BufferAttribute(new Int32Array(1), 1))
      const caps = inferModelCapabilities(new Mesh(geom))
      expect(caps.expressIdPicking).toBeUndefined()
      expect(caps.instancePicking).toBeUndefined()
    })

    it('promotes spatialStructure when userData carries a BLDRS_spatial_tree payload', () => {
      // Mirrors what `BldrsSpatialTreeReader#afterRoot` (the cache-hit
      // path) attaches: a decoded IFC tree on the model's root userData.
      // `Loader.js#convertToShareModel` then hangs `model.getSpatialStructure`
      // off it. `inferModelCapabilities` doesn't need the consumer wiring
      // to be in place to flip the flag — the presence of the payload
      // alone is the signal.
      const root = new Group()
      root.userData.bldrsSpatialTree = {
        expressID: 1, type: 'IFCPROJECT', Name: {value: 'P'}, children: [],
      }
      const caps = inferModelCapabilities(root)
      expect(caps.spatialStructure).toBe(true)
    })

    it('leaves spatialStructure undefined when no BLDRS_spatial_tree is present', () => {
      const root = new Group()
      const caps = inferModelCapabilities(root)
      expect(caps.spatialStructure).toBeUndefined()
    })

    it('promotes typedProperties when userData carries a BLDRS_element_properties payload', () => {
      // Mirrors what `BldrsElementPropertiesReader#afterRoot` parks: a
      // `{compressed, decode}` lazy-decode object on userData.
      // `Loader.js#convertToShareModel` hangs `getItemProperties` /
      // `getPropertySets` off it. Capability flip is independent of
      // the consumer wiring — presence of the payload is the signal.
      const root = new Group()
      root.userData.bldrsElementProperties = {
        compressed: new Uint8Array([0]),
        decode: () => ({itemProperties: {}, propertySets: {}}),
      }
      const caps = inferModelCapabilities(root)
      expect(caps.typedProperties).toBe(true)
    })

    it('leaves typedProperties undefined when no BLDRS_element_properties is present', () => {
      const root = new Group()
      const caps = inferModelCapabilities(root)
      expect(caps.typedProperties).toBeUndefined()
    })
  })

  describe('modelHasUnstructuredMeshClipper', () => {
    it.each(['glb', 'gltf'])('returns true for %s', (format) => {
      const model = decorateShareModel(new Object3D(), format)
      expect(modelHasUnstructuredMeshClipper(model)).toBe(true)
    })

    it.each(['ifc', 'step', 'stp', 'stl', 'obj', 'pdb', 'xyz', 'fbx', 'bld'])(
      'returns false for %s — preserves original IFC.type === glb/gltf semantic',
      (format) => {
        const model = decorateShareModel(new Object3D(), format)
        expect(modelHasUnstructuredMeshClipper(model)).toBe(false)
      },
    )

    it('returns false for null/undefined/undecorated', () => {
      expect(modelHasUnstructuredMeshClipper(null)).toBe(false)
      expect(modelHasUnstructuredMeshClipper(undefined)).toBe(false)
      expect(modelHasUnstructuredMeshClipper(new Object3D())).toBe(false)
    })
  })


  describe('getMeshMaterials', () => {
    it('wraps a single material in a length-1 array', () => {
      const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
      const mats = getMeshMaterials(mesh)
      expect(mats.length).toBe(1)
      expect(mats[0]).toBe(mesh.material)
    })

    it('returns the array as-is when material is already an array', () => {
      const a = new MeshBasicMaterial()
      const b = new MeshBasicMaterial()
      const mesh = new Mesh(new BufferGeometry(), [a, b])
      const mats = getMeshMaterials(mesh)
      expect(mats).toEqual([a, b])
    })

    it('returns empty array when mesh has no material', () => {
      const mesh = new Mesh(new BufferGeometry(), null)
      expect(getMeshMaterials(mesh)).toEqual([])
    })

    it('safe on null / undefined / non-mesh inputs', () => {
      expect(getMeshMaterials(null)).toEqual([])
      expect(getMeshMaterials(undefined)).toEqual([])
      expect(getMeshMaterials({})).toEqual([])
      expect(getMeshMaterials(new Object3D())).toEqual([])
    })
  })
})

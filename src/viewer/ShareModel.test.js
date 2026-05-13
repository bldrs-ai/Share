import {Object3D} from 'three'
import {
  capabilitiesForFormat,
  decorateShareModel,
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
})

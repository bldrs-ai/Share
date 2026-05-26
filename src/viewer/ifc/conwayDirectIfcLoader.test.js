// Unit tests for the Conway-direct IFC parse path (Slice 5b of
// design/new/viewer-replacement.md). Covers `parseIfcWithConway`
// (OpenModel + StreamAllMeshes capture) + the property-method
// closures `decorateConwayDirectIfcModel` attaches.
//
// `decorateConwayDirectIfcModel`'s BVH + IfcInstanceMap wiring is
// exercised through the existing integration tests in
// `Loader.test.js` (full load pipeline) — this file pins the
// pieces that don't need a real BufferGeometry to validate.

import {Mesh} from 'three'
import {
  decorateConwayDirectIfcModel,
  parseIfcWithConway,
} from './conwayDirectIfcLoader'


/* eslint-disable no-magic-numbers */
describe('viewer/ifc/conwayDirectIfcLoader', () => {
  describe('parseIfcWithConway', () => {
    it('returns the modelID + captured FlatMeshes from a single Conway OpenModel + StreamAllMeshes pass', () => {
      const fakeFlatMesh1 = {expressID: 42, geometries: {size: () => 0}}
      const fakeFlatMesh2 = {expressID: 43, geometries: {size: () => 0}}
      const ifcAPI = {
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn((modelID, cb) => {
          cb(fakeFlatMesh1)
          cb(fakeFlatMesh2)
        }),
      }
      const buffer = new ArrayBuffer(8)
      const result = parseIfcWithConway(buffer, ifcAPI)
      expect(result.modelID).toBe(0)
      expect(result.captured).toEqual([fakeFlatMesh1, fakeFlatMesh2])
      // OpenModel called with a Uint8Array view of the buffer + the
      // default settings (COORDINATE_TO_ORIGIN matches what wit-three's
      // `applyWebIfcConfig` was setting before Slice 5b).
      expect(ifcAPI.OpenModel).toHaveBeenCalledTimes(1)
      const [data, settings] = ifcAPI.OpenModel.mock.calls[0]
      expect(data).toBeInstanceOf(Uint8Array)
      expect(settings).toEqual({COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true})
    })

    it('accepts a Uint8Array buffer directly without re-wrapping', () => {
      const ifcAPI = {
        OpenModel: jest.fn(() => 1),
        StreamAllMeshes: jest.fn(),
      }
      const bytes = new Uint8Array([1, 2, 3])
      parseIfcWithConway(bytes, ifcAPI)
      // The Uint8Array passed to OpenModel should be the same
      // reference we handed in — re-wrapping would lose buffer
      // ownership semantics for callers that rely on it.
      expect(ifcAPI.OpenModel.mock.calls[0][0]).toBe(bytes)
    })

    it('throws when the IfcAPI lacks OpenModel', () => {
      expect(() => parseIfcWithConway(new ArrayBuffer(0), {})).toThrow(
        /OpenModel is unavailable/)
    })

    it('throws when the IfcAPI lacks StreamAllMeshes', () => {
      expect(() => parseIfcWithConway(new ArrayBuffer(0), {
        OpenModel: () => 0,
      })).toThrow(/StreamAllMeshes is unavailable/)
    })

    it('throws when OpenModel returns a negative modelID (Conway parse failure)', () => {
      const ifcAPI = {
        OpenModel: jest.fn(() => -1),
        StreamAllMeshes: jest.fn(),
      }
      expect(() => parseIfcWithConway(new ArrayBuffer(0), ifcAPI)).toThrow(
        /OpenModel returned -1/)
      expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
    })

    it('forwards custom settings to OpenModel when provided', () => {
      const ifcAPI = {
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn(),
      }
      const settings = {COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: false}
      parseIfcWithConway(new ArrayBuffer(0), ifcAPI, settings)
      expect(ifcAPI.OpenModel.mock.calls[0][1]).toBe(settings)
    })
  })

  describe('decorateConwayDirectIfcModel — property-method closures', () => {
    /** @return {object} minimal Conway IfcAPI stub */
    function makeIfcAPI() {
      return {
        properties: {
          getItemProperties: jest.fn(),
          getPropertySets: jest.fn(),
          getSpatialStructure: jest.fn(),
          getIfcType: jest.fn(),
        },
      }
    }

    it('attaches getItemProperties bound to the model\'s modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({expressID: 42, Name: {value: 'Wall'}})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 7)
      const props = await ifcModel.getItemProperties(42)
      expect(props.Name.value).toBe('Wall')
      // The model's bound modelID (7) flows through — consumers don't
      // pass it.
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(7, 42, false)
    })

    it('forwards recursive arg to getItemProperties', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getItemProperties(42, true)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(0, 42, true)
    })

    it('attaches getPropertySets bound to the model\'s modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getPropertySets.mockResolvedValue([{Name: 'Pset_WallCommon'}])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 3)
      const psets = await ifcModel.getPropertySets(42)
      expect(psets).toHaveLength(1)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })

    it('getSpatialStructure accepts (modelID, withProperties) — the manager-shape call site', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100, children: []})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      // Two-arg call (CadView.jsx / IfcIsolator.js shape). The
      // leading arg is ignored — the bound modelID is used instead.
      await ifcModel.getSpatialStructure(0, true)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(0, true)
    })

    it('getSpatialStructure accepts a single boolean arg — the cache-hit closure shape', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getSpatialStructure(true)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(0, true)
    })

    it('getIfcType resolves the entity\'s type via getItemProperties + Conway\'s type map', async () => {
      const ifcAPI = makeIfcAPI()
      const IFCWALL_TYPE_CODE = 2391406946
      ifcAPI.properties.getItemProperties.mockResolvedValue({type: IFCWALL_TYPE_CODE})
      ifcAPI.properties.getIfcType.mockImplementation(
        (code) => (code === IFCWALL_TYPE_CODE ? 'IFCWALL' : null))
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      const typeName = await ifcModel.getIfcType(42)
      expect(typeName).toBe('IFCWALL')
    })

    it('getIfcType caches per-expressID so bulk reads don\'t re-fetch', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({type: 1})
      ifcAPI.properties.getIfcType.mockReturnValue('IFCTYPE')
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getIfcType(42)
      await ifcModel.getIfcType(42)
      await ifcModel.getIfcType(42)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledTimes(1)
    })

    it('getIfcType returns null + caches when getItemProperties throws', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockRejectedValue(new Error('parse error'))
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(await ifcModel.getIfcType(42)).toBe(null)
      // Cached — subsequent calls don't re-throw.
      expect(await ifcModel.getIfcType(42)).toBe(null)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledTimes(1)
    })

    it('sets capabilities flips: ifcSubsets false, instancePicking + expressIdPicking true', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.capabilities.ifcSubsets).toBe(false)
      expect(ifcModel.capabilities.instancePicking).toBe(true)
      expect(ifcModel.capabilities.expressIdPicking).toBe(true)
    })

    it('binds modelID on the model', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 17)
      expect(ifcModel.modelID).toBe(17)
    })
  })
})

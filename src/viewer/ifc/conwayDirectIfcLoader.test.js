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
    it('returns the modelID + captured FlatMeshes from a single Conway OpenModel + StreamAllMeshes pass', async () => {
      const fakeFlatMesh1 = {expressID: 42, geometries: {size: () => 0}}
      const fakeFlatMesh2 = {expressID: 43, geometries: {size: () => 0}}
      const ifcAPI = {
        wasmModule: {}, // already initialised — skips the Init branch
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn((modelID, cb) => {
          cb(fakeFlatMesh1)
          cb(fakeFlatMesh2)
        }),
      }
      const buffer = new ArrayBuffer(8)
      const result = await parseIfcWithConway(buffer, ifcAPI)
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

    it('accepts a Uint8Array buffer directly without re-wrapping', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => 1),
        StreamAllMeshes: jest.fn(),
      }
      const bytes = new Uint8Array([1, 2, 3])
      await parseIfcWithConway(bytes, ifcAPI)
      // The Uint8Array passed to OpenModel should be the same
      // reference we handed in — re-wrapping would lose buffer
      // ownership semantics for callers that rely on it.
      expect(ifcAPI.OpenModel.mock.calls[0][0]).toBe(bytes)
    })

    it('lazily Inits Conway when wasmModule is undefined — first-load dance', async () => {
      // Regression pin: pre-Slice-5b wit-three's `IFCLoader.parse`
      // did `if (wasmModule === undefined) await Init()`. We dropped
      // that call site; without re-doing it here, `OpenModel`
      // returns -1 on the first cache-miss load of any session.
      // Verified live on a fresh-page IFC load.
      const initOrder = []
      const ifcAPI = {
        wasmModule: undefined,
        // Returns a Promise but no actual await needed; eslint
        // require-await doesn't fire on explicit `Promise.resolve()`.
        Init: jest.fn(() => {
          initOrder.push('init')
          ifcAPI.wasmModule = {ready: true}
          return Promise.resolve()
        }),
        OpenModel: jest.fn(() => {
          initOrder.push('openModel')
          return 0
        }),
        StreamAllMeshes: jest.fn(),
      }
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI)
      expect(ifcAPI.Init).toHaveBeenCalledTimes(1)
      // Order matters: Init must complete before OpenModel runs.
      expect(initOrder).toEqual(['init', 'openModel'])
    })

    it('skips Init when wasmModule is already present', async () => {
      const ifcAPI = {
        wasmModule: {ready: true},
        Init: jest.fn(),
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn(),
      }
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI)
      expect(ifcAPI.Init).not.toHaveBeenCalled()
    })

    it('throws when the IfcAPI lacks OpenModel', async () => {
      await expect(parseIfcWithConway(new ArrayBuffer(0), {})).rejects.toThrow(
        /OpenModel is unavailable/)
    })

    it('throws when the IfcAPI lacks StreamAllMeshes', async () => {
      await expect(parseIfcWithConway(new ArrayBuffer(0), {
        OpenModel: () => 0,
      })).rejects.toThrow(/StreamAllMeshes is unavailable/)
    })

    it('throws when OpenModel returns a negative modelID (Conway parse failure)', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => -1),
        StreamAllMeshes: jest.fn(),
      }
      await expect(parseIfcWithConway(new ArrayBuffer(0), ifcAPI)).rejects.toThrow(
        /OpenModel returned -1/)
      expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
    })

    it('forwards custom settings to OpenModel when provided', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn(),
      }
      const settings = {COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: false}
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI, settings)
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

    it('getSpatialStructure passes Conway\'s \'names\' mode through un-coerced', async () => {
      // Regression pin: 'names' must reach Conway as the string, not be
      // boolean-coerced — a truthy coercion would silently upgrade the
      // light Name/LongName/GlobalId walk back to the full-record visit
      // that 'names' mode exists to avoid (CadView.jsx load path).
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 7)
      // Two-arg manager shape (CadView.jsx): (modelID, 'names').
      await ifcModel.getSpatialStructure(0, 'names')
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(7, 'names')
      // Single-arg cache-hit closure shape: ('names').
      await ifcModel.getSpatialStructure('names')
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenLastCalledWith(7, 'names')
    })

    it('getIfcType is an identity over the spatial-tree node\'s string type', () => {
      // Regression pin: SearchIndex (`src/search/SearchIndex.js#indexElement`)
      // calls `Ifc.getType(model, elt)` → `model.properties.getIfcType(elt.type)`
      // where `model = {properties: m}` and `elt` is a spatial-tree node.
      // Conway's `properties.getSpatialStructure` returns nodes with `.type`
      // already set to the IFC string (e.g. 'IFCWALL'), so the model-level
      // `getIfcType` is the identity — matches Loader.js#convertToShareModel's
      // cache-hit closure shape. An async / Promise-returning impl here would
      // crash SearchIndex's `key.toLowerCase()`.
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.getIfcType('IFCWALL')).toBe('IFCWALL')
      expect(ifcModel.getIfcType('IFCBUILDINGSTOREY')).toBe('IFCBUILDINGSTOREY')
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

    it('attaches an ifcManager shim — passes the !m.ifcManager IFC-discriminator check', () => {
      // Regression pin: `CadView.jsx#onModel` early-returns when
      // `!m.ifcManager`. Without this shim, the Conway-direct mesh
      // would be treated as a non-IFC model and `setRootElement`
      // would never fire — NavTree stays empty + selection effects
      // skip.
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.ifcManager).toBeTruthy()
      expect(ifcModel.ifcManager.ifcAPI).toBe(ifcAPI)
    })

    it('ifcManager shim routes getSpatialStructure to Conway with the bound modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 5)
      // IfcIsolator.js shape: `model.ifcManager.getSpatialStructure(0, false)`.
      // The leading arg is ignored; the bound modelID (5) flows through.
      await ifcModel.ifcManager.getSpatialStructure(0, false)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(5, false)
    })

    it('ifcManager shim routes getItemProperties + getPropertySets to Conway', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({Name: {value: 'X'}})
      ifcAPI.properties.getPropertySets.mockResolvedValue([])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 3)
      await ifcModel.ifcManager.getItemProperties(0, 42, false)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(3, 42, false)
      await ifcModel.ifcManager.getPropertySets(0, 42, false)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })
  })
})

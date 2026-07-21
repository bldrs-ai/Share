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

// Controllable flag surface: defaults to "everything off" (matching
// the real module for every flag these tests touch except
// `streamOpen`, whose default-on is pinned separately against the
// real module below). The open-path tests flip it per case.
const mockIsFeatureEnabled = jest.fn()
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))


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

    describe('demandGeometry deferred open + batch pump (slice A)', () => {
      beforeEach(() => mockIsFeatureEnabled.mockReset())
      afterAll(() => mockIsFeatureEnabled.mockReset())

      /**
       * @param {number} products total products the fake engine holds
       * @return {object} IfcAPI stub with the deferred pump surface
       */
      function makeDemandAPI(products) {
        let cursor = 0
        return {
          wasmModule: {},
          OpenModelStreamed: jest.fn(() => Promise.resolve(5)),
          OpenModelAsync: jest.fn(() => Promise.resolve(8)),
          OpenModel: jest.fn(() => 9),
          StreamAllMeshes: jest.fn(),
          ExtractGeometryBatch: jest.fn((modelID, batchSize, cb) => {
            const take = Math.min(batchSize, products - cursor)
            for (let i = 0; i < take; i++) {
              cb({expressID: 1000 + cursor + i, geometries: {size: () => 1}})
            }
            cursor += take
            return {extracted: take, remaining: products - cursor}
          }),
        }
      }

      it('opens deferred and pumps batches to completion', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        const batches = []
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, (batch) => batches.push(batch.length))
        expect(result.modelID).toBe(5)
        // Deferred settings rode the open.
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.DEFER_GEOMETRY).toBe(true)
        // 150 products in batches of 64 → 3 extraction rounds; all
        // meshes accumulate AND stream incrementally.
        expect(result.captured).toHaveLength(150)
        expect(batches).toEqual([64, 64, 22])
        // The one-shot capture path is not used on this branch.
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
      })

      it('falls through to the classic selection when the engine lacks the pump', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        delete ifcAPI.ExtractGeometryBatch
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        // Classic streamed open (no defer), one-shot capture.
        expect(result.modelID).toBe(5)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings?.DEFER_GEOMETRY).toBeUndefined()
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })

      it('stays on the classic path when the flag is off', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(ifcAPI.ExtractGeometryBatch).not.toHaveBeenCalled()
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })

      it('disableStreamOpen also disables the demand path', async () => {
        mockIsFeatureEnabled.mockImplementation(
          (name) => name === 'demandGeometry' || name === 'disableStreamOpen')
        const ifcAPI = makeDemandAPI(10)
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        // Full classic fallback: OpenModelAsync, not the deferred open.
        expect(result.modelID).toBe(8)
        expect(ifcAPI.ExtractGeometryBatch).not.toHaveBeenCalled()
      })

      it('demandGeometry flag exists (temporarily default-on for branch burn-in)', () => {
        // Default-off is the mainline contract; this branch flips it on so
        // DnD loads (which can't carry ?feature=) exercise the demand path.
        // Restore the isActive=false assertion before merging to main.
        const {flags} = jest.requireActual('../../FeatureFlags')
        const flag = flags.find((f) => f.name === 'demandGeometry')
        expect(flag).toBeDefined()
        expect(flag.isActive).toBe(true)
      })

      it('threads onPreviewMesh into the deferred open as ON_PREVIEW_MESH (slice A2)', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        const onPreviewMesh = jest.fn()
        await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, undefined, onPreviewMesh)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.DEFER_GEOMETRY).toBe(true)
        expect(settings.ON_PREVIEW_MESH).toBe(onPreviewMesh)
      })

      it('omits ON_PREVIEW_MESH when no preview callback is given', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.ON_PREVIEW_MESH).toBeUndefined()
      })
    })

    describe('open-path selection (disableStreamOpen flag)', () => {
      // Share's jest config doesn't clearMocks, so a per-test
      // implementation would otherwise leak into later tests — reset to
      // the default (everything off) around this block.
      beforeEach(() => mockIsFeatureEnabled.mockReset())
      afterAll(() => mockIsFeatureEnabled.mockReset())

      /** @return {object} IfcAPI stub exposing all three open entries */
      function makeTriplePathAPI() {
        return {
          wasmModule: {},
          OpenModelStreamed: jest.fn(() => Promise.resolve(7)),
          OpenModelAsync: jest.fn(() => Promise.resolve(8)),
          OpenModel: jest.fn(() => 9),
          StreamAllMeshes: jest.fn(),
        }
      }

      it('disableStreamOpen exists and defaults to off in FeatureFlags', () => {
        // The mock above hides the real module from the loader; this
        // pins the shipped default (streaming ON) so a prod kill-switch
        // flip is a deliberate diff here too. The flag is inverted
        // because `?feature=` can only turn flags on — the runtime
        // escape hatch for a default-on behavior must be an off-flag.
        const {flags} = jest.requireActual('../../FeatureFlags')
        const flag = flags.find((f) => f.name === 'disableStreamOpen')
        expect(flag).toBeDefined()
        expect(flag.isActive).toBe(false)
      })

      it('prefers OpenModelStreamed by default (no flags set)', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(7)
        expect(ifcAPI.OpenModelStreamed).toHaveBeenCalledTimes(1)
        const [data, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(data).toBeInstanceOf(Uint8Array)
        expect(settings).toEqual({COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true})
        expect(ifcAPI.OpenModelAsync).not.toHaveBeenCalled()
        expect(ifcAPI.OpenModel).not.toHaveBeenCalled()
      })

      it('falls back to OpenModelAsync when the engine predates OpenModelStreamed', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        delete ifcAPI.OpenModelStreamed
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(8)
        expect(ifcAPI.OpenModelAsync).toHaveBeenCalledTimes(1)
        expect(ifcAPI.OpenModel).not.toHaveBeenCalled()
      })

      it('disableStreamOpen reverts to OpenModelAsync, even with OpenModelStreamed present', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'disableStreamOpen')
        const ifcAPI = makeTriplePathAPI()
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(8)
        expect(ifcAPI.OpenModelStreamed).not.toHaveBeenCalled()
        expect(ifcAPI.OpenModelAsync).toHaveBeenCalledTimes(1)
      })

      it('throws when OpenModelStreamed reports failure (-1)', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        ifcAPI.OpenModelStreamed = jest.fn(() => Promise.resolve(-1))
        await expect(parseIfcWithConway(new ArrayBuffer(4), ifcAPI)).rejects.toThrow(
          /OpenModel returned -1/)
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
      })
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
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(0, true, {includeSolids: true})
    })

    it('getSpatialStructure accepts a single boolean arg — the cache-hit closure shape', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getSpatialStructure(true)
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(0, true, {includeSolids: true})
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
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(7, 'names', {includeSolids: true})
      // Single-arg cache-hit closure shape: ('names').
      await ifcModel.getSpatialStructure('names')
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenLastCalledWith(7, 'names', {includeSolids: true})
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

// The model's reads over its Engine, and the merged model's decoration
// (model/engineModelReads.js; layering.md §7 "1a"). Over a real ConwayEngine
// wrapping a Conway IfcAPI stub, so what reaches Conway, and with which
// model's handle, is what is asserted: the engine adds no argument of its own
// and drops none.
//
// `decorateConwayDirectIfcModel`'s BVH + IfcInstanceMap wiring is exercised
// through the integration tests in `loader/Loader.test.js` (full load
// pipeline); this file pins the pieces that don't need a real BufferGeometry.

import {Mesh} from 'three'
import {ConwayEngine} from '../engine/ConwayEngine'
import {decorateConwayDirectIfcModel, makeIndexedModelHandle} from './engineModelReads'


/**
 * A ConwayEngine over `ifcAPI` with a model open as `modelID`, as an open
 * leaves it.
 *
 * @param {object} ifcAPI Conway IfcAPI stub
 * @param {number} modelID
 * @return {ConwayEngine}
 */
function engineOver(ifcAPI, modelID) {
  const engine = new ConwayEngine({ifcAPI})
  engine.modelID = modelID
  return engine
}


/** The load's alias of its engine; only its identity matters here. */
const ALIAS = {alias: true}


/* eslint-disable no-magic-numbers */
describe('model/engineModelReads', () => {
  // open-205 #2029: what the tree, properties and search read while the
  // geometry streams. It must answer like the finished model will.
  describe('makeIndexedModelHandle', () => {
    it('reads the tree, properties and types of the open model, with no geometry', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const ifcAPI = {
        properties: {
          getItemProperties: jest.fn().mockResolvedValue({expressID: 42}),
          getPropertySets: jest.fn().mockResolvedValue([]),
          getSpatialStructure: jest.fn().mockResolvedValue(tree),
        },
      }
      const handle = makeIndexedModelHandle(engineOver(ifcAPI, 3), ALIAS)
      expect(handle.isIndexedModel).toBe(true)
      expect(handle.modelID).toBe(3)
      expect(handle.geometry).toBeUndefined()
      // The tree as CadView#readModelTree asks for it, from the model's own
      // closure, which is the one the NavTree feed takes (sub-solids on).
      expect(await handle.getSpatialStructure(0, 'names')).toBe(tree)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(3, 'names', {includeSolids: true})
      expect(await handle.getItemProperties(42)).toEqual({expressID: 42})
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(3, 42, false)
      expect(handle.getIfcType('IFCWALL')).toBe('IFCWALL')
      // `onModel` and search discriminate an IFC model on its manager.
      expect(handle.ifcManager.ifcAPI).toBe(ALIAS)
      expect(handle.engine).toBeInstanceOf(ConwayEngine)
    })
  })


  describe('decorateConwayDirectIfcModel — property-method closures', () => {
    /** @return {object} minimal Conway IfcAPI stub */
    function makeIfcAPI() {
      return {
        properties: {
          getAllItemsOfType: jest.fn(),
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
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 7), ALIAS, 7)
      const props = await ifcModel.getItemProperties(42)
      expect(props.Name.value).toBe('Wall')
      // The model's bound modelID (7) flows through — consumers don't
      // pass it.
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(7, 42, false)
    })

    it('forwards recursive arg to getItemProperties', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
      await ifcModel.getItemProperties(42, true)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(0, 42, true)
    })

    it('attaches getPropertySets bound to the model\'s modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getPropertySets.mockResolvedValue([{Name: 'Pset_WallCommon'}])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 3), ALIAS, 3)
      const psets = await ifcModel.getPropertySets(42)
      expect(psets).toHaveLength(1)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })

    it('getSpatialStructure accepts (modelID, withProperties) — the manager-shape call site', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100, children: []})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
      // Two-arg call (CadView.jsx / IfcIsolator.js shape). The
      // leading arg is ignored — the bound modelID is used instead.
      await ifcModel.getSpatialStructure(0, true)
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(0, true, {includeSolids: true})
    })

    it('getSpatialStructure accepts a single boolean arg — the cache-hit closure shape', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
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
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 7), ALIAS, 7)
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
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
      expect(ifcModel.getIfcType('IFCWALL')).toBe('IFCWALL')
      expect(ifcModel.getIfcType('IFCBUILDINGSTOREY')).toBe('IFCBUILDINGSTOREY')
    })

    it('sets capabilities flips: ifcSubsets false, instancePicking + expressIdPicking true', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
      expect(ifcModel.capabilities.ifcSubsets).toBe(false)
      expect(ifcModel.capabilities.instancePicking).toBe(true)
      expect(ifcModel.capabilities.expressIdPicking).toBe(true)
    })

    it('binds modelID on the model', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 17), ALIAS, 17)
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
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 0), ALIAS, 0)
      expect(ifcModel.ifcManager).toBeTruthy()
      expect(ifcModel.ifcManager.ifcAPI).toBe(ALIAS)
      expect(ifcModel.engine).toBeInstanceOf(ConwayEngine)
    })

    it('ifcManager shim routes getSpatialStructure to Conway with the bound modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 5), ALIAS, 5)
      // IfcIsolator.js shape: `model.ifcManager.getSpatialStructure(0, false)`.
      // The leading arg is ignored; the bound modelID (5) flows through.
      await ifcModel.ifcManager.getSpatialStructure(0, false)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(5, false, {includeSolids: false})
    })

    it('ifcManager shim routes getItemProperties + getPropertySets to Conway', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({Name: {value: 'X'}})
      ifcAPI.properties.getPropertySets.mockResolvedValue([])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, engineOver(ifcAPI, 3), ALIAS, 3)
      await ifcModel.ifcManager.getItemProperties(0, 42, false)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(3, 42, false)
      await ifcModel.ifcManager.getPropertySets(0, 42, false)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })
  })
})

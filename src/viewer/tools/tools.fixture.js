/* eslint-disable no-magic-numbers */
// A loaded IFC-shaped model for the Assist view-tool suites, built from the
// production pieces wherever Jest can run them: the batched geometry comes
// from `flatMeshToBatchedModel` + `decorateBatchMeshes` (as a Conway-direct
// load builds it), hide / isolate run through a real IfcIsolator over it (so
// visibility is the per-instance mask a user's click produces), the store is
// the real zustand store, the SearchIndex is real and indexed from the tree,
// and `elementTypesMap` comes from `groupElementsByTypes`. What's doubled is
// what jsdom can't host: the Conway property API (entities and psets below,
// in the shapes Conway's compat surface returns), the renderer, and the
// camera-controls instance.
import {Group, Vector3} from 'three'
import SearchIndex from '../../search/SearchIndex'
import useStore from '../../store/useStore'
import {groupElementsByTypes} from '../../utils/ifc'
import {decorateBatchMeshes} from '../ifc/buildBatchedConwayModel'
import {SHAPE_ID, SPACING, unitTriangleApi} from '../ifc/batchedModel.fixture'
import {flatMeshToBatchedModel} from '../ifc/flatMeshToBatchedModel'
import IfcIsolator from '../three/IfcIsolator'


/** Products with geometry, in emission order (= batch id). */
export const PRODUCTS = [100, 101, 102, 103, 200, 201, 202]

/**
 * A GlobalId per node: 22 characters of IFC's base-64 alphabet. The `_` ends
 * the id, so `G1_…` and `G100_…` can't pad into the same string.
 *
 * @param {number} id
 * @return {string}
 */
export function globalIdOf(id) {
  return `G${id}_`.padEnd(22, 'A')
}


/**
 * @param {number} expressID
 * @param {string} type
 * @param {string} name
 * @param {Array<object>} [children]
 * @return {object} a NavTree node, shaped as Conway's 'names' spatial walk
 */
function node(expressID, type, name, children = []) {
  return {
    expressID,
    type,
    Name: {type: 1, value: name},
    GlobalId: {type: 1, value: globalIdOf(expressID)},
    children,
  }
}


/**
 * Project 1 › Site 2 › Building 3 › Level 1 (10) and Level 2 (20):
 *
 *   Level 1: Wall A 100, Wall B 101, Window 1 102, Window 2 103
 *   Level 2: Wall C 200, Window 3 201, Front Door 202
 *
 * @return {object} the spatial tree root
 */
export function makeTree() {
  return node(1, 'IFCPROJECT', 'Proj', [
    node(2, 'IFCSITE', 'Site', [
      node(3, 'IFCBUILDING', 'Bldg', [
        node(10, 'IFCBUILDINGSTOREY', 'Level 1', [
          node(100, 'IFCWALL', 'Wall A'),
          node(101, 'IFCWALL', 'Wall B'),
          node(102, 'IFCWINDOW', 'Window 1'),
          node(103, 'IFCWINDOW', 'Window 2'),
        ]),
        node(20, 'IFCBUILDINGSTOREY', 'Level 2', [
          node(200, 'IFCWALL', 'Wall C'),
          node(201, 'IFCWINDOW', 'Window 3'),
          node(202, 'IFCDOOR', 'Front Door'),
        ]),
      ]),
    ]),
  ])
}


/**
 * The entities `getItemProperties` serves. Wall A carries a typed array
 * among its attributes — the shape a geometry-bearing field would have —
 * so a summarizer that passed raw values through would put it in a result.
 *
 * @return {object} express id → entity
 */
function makeEntities() {
  const wrap = (value) => ({type: 1, value})
  return {
    100: {
      expressID: 100, type: 'IFCWALL', GlobalId: wrap(globalIdOf(100)), Name: wrap('Wall A'),
      ObjectPlacement: {type: 5, value: 500}, Tag: wrap('W\\X2\\00E9\\X0\\-A'),
      Position: new Float32Array([1, 2, 3]),
    },
    102: {
      expressID: 102, type: 'IFCWINDOW', GlobalId: wrap(globalIdOf(102)), Name: wrap('Window 1'),
      OverallHeight: {type: 4, value: 1.2}, Description: wrap('x'.repeat(500)),
    },
    600: {
      expressID: 600, type: 'IFCPROPERTYSET', Name: wrap('Pset_WindowCommon'),
      HasProperties: [{type: 5, value: 601}, {type: 5, value: 602}, {type: 5, value: 999}],
    },
    601: {expressID: 601, Name: wrap('IsExternal'), NominalValue: {type: 3, value: true}},
    602: {expressID: 602, Name: wrap('ThermalTransmittance'), NominalValue: {type: 4, value: 1.4}},
    610: {
      expressID: 610, type: 'IFCELEMENTQUANTITY', Name: wrap('Qto_WindowBaseQuantities'),
      Quantities: [{type: 5, value: 611}],
    },
    611: {expressID: 611, Name: wrap('Area'), AreaValue: {type: 4, value: 2.5}},
  }
}


/**
 * @param {number} x
 * @return {Array<number>} column-major translation matrix
 */
function translateX(x) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]
}


/**
 * @return {object} the model root: a Group around the decorated batch, with
 *   the model API the viewer and Properties panel use
 */
export function makeModel() {
  const flatMeshes = PRODUCTS.map((expressID, i) => ({
    expressID,
    geometries: [{
      geometryExpressID: SHAPE_ID,
      flatTransformation: translateX(i * SPACING),
      color: {x: 0.5, y: 0.5, z: 0.5, w: 1},
    }],
  }))
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
  decorateBatchMeshes(batches)
  const model = new Group()
  batches.forEach(({mesh}) => model.add(mesh))
  const tree = makeTree()
  const entities = makeEntities()
  const psets = {102: [entities[600], entities[610]]}
  model.format = 'ifc'
  model.getSpatialStructure = () => Promise.resolve(tree)
  model.getItemProperties = (id) => Promise.resolve(entities[id] ?? null)
  model.getPropertySets = (id) => Promise.resolve(psets[id] ?? [])
  return {model, tree, batch: batches[0].mesh}
}


/**
 * A STEP-shaped assembly, as a Conway STEP load leaves it: NavTree rows are
 * NAUOs keyed by occurrence path, which own no geometry; placements belong to
 * the parts' product_definition_shape ids. The top-level product has an
 * empty occurrence path (`findSoleRootNode`) and geometry of its own (#1909):
 *
 *   Assembly 1 (path [])          own shell: owner 500
 *     Sub 10 [10]  › Bolt 11 [10,11], Bolt 12 [10,12]   owner 100, twice
 *     Plate 20 [20]                                       owner 200
 *
 * Placements in emission order (= batch id): 500, 100, 100, 200.
 *
 * @return {object} `{model, tree, batch}`
 */
export function makeStepModel() {
  const placements = [[500, []], [100, [10, 11]], [100, [10, 12]], [200, [20]]]
  const flatMeshes = placements.map(([expressID, occurrencePath], i) => ({
    expressID,
    geometries: [{
      geometryExpressID: SHAPE_ID,
      flatTransformation: translateX(i * SPACING),
      color: {x: 0.5, y: 0.5, z: 0.5, w: 1},
      occurrencePath,
    }],
  }))
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
  decorateBatchMeshes(batches)
  const model = new Group()
  batches.forEach(({mesh}) => model.add(mesh))
  const row = (expressID, name, occurrencePath, children = []) =>
    ({expressID, type: 'NEXT_ASSEMBLY_USAGE_OCCURRENCE', Name: {type: 1, value: name}, occurrencePath, children})
  const tree = {
    ...row(1, 'Assembly', [], [
      row(10, 'Sub', [10], [row(11, 'Bolt', [10, 11]), row(12, 'Bolt', [10, 12])]),
      row(20, 'Plate', [20]),
    ]),
    type: 'PRODUCT_DEFINITION',
  }
  model.format = 'step'
  model.getSpatialStructure = () => Promise.resolve(tree)
  model.getItemProperties = () => Promise.resolve(null)
  model.getPropertySets = () => Promise.resolve([])
  return {model, tree, batch: batches[0].mesh}
}


/**
 * `twoRootShells.step` as Conway's tree carries it (src/tests/fixtures/; the
 * same shape `utils/occurrencePaths.test.js` models): a synthetic `Model`
 * wrapper (0) over two disconnected top-level parts, EVERY node at the empty
 * occurrence path, each part listing the product_definition_shape its
 * placements report as their owner — Shells #7 → 8, Plates #3007 → 3008.
 * No row has a pathful key. Two placements per part, in emission order:
 * 8, 8, 3008, 3008.
 *
 * @return {object} `{model, tree, batch}`
 */
export function makeTwoRootStepModel() {
  const owners = [8, 8, 3008, 3008]
  const flatMeshes = owners.map((expressID, i) => ({
    expressID,
    geometries: [{
      geometryExpressID: SHAPE_ID,
      flatTransformation: translateX(i * SPACING),
      color: {x: 0.5, y: 0.5, z: 0.5, w: 1},
      occurrencePath: [],
    }],
  }))
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
  decorateBatchMeshes(batches)
  const model = new Group()
  batches.forEach(({mesh}) => model.add(mesh))
  const part = (expressID, name, shape) => ({
    expressID, type: 'product', Name: {type: 1, value: name}, occurrencePath: [],
    productDefinitionShapeExpressIDs: [shape], children: [],
  })
  const tree = {
    expressID: 0, type: 'product_structure', Name: {type: 1, value: 'Model'}, occurrencePath: [],
    productDefinitionShapeExpressIDs: [],
    children: [part(7, 'Shells', 8), part(3007, 'Plates', 3008)],
  }
  model.format = 'step'
  model.getSpatialStructure = () => Promise.resolve(tree)
  model.getItemProperties = () => Promise.resolve(null)
  model.getPropertySets = () => Promise.resolve([])
  return {model, tree, batch: batches[0].mesh}
}


/**
 * @return {object} a camera-controls double that records its moves. Its
 *   getters allocate when called without an `out`, as camera-controls' do
 *   (`addCameraUrlParams` relies on that).
 */
export function makeCameraControls() {
  const position = new Vector3(50, 50, 50)
  const target = new Vector3(0, 0, 0)
  return {
    position,
    target,
    getPosition: (out = new Vector3()) => out.copy(position),
    getTarget: (out = new Vector3()) => out.copy(target),
    fitToSphere: jest.fn(() => Promise.resolve()),
    setLookAt: jest.fn((px, py, pz, tx, ty, tz) => {
      position.set(px, py, pz)
      target.set(tx, ty, tz)
      return Promise.resolve()
    }),
  }
}


/**
 * The selection funnel's store contract (CadView#selectItemsInScene, IFC
 * branch): what every selection source writes. CadView's own funnel is
 * exercised by CadView.test.jsx; this one stands in for it where there's no
 * CadView.
 *
 * @return {Function} a jest.fn funnel
 */
export function makeStoreFunnel() {
  return jest.fn((resultIDs, updateNavigation = true, instanceIds = [], occurrencePath = null,
    solidExpressId = null, anchorIds = null) => {
    const resIds = resultIDs.map((id) => `${id}`)
    useStore.setState({
      selectedElements: resIds,
      selectedAnchorIds: anchorIds === null ? resIds : anchorIds.map((id) => `${id}`),
      selectedInstanceIds: instanceIds,
      selectedOccurrencePath: occurrencePath,
      selectedSolidExpressId: solidExpressId,
    })
  })
}


/**
 * Load the fixture into the real store, behind a viewer whose isolator is
 * real, as CadView#onModel leaves things.
 *
 * @param {object} [opts]
 * @param {Function} [opts.build] the model builder (`makeModel`, `makeStepModel`)
 * @param {object} [opts.viewer] the viewer to dress, e.g. an
 *   `Object.create(ShareViewer.prototype)` whose real occurrence resolvers
 *   should run; its `IFC` is pointed at the model
 * @return {Promise<object>} `{viewer, model, tree, batch, controls, searchIndex}`
 */
export async function loadFixture({build = makeModel, viewer = {}} = {}) {
  const {model, tree, batch} = build()
  const controls = makeCameraControls()
  const scene = {add: jest.fn(), remove: jest.fn()}
  const isolatorContext = {
    getScene: () => scene,
    getPickableModels: () => [],
    getClippingPlanes: () => [],
    renderer: {update: jest.fn()},
    items: {pickableIfcModels: []},
  }
  Object.assign(viewer, {
    // What ShareViewer#_modelById reads.
    IFC: {context: {items: {ifcModels: [model]}}},
    postProcessor: {createOutlineEffect: jest.fn(() => ({setSelection: jest.fn()}))},
    setSelection: jest.fn(),
    setInstanceSelection: jest.fn(),
    getSelectedIds: jest.fn(() => []),
    highlighter: {setHighlighted: jest.fn()},
    _clearPreselectionForAllModels: jest.fn(),
    _clearConwaySelectionSubsets: jest.fn(),
    context: {getCameraControls: () => controls, fitModelToFrame: jest.fn()},
  })
  viewer.isolator = new IfcIsolator(isolatorContext, viewer)
  await viewer.isolator.setModel(model)
  const searchIndex = new SearchIndex()
  searchIndex.indexElement({properties: {getIfcType: (type) => type}}, tree)
  useStore.setState({
    viewer,
    model,
    rootElement: tree,
    elementTypesMap: groupElementsByTypes(tree),
    searchIndex,
    modelPath: {filepath: '/index.ifc'},
    selectedElements: [],
    selectedAnchorIds: [],
    selectedInstanceIds: [],
    selectedOccurrencePath: null,
    selectedSolidExpressId: null,
    hiddenElements: {},
    isolatedElements: {},
    isTempIsolationModeOn: false,
    cameraControls: controls,
    displayOverrides: {},
  })
  return {viewer, model, tree, batch, controls, searchIndex}
}


/**
 * @param {object} batch the fixture's BatchedMesh
 * @return {Array<number>} the products whose instances are visible
 */
export function visibleProducts(batch) {
  const visible = []
  for (let batchId = 0; batchId < batch.instanceCount; batchId++) {
    if (batch.getVisibleAt(batchId)) {
      visible.push(batch.instanceParents[batchId])
    }
  }
  return visible.sort((a, b) => a - b)
}

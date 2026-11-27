// What `ShareIfcLoader#parse` hands the load reporter so an empty scene can be
// told apart from an engine failure (Share#1962). The verdict itself is
// loadProgress#classifyLoadOutcome (unit-tested there over hand-written
// counts); what is pinned here is the part ShareIfcLoader owns: that conway's
// own counts are read off the statistics object AFTER the build, reach the
// reporter beside the vertex counts, stay unknown when the engine lacks the
// accessor, and which of them also reach `loadStats`, which is spread into
// GA's stats_* params (products-with-geometry does; the data-defect count
// does not).
//
// Over a mocked IfcAPI for the reason ShareIfcLoader.coordination.test.js
// gives: no jest test here instantiates the conway wasm engine. The real
// engine's answer for a geometry-less file is checked by the E2E spec
// Containers/noGeometryAlert.spec.ts.

import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel, buildBatchedConwayModel} from '../model/buildBatchedConwayModel'
import {buildConwayIfcModel} from '../model/buildConwayIfcModel'
import {IncrementalBatchedBuilder} from '../model/incrementalBatchedBuilder'
import {createEngineModelLoad} from '../engine/engineModelLoad'
import {makeFakeEngine, makeFakeEngineLoad} from './engineLoad.fixture'
import {isFeatureEnabled} from '../FeatureFlags'
import {LoadReporter} from './loadProgress'


jest.mock('../engine/engineModelLoad', () => ({
  createEngineModelLoad: jest.fn(),
  engineFormatOf: jest.requireActual('../engine/engineModelLoad').engineFormatOf,
}))
jest.mock('../model/engineModelReads', () => ({
  decorateConwayDirectIfcModel: jest.fn(),
  makeIndexedModelHandle: jest.requireActual('../model/engineModelReads').makeIndexedModelHandle,
}))
jest.mock('../model/buildBatchedConwayModel', () => ({
  buildBatchedConwayModel: jest.fn(),
  assembleBatchedModel: jest.fn(),
}))
jest.mock('../model/buildConwayIfcModel', () => ({buildConwayIfcModel: jest.fn()}))
jest.mock('../model/incrementalBatchedBuilder', () => ({IncrementalBatchedBuilder: jest.fn()}))
jest.mock('../model/flatMeshToBufferGeometry', () => ({flatMeshToBufferGeometry: jest.fn()}))
jest.mock('../model/flatMeshToInstancedModel', () => ({flatMeshToInstancedModel: jest.fn()}))
jest.mock('../model/parsePreviewMesh', () => ({payloadToPreviewMesh: jest.fn(() => null)}))
jest.mock('../model/ifcItemsMapParity', () => ({runIfcItemsMapParityCheck: jest.fn()}))
jest.mock('../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))
jest.mock('../utils/location', () => ({hasParams: jest.fn(() => false)}))
jest.mock('./ProgressiveLoadSession', () => jest.fn().mockImplementation(() => ({
  previewGroup: {add: jest.fn(), remove: jest.fn(), children: []},
  report: jest.fn(),
  beginAssembly: jest.fn(),
  notifyBounds: jest.fn(),
  addPreviewMesh: jest.fn(),
  setSummary: jest.fn(),
  finish: jest.fn(),
  abort: jest.fn(),
})))


// ms of geometry time the stand-in pump adds on top of the open's 0.
const PUMP_MS = 250

const PUMPED = [{expressID: 101, geometries: {size: () => 1}}]

const EMPTY_BUILD = {
  vertexCount: 0,
  triangleCount: 0,
  instanceCount: 0,
  parentCount: 0,
  materialCount: 0,
  skippedFlatMeshes: 0,
  skippedPlacedGeometries: 0,
}

const DRAWN_BUILD = {...EMPTY_BUILD, vertexCount: 3, triangleCount: 1}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/**
 * A conway Statistics stand-in. `counts` are the getters under test; leaving
 * one out models an engine that does not have it (a pin before conway#740).
 *
 * @param {object} counts {getProductCount, getProductsWithGeometryCount,
 *   getErrorCount, getDataDefectCount}, each a number
 * @return {object}
 */
function makeStatistics(counts) {
  const statistics = {
    getGeometryMemory: () => 1,
    getGeometryTime: () => 1,
    getTotalTime: () => 1,
    getVersion: () => 'IFC4',
    getLoadStatus: () => 'OK',
    getOriginatingSystem: () => 'Test',
    getPreprocessorVersion: () => '1.0',
    getParseTime: () => 1,
    getWarningCount: () => 0,
  }
  for (const [name, value] of Object.entries(counts)) {
    statistics[name] = () => value
  }
  return statistics
}


/**
 * @param {?object} statistics what `getStatistics` answers, or null for an
 *   engine with no statistics API at all (e.g. an older Conway or a mock)
 * @return {object} IfcAPI stub for the post-build tail of `parse`
 */
function makeIfcAPI(statistics) {
  const api = {
    GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
    OpenModel: jest.fn(),
    StreamAllMeshes: jest.fn(),
    properties: {},
  }
  if (statistics !== null) {
    api.getStatistics = jest.fn(() => statistics)
  }
  return api
}


/** @return {object} a `viewer.IFC` stub with the scene `parse` needs */
function makeIfcNamespace() {
  return {
    ifcLastError: null,
    addIfcModel: jest.fn(),
    context: {
      items: {ifcModels: []},
      getScene: () => ({add: jest.fn(), remove: jest.fn()}),
      ifcCamera: {cameraControls: null, perspectiveCamera: null},
    },
  }
}


describe('loader/ShareIfcLoader counts for the no-geometry verdict (Share#1962)', () => {
  let build
  let consoleInfoSpy
  // The engine's part of the load (engineLoad.fixture.js).
  let play

  beforeEach(() => {
    jest.clearAllMocks()
    // The reporter mirrors its report to console.info; the report is not
    // what is under test here.
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    build = EMPTY_BUILD
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    play = ({onMeshBatch}) => {
      if (onMeshBatch) {
        onMeshBatch(PUMPED, 7, {done: 1, total: 1})
      }
      // eslint-disable-next-line require-await
      return {modelID: 7, recapture: async () => PUMPED}
    }
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: build}),
    }))
    const model = () => ({matrix: null, geometry: null, capabilities: {}, userData: {}})
    assembleBatchedModel.mockImplementation(() => model())
    buildConwayIfcModel.mockImplementation(() => ({mesh: model(), stats: build}))
    buildBatchedConwayModel.mockImplementation(() => ({model: model(), stats: build}))
  })

  afterEach(() => {
    consoleInfoSpy.mockRestore()
  })

  /**
   * Run one load through a real reporter, as CadView does.
   *
   * @param {?object} statistics see makeIfcAPI
   * @return {Promise<{model: object, outcome: string}>}
   */
  async function loadAndClassify(statistics) {
    const report = new LoadReporter({fileInfo: 'shell.ifc'})
    const ifcAPI = makeIfcAPI(statistics)
    createEngineModelLoad.mockImplementation(() => makeFakeEngineLoad({ifcAPI, play}))
    const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc: makeIfcNamespace()})
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {report})
    report.end()
    return {model, outcome: report.completedOutcome()}
  }

  it('a file with no products is no_geometry', async () => {
    const {outcome} = await loadAndClassify(makeStatistics({
      getProductCount: 0, getProductsWithGeometryCount: 0, getErrorCount: 0, getDataDefectCount: 0,
    }))
    expect(outcome).toBe('no_geometry')
  })

  it('products none of which have geometry, with no engine error, is no_geometry', async () => {
    const {outcome} = await loadAndClassify(makeStatistics({
      getProductCount: 9, getProductsWithGeometryCount: 0, getErrorCount: 0, getDataDefectCount: 0,
    }))
    expect(outcome).toBe('no_geometry')
  })

  it('the same products with an engine error stay unusable', async () => {
    const {outcome} = await loadAndClassify(makeStatistics({
      getProductCount: 9, getProductsWithGeometryCount: 0, getErrorCount: 2, getDataDefectCount: 2,
    }))
    expect(outcome).toBe('unusable')
  })

  it('stays unusable when the engine has no products-with-geometry accessor', async () => {
    const {outcome} = await loadAndClassify(makeStatistics({getProductCount: 9, getErrorCount: 0}))
    expect(outcome).toBe('unusable')
  })

  it('stays unusable against an engine with no statistics API', async () => {
    const {outcome} = await loadAndClassify(null)
    expect(outcome).toBe('unusable')
  })

  it('is displayed when geometry was built, whatever the counts say', async () => {
    build = DRAWN_BUILD
    const {outcome} = await loadAndClassify(makeStatistics({
      getProductCount: 0, getProductsWithGeometryCount: 0, getErrorCount: 0, getDataDefectCount: 0,
    }))
    expect(outcome).toBe('displayed')
  })

  // loadStats is spread into real_model_open's stats_* params, so what is on
  // it is what GA receives.
  it('puts products-with-geometry on loadStats for GA, beside productCount', async () => {
    const {model} = await loadAndClassify(makeStatistics({
      getProductCount: 9, getProductsWithGeometryCount: 4, getErrorCount: 1, getDataDefectCount: 3,
    }))
    expect(model.loadStats).toMatchObject({productCount: 9, productsWithGeometryCount: 4, errorCount: 1})
  })

  it('carries a zero count to GA as zero', async () => {
    const {model} = await loadAndClassify(makeStatistics({getProductCount: 9, getProductsWithGeometryCount: 0}))
    expect(model.loadStats.productsWithGeometryCount).toBe(0)
  })

  it('leaves it absent, not zero, when the engine has no such accessor', async () => {
    const {model} = await loadAndClassify(makeStatistics({getProductCount: 9}))
    expect(model.loadStats).not.toHaveProperty('productsWithGeometryCount')
  })

  // On a deferred (demand) open the counts are 0 / the open's value until the
  // pump runs, and conway refreshes them on each pump call
  // (IfcAPI#recordPumpStatistics_). The engine snapshots them into the `done`
  // summary once the pump has drained (ConwayEngine#summarize_), and parse
  // awaits the load BEFORE it reads them, so the read is post-drain. Pinned here because the verdict depends on it: read
  // before the pump, "0 products with geometry" would call this file empty
  // when the engine had geometry for 4 of its products.
  it('reads the counts and geometry time after the pump has drained', async () => {
    let isPumped = false
    const statistics = {
      ...makeStatistics({getProductCount: 9, getErrorCount: 0}),
      getProductsWithGeometryCount: () => (isPumped ? 4 : 0),
      getGeometryTime: () => (isPumped ? PUMP_MS : 0),
    }
    const pumping = play
    play = (...args) => {
      const parsed = pumping(...args)
      isPumped = true
      return parsed
    }

    const {model, outcome} = await loadAndClassify(statistics)

    expect(model.loadStats.productsWithGeometryCount).toBe(4)
    expect(model.loadStats.geometryTime).toBe(PUMP_MS)
    // Empty build, but conway counted geometry: the engine's problem, not an
    // empty file. A pre-pump read (0 with geometry, no errors) says no_geometry.
    expect(outcome).toBe('unusable')
  })

  it('keeps the data-defect count off loadStats, which GA spreads', async () => {
    const {model} = await loadAndClassify(makeStatistics({getProductCount: 9, getDataDefectCount: 3}))
    expect(model.loadStats).not.toHaveProperty('dataDefectCount')
  })
})

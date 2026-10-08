/* eslint-disable no-magic-numbers */
// Real three.js and a real IfcIsolator, as ShareViewer.test.js restores
// three: the harness below mocks ShareViewer's heavy dependencies, these two
// among them, and the explicit factories here win. The batch is then a real
// BatchedMesh and hide / isolate run the isolator's real masking.
jest.mock('three', () => jest.requireActual('three'))
jest.mock('../three/IfcIsolator', () => jest.requireActual('../three/IfcIsolator'))
import '../../../__mocks__/shareViewerTestHarness'
import useStore from '../../store/useStore'
import {ShareViewer} from '../ShareViewer'
import {createShareAssistRegistry} from './assistHost'
import {registerSelectionFunnel} from './selectionFunnel'
import {loadFixture, makeStepModel, makeStoreFunnel, visibleProducts} from './tools.fixture'
import {captureVisibility, restoreVisibility} from './visibilityState'


/**
 * The view tools on a STEP model, through the viewer's REAL occurrence
 * resolvers (`ShareViewer#getInstanceIdsForOccurrencePath` /
 * `#getRootLevelInstances`, on the prototype) over a real decorated batch.
 * STEP is where an element ref is a NavTree row that owns no geometry, so a
 * tool that treats it as an element id acts on nothing.
 */
describe('viewer/tools on a STEP assembly', () => {
  const ALL = [100, 100, 200, 500]
  let fixture
  let registry
  let unregister


  beforeEach(async () => {
    fixture = await loadFixture({build: makeStepModel, viewer: Object.create(ShareViewer.prototype)})
    registry = createShareAssistRegistry()
    unregister = registerSelectionFunnel(makeStoreFunnel())
  })


  afterEach(() => {
    unregister()
    registry.dispose()
  })


  // Codex review on #1946: the top-level product has no occurrence path, so
  // it fell through to element ids (its own and its rows'), none of which own
  // a placement — Isolate showed nothing and reported success.
  it('isolates the top-level product as the whole product, as its row does', async () => {
    const result = await registry.call('view.isolate', {refs: ['e1']})
    expect(visibleProducts(fixture.batch)).toEqual(ALL)
    expect(useStore.getState().isTempIsolationModeOn).toBe(true)
    await result.undo()
    expect(useStore.getState().isTempIsolationModeOn).toBe(false)
  })

  it('isolates a row by its occurrences', async () => {
    await registry.call('view.isolate', {refs: ['e10']})
    expect(visibleProducts(fixture.batch)).toEqual([100, 100])
    await registry.call('view.isolate', {refs: ['o20']})
    expect(visibleProducts(fixture.batch)).toEqual([200])
  })

  it('hides the top-level product, and undo shows it again', async () => {
    const result = await registry.call('view.hide', {refs: ['e1']})
    expect(visibleProducts(fixture.batch)).toEqual([])
    await result.undo()
    expect(visibleProducts(fixture.batch)).toEqual(ALL)
  })

  it('frames the top-level product and a row by their placements', async () => {
    // Placements 0–3 of the unit triangle: x 0–31.
    expect((await registry.call('view.focus', {refs: ['e1']})).content.center).toEqual([15.5, 0.5, 0])
    // Sub's two bolts are placements 1 and 2: x 10–21.
    expect((await registry.call('view.focus', {refs: ['e10']})).content.center).toEqual([15.5, 0.5, 0])
    expect((await registry.call('view.focus', {refs: ['e20']})).content.center).toEqual([30.5, 0.5, 0])
  })


  // Codex review on #1946: an isolation holding a pathful occurrence AND a
  // whole root-level product (what Isolate does to such a multi-selection,
  // IfcIsolator#_wholeRootOccurrences) restored without the product.
  it('restores a mixed occurrence + root-product isolation whole', () => {
    const {isolator} = fixture.viewer
    const rootOwn = fixture.batch.instanceOccurrenceIds[0]
    isolator.isolateOccurrences([
      {nodeId: 20, occurrencePath: [20], solidExpressId: null},
      {nodeId: 1, occurrencePath: [], solidExpressId: null, instanceIds: [rootOwn]},
    ])
    expect(visibleProducts(fixture.batch)).toEqual([200, 500])
    const isolatedBefore = useStore.getState().isolatedElements

    const snapshot = captureVisibility(isolator)
    isolator.resetTempIsolation()
    expect(visibleProducts(fixture.batch)).toEqual(ALL)
    restoreVisibility(isolator, snapshot)

    expect(visibleProducts(fixture.batch)).toEqual([200, 500])
    expect(useStore.getState().isolatedElements).toEqual(isolatedBefore)
    // The link still carries the pathful occurrence (a pathless one has no ref).
    expect(isolator.isolatedOccurrences.map(({nodeId}) => nodeId)).toEqual([20])
  })
})

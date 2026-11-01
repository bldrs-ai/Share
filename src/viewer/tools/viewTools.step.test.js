/* eslint-disable no-magic-numbers */
// Real three.js and a real IfcIsolator, as ShareViewer.test.js restores
// three: the harness below mocks ShareViewer's heavy dependencies, these two
// among them, and the explicit factories here win. The batch is then a real
// BatchedMesh and hide / isolate run the isolator's real masking.
jest.mock('three', () => jest.requireActual('three'))
jest.mock('../three/IfcIsolator', () => jest.requireActual('../three/IfcIsolator'))
import '../../../__mocks__/shareViewerTestHarness'
import {
  visibilityRefs,
  visibilityRefsAreExact,
  writeVisibilityHash,
} from '../../Components/Residency/visibilityHash'
import useStore from '../../store/useStore'
import {ShareViewer} from '../ShareViewer'
import {createShareAssistRegistry} from './assistHost'
import {registerSelectionFunnel} from './selectionFunnel'
import {
  loadFixture,
  makeReusedStepModel,
  makeStepModel,
  makeStoreFunnel,
  makeTwoRootStepModel,
  visibleProducts,
} from './tools.fixture'
import {captureVisibility, restoreVisibility} from './visibilityState'


/**
 * @return {object} a location double with a normalized `hash`
 */
function loc() {
  let value = ''
  return {
    get hash() {
      return value
    },
    set hash(next) {
      value = next && !next.startsWith('#') ? `#${next}` : next
    },
  }
}


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

  // Codex review round 4 on #1946: a one-product file's root IS the product.
  it('lists the top-level product of a one-product file in model.query', async () => {
    const all = await registry.call('model.query', {})
    expect(all.refs).toEqual(['e1', 'o10', 'o10.11', 'o10.12', 'o20'])
    expect((await registry.call('model.query', {name: 'Assembly'})).refs).toEqual(['e1'])
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
    // The link carries both: the occurrence by its path, the product's own
    // geometry by its row (an empty path, written `e1`, #1924).
    expect(isolator.isolatedOccurrences.map(({nodeId}) => nodeId)).toEqual([20, 1])
  })

  // #2001 after #1946: the tools hid the product as one pathless entry, so
  // its rows' eyes read visible and the `#d:` link wrote only `e1`, the
  // product's own geometry, which reopens without its children.
  it('hides the top-level product as its rows, so the link names all of it', async () => {
    const {isolator} = fixture.viewer
    await registry.call('view.hide', {refs: ['e1']})
    expect(visibleProducts(fixture.batch)).toEqual([])
    expect(visibilityRefs(fixture.viewer).hide.sort()).toEqual(['e1', 'o10', 'o20'])
    expect(isolator.unHideProduct(1)).toBe(true)
    expect(visibleProducts(fixture.batch)).toEqual(ALL)
  })

  // An entry no ref names exactly (`inexact`, #2001) stays out of the link,
  // and must still be after undo: restored as exact, its ref would reopen
  // more than was hidden (`o20` here names all of Plate's placements).
  it('keeps an inexact hide and isolation out of the link across a snapshot', () => {
    const {isolator} = fixture.viewer
    const plate = fixture.batch.instanceOccurrenceIds[3]
    isolator.hideOccurrences([{nodeId: 20, occurrencePath: [20], solidExpressId: null, instanceIds: [plate], inexact: true}])
    expect(visibilityRefsAreExact(fixture.viewer)).toBe(false)
    const hidden = captureVisibility(isolator)
    isolator.unHideAllElements()
    restoreVisibility(isolator, hidden)
    expect(visibleProducts(fixture.batch)).toEqual([100, 100, 500])
    expect(visibilityRefsAreExact(fixture.viewer)).toBe(false)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const location = loc()
    expect(writeVisibilityHash(location, fixture.viewer)).toBe(false)
    expect(location.hash).not.toContain('hide=')

    isolator.unHideAllElements()
    isolator.isolateOccurrences([{nodeId: 20, occurrencePath: [20], solidExpressId: null, instanceIds: [plate], inexact: true}])
    const isolated = captureVisibility(isolator)
    isolator.resetTempIsolation()
    restoreVisibility(isolator, isolated)
    expect(visibleProducts(fixture.batch)).toEqual([200])
    expect(writeVisibilityHash(location, fixture.viewer)).toBe(false)
    expect(location.hash).not.toContain('iso=')
    warn.mockRestore()
  })

  // An occurrence hidden without a path (null) has no ref. Captured as an
  // empty path, it came back as a top-level product's own geometry, which
  // the link writes as `e<row>` and reopens as the product's shells.
  it('restores an occurrence hidden without a path as one, which the link leaves out', () => {
    const {isolator} = fixture.viewer
    const plate = fixture.batch.instanceOccurrenceIds[3]
    isolator.hideOccurrence(20, [plate])
    expect(visibilityRefs(fixture.viewer).hide).toEqual([])
    const snapshot = captureVisibility(isolator)
    isolator.unHideAllElements()
    restoreVisibility(isolator, snapshot)
    expect(visibleProducts(fixture.batch)).toEqual([100, 100, 500])
    expect(visibilityRefs(fixture.viewer).hide).toEqual([])
  })

  // #2001: undo restored the hides in one call, which counted every row as
  // hidden with the product, so the product's eye then showed a row the user
  // had hidden on its own.
  it('undo keeps a row hidden on its own apart from the product hidden after it', async () => {
    const {isolator} = fixture.viewer
    await registry.call('view.hide', {refs: ['o20']})
    await registry.call('view.hide', {refs: ['e1']})
    const result = await registry.call('view.showAll', {})
    expect(visibleProducts(fixture.batch)).toEqual(ALL)
    await result.undo()
    expect(visibleProducts(fixture.batch)).toEqual([])
    isolator.unHideProduct(1)
    expect(visibleProducts(fixture.batch)).toEqual([100, 100, 500])
  })
})


// Codex review round 2 on #1946: in a root-only multi-root file no row has a
// pathful key, which the first fix took to mean "not STEP" — so a part's ref
// fell back to row ids, isolate blanked the model and focus rejected.
describe('viewer/tools on a root-only multi-root STEP file (twoRootShells.step)', () => {
  let fixture
  let registry
  let unregister


  beforeEach(async () => {
    fixture = await loadFixture({build: makeTwoRootStepModel, viewer: Object.create(ShareViewer.prototype)})
    registry = createShareAssistRegistry()
    unregister = registerSelectionFunnel(makeStoreFunnel())
  })


  afterEach(() => {
    unregister()
    registry.dispose()
  })


  it('isolates one part by the placements its owner list names', async () => {
    const result = await registry.call('view.isolate', {refs: ['e3007']})
    expect(visibleProducts(fixture.batch)).toEqual([3008, 3008])
    await result.undo()
    expect(visibleProducts(fixture.batch)).toEqual([8, 8, 3008, 3008])
  })

  it('hides one part and frames each', async () => {
    await registry.call('view.hide', {refs: ['e7']})
    expect(visibleProducts(fixture.batch)).toEqual([3008, 3008])
    // Shells: placements 0–1, x 0–11. Plates: placements 2–3, x 20–31.
    expect((await registry.call('view.focus', {refs: ['e7']})).content.center).toEqual([5.5, 0.5, 0])
    expect((await registry.call('view.focus', {refs: ['e3007']})).content.center).toEqual([25.5, 0.5, 0])
  })

  it('lists both parts in model.query but not the synthetic wrapper', async () => {
    expect((await registry.call('model.query', {})).refs).toEqual(['e7', 'e3007'])
  })

  it('isolates both parts through the synthetic wrapper', async () => {
    await registry.call('view.isolate', {refs: ['e0']})
    expect(visibleProducts(fixture.batch)).toEqual([8, 8, 3008, 3008])
    expect(useStore.getState().isTempIsolationModeOn).toBe(true)
    // As each part (#2001): `e0` names no geometry, so a link that wrote
    // the wrapper reopened isolating nothing.
    expect(visibilityRefs(fixture.viewer).iso.sort()).toEqual(['e3007', 'e7'])
  })
})


// A multi-root file's wrapper whose part has children of its own: the
// wrapper splits into its parts, and each part into rows (#2001), so its
// child is written by path rather than folded into the part's `e<row>`, which
// reads back as the part's own geometry alone.
describe('viewer/tools on a multi-root STEP file whose part has a child', () => {
  let fixture
  let registry
  let unregister


  beforeEach(async () => {
    fixture = await loadFixture({
      build: () => makeTwoRootStepModel({withChild: true}),
      viewer: Object.create(ShareViewer.prototype),
    })
    registry = createShareAssistRegistry()
    unregister = registerSelectionFunnel(makeStoreFunnel())
  })


  afterEach(() => {
    unregister()
    registry.dispose()
  })


  it('hides the wrapper as each part\'s own geometry and the part\'s child', async () => {
    await registry.call('view.hide', {refs: ['e0']})
    expect(visibleProducts(fixture.batch)).toEqual([])
    expect(visibilityRefs(fixture.viewer).hide.sort()).toEqual(['e3007', 'e7', 'o3100'])
  })
})


// Codex review round 4 on #1946: a single occurrence selection reported its
// row as `e<row>`, which every copy of a reused sub-assembly shares, so
// hiding by the returned chip hid every copy.
describe('viewer/tools on a reused STEP sub-assembly', () => {
  let fixture
  let registry
  let unregister


  beforeEach(async () => {
    fixture = await loadFixture({build: makeReusedStepModel, viewer: Object.create(ShareViewer.prototype)})
    registry = createShareAssistRegistry()
    unregister = registerSelectionFunnel(makeStoreFunnel())
  })


  afterEach(() => {
    unregister()
    registry.dispose()
  })


  it('returns the occurrence ref it selected, and hiding by it hides only that copy', async () => {
    const selected = await registry.call('view.select', {refs: ['o30.10.11']})
    expect(selected.refs).toEqual(['o30.10.11'])
    expect(selected.content.refs).toEqual(['o30.10.11'])
    expect(visibleProducts(fixture.batch)).toEqual([100, 100])
    await registry.call('view.hide', {refs: selected.refs})
    expect(visibleProducts(fixture.batch)).toEqual([100])
    // The copy left is the second placement (x 10–11).
    expect((await registry.call('view.focus', {refs: ['o40.10.11']})).content.center).toEqual([10.5, 0.5, 0])
  })

  it('lists each copy by its own occurrence ref in model.query', async () => {
    expect((await registry.call('model.query', {name: 'Bolt'})).refs).toEqual(['o30.10.11', 'o40.10.11'])
  })
})

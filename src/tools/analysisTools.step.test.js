/* eslint-disable no-magic-numbers */
// As viewTools.step.test.js: real three, a real IfcIsolator, and the viewer's
// REAL occurrence resolvers over a real decorated batch. On STEP a ref names
// a NavTree row that owns no geometry, so a measure that looked up element
// ids alone would find nothing.
jest.mock('three', () => jest.requireActual('three'))
jest.mock('../viewer/three/IfcIsolator', () => jest.requireActual('../viewer/three/IfcIsolator'))
import '../../__mocks__/shareViewerTestHarness'
import {ShareViewer} from '../viewer/ShareViewer'
import {createShareAssistRegistry} from './assistHost'
import {loadFixture, makeReusedStepModel, makeStepModel} from './tools.fixture'


describe('viewer/tools analysis on a STEP assembly', () => {
  let registry

  beforeEach(async () => {
    await loadFixture({build: makeStepModel, viewer: Object.create(ShareViewer.prototype)})
    registry = createShareAssistRegistry()
  })

  afterEach(() => registry.dispose())

  // Each placed shape is a unit triangle (area 0.5): Sub holds two Bolts
  // (owner 100, twice), Plate one (owner 200), the Assembly one of its own.
  it('measures an occurrence and an assembly row from the instances they own', async () => {
    const plate = await registry.call('model.measure', {refs: ['o20'], metric: 'surfaceArea'})
    expect(plate.content.items[0].value).toBeCloseTo(0.5, 6)
    const sub = await registry.call('model.measure', {refs: ['e10'], metric: 'surfaceArea'})
    expect(sub.content.items[0]).toMatchObject({pieces: 2})
    expect(sub.content.items[0].value).toBeCloseTo(1, 6)
    const whole = await registry.call('model.measure', {refs: ['e1'], metric: 'surfaceArea'})
    expect(whole.content.total).toBeCloseTo(2, 6)
  })

  it('reports a single triangle as not closed, and its extents', async () => {
    const volume = await registry.call('model.measure', {refs: ['o20'], metric: 'volume'})
    expect(volume.content.items[0]).toMatchObject({value: null, closed: false})
    const extents = await registry.call('model.measure', {refs: ['o20'], metric: 'extents'})
    expect(extents.content.items[0].size).toEqual([1, 1, 0])
  })

  it('has no quantity sets to read and says so', async () => {
    const result = await registry.call('model.quantities', {})
    expect(result.content.available).toBe(false)
    expect(result.content.hint).toMatch(/model\.measure/)
  })
})


// A reused sub-assembly's copies share row ids (Sub 10, Bolt 11 under both A and
// B), and nodesById keeps the first. A ref to the second copy must answer for
// the second copy.
describe('viewer/tools analysis on a reused STEP sub-assembly', () => {
  let registry

  beforeEach(async () => {
    await loadFixture({build: makeReusedStepModel, viewer: Object.create(ShareViewer.prototype)})
    registry = createShareAssistRegistry()
  })

  afterEach(() => registry.dispose())

  it.each([
    ['o30.10.11', ['Top', 'A', 'Sub']],
    ['o40.10.11', ['Top', 'B', 'Sub']],
  ])('model.spatial puts %s under its own copy', async (ref, ancestors) => {
    const {content} = await registry.call('model.spatial', {ref})
    expect(content.path.map(({name}) => name)).toEqual(ancestors)
    expect(content.root.name).toBe('Bolt')
  })

  it('model.measure names the copy it measured', async () => {
    const {content} = await registry.call('model.measure', {refs: ['o40.10.11'], metric: 'surfaceArea'})
    expect(content.items[0]).toMatchObject({ref: 'o40.10.11', name: 'Bolt'})
    expect(content.items[0].value).toBeCloseTo(0.5, 6)
  })
})

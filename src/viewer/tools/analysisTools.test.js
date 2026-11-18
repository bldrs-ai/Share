/* eslint-disable no-magic-numbers */
import {ToolError, findNonJson} from '../../assist'
import {createShareAssistRegistry} from './assistHost'
import {MEASURE_LIMITS} from './analysisTools'
import {loadFixture, makeMeasureModel, makeStepModel} from './tools.fixture'


jest.mock('../ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({
  BlendFunction: {SCREEN: 1},
}))


/**
 * @param {Promise} promise
 * @return {Promise<ToolError>} what it rejected with
 */
async function rejection(promise) {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}


/**
 * @param {Array<object>} items a result's items
 * @param {string} ref
 * @return {object} the item for the ref
 */
function itemOf(items, ref) {
  const item = items.find((candidate) => candidate.ref === ref)
  if (!item) {
    throw new Error(`no item for ${ref}: ${items.map((i) => i.ref)}`)
  }
  return item
}


// The numbers below are computed by hand from the fixture's geometry
// (tools.fixture.js#makeMeasureModel), not read back from the tool:
//   Wall A  unit cube scaled 2×1×3  area 2(2·1 + 2·3 + 1·3) = 22   volume 6
//   Wall B  cube scaled 2 (mirrored) area 6·4 = 24                  volume 8
//   Window 1 cube without its top    area 5, open                   no volume
//   Wall C  two unit cubes           area 12                        volume 2
describe('viewer/tools analysis: model.measure', () => {
  let registry

  beforeEach(async () => {
    await loadFixture({build: makeMeasureModel})
    registry = createShareAssistRegistry()
  })

  afterEach(() => registry.dispose())

  it('measures surface area from the mesh with the instance transform applied', async () => {
    const {content} = await registry.call('model.measure', {refs: ['e100', 'e101', 'e102', 'e200'], metric: 'surfaceArea'})
    expect(itemOf(content.items, 'e100').value).toBeCloseTo(22, 4)
    // A mirrored instance (negative scale) still has positive area.
    expect(itemOf(content.items, 'e101').value).toBeCloseTo(24, 4)
    expect(itemOf(content.items, 'e102').value).toBeCloseTo(5, 4)
    expect(itemOf(content.items, 'e200').value).toBeCloseTo(12, 4)
    expect(itemOf(content.items, 'e200').pieces).toBe(2)
    expect(content.total).toBeCloseTo(63, 4)
    expect(content.totalUnit).toBe('m²')
    expect(content.complete).toBe(true)
    // States where the number came from, and what it is not.
    expect(content.source).toMatch(/mesh/)
    expect(content.note).toMatch(/not a net wall area/)
  })

  it('computes volume of closed meshes through placement scale and mirror', async () => {
    const {content} = await registry.call('model.measure', {refs: ['e100', 'e101', 'e200'], metric: 'volume'})
    expect(itemOf(content.items, 'e100')).toMatchObject({closed: true, unit: 'm³'})
    expect(itemOf(content.items, 'e100').value).toBeCloseTo(6, 4)
    expect(itemOf(content.items, 'e101').value).toBeCloseTo(8, 4)
    expect(itemOf(content.items, 'e200').value).toBeCloseTo(2, 4)
    expect(content.total).toBeCloseTo(16, 4)
    expect(content.openPieces).toBe(0)
  })

  it('refuses a volume for an open mesh instead of returning a wrong number', async () => {
    const {content} = await registry.call('model.measure', {refs: ['e100', 'e102'], metric: 'volume'})
    const open = itemOf(content.items, 'e102')
    expect(open.value).toBeNull()
    expect(open.closed).toBe(false)
    expect(open.reason).toMatch(/not closed/)
    // The total covers the closed piece only, and says so.
    expect(content.total).toBeCloseTo(6, 4)
    expect(content.totalCovers).toMatch(/closed pieces only/)
    expect(content.openPieces).toBe(1)
    expect(content.hint).toMatch(/closed meshes/)
  })

  it('reports the world box of placed instances', async () => {
    const {content} = await registry.call('model.measure', {refs: ['e100', 'e200'], metric: 'extents'})
    // Wall A: 2×1×3 turned 90° about Z (x' = -y, y' = x) and moved to x=5.
    const wall = itemOf(content.items, 'e100')
    expect(wall.min).toEqual([4, 0, 0])
    expect(wall.max).toEqual([5, 2, 3])
    expect(wall.size).toEqual([1, 2, 3])
    // Wall C: unit cubes at x=40 and x=50.
    expect(itemOf(content.items, 'e200').size).toEqual([11, 1, 1])
    expect(content.total.min).toEqual([4, 0, 0])
    expect(content.total.max).toEqual([51, 2, 3])
  })

  it('measures a container by its contents and counts shared geometry once in the total', async () => {
    const level = await registry.call('model.measure', {refs: ['e10'], metric: 'surfaceArea'})
    expect(level.content.items).toHaveLength(1)
    expect(level.content.items[0].value).toBeCloseTo(51, 4)
    // The storey and one of its walls: the wall is in both, once in the total.
    const both = await registry.call('model.measure', {refs: ['e10', 'e100'], metric: 'surfaceArea'})
    expect(itemOf(both.content.items, 'e100').value).toBeCloseTo(22, 4)
    expect(both.content.total).toBeCloseTo(51, 4)
  })

  it('says which refs have no geometry, and refuses when none has', async () => {
    const some = await registry.call('model.measure', {refs: ['e100', 'e103'], metric: 'surfaceArea'})
    expect(itemOf(some.content.items, 'e103')).toMatchObject({value: null, reason: 'no geometry'})
    expect(some.content.withoutGeometry).toBe(1)
    expect(some.content.measured).toBe(1)
    const none = await rejection(registry.call('model.measure', {refs: ['e103', 'e201'], metric: 'surfaceArea'}))
    expect(none.code).toBe('rejected')
  })

  it('names an unresolvable ref and measures nothing', async () => {
    const error = await rejection(registry.call('model.measure', {refs: ['e100', 'e999'], metric: 'volume'}))
    expect(error.code).toBe('unresolved_refs')
    expect(JSON.stringify(error.details)).toContain('e999')
  })

  it('rejects a metric it does not have, listing the valid ones', async () => {
    const error = await rejection(registry.call('model.measure', {refs: ['e100'], metric: 'weight'}))
    expect(error.code).toBe('invalid_input')
  })

  describe('work bounds', () => {
    afterEach(() => {
      MEASURE_LIMITS.maxTriangles = 3_000_000
      MEASURE_LIMITS.yieldEvery = 200_000
    })

    // The cap stops BETWEEN refs; a ref cut short adds nothing to the total,
    // so the total is never a partial number presented as complete.
    it('stops at the triangle limit and leaves out the refs it did not measure', async () => {
      MEASURE_LIMITS.maxTriangles = 30
      const {content} = await registry.call('model.measure', {refs: ['e100', 'e101', 'e102'], metric: 'surfaceArea'})
      // 12 + 12 triangles fit; the open box's 10 would pass 30.
      expect(content.complete).toBe(false)
      expect(content.unmeasured).toEqual(['e102'])
      expect(content.measured).toBe(2)
      expect(content.total).toBeCloseTo(46, 4)
      expect(content.hint).toMatch(/narrower/)
    })

    it('stops between pieces when the call is aborted', async () => {
      MEASURE_LIMITS.yieldEvery = 1
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 0)
      const error = await rejection(registry.call('model.measure',
        {refs: ['e100', 'e101', 'e102'], metric: 'surfaceArea'}, {signal: controller.signal}))
      expect(error).toBeInstanceOf(ToolError)
      expect(error.code).toBe('aborted')
    })
  })

  it('returns plain JSON, no geometry', async () => {
    for (const metric of ['surfaceArea', 'volume', 'extents']) {
      const {content} = await registry.call('model.measure', {refs: ['e100', 'e102'], metric})
      expect(findNonJson(content)).toBeNull()
    }
  })
})


describe('viewer/tools analysis: model.quantities', () => {
  let registry

  afterEach(() => registry.dispose())

  /**
   * @param {object} opts for makeMeasureModel
   */
  async function open(opts) {
    await loadFixture({build: () => makeMeasureModel(opts)})
    registry = createShareAssistRegistry()
  }

  /**
   * @param {object} content a result's content
   * @param {string} name
   * @return {object} the total for the quantity name
   */
  function total(content, name) {
    return content.totals.find((t) => t.name === name)
  }

  it('reads the quantities the model carries: per element, and totalled by name', async () => {
    await open({})
    const {content, refs} = await registry.call('model.quantities', {})
    expect(content.available).toBe(true)
    expect(content.source).toMatch(/IfcElementQuantity/)
    expect(total(content, 'NetSideArea')).toMatchObject({kind: 'area', unit: 'm²', total: 16, count: 3})
    expect(total(content, 'NetVolume')).toMatchObject({kind: 'volume', unit: 'm³', total: 14, count: 2})
    expect(total(content, 'Length')).toMatchObject({kind: 'length', unit: 'm', total: 2, count: 1})
    expect(content.scope).toMatchObject({complete: true, elementsWithQuantities: 3})
    expect(refs).toEqual(['e100', 'e101', 'e200'])
    expect(itemOf(content.items, 'e100').quantities).toEqual(expect.arrayContaining([
      {set: 'Qto_WallBaseQuantities', name: 'NetSideArea', kind: 'area', value: 6, unit: 'm²'},
    ]))
    // Window 1 has a property set and no quantity set: it is simply absent.
    expect(content.items.map(({ref}) => ref)).not.toContain('e102')
    expect(findNonJson(content)).toBeNull()
  })

  it('covers a container\'s contents, and filters by kind and name', async () => {
    await open({})
    const level = (await registry.call('model.quantities', {refs: ['e10']})).content
    expect(total(level, 'NetSideArea').total).toBe(14)
    expect(level.scope.description).toMatch(/contents/)
    const volumes = (await registry.call('model.quantities', {kind: 'volume'})).content
    expect(volumes.totals.map(({name}) => name)).toEqual(['NetVolume'])
    const byName = (await registry.call('model.quantities', {name: 'sidearea'})).content
    expect(byName.totals.map(({name}) => name)).toEqual(['NetSideArea'])
  })

  // The file's own units, never assumed: a milli-prefixed metre (area and
  // volume implied by it) and feet through IfcConversionBasedUnit give the
  // same SI numbers as a metre model.
  it.each(['mm', 'ft'])('converts a %s model\'s quantities to SI', async (units) => {
    await open({units})
    const {content} = await registry.call('model.quantities', {})
    expect(total(content, 'NetSideArea').total).toBeCloseTo(16, 4)
    expect(total(content, 'NetVolume').total).toBeCloseTo(14, 4)
    expect(total(content, 'Length').total).toBeCloseTo(2, 4)
    expect(content.units.from).toMatch(/IfcUnitAssignment/)
  })

  // A quantity may name its own Unit (IfcPhysicalSimpleQuantity.Unit), which
  // overrides the project's. Wall C's area is stated in square feet here.
  it('honours a unit a quantity names for itself', async () => {
    await open({})
    const {model} = (await import('../../store/useStore')).default.getState()
    const read = model.getItemProperties.getMockImplementation()
    const ref = (value) => ({type: 5, value})
    const extra = {
      3301: {...(await read(3301)), Unit: ref(3400)},
      3400: {expressID: 3400, type: 2889183280, UnitType: {type: 3, value: 'AREAUNIT'}, ConversionFactor: ref(3401)},
      3401: {expressID: 3401, ValueComponent: {type: 4, value: 0.09290304}, UnitComponent: ref(3402)},
      3402: {expressID: 3402, type: 448429030, Dimensions: {type: 3, value: 'AREAUNIT'}, Prefix: {type: 3, value: 'SQUARE_METRE'}},
    }
    model.getItemProperties.mockImplementation((id) => (extra[id] ? Promise.resolve(extra[id]) : read(id)))
    const {content} = await registry.call('model.quantities', {refs: ['e200']})
    expect(total(content, 'NetSideArea').total).toBeCloseTo(2 * 0.09290304, 6)
  })

  // The whole-model call reads a bounded number of elements; past it the
  // totals cover those only and the result says so, rather than reading as
  // the model's total.
  it('says when a whole-model call stopped short of the elements it could not read', async () => {
    await open({})
    const {default: useStore} = await import('../../store/useStore')
    const {rootElement} = useStore.getState()
    const level2 = rootElement.children[0].children[0].children[1]
    for (let i = 0; i < 305; i++) {
      level2.children.push({expressID: 9000 + i, type: 'IFCWALL', Name: {type: 1, value: `Extra ${i}`}, children: []})
    }
    const {content} = await registry.call('model.quantities', {})
    expect(content.scope.complete).toBe(false)
    expect(content.scope.elementsRead).toBe(300)
    expect(content.scope.elementsInScope).toBe(7 + 305)
    expect(content.scope.note).toMatch(/first 300 of 312/)
  })

  it('says plainly when the model carries none, pointing at model.measure', async () => {
    await open({quantities: false})
    const result = await registry.call('model.quantities', {})
    expect(result.content.available).toBe(false)
    expect(result.content.reason).toMatch(/No element in the whole model carries a quantity set/)
    expect(result.content.hint).toMatch(/model\.measure/)
    expect(result.content.totals).toBeUndefined()
  })

  it('says a STEP model carries none, without reading any element', async () => {
    await loadFixture({build: makeStepModel})
    registry = createShareAssistRegistry()
    const result = await registry.call('model.quantities', {})
    expect(result.content).toMatchObject({available: false, scanned: 0})
    expect(result.content.reason).toMatch(/not IFC/)
  })

  it('names refs that do not resolve', async () => {
    await open({})
    expect((await rejection(registry.call('model.quantities', {refs: ['e999']}))).code).toBe('unresolved_refs')
  })

  it('stops between reads when the call is aborted', async () => {
    await open({})
    const controller = new AbortController()
    const {model} = (await import('../../store/useStore')).default.getState()
    const read = model.getPropertySets.getMockImplementation()
    model.getPropertySets.mockImplementation((id) => {
      controller.abort()
      return read(id)
    })
    const error = await rejection(registry.call('model.quantities', {}, {signal: controller.signal}))
    expect(error.code).toBe('aborted')
  })

  it('reads through the async API only, one round trip per entity', async () => {
    await open({})
    const {model} = (await import('../../store/useStore')).default.getState()
    await registry.call('model.quantities', {refs: ['e100']})
    // Wall A: its sets, then its three quantities (plus the project's units).
    expect(model.getPropertySets).toHaveBeenCalledWith(100)
    expect(model.getItemProperties).toHaveBeenCalledWith(3101)
  })
})


describe('viewer/tools analysis: model.spatial', () => {
  let registry

  afterEach(() => registry.dispose())

  it('lists project, site, building and storeys with their element counts', async () => {
    await loadFixture({build: makeMeasureModel})
    registry = createShareAssistRegistry()
    const {content, refs} = await registry.call('model.spatial', {})
    expect(content.structure).toBe('spatial')
    const [site] = content.root.children
    const [building] = site.children
    expect(content.root).toMatchObject({ref: 'e1', type: 'IFCPROJECT', elements: 7})
    expect(site).toMatchObject({ref: 'e2', type: 'IFCSITE', elements: 7})
    expect(building).toMatchObject({ref: 'e3', type: 'IFCBUILDING', elements: 7})
    expect(building.children.map(({name, ref, elements}) => [name, ref, elements])).toEqual([
      ['Level 1', 'e10', 4],
      ['Level 2', 'e20', 3],
    ])
    expect(refs).toEqual(['e1', 'e2', 'e3', 'e10', 'e20'])
  })

  it('returns one container\'s subtree, with where it sits', async () => {
    await loadFixture({build: makeMeasureModel})
    registry = createShareAssistRegistry()
    const {content} = await registry.call('model.spatial', {ref: 'e20'})
    expect(content.root).toMatchObject({name: 'Level 2', elements: 3})
    expect(content.path.map(({name}) => name)).toEqual(['Proj', 'Site', 'Bldg'])
  })

  it('answers which storey an element is on', async () => {
    await loadFixture({build: makeMeasureModel})
    registry = createShareAssistRegistry()
    const {content} = await registry.call('model.spatial', {ref: 'e201'})
    expect(content.element).toMatchObject({ref: 'e201', name: 'Window 3'})
    expect(content.storey).toMatchObject({ref: 'e20', name: 'Level 2'})
    expect(content.path.map(({name}) => name)).toEqual(['Proj', 'Site', 'Bldg', 'Level 2'])
  })

  it('gives a STEP assembly\'s top levels and says it is not a spatial structure', async () => {
    await loadFixture({build: makeStepModel})
    registry = createShareAssistRegistry()
    const {content} = await registry.call('model.spatial', {})
    expect(content.structure).toBe('hierarchy')
    expect(content.note).toMatch(/not an IFC spatial structure/)
    expect(content.root).toMatchObject({name: 'Assembly', contains: 4})
    expect(content.root.children.map(({name}) => name)).toEqual(['Sub', 'Plate'])
  })

  it('names a ref that does not resolve', async () => {
    await loadFixture({build: makeMeasureModel})
    registry = createShareAssistRegistry()
    expect((await rejection(registry.call('model.spatial', {ref: 'e999'}))).code).toBe('unresolved_refs')
  })
})

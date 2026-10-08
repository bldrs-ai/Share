/* eslint-disable no-magic-numbers */
import {ToolError, findNonJson} from '../../assist'
import useStore from '../../store/useStore'
import {createShareAssistRegistry, installAssistDevHook} from './assistHost'
import {registerSelectionFunnel} from './selectionFunnel'
import {globalIdOf, loadFixture, makeStoreFunnel, visibleProducts} from './tools.fixture'


jest.mock('../ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({
  BlendFunction: {SCREEN: 1},
}))


const ALL_PRODUCTS = [100, 101, 102, 103, 200, 201, 202]


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


describe('viewer/tools (view + share providers)', () => {
  let fixture
  let registry
  let funnel
  let unregister


  beforeEach(async () => {
    fixture = await loadFixture()
    registry = createShareAssistRegistry()
    funnel = makeStoreFunnel()
    unregister = registerSelectionFunnel(funnel)
  })


  afterEach(() => {
    unregister()
    registry.dispose()
  })


  it('registers the v0 tools with their policies', () => {
    expect(registry.list().map(({name, policy}) => [name, policy])).toEqual([
      ['view.query', 'run'],
      ['view.properties', 'run'],
      ['view.select', 'runWithUndo'],
      ['view.isolate', 'runWithUndo'],
      ['view.hide', 'runWithUndo'],
      ['view.showAll', 'runWithUndo'],
      ['view.focus', 'runWithUndo'],
      ['share.permalink', 'run'],
    ])
  })


  it('reports not_ready without a loaded model', async () => {
    useStore.setState({model: null})
    const error = await rejection(registry.call('view.query', {}))
    expect(error).toBeInstanceOf(ToolError)
    expect(error.code).toBe('not_ready')
  })


  // Every tool, on inputs that reach the attribute with a typed array in it
  // (Wall A, e100): a summarizer that passed raw values through would put a
  // Float32Array in `content`, and this would name it.
  it('returns plain JSON from every tool, never geometry', async () => {
    const calls = [
      ['view.query', {}],
      ['view.properties', {refs: ['e100', 'e102']}],
      ['view.select', {refs: ['e100']}],
      ['view.hide', {refs: ['e100']}],
      ['view.showAll', {}],
      ['view.isolate', {refs: ['e100']}],
      ['view.showAll', {}],
      ['view.focus', {refs: ['e100']}],
      ['share.permalink', {}],
    ]
    for (const [name, input] of calls) {
      const result = await registry.call(name, input)
      expect(findNonJson(result.content), name).toBeNull()
    }
  })


  describe('view.query', () => {
    it.each([
      ['IfcWindow'],
      ['IFCWINDOW'],
      ['window'],
    ])('matches ifcType %s loosely', async (ifcType) => {
      const result = await registry.call('view.query', {ifcType})
      expect(result.content).toEqual({
        total: 3,
        returned: 3,
        truncated: false,
        items: [
          {ref: 'e102', type: 'IFCWINDOW', name: 'Window 1'},
          {ref: 'e103', type: 'IFCWINDOW', name: 'Window 2'},
          {ref: 'e201', type: 'IFCWINDOW', name: 'Window 3'},
        ],
      })
      expect(result.refs).toEqual(['e102', 'e103', 'e201'])
      expect(result.echo).toBe('Found 3 elements')
    })

    it('matches the NavTree\'s pretty type name', async () => {
      const result = await registry.call('view.query', {ifcType: 'Building Storey'})
      expect(result.refs).toEqual(['e10', 'e20'])
    })

    it('filters by level, by name or by ref, combined with type', async () => {
      expect((await registry.call('view.query', {level: 'Level 2', ifcType: 'IfcWall'})).refs).toEqual(['e200'])
      expect((await registry.call('view.query', {level: 'level 1'})).refs).toEqual(['e100', 'e101', 'e102', 'e103'])
      expect((await registry.call('view.query', {level: 'e20'})).refs).toEqual(['e200', 'e201', 'e202'])
    })

    it('lists the valid levels when none matches', async () => {
      const error = await rejection(registry.call('view.query', {level: 'Roof'}))
      expect(error.code).toBe('rejected')
      expect(error.details.levels).toEqual([{ref: 'e10', name: 'Level 1'}, {ref: 'e20', name: 'Level 2'}])
    })

    it('filters by name substring and by search text', async () => {
      expect((await registry.call('view.query', {name: 'wall'})).refs).toEqual(['e100', 'e101', 'e200'])
      expect((await registry.call('view.query', {text: 'Door'})).refs).toEqual(['e202'])
      expect((await registry.call('view.query', {text: globalIdOf(201)})).refs).toEqual(['e201'])
    })

    it('needs no arguments at all (eval #1929), and caps with a total', async () => {
      const all = await registry.call('view.query')
      expect(all.content.total).toBe(11)
      expect(all.content.truncated).toBe(false)
      const capped = await registry.call('view.query', {limit: 2})
      expect(capped.content).toMatchObject({total: 11, returned: 2, truncated: true})
      expect(capped.content.hint).toMatch(/narrow the query/)
      expect(capped.refs).toEqual(['e2', 'e3'])
    })

    it('rejects an argument it doesn\'t have, naming the ones it does', async () => {
      const error = await rejection(registry.call('view.query', {query: 'windows'}))
      expect(error.code).toBe('invalid_input')
      expect(error.message).toMatch(/unknown property 'query' \(allowed: ifcType, level, name, text, limit\)/)
    })
  })


  describe('view.properties', () => {
    it('summarizes attributes and property sets', async () => {
      const result = await registry.call('view.properties', {refs: ['e102']})
      const [item] = result.content.items
      expect(item.ref).toBe('e102')
      expect(item.type).toBe('IFCWINDOW')
      expect(item.name).toBe('Window 1')
      expect(item.attributes).toMatchObject({GlobalId: globalIdOf(102), Name: 'Window 1', OverallHeight: 1.2})
      // Long strings are cut.
      expect(item.attributes.Description).toBe(`${'x'.repeat(200)}…`)
      expect(item.propertySets).toEqual([
        // #999 doesn't resolve and is skipped, not fatal.
        {name: 'Pset_WindowCommon', properties: {IsExternal: true, ThermalTransmittance: 1.4}},
        {name: 'Qto_WindowBaseQuantities', properties: {Area: 2.5}},
      ])
    })

    it('reads references as #ids, decodes IFC strings, and drops buffers', async () => {
      const result = await registry.call('view.properties', {refs: ['e100']})
      const {attributes} = result.content.items[0]
      expect(attributes.ObjectPlacement).toBe('#500')
      expect(attributes.Tag).toBe('Wé-A')
      expect(attributes).not.toHaveProperty('Position')
      expect(result.content.items[0].propertySets).toEqual([])
    })

    it('accepts GlobalIds, prefixed or bare', async () => {
      const result = await registry.call('view.properties', {refs: [`g${globalIdOf(102)}`, globalIdOf(100)]})
      expect(result.content.items.map(({name}) => name)).toEqual(['Window 1', 'Wall A'])
    })

    it('fails the call on refs that don\'t resolve, listing each with a reason', async () => {
      const error = await rejection(registry.call('view.properties', {refs: ['e102', 'e9999', 'zzz', 'nLevel%201', 'o10.100']}))
      expect(error.code).toBe('unresolved_refs')
      expect(error.details.unresolved.map(({ref}) => ref)).toEqual(['e9999', 'zzz', 'nLevel%201', 'o10.100'])
      expect(error.details.unresolved[1].reason).toBe('not a ref')
      expect(error.details.unresolved[2].reason).toMatch(/scene-graph models/)
      expect(error.details.grammar).toMatch(/e<expressID>/)
    })
  })


  describe('view.select', () => {
    it('selects through the funnel: rows as anchors, descendants for the scene', async () => {
      const result = await registry.call('view.select', {refs: ['e102', 'e20']})
      expect(funnel).toHaveBeenCalledTimes(1)
      const [ids, updateNav, instances, path, solid, anchors] = funnel.mock.calls[0]
      expect([...ids].sort((a, b) => a - b)).toEqual([20, 102, 200, 201, 202])
      expect([updateNav, instances, path, solid, anchors]).toEqual([true, [], null, null, [102, 20]])
      expect(useStore.getState().selectedAnchorIds).toEqual(['102', '20'])
      expect(result.content).toEqual({
        selected: 2, truncated: false, refs: ['e102', 'e20'], types: {IFCWINDOW: 1, IFCBUILDINGSTOREY: 1},
      })
      expect(result.echo).toBe('Selected 2 elements')
    })

    it('adds to the selection with mode add', async () => {
      await registry.call('view.select', {refs: ['e100']})
      await registry.call('view.select', {refs: ['e101'], mode: 'add'})
      expect(useStore.getState().selectedAnchorIds).toEqual(['100', '101'])
    })

    it('undo restores the previous selection', async () => {
      await registry.call('view.select', {refs: ['e200']})
      const result = await registry.call('view.select', {refs: ['e102']})
      expect(useStore.getState().selectedAnchorIds).toEqual(['102'])
      await result.undo()
      expect(useStore.getState().selectedAnchorIds).toEqual(['200'])
      expect(useStore.getState().selectedElements).toEqual(['200'])
    })

    it('clears with an empty list, and undo brings the selection back', async () => {
      await registry.call('view.select', {refs: ['e200']})
      const result = await registry.call('view.select', {refs: []})
      expect(useStore.getState().selectedAnchorIds).toEqual([])
      expect(result.echo).toBe('Cleared the selection')
      await result.undo()
      expect(useStore.getState().selectedAnchorIds).toEqual(['200'])
    })

    it('reports not_ready with no viewer mounted', async () => {
      unregister()
      const error = await rejection(registry.call('view.select', {refs: ['e100']}))
      expect(error.code).toBe('not_ready')
    })

    it('changes nothing when a ref is unresolved', async () => {
      const error = await rejection(registry.call('view.select', {refs: ['e100', 'e404']}))
      expect(error.code).toBe('unresolved_refs')
      expect(funnel).not.toHaveBeenCalled()
    })
  })


  describe('visibility', () => {
    it('isolates a storey\'s contents, and undo shows everything again', async () => {
      const result = await registry.call('view.isolate', {refs: ['e10']})
      expect(visibleProducts(fixture.batch)).toEqual([100, 101, 102, 103])
      expect(useStore.getState().isTempIsolationModeOn).toBe(true)
      expect(result.echo).toBe('Isolated 1 element')
      await result.undo()
      expect(visibleProducts(fixture.batch)).toEqual(ALL_PRODUCTS)
      expect(useStore.getState().isTempIsolationModeOn).toBe(false)
    })

    it('re-isolating replaces the isolation, and undo returns to the first', async () => {
      await registry.call('view.isolate', {refs: ['e10']})
      const second = await registry.call('view.isolate', {refs: ['e202']})
      expect(visibleProducts(fixture.batch)).toEqual([202])
      await second.undo()
      expect(visibleProducts(fixture.batch)).toEqual([100, 101, 102, 103])
    })

    it('hides with descendants, as the NavTree eye does; undo shows them again', async () => {
      const result = await registry.call('view.hide', {refs: ['e20', 'e102']})
      expect(visibleProducts(fixture.batch)).toEqual([100, 101, 103])
      expect(useStore.getState().hiddenElements).toMatchObject({20: true, 102: true, 200: true, 201: true, 202: true})
      expect(result.content.hidden).toBe(2)
      await result.undo()
      expect(visibleProducts(fixture.batch)).toEqual(ALL_PRODUCTS)
      expect(Object.values(useStore.getState().hiddenElements).some(Boolean)).toBe(false)
    })

    it('refuses to hide during isolation, and to isolate only hidden elements', async () => {
      await registry.call('view.hide', {refs: ['e102']})
      expect((await rejection(registry.call('view.isolate', {refs: ['e102']}))).code).toBe('rejected')
      // The refused isolate left the hide alone.
      expect(visibleProducts(fixture.batch)).not.toContain(102)
      await registry.call('view.isolate', {refs: ['e10']})
      expect((await rejection(registry.call('view.hide', {refs: ['e100']}))).code).toBe('rejected')
    })

    it('showAll ends isolation and unhides; undo restores both', async () => {
      await registry.call('view.hide', {refs: ['e201']})
      await registry.call('view.isolate', {refs: ['e20']})
      expect(visibleProducts(fixture.batch)).toEqual([200, 202])
      const result = await registry.call('view.showAll', {})
      expect(visibleProducts(fixture.batch)).toEqual(ALL_PRODUCTS)
      expect(result.content).toEqual({shown: 1, endedIsolation: true})
      await result.undo()
      expect(visibleProducts(fixture.batch)).toEqual([200, 202])
      expect(useStore.getState().isTempIsolationModeOn).toBe(true)
    })
  })


  describe('view.focus', () => {
    it('frames an element\'s geometry, and undo puts the camera back', async () => {
      const {controls} = fixture
      // Window 1 is the third placement of the unit triangle: x 20–21, y 0–1.
      const result = await registry.call('view.focus', {refs: ['e102']})
      expect(controls.fitToSphere).toHaveBeenCalledTimes(1)
      const [sphere, smooth] = controls.fitToSphere.mock.calls[0]
      expect(smooth).toBe(true)
      expect(sphere.center.toArray()).toEqual([20.5, 0.5, 0])
      expect(sphere.radius).toBeCloseTo(Math.SQRT2 / 2 * 1.5)
      expect(result.content).toEqual({framed: 'elements', count: 1, center: [20.5, 0.5, 0], radius: 1.061})
      await result.undo()
      expect(controls.setLookAt).toHaveBeenCalledWith(50, 50, 50, 0, 0, 0, true)
    })

    it('frames a container by its contents', async () => {
      // Level 1 holds placements 0–3: x 0–31.
      const result = await registry.call('view.focus', {refs: ['e10']})
      expect(result.content.center).toEqual([15.5, 0.5, 0])
    })

    it('frames the whole model without refs', async () => {
      const result = await registry.call('view.focus', {})
      expect(fixture.viewer.context.fitModelToFrame).toHaveBeenCalledWith(fixture.model)
      expect(result.content).toEqual({framed: 'model'})
    })
  })


  describe('share.permalink', () => {
    it('describes the current view without changing the page URL', async () => {
      await registry.call('view.hide', {refs: ['e102']})
      const hashBefore = window.location.hash
      const {content} = await registry.call('share.permalink', {})
      expect(window.location.hash).toBe(hashBefore)
      const url = new URL(content.url)
      expect(`${url.origin}${url.pathname}`).toBe(`${window.location.origin}${window.location.pathname}`)
      expect(url.hash).toMatch(/c:50,50,50,0/)
      expect(url.hash).toMatch(/d:hide=e102/)
    })
  })


  describe('view context', () => {
    it('summarizes the model, selection and visibility', async () => {
      expect(registry.context()).toEqual([{
        id: 'view',
        text: 'Model: index.ifc (ifc), 11 elements, 2 levels (Level 1, Level 2).\n' +
          'Selection: none.\nHidden: 0. Isolation: off.',
        data: {
          loaded: true,
          model: {name: 'index.ifc', format: 'ifc'},
          elementCount: 11,
          levels: [{ref: 'e10', name: 'Level 1'}, {ref: 'e20', name: 'Level 2'}],
          levelCount: 2,
          selection: {count: 0, types: {}},
          visibility: {hiddenCount: 0, isolating: false, isolatedCount: 0},
        },
      }])
      await registry.call('view.select', {refs: ['e102', 'e100']})
      await registry.call('view.hide', {refs: ['e201']})
      expect(registry.context()[0].text).toBe(
        'Model: index.ifc (ifc), 11 elements, 2 levels (Level 1, Level 2).\n' +
        'Selection: 2 (IFCWINDOW×1, IFCWALL×1).\nHidden: 1. Isolation: off.')
    })

    it('says when nothing is loaded', () => {
      useStore.setState({model: null})
      expect(registry.context()[0]).toEqual({id: 'view', text: 'No model is loaded.', data: {loaded: false}})
    })
  })


  // Codex review on #1946: CadView stays mounted while the route loads another
  // model, so an undo can outlive the model it changed. It must refuse, not
  // replay the old isolator / ids / camera into the new model's state.
  describe('undo after the model changed', () => {
    const loadAnotherModel = () => useStore.setState({model: {format: 'ifc'}})

    it('visibility undo rejects expired and leaves the state alone', async () => {
      const result = await registry.call('view.isolate', {refs: ['e10']})
      loadAnotherModel()
      const error = await rejection(result.undo())
      expect(error.code).toBe('expired')
      expect(useStore.getState().isTempIsolationModeOn).toBe(true)
      expect(visibleProducts(fixture.batch)).toEqual([100, 101, 102, 103])
    })

    it('selection undo rejects expired without calling the funnel', async () => {
      const result = await registry.call('view.select', {refs: ['e102']})
      loadAnotherModel()
      expect((await rejection(result.undo())).code).toBe('expired')
      expect(funnel).toHaveBeenCalledTimes(1)
    })

    it('camera undo rejects expired without moving the camera', async () => {
      const result = await registry.call('view.focus', {refs: ['e102']})
      loadAnotherModel()
      expect((await rejection(result.undo())).code).toBe('expired')
      expect(fixture.controls.setLookAt).not.toHaveBeenCalled()
    })

    it('the dev hook drops its undo stack', async () => {
      const target = {}
      const uninstall = installAssistDevHook(target)
      try {
        expect((await target.__bldrsAssistTools.call('view.hide', {refs: ['e100']})).ok).toBe(true)
        loadAnotherModel()
        expect(await target.__bldrsAssistTools.undo()).toBe(false)
      } finally {
        uninstall()
      }
    })
  })


  describe('dev hook', () => {
    it('installs list/call/undo/context, returns errors as data, and uninstalls', async () => {
      const target = {}
      const uninstall = installAssistDevHook(target)
      const hook = target.__bldrsAssistTools
      expect(hook.list().map(({name}) => name)).toContain('view.isolate')

      const ok = await hook.call('view.isolate', {refs: ['e20']})
      expect(ok).toEqual({ok: true, content: {isolated: 1, refs: ['e20']}, echo: 'Isolated 1 element',
        refs: ['e20'], undoable: true})
      expect(visibleProducts(fixture.batch)).toEqual([200, 201, 202])
      expect(await hook.undo()).toBe(true)
      expect(visibleProducts(fixture.batch)).toEqual(ALL_PRODUCTS)
      expect(await hook.undo()).toBe(false)

      const bad = await hook.call('view.explode', {})
      expect(bad.ok).toBe(false)
      expect(bad.error.code).toBe('unknown_tool')
      expect(hook.context()[0].id).toBe('view')

      uninstall()
      expect(target).not.toHaveProperty('__bldrsAssistTools')
    })
  })
})

import {Float32BufferAttribute} from 'three'
import {ToolError} from './errors'
import {DEFAULT_MAX_RESULT_CHARS, createRegistry} from './registry'


/**
 * @param {string} name
 * @param {object} [overrides]
 * @return {object} a tool whose run records its input
 */
function makeTool(name, overrides = {}) {
  return {
    name,
    description: `the ${name} tool`,
    inputSchema: {
      type: 'object',
      properties: {refs: {type: 'array', items: {type: 'string'}, minItems: 1}},
      required: ['refs'],
      additionalProperties: false,
    },
    annotations: {viewState: true},
    run: jest.fn((input) => Promise.resolve({content: {got: input.refs.length}, refs: input.refs})),
    ...overrides,
  }
}


/**
 * @param {string} id
 * @param {Array<object>} tools
 * @return {object} a provider with a fixed tool list
 */
function makeProvider(id, tools) {
  return {id, tools: () => tools}
}


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


describe('assist/registry', () => {
  describe('assembly', () => {
    it('lists tools with their derived policy', () => {
      const registry = createRegistry([
        makeProvider('view', [makeTool('view.select'), makeTool('view.query', {annotations: {readOnly: true}})]),
        makeProvider('share', [makeTool('share.permalink', {annotations: undefined})]),
      ])
      expect(registry.list().map(({name, policy}) => [name, policy])).toEqual([
        ['view.select', 'runWithUndo'],
        ['view.query', 'run'],
        ['share.permalink', 'confirm'],
      ])
      expect(registry.list()[0]).not.toHaveProperty('run')
    })

    it('rejects a duplicate tool name across providers', () => {
      expect(() => createRegistry([
        makeProvider('view', [makeTool('view.select')]),
        makeProvider('view2', [makeTool('view.select')]),
      ])).toThrow(/tool name 'view.select' must be 'view2.<verb>'/)
      expect(() => createRegistry([
        makeProvider('view', [makeTool('view.select'), makeTool('view.select')]),
      ])).toThrow('Duplicate tool name \'view.select\'')
    })

    it('rejects a duplicate provider id', () => {
      expect(() => createRegistry([makeProvider('view', []), makeProvider('view', [])]))
        .toThrow('Duplicate provider id \'view\'')
    })

    it.each([
      ['outside its namespace', 'share.select'],
      ['no verb', 'view.'],
      ['the bare namespace', 'view'],
      ['an uppercase verb', 'view.Select'],
      ['a separator other than a dot', 'view/select'],
    ])('rejects a tool name %s', (_label, name) => {
      expect(() => createRegistry([makeProvider('view', [makeTool(name)])])).toThrow(/must be 'view.<verb>'/)
    })

    it('accepts a dotted verb', () => {
      expect(createRegistry([makeProvider('view', [makeTool('view.camera.focus')])]).has('view.camera.focus')).toBe(true)
    })

    it('rejects a schema the validator cannot enforce, at registration', () => {
      const tool = makeTool('view.query', {inputSchema: {type: 'object', properties: {q: {type: 'string', pattern: 'x'}}}})
      expect(() => createRegistry([makeProvider('view', [tool])]))
        .toThrow(/Tool 'view.query': #\/properties\/q: unsupported schema keyword 'pattern'/)
    })

    it('requires an object input schema and a description', () => {
      expect(() => createRegistry([makeProvider('view', [makeTool('view.a', {inputSchema: {type: 'string'}})])]))
        .toThrow(/inputSchema.type must be 'object'/)
      expect(() => createRegistry([makeProvider('view', [makeTool('view.a', {description: ' '})])]))
        .toThrow(/description is required/)
    })
  })


  describe('call', () => {
    it('validates input before run, and runs valid input', async () => {
      const tool = makeTool('view.select')
      const registry = createRegistry([makeProvider('view', [tool])])

      const error = await rejection(registry.call('view.select', {refs: [], extra: true}))
      expect(error).toBeInstanceOf(ToolError)
      expect(error.code).toBe('invalid_input')
      expect(error.details.problems).toEqual([
        '#/refs: must have at least 1 items',
        '#: unknown property \'extra\' (allowed: refs)',
      ])
      // The body never saw the invalid call.
      expect(tool.run).not.toHaveBeenCalled()

      const result = await registry.call('view.select', {refs: ['e1', 'e2']})
      expect(result.content).toEqual({got: 2})
      expect(tool.run).toHaveBeenCalledTimes(1)
      expect(tool.run.mock.calls[0][0]).toEqual({refs: ['e1', 'e2']})
    })

    it('treats a missing arguments object as {}', async () => {
      const tool = makeTool('share.permalink', {
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
        run: jest.fn(() => Promise.resolve({content: {url: 'u'}})),
      })
      const registry = createRegistry([makeProvider('share', [tool])])
      await registry.call('share.permalink')
      expect(tool.run.mock.calls[0][0]).toEqual({})
    })

    it('rejects an unknown tool, listing the available ones', async () => {
      const registry = createRegistry([makeProvider('view', [makeTool('view.select'), makeTool('view.query')])])
      const error = await rejection(registry.call('view.explode', {}))
      expect(error.code).toBe('unknown_tool')
      expect(error.details.available).toEqual(['view.select', 'view.query'])
      expect(() => registry.policyOf('view.explode')).toThrow(ToolError)
    })

    it('refuses a call whose signal already aborted', async () => {
      const tool = makeTool('view.select')
      const registry = createRegistry([makeProvider('view', [tool])])
      const controller = new AbortController()
      controller.abort()
      const error = await rejection(registry.call('view.select', {refs: ['e1']}, {signal: controller.signal}))
      expect(error.code).toBe('aborted')
      expect(tool.run).not.toHaveBeenCalled()
    })

    it('refuses a result carrying geometry, naming where', async () => {
      const tool = makeTool('view.query', {
        run: () => Promise.resolve({
          content: {items: [{ref: 'e1', position: new Float32BufferAttribute([0, 0, 0], 3)}]},
        }),
      })
      const registry = createRegistry([makeProvider('view', [tool])])
      const error = await rejection(registry.call('view.query', {refs: ['e1']}))
      expect(error.code).toBe('invalid_result')
      expect(error.details.problem).toBe('#/items/0/position: Float32BufferAttribute instance')
    })

    it('refuses a result past the size cap', async () => {
      const big = 'x'.repeat(DEFAULT_MAX_RESULT_CHARS)
      const tool = makeTool('view.query', {run: () => Promise.resolve({content: {big}})})
      const registry = createRegistry([makeProvider('view', [tool])])
      const error = await rejection(registry.call('view.query', {refs: ['e1']}))
      expect(error.code).toBe('result_too_large')
      expect(error.details.cap).toBe(DEFAULT_MAX_RESULT_CHARS)
    })

    it('refuses non-string refs and a missing content', async () => {
      const registry = createRegistry([makeProvider('view', [
        makeTool('view.a', {run: () => Promise.resolve({content: {}, refs: [1]})}),
        makeTool('view.b', {run: () => Promise.resolve({})}),
      ])])
      expect((await rejection(registry.call('view.a', {refs: ['e1']}))).code).toBe('invalid_result')
      expect((await rejection(registry.call('view.b', {refs: ['e1']}))).code).toBe('invalid_result')
    })
  })


  describe('change and context', () => {
    it('re-indexes on a provider change and notifies, keeping the last good index on a clash', () => {
      let tools = [makeTool('view.select')]
      let notify = null
      const unsubscribe = jest.fn()
      const provider = {
        id: 'view',
        tools: () => tools,
        onChange: (cb) => {
          notify = cb
          return unsubscribe
        },
      }
      const registry = createRegistry([provider])
      const listener = jest.fn()
      registry.onChange(listener)

      tools = [makeTool('view.select'), makeTool('view.hide')]
      notify()
      expect(registry.has('view.hide')).toBe(true)
      expect(listener).toHaveBeenCalledTimes(1)

      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        tools = [makeTool('view.select'), makeTool('view.select')]
        notify()
        expect(consoleError).toHaveBeenCalledTimes(1)
      } finally {
        consoleError.mockRestore()
      }
      expect(registry.has('view.hide')).toBe(true)
      expect(listener).toHaveBeenCalledTimes(1)

      registry.dispose()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('snapshots context sources in order and rejects duplicate ids', () => {
      const registry = createRegistry([], {
        contextSources: [
          {id: 'view', snapshot: () => ({id: 'view', text: 'Model: a'})},
          {id: 'project', snapshot: () => ({id: 'project', text: 'Project: b', data: {n: 1}})},
        ],
      })
      expect(registry.context()).toEqual([
        {id: 'view', text: 'Model: a'},
        {id: 'project', text: 'Project: b', data: {n: 1}},
      ])
      expect(() => createRegistry([], {contextSources: [{id: 'a', snapshot: () => ({})}, {id: 'a', snapshot: () => ({})}]}))
        .toThrow('Duplicate context source id \'a\'')
    })
  })
})

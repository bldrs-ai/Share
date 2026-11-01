import {assertSupportedSchema, validate} from './schema'


const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    ifcType: {type: 'string', minLength: 1},
    refs: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 3},
    limit: {type: 'integer', minimum: 1, maximum: 200},
    mode: {type: 'string', enum: ['replace', 'add']},
    flag: {type: ['boolean', 'null']},
  },
  required: ['refs'],
  additionalProperties: false,
}


describe('assist/schema', () => {
  describe('validate', () => {
    it('accepts a valid value', () => {
      expect(validate(QUERY_SCHEMA, {refs: ['e1'], limit: 5, mode: 'add', flag: null})).toEqual([])
    })

    it('reports each violation with its path', () => {
      const problems = validate(QUERY_SCHEMA, {
        refs: [], limit: 0.5, mode: 'merge', extra: 1, ifcType: '',
      })
      expect(problems).toEqual([
        '#/ifcType: must be at least 1 characters',
        '#/refs: must have at least 1 items',
        '#/limit: expected integer, got number',
        '#/mode: must be one of "replace", "add"',
        '#: unknown property \'extra\' (allowed: ifcType, refs, limit, mode, flag)',
      ])
    })

    it('reports a missing required property', () => {
      expect(validate(QUERY_SCHEMA, {})).toEqual(['#: missing required property \'refs\''])
    })

    it('checks array items and bounds', () => {
      expect(validate(QUERY_SCHEMA, {refs: ['a', 2, 'c', 'd']})).toEqual([
        '#/refs: must have at most 3 items',
        '#/refs/1: expected string, got number',
      ])
    })

    it('checks numeric bounds', () => {
      expect(validate(QUERY_SCHEMA, {refs: ['a'], limit: 201})).toEqual(['#/limit: must be <= 200'])
    })

    it('stops at a type mismatch rather than piling on consequences', () => {
      expect(validate(QUERY_SCHEMA, ['refs'])).toEqual(['#: expected object, got array'])
      expect(validate(QUERY_SCHEMA, null)).toEqual(['#: expected object, got null'])
    })

    it('rejects class instances and non-finite numbers as JSON values', () => {
      expect(validate({type: 'object'}, new Date())).toEqual(['#: expected object, got object'])
      expect(validate({type: 'number'}, NaN)).toEqual(['#: expected number, got number'])
    })
  })


  describe('assertSupportedSchema', () => {
    it('accepts the supported subset', () => {
      expect(() => assertSupportedSchema(QUERY_SCHEMA)).not.toThrow()
    })

    it.each([
      [{type: 'object', properties: {q: {type: 'string', pattern: '^a'}}}, /#\/properties\/q: unsupported schema keyword 'pattern'/],
      [{type: 'object', oneOf: []}, /unsupported schema keyword 'oneOf'/],
      [{type: 'tuple'}, /unsupported type 'tuple'/],
      [{type: 'object', additionalProperties: true}, /only 'additionalProperties: false'/],
      [{type: 'array', items: {format: 'uri'}}, /#\/items: unsupported schema keyword 'format'/],
    ])('rejects %j', (schema, message) => {
      expect(() => assertSupportedSchema(schema)).toThrow(message)
    })
  })
})

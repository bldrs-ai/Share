import {parse, zipEnvWithConfig} from './defines.js'


describe('defines', () => {
  it('parses env vars correctly', () => {
    expect(parse(undefined)).toBe(undefined)
    expect(parse('undefined')).toBe(undefined)
    expect(parse('null')).toBe(null)
    expect(parse(null)).toBe(null)
    expect(parse('true')).toBe(true)
    expect(parse('false')).toBe(false)
    expect(() => parse(true)).toThrow(TypeError)
    expect(() => parse(false)).toThrow(TypeError)
    expect(parse('1')).toBe(1)
    // eslint-disable-next-line no-magic-numbers
    expect(parse('1.1')).toBe(1.1)
    expect(parse('str')).toBe('str')
  })

  describe('with config', () => {
    const config = {
      isBool1: true,
      isBool2: false,
      isUndef: undefined,
      isNull: null,
      isInt: 1,
      isFloat: 1.1,
      isStr: 'str',
    }

    const defines = {
      'process.env.isBool1': 'true',
      'process.env.isBool2': 'false',
      'process.env.isUndef': 'null',
      'process.env.isNull': 'null',
      'process.env.isInt': '1',
      'process.env.isFloat': '1.1',
      'process.env.isStr': '"str"',
    }

    beforeEach(() => {
      delete process.env['isBool1']
      delete process.env['isBool2']
      delete process.env['isUndef']
      delete process.env['isNull']
      delete process.env['isUndef']
      delete process.env['isInt']
      delete process.env['isFloat']
      delete process.env['isStr']
    })

    it('zipEnvWithConfig, no overrides', () => {
      expect(zipEnvWithConfig(config)).toStrictEqual(defines)
    })

    it('zipEnvWithConfig, with overrides', () => {
      // Purposely override with different values/types
      process.env.isBool1 = 'false'
      process.env.isBool2 = 'true'
      process.env.isUndef = 'foo'
      process.env.isNull = 'foo'
      process.env.isInt = '2'
      process.env.isFloat = '2.2'
      process.env.isStr = 'str2'
      expect(zipEnvWithConfig(config)).toStrictEqual({
        'process.env.isBool1': 'false',
        'process.env.isBool2': 'true',
        'process.env.isUndef': '"foo"',
        'process.env.isNull': '"foo"',
        'process.env.isInt': '2',
        'process.env.isFloat': '2.2',
        'process.env.isStr': '"str2"',
      })
    })
  })
})

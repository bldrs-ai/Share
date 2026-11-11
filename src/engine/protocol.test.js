import {deserializeError, serializeError} from './protocol'


describe('engine/protocol: error shape', () => {
  it('carries the failed open\'s source mode across the worker boundary, and nothing else extra', () => {
    const error = Object.assign(new Error('malformed'), {
      sourceMode: {mode: 'buffered', reason: 'underCap', path: '/private/model.ifc', bytes: 64},
      path: '/private/model.ifc',
    })
    const back = deserializeError(structuredClone(serializeError(error)))
    expect(back.message).toBe('malformed')
    expect(back.sourceMode).toEqual({mode: 'buffered', reason: 'underCap'})
    expect(back.path).toBeUndefined()
    expect(JSON.stringify(serializeError(error))).not.toContain('private')
  })

  it('an error with no source mode gets none', () => {
    const back = deserializeError(JSON.parse(JSON.stringify(serializeError(new Error('x')))))
    expect(back.sourceMode).toBeUndefined()
  })
})

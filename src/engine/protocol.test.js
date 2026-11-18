import {deserializeError, errorMessageOf, serializeError} from './protocol'


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


// SHARE-1Y7: an engine throw that isn't an Error with a string message reached
// the page as `Error: [object Object]`.
describe('engine/protocol: errorMessageOf', () => {
  it('keeps a string message, and a message wrapped in another', () => {
    expect(errorMessageOf(new Error('Aborted()'))).toBe('Aborted()')
    expect(errorMessageOf('out of memory')).toBe('out of memory')
    expect(errorMessageOf({message: {message: 'Aborted(OOM)'}})).toBe('Aborted(OOM)')
  })

  it('names the type of anything else, never its contents', () => {
    const thrown = {message: {path: '/private/model.ifc'}}
    expect(errorMessageOf(thrown)).toBe('engine failure (non-Error Object)')
    expect(errorMessageOf(true)).toBe('engine failure (non-Error Boolean)')
    expect(errorMessageOf(undefined)).toBe('engine failure (non-Error undefined)')
    expect(serializeError(thrown).message).not.toContain('[object Object]')
    expect(JSON.stringify(serializeError(thrown))).not.toContain('private')
  })
})

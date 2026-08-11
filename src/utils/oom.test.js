import {isOutOfMemoryError, markIfOutOfMemory, OOM_PATTERNS} from './oom'


describe('isOutOfMemoryError', () => {
  it('returns false for null/undefined/non-errors', () => {
    expect(isOutOfMemoryError(null)).toBe(false)
    expect(isOutOfMemoryError(undefined)).toBe(false)
    expect(isOutOfMemoryError({})).toBe(false)
  })

  it('matches classic JS/host OOM messages', () => {
    expect(isOutOfMemoryError(new Error('Out of memory'))).toBe(true)
    expect(isOutOfMemoryError(new Error('Array buffer allocation failed'))).toBe(true)
    expect(isOutOfMemoryError(new RangeError('could not allocate memory'))).toBe(true)
  })

  it('matches explicit Emscripten/heap OOM aborts', () => {
    expect(isOutOfMemoryError(new Error('Aborted(OOM)'))).toBe(true)
    expect(isOutOfMemoryError(new Error('Cannot enlarge memory arrays to size ...'))).toBe(true)
    expect(isOutOfMemoryError(new Error('memory allocation failed'))).toBe(true)
  })

  it('does NOT classify ambiguous wasm traps as OOM', () => {
    // These are control-flow / wild-pointer traps a genuine Conway code
    // defect throws just as readily as heap exhaustion does. Classifying
    // them as OOM would suppress their Sentry capture and mislabel a real
    // bug as a device limit — so they stay non-OOM and remain captured.
    expect(isOutOfMemoryError(new Error('RuntimeError: memory access out of bounds'))).toBe(false)
    expect(isOutOfMemoryError(new Error('out of bounds memory access'))).toBe(false)
    expect(isOutOfMemoryError(new Error('table index is out of bounds'))).toBe(false)
  })

  it('does not false-positive on unrelated aborts/failures', () => {
    expect(isOutOfMemoryError(new Error('The operation was aborted'))).toBe(false)
    expect(isOutOfMemoryError(new Error('Failed to fetch'))).toBe(false)
    expect(isOutOfMemoryError(new Error('parseIfcWithConway: OpenModel returned -1'))).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isOutOfMemoryError(new Error('ABORTED(OOM)'))).toBe(true)
  })

  it('OOM_PATTERNS stay lowercase (consumers lowercase before matching)', () => {
    OOM_PATTERNS.forEach((p) => expect(p).toBe(p.toLowerCase()))
  })
})


describe('markIfOutOfMemory', () => {
  it('tags an object OOM error in place and returns it', () => {
    const err = new Error('Aborted(OOM)')
    expect(markIfOutOfMemory(err)).toBe(err)
    expect(err.isOutOfMemory).toBe(true)
  })

  it('does not tag a non-OOM object error', () => {
    const err = new Error('Failed to fetch')
    markIfOutOfMemory(err)
    expect(err.isOutOfMemory).toBeUndefined()
  })

  it('is a no-op (no TypeError) for a primitive OOM throwable', () => {
    // Emscripten abort() can throw a bare string; assigning a property to a
    // primitive throws a TypeError in strict mode, so primitives are left
    // untagged (message-based isOutOfMemoryError still classifies them).
    expect(() => markIfOutOfMemory('Aborted(OOM)')).not.toThrow()
    expect(markIfOutOfMemory('Aborted(OOM)')).toBe('Aborted(OOM)')
  })

  it('handles null/undefined without throwing', () => {
    expect(() => markIfOutOfMemory(null)).not.toThrow()
    expect(() => markIfOutOfMemory(undefined)).not.toThrow()
  })
})

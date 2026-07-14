import {isOutOfMemoryError, OOM_PATTERNS} from './oom'


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

  it('matches Emscripten/wasm heap-exhaustion traps (constrained-mobile Conway path)', () => {
    // These are the constrained-device signatures behind SHARE-RS that
    // previously slipped past the OOM UX and into Sentry as opaque errors.
    expect(isOutOfMemoryError(new Error('RuntimeError: memory access out of bounds'))).toBe(true)
    expect(isOutOfMemoryError(new Error('out of bounds memory access'))).toBe(true)
    expect(isOutOfMemoryError(new Error('table index is out of bounds'))).toBe(true)
    expect(isOutOfMemoryError(new Error('Aborted(OOM)'))).toBe(true)
    expect(isOutOfMemoryError(new Error('Cannot enlarge memory arrays to size ...'))).toBe(true)
    expect(isOutOfMemoryError(new Error('memory allocation failed'))).toBe(true)
  })

  it('does not false-positive on unrelated aborts/failures', () => {
    expect(isOutOfMemoryError(new Error('The operation was aborted'))).toBe(false)
    expect(isOutOfMemoryError(new Error('Failed to fetch'))).toBe(false)
    expect(isOutOfMemoryError(new Error('parseIfcWithConway: OpenModel returned -1'))).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isOutOfMemoryError(new Error('MEMORY ACCESS OUT OF BOUNDS'))).toBe(true)
  })

  it('OOM_PATTERNS stay lowercase (consumers lowercase before matching)', () => {
    OOM_PATTERNS.forEach((p) => expect(p).toBe(p.toLowerCase()))
  })
})

/* eslint-disable no-magic-numbers */
// The frame validator guards three boundaries (engine reply, cache write,
// cache read) and every one of them can hand it JSON-shaped garbage. The
// cases below are the shapes actually reachable there, not an exhaustive
// type sweep: `undefined` from an engine that returns nothing, `null` from a
// JSON round-trip (which is what `undefined` becomes in `JSON.stringify`),
// and `NaN` from arithmetic on a frame that was never derived.

import {
  APPLIED_COORDINATION_KEY,
  COORDINATION_OFFSET_KEY,
  MAT4_LENGTH,
  OFFSET_LENGTH,
  validAppliedCoordination,
  validCoordinationOffset,
} from './appliedCoordination'


/** @return {Array<number>} a distinguishable well-formed frame */
function frame() {
  return [
    0.001, 0, 0, 0,
    0, 0, -0.001, 0,
    0, 0.001, 0, 0,
    -2600, 450, 1200, 1,
  ]
}


describe('viewer/ifc/appliedCoordination', () => {
  it('keys the frame under the name a fresh parse and a cache hit share', () => {
    // Un-prefixed on purpose: GLTFLoader promotes `scenes[0].extras` onto
    // `userData` verbatim, so the extras key IS the userData key. If this
    // ever gains a `bldrs` prefix, a cache hit starts presenting a second,
    // differently-named surface — which is the bug Share#1633 item 1 is about.
    expect(APPLIED_COORDINATION_KEY).toBe('appliedCoordination')
    expect(MAT4_LENGTH).toBe(16)
  })

  it('accepts a well-formed frame and returns a copy', () => {
    const input = frame()
    const out = validAppliedCoordination(input)

    expect(out).toEqual(input)
    // A copy, so a parsed-JSON blob or an engine buffer cannot keep mutating
    // a frame already handed to a model.
    expect(out).not.toBe(input)
  })

  it('refuses a right-length frame of non-finite numbers', () => {
    // The case length alone misses, and the reason the guard is not just
    // `length === 16`: `Matrix4#fromArray` reads all 16 slots whatever they
    // hold, so these become a garbage matrix whose inverse is NaN
    // everywhere — wrong, and undetectable by the consumer.
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '0']) {
      const f = frame()
      f[5] = bad
      expect(validAppliedCoordination(f)).toBeNull()
    }
  })

  it('refuses a wrong-length array', () => {
    expect(validAppliedCoordination(frame().slice(0, 15))).toBeNull()
    expect(validAppliedCoordination([...frame(), 1])).toBeNull()
    expect(validAppliedCoordination([])).toBeNull()
  })

  it('refuses anything that is not an array', () => {
    // A `Float64Array` is refused deliberately, not incidentally: it is what
    // a typed-array stamp would produce, and it does NOT survive the JSON
    // boundaries the frame has to cross (it comes back as `{"0": …}`).
    for (const bad of [null, undefined, 0, 'frame', {0: 1}, new Float64Array(16)]) {
      expect(validAppliedCoordination(bad)).toBeNull()
    }
  })
})


describe('viewer/ifc/appliedCoordination — backstop offset', () => {
  it('keys the offset under the name IncrementalBatchedBuilder already stamps', () => {
    // This constant NAMES an existing surface rather than introducing one:
    // renaming it here would orphan the builder's stamp, and (being an extras
    // key too) would split the cache-hit surface from the fresh-parse one.
    expect(COORDINATION_OFFSET_KEY).toBe('coordinationOffset')
    expect(OFFSET_LENGTH).toBe(3)
  })

  it('accepts a well-formed offset and returns a copy', () => {
    const input = [2600000, 450, -1200000]
    const out = validCoordinationOffset(input)

    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('refuses a non-finite component', () => {
    // A bad offset corrupts by TRANSLATION rather than by NaN, so it looks
    // like a correctly placed model somewhere else — worth refusing for the
    // same reason a bad frame is.
    for (const bad of [NaN, Infinity, null, undefined, '0']) {
      expect(validCoordinationOffset([1, bad, 3])).toBeNull()
    }
  })

  it('refuses a wrong-length or non-array offset', () => {
    expect(validCoordinationOffset([1, 2])).toBeNull()
    expect(validCoordinationOffset([1, 2, 3, 4])).toBeNull()
    expect(validCoordinationOffset([])).toBeNull()
    for (const bad of [null, undefined, 0, 'offset', {0: 1}, new Float64Array(3)]) {
      expect(validCoordinationOffset(bad)).toBeNull()
    }
  })

  it('keeps the two validators independent', () => {
    // Guards against a copy-paste that points one key at the other's length.
    expect(validCoordinationOffset(new Array(MAT4_LENGTH).fill(1))).toBeNull()
    expect(validAppliedCoordination([1, 2, 3])).toBeNull()
    expect(APPLIED_COORDINATION_KEY).not.toBe(COORDINATION_OFFSET_KEY)
  })
})

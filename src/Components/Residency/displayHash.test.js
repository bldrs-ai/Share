import {
  HASH_PREFIX_DISPLAY,
  modelDisplayParams,
  readModelDisplayHash,
  writeModelDisplayHash,
} from './displayHash'
import {ColorMode} from '../../viewer/display/colorMode'
import {ShadingMode} from '../../viewer/display/shadingMode'


const {AUTO, SOURCE} = ColorMode
const {SHADED, WIREFRAME} = ShadingMode

/**
 * A location double that emulates the browser's `hash` normalization:
 * assigning a non-empty value without a leading `#` stores it with one
 * (as `location.hash = 'd:…'` becomes `#d:…`), and an empty value clears it.
 * Without this, `getHashParams`' `substring(1)` would eat the first token's
 * leading character after `addHashParams` writes a bare string.
 *
 * @param {string} [initial] initial hash (with or without `#`)
 * @return {object} location-like `{hash}`
 */
function loc(initial = '') {
  let value = initial && !initial.startsWith('#') ? `#${initial}` : initial
  return {
    get hash() {
      return value
    },
    set hash(next) {
      value = next && !next.startsWith('#') ? `#${next}` : next
    },
  }
}


describe('modelDisplayParams', () => {
  it('emits nothing for the default display (auto + shaded)', () => {
    expect(modelDisplayParams(AUTO, SHADED)).toEqual({})
  })

  it('emits only the non-default axes', () => {
    expect(modelDisplayParams(SOURCE, SHADED)).toEqual({color: 'src'})
    expect(modelDisplayParams(AUTO, WIREFRAME)).toEqual({wire: '1'})
    expect(modelDisplayParams(SOURCE, WIREFRAME)).toEqual({color: 'src', wire: '1'})
  })
})


describe('#d: round-trip', () => {
  // Read returns only the NON-default axes — the permalink never carries a
  // default, so a default axis comes back unset (the consumer leaves the
  // model at its default). That's the property that keeps links minimal.
  const cases = [
    ['source only', SOURCE, SHADED, {color: SOURCE}],
    ['wireframe only', AUTO, WIREFRAME, {shading: WIREFRAME}],
    ['both', SOURCE, WIREFRAME, {color: SOURCE, shading: WIREFRAME}],
  ]
  it.each(cases)('write then read: %s', (_label, color, shading, expected) => {
    const location = loc()
    writeModelDisplayHash(location, color, shading)
    expect(readModelDisplayHash(location)).toEqual(expected)
  })

  it('writes no d: token when everything is default', () => {
    const location = loc()
    writeModelDisplayHash(location, AUTO, SHADED)
    expect(location.hash).not.toContain(`${HASH_PREFIX_DISPLAY}:`)
    expect(readModelDisplayHash(location)).toEqual({})
  })

  it('clears the d: token when state returns to default, keeping other tokens', () => {
    const location = loc('#c:1,2,3,4,5,6')
    writeModelDisplayHash(location, SOURCE, WIREFRAME)
    expect(location.hash).toContain(`${HASH_PREFIX_DISPLAY}:`)
    writeModelDisplayHash(location, AUTO, SHADED)
    // d: gone, camera token untouched.
    expect(location.hash).not.toContain(`${HASH_PREFIX_DISPLAY}:`)
    expect(location.hash).toContain('c:1,2,3,4,5,6')
  })

  it('co-exists with a camera token', () => {
    const location = loc('#c:1,2,3,4,5,6')
    writeModelDisplayHash(location, SOURCE, SHADED)
    expect(location.hash).toContain('c:1,2,3,4,5,6')
    expect(readModelDisplayHash(location)).toEqual({color: SOURCE})
  })
})


describe('readModelDisplayHash tolerance', () => {
  it('returns empty for no token', () => {
    expect(readModelDisplayHash(loc(''))).toEqual({})
    expect(readModelDisplayHash(loc('#c:1,2,3'))).toEqual({})
  })

  it('drops unknown axis values instead of throwing', () => {
    // A hand-edited / future-versioned token: apply what's understood.
    expect(readModelDisplayHash(loc('#d:color=magenta,wire=1')))
      .toEqual({shading: WIREFRAME})
  })

  it('reads explicit defaults too (auto / shaded)', () => {
    expect(readModelDisplayHash(loc('#d:color=auto'))).toEqual({color: AUTO})
    expect(readModelDisplayHash(loc('#d:wire=0'))).toEqual({shading: SHADED})
  })
})

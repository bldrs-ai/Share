import {
  HASH_PREFIX_DISPLAY,
  modelDisplayParams,
  readModelDisplayHash,
  writeModelDisplayHash,
} from './displayHash'
import {ColorMode} from '../../viewer/display/colorMode'
import {RESIDENCY_DEFAULT} from '../../viewer/display/residencyMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {ResidencyMetric} from '../../viewer/residency/ResidencyController'


const {AUTO, SOURCE} = ColorMode
const {SHADED, WIREFRAME} = ShadingMode
const {MEMORY, DISTANCE} = ResidencyMetric

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


/**
 * A full appearance, defaults filled in — what the Display menu resolves to.
 *
 * @param {object} [patch] axes to move off their defaults
 * @return {object} `{color, shading, residency}`
 */
function appearance(patch = {}) {
  return {color: AUTO, shading: SHADED, residency: {...RESIDENCY_DEFAULT}, ...patch}
}


describe('modelDisplayParams', () => {
  it('emits nothing for the default display (auto + shaded + fully resident)', () => {
    expect(modelDisplayParams(appearance())).toEqual({})
    // …and nothing for an appearance with no axes set at all.
    expect(modelDisplayParams()).toEqual({})
  })

  it('emits only the non-default axes', () => {
    expect(modelDisplayParams(appearance({color: SOURCE}))).toEqual({color: 'src'})
    expect(modelDisplayParams(appearance({shading: WIREFRAME}))).toEqual({wire: '1'})
    expect(modelDisplayParams(appearance({residency: {percent: 40, metric: MEMORY}})))
      .toEqual({res: '40.memory'})
    expect(modelDisplayParams(appearance({
      color: SOURCE,
      shading: WIREFRAME,
      residency: {percent: 40, metric: MEMORY},
    }))).toEqual({color: 'src', wire: '1', res: '40.memory'})
  })

  it('drops the metric suffix when the metric is the default', () => {
    expect(modelDisplayParams(appearance({residency: {percent: 40, metric: RESIDENCY_DEFAULT.metric}})))
      .toEqual({res: '40'})
  })

  it('emits a non-default metric even at full residency', () => {
    // Inert on screen (nothing is being evicted at 100%), but it is still a
    // choice the user made in the menu, so the link has to carry it.
    expect(modelDisplayParams(appearance({residency: {percent: 100, metric: DISTANCE}})))
      .toEqual({res: '100.distance'})
  })

  it('emits 0% as a STRING so it survives the encoder', () => {
    // getEncodedParam writes a bare key for a falsy value, so a numeric 0
    // would come out as `res` with no `=0` and read back as unset.
    expect(modelDisplayParams(appearance({residency: {percent: 0, metric: RESIDENCY_DEFAULT.metric}})))
      .toEqual({res: '0'})
  })
})


describe('#d: round-trip', () => {
  // Read returns only the NON-default axes — the permalink never carries a
  // default, so a default axis comes back unset (the consumer leaves the
  // model at its default). That's the property that keeps links minimal.
  const cases = [
    ['source only', {color: SOURCE}, {color: SOURCE}],
    ['wireframe only', {shading: WIREFRAME}, {shading: WIREFRAME}],
    ['residency percent only', {residency: {percent: 40, metric: RESIDENCY_DEFAULT.metric}},
      {residency: {percent: 40}}],
    ['residency percent + metric', {residency: {percent: 40, metric: MEMORY}},
      {residency: {percent: 40, metric: MEMORY}}],
    ['residency metric only', {residency: {percent: 100, metric: DISTANCE}},
      {residency: {percent: 100, metric: DISTANCE}}],
    ['fully evicted', {residency: {percent: 0, metric: RESIDENCY_DEFAULT.metric}},
      {residency: {percent: 0}}],
    ['all three', {color: SOURCE, shading: WIREFRAME, residency: {percent: 25, metric: MEMORY}},
      {color: SOURCE, shading: WIREFRAME, residency: {percent: 25, metric: MEMORY}}],
  ]
  it.each(cases)('write then read: %s', (_label, patch, expected) => {
    const location = loc()
    writeModelDisplayHash(location, appearance(patch))
    expect(readModelDisplayHash(location)).toEqual(expected)
  })

  it('writes no d: token when everything is default', () => {
    const location = loc()
    writeModelDisplayHash(location, appearance())
    expect(location.hash).not.toContain(`${HASH_PREFIX_DISPLAY}:`)
    expect(readModelDisplayHash(location)).toEqual({})
  })

  it('drops a stale axis when it returns to default while others stay set', () => {
    // Regression (Codex review on #1714): addHashParams MERGES into the
    // existing token, so Source+Wireframe -> Auto+Wireframe kept `color=src`
    // and the shared URL restored the wrong display. The write must replace
    // the whole token. Extended to all three axes — with residency in the
    // token there are now two ways for a stale term to survive a write.
    const location = loc()
    const all = {color: SOURCE, shading: WIREFRAME, residency: {percent: 40, metric: MEMORY}}

    writeModelDisplayHash(location, appearance(all))
    writeModelDisplayHash(location, appearance({...all, color: AUTO}))
    expect(location.hash).not.toContain('color')
    expect(readModelDisplayHash(location))
      .toEqual({shading: WIREFRAME, residency: {percent: 40, metric: MEMORY}})

    writeModelDisplayHash(location, appearance(all))
    writeModelDisplayHash(location, appearance({...all, shading: SHADED}))
    expect(location.hash).not.toContain('wire')
    expect(readModelDisplayHash(location))
      .toEqual({color: SOURCE, residency: {percent: 40, metric: MEMORY}})

    writeModelDisplayHash(location, appearance(all))
    writeModelDisplayHash(location, appearance({...all, residency: {...RESIDENCY_DEFAULT}}))
    expect(location.hash).not.toContain('res')
    expect(readModelDisplayHash(location)).toEqual({color: SOURCE, shading: WIREFRAME})
  })

  it('clears the d: token when state returns to default, keeping other tokens', () => {
    const location = loc('#c:1,2,3,4,5,6')
    writeModelDisplayHash(location, appearance({color: SOURCE, residency: {percent: 40}}))
    expect(location.hash).toContain(`${HASH_PREFIX_DISPLAY}:`)
    writeModelDisplayHash(location, appearance())
    // d: gone, camera token untouched.
    expect(location.hash).not.toContain(`${HASH_PREFIX_DISPLAY}:`)
    expect(location.hash).toContain('c:1,2,3,4,5,6')
  })

  it('co-exists with a camera token', () => {
    const location = loc('#c:1,2,3,4,5,6')
    writeModelDisplayHash(location, appearance({color: SOURCE}))
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

  it('keeps the half of res it understands', () => {
    expect(readModelDisplayHash(loc('#d:res=40.nonsense'))).toEqual({residency: {percent: 40}})
    expect(readModelDisplayHash(loc('#d:res=abc.memory'))).toEqual({residency: {metric: MEMORY}})
  })

  it('drops an out-of-range or unparseable percent', () => {
    expect(readModelDisplayHash(loc('#d:res=999'))).toEqual({})
    expect(readModelDisplayHash(loc('#d:res=-1'))).toEqual({})
    expect(readModelDisplayHash(loc('#d:res=abc'))).toEqual({})
  })

  it('does not read a bare `res` as a fully evicted model', () => {
    // getObjectParams decodes a keyless term to the NUMBER 0; without the
    // typeof guard `#d:res` would hide the whole model.
    expect(readModelDisplayHash(loc('#d:res'))).toEqual({})
  })
})

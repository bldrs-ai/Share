import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster'
import {anonRouteKind, isAnonMeteredKey, isSampleKey} from './anonMeterKeys'


/* eslint-disable no-magic-numbers */
describe('quota/anonMeterKeys', () => {
  it('meters remote loads: GitHub, Drive and URL models', () => {
    expect(isAnonMeteredKey('/share/v/gh/someone/repo/main/a.ifc')).toBe(true)
    expect(isAnonMeteredKey('/share/v/g/1AbCdEf')).toBe(true)
    expect(isAnonMeteredKey(`/share/v/u/sha256-${'a'.repeat(64)}`)).toBe(true)
  })

  it('never meters local files, the hosted demo or the samples', () => {
    expect(isAnonMeteredKey('/share/v/local-only/x.ifc')).toBe(false)
    expect(isAnonMeteredKey('/share/v/p/index.ifc')).toBe(false)
    for (const sample of SAMPLE_MODELS) {
      expect(isSampleKey(sample.path)).toBe(true)
      expect(isAnonMeteredKey(sample.path.split('#')[0])).toBe(false)
    }
  })

  it('refuses anything not a key', () => {
    for (const bad of [null, undefined, 7, '', 'v/gh/x', `/share/v/gh/${'x'.repeat(1100)}`]) {
      expect(isAnonMeteredKey(bad)).toBe(false)
    }
    expect(anonRouteKind('/share/v/gh/o/r/main/a.ifc')).toBe('gh')
    expect(anonRouteKind(42)).toBeNull()
  })
})

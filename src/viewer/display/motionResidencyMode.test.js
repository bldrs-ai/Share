import {flags} from '../../FeatureFlags'
import {isMotionResidencyOn} from './motionResidencyMode'


describe('viewer/display/motionResidencyMode#isMotionResidencyOn', () => {
  let originalLocation
  const setSearch = (search) => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
  }
  beforeEach(() => {
    originalLocation = window.location
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('declares disableMotionResidency off, and no motionResidency opt-in at all', () => {
    expect(flags.find((f) => f.name === 'disableMotionResidency')?.isActive).toBe(false)
    // The retired opt-in is gone, so there is nothing for a URL to opt back
    // in with and no static `false` that could be mistaken for the rollback.
    expect(flags.find((f) => f.name === 'motionResidency')).toBeUndefined()
  })

  it('is on for a plain URL, and a leftover ?feature=motionResidency changes nothing', () => {
    for (const search of ['', '?feature=motionResidency', '?feature=perf,motionResidency']) {
      setSearch(search)
      expect(isMotionResidencyOn()).toBe(true)
    }
  })

  it('?feature=disableMotionResidency turns it off, alongside other flags too', () => {
    for (const search of ['?feature=disableMotionResidency', '?feature=perf,disablemotionresidency',
      '?feature=motionResidency,disableMotionResidency']) {
      setSearch(search)
      expect(isMotionResidencyOn()).toBe(false)
    }
  })

  it('the rollback (disableMotionResidency on in FeatureFlags.js) holds whatever the URL says', () => {
    const flag = flags.find((f) => f.name === 'disableMotionResidency')
    flag.isActive = true
    try {
      for (const search of ['', '?feature=motionResidency']) {
        setSearch(search)
        expect(isMotionResidencyOn()).toBe(false)
      }
    } finally {
      flag.isActive = false
    }
  })
})

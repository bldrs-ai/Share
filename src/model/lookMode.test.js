import {flags} from '../FeatureFlags'
import {LookOffReason, isLookOn, lookOffReason} from './lookMode'


describe('model/lookMode', () => {
  let originalLocation
  const savedOptIn = process.env.LOOK_IS_OPT_IN
  const setSearch = (search) => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
  }
  beforeEach(() => {
    originalLocation = window.location
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
    // Assigning undefined to process.env stores the string 'undefined'.
    if (savedOptIn === undefined) {
      delete process.env.LOOK_IS_OPT_IN
    } else {
      process.env.LOOK_IS_OPT_IN = savedOptIn
    }
    delete globalThis.__bldrsLookOptIn
  })

  it('is on for a plain URL in every build but Playwright\'s', () => {
    setSearch('')
    expect(isLookOn()).toBe(true)
  })

  it('is off for ?feature=disableLook', () => {
    setSearch('?feature=disableLook')
    expect(lookOffReason()).toBe(LookOffReason.KILL_SWITCH)
  })

  it('is off under LOOK_IS_OPT_IN until the page opts in', () => {
    setSearch('')
    process.env.LOOK_IS_OPT_IN = true
    expect(lookOffReason()).toBe(LookOffReason.E2E_OPT_IN)
    globalThis.__bldrsLookOptIn = true
    expect(isLookOn()).toBe(true)
  })

  it('lets the static rollback win over an opt-in', () => {
    const flag = flags.find((f) => f.name === 'disableLook')
    const was = flag.isActive
    flag.isActive = true
    try {
      process.env.LOOK_IS_OPT_IN = true
      globalThis.__bldrsLookOptIn = true
      expect(lookOffReason()).toBe(LookOffReason.ROLLBACK)
    } finally {
      flag.isActive = was
    }
  })
})

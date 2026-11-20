import {flags} from '../FeatureFlags'
import {PageLoadReason, isSpaModelNavOn, modelNavMode, modelPageLoadReason} from './spaModelNavMode'


describe('utils/spaModelNavMode', () => {
  let originalLocation
  const setSearch = (search) => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
  }
  /**
   * Run `body` with a static flag forced, and put it back after.
   *
   * @param {string} name
   * @param {boolean} isActive
   * @param {Function} body
   */
  const withStaticFlag = (name, isActive, body) => {
    const flag = flags.find((f) => f.name === name)
    const was = flag.isActive
    flag.isActive = isActive
    try {
      body()
    } finally {
      flag.isActive = was
    }
  }
  beforeEach(() => {
    originalLocation = window.location
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('declares spaModelNav on by default, with disableSpaModelNav as its off-switch', () => {
    expect(flags.find((f) => f.name === 'spaModelNav')?.isActive).toBe(true)
    expect(flags.find((f) => f.name === 'disableSpaModelNav')?.isActive).toBe(false)
  })

  it('switches in-app on a plain URL, and with the old opt-in still named', () => {
    setSearch('')
    expect(modelPageLoadReason()).toBeNull()
    expect(isSpaModelNavOn()).toBe(true)
    expect(modelNavMode()).toBe('in-app')
    setSearch('?feature=spaModelNav')
    expect(isSpaModelNavOn()).toBe(true)
  })

  it('?feature=disableSpaModelNav loads the page, even with the flag named', () => {
    for (const search of ['?feature=disableSpaModelNav', '?feature=spaModelNav,disableSpaModelNav']) {
      setSearch(search)
      expect(modelPageLoadReason()).toBe(PageLoadReason.KILL_SWITCH)
      expect(isSpaModelNavOn()).toBe(false)
      expect(modelNavMode()).toBe('page-load:disableSpaModelNav')
    }
  })

  it('with spaModelNav off in FeatureFlags.js, only a URL opt-in switches in-app', () => {
    withStaticFlag('spaModelNav', false, () => {
      setSearch('')
      expect(modelPageLoadReason()).toBe(PageLoadReason.FLAG_OFF)
      // Which is why turning it off is NOT the rollback: a link that still
      // says `?feature=spaModelNav` stays in-app, and carries it onward.
      setSearch('?feature=spaModelNav')
      expect(isSpaModelNavOn()).toBe(true)
    })
  })

  // The rollback has to beat a URL opt-in, which `isFeatureEnabled`'s OR of
  // static and URL would honour (the same trap as disableEngineWorker,
  // codex review on #2083).
  it('the rollback (disableSpaModelNav on in FeatureFlags.js) wins over ?feature=spaModelNav', () => {
    withStaticFlag('disableSpaModelNav', true, () => {
      for (const search of ['', '?feature=spaModelNav', '?feature=spaModelNav,workspace']) {
        setSearch(search)
        expect(modelPageLoadReason()).toBe(PageLoadReason.ROLLBACK)
        expect(isSpaModelNavOn()).toBe(false)
        expect(modelNavMode()).toBe('page-load:rollback')
      }
    })
  })
})

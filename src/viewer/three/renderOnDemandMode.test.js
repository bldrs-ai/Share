import {flags} from '../../FeatureFlags'
import {PaintEveryFrameReason, isRenderOnDemandOn, paintEveryFrameReason} from './renderOnDemandMode'


describe('viewer/three/renderOnDemandMode', () => {
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

  it('declares renderOnDemand on by default, with disableRenderOnDemand as its off-switch', () => {
    expect(flags.find((f) => f.name === 'renderOnDemand')?.isActive).toBe(true)
    expect(flags.find((f) => f.name === 'disableRenderOnDemand')?.isActive).toBe(false)
  })

  it('paints on demand on a plain URL, and with the old opt-in still named', () => {
    setSearch('')
    expect(paintEveryFrameReason()).toBeNull()
    expect(isRenderOnDemandOn()).toBe(true)
    setSearch('?feature=renderOnDemand')
    expect(isRenderOnDemandOn()).toBe(true)
  })

  it('?feature=disableRenderOnDemand paints every frame, even with the flag named', () => {
    for (const search of ['?feature=disableRenderOnDemand', '?feature=renderOnDemand,disableRenderOnDemand']) {
      setSearch(search)
      expect(paintEveryFrameReason()).toBe(PaintEveryFrameReason.KILL_SWITCH)
      expect(isRenderOnDemandOn()).toBe(false)
    }
  })

  it('with renderOnDemand off in FeatureFlags.js, only a URL opt-in paints on demand', () => {
    withStaticFlag('renderOnDemand', false, () => {
      setSearch('')
      expect(paintEveryFrameReason()).toBe(PaintEveryFrameReason.FLAG_OFF)
      // Which is why turning it off is NOT the rollback: a link that still
      // says `?feature=renderOnDemand` stays on demand.
      setSearch('?feature=renderOnDemand')
      expect(isRenderOnDemandOn()).toBe(true)
    })
  })

  // The rollback has to beat a URL opt-in, which `isFeatureEnabled`'s OR of
  // static and URL would honour (the same trap as disableEngineWorker,
  // codex review on #2083).
  it('the rollback (disableRenderOnDemand on in FeatureFlags.js) wins over ?feature=renderOnDemand', () => {
    withStaticFlag('disableRenderOnDemand', true, () => {
      for (const search of ['', '?feature=renderOnDemand', '?feature=renderOnDemand,perf']) {
        setSearch(search)
        expect(paintEveryFrameReason()).toBe(PaintEveryFrameReason.ROLLBACK)
        expect(isRenderOnDemandOn()).toBe(false)
      }
    })
  })
})

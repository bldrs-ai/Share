import {flags} from '../FeatureFlags'
import {
  MainThreadReason,
  hasLegacyViewRules,
  isLegacyBotRequested,
  mainThreadEngineNote,
  mainThreadEngineReason,
} from './engineRoute'


describe('engine/engineRoute', () => {
  let originalLocation
  const setSearch = (search, hash = '') => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search, hash}})
  }
  beforeEach(() => {
    originalLocation = window.location
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('runs a plain load in the engine worker', () => {
    setSearch('')
    expect(mainThreadEngineReason()).toBeNull()
    setSearch('?feature=engineWorker')
    expect(mainThreadEngineReason()).toBeNull()
  })

  it('the kill switch puts the main-thread engine back, even with the flag named', () => {
    setSearch('?feature=disableEngineWorker')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.KILL_SWITCH)
    setSearch('?feature=engineWorker,disableEngineWorker')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.KILL_SWITCH)
  })

  it('a known ?view= rule set loads on the main-thread engine, which applies it', () => {
    setSearch('?view=ch.sia380-1.heatmap')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.VIEW_RULES)
    // The default view and a name ShareViewer does not know do nothing on
    // either engine, so they leave the load in the worker.
    setSearch('?view=default')
    expect(mainThreadEngineReason()).toBeNull()
    setSearch('?view=made-up')
    expect(mainThreadEngineReason()).toBeNull()
  })

  it('the legacy ?feature=bot chat loads on the main-thread engine; ?feature=assist does not', () => {
    setSearch('?feature=bot')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.LEGACY_BOT)
    setSearch('?feature=assist')
    expect(mainThreadEngineReason()).toBeNull()
  })

  // Codex review on #2083: a `#bot:` permalink opens the legacy chat with no
  // `?feature=bot` (BotSlice reads the hash), so the route has to read the
  // same hash, or the chat sits on a worker model it cannot read.
  it('a #bot: permalink loads on the main-thread engine, as ?feature=bot does', () => {
    setSearch('', '#bot:')
    expect(isLegacyBotRequested()).toBe(true)
    expect(mainThreadEngineReason()).toBe(MainThreadReason.LEGACY_BOT)
    setSearch('', '#c:1,2,3;bot:')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.LEGACY_BOT)
    // A hash without the bot token leaves the load in the worker.
    setSearch('', '#c:1,2,3')
    expect(isLegacyBotRequested()).toBe(false)
    expect(mainThreadEngineReason()).toBeNull()
  })

  it('names the switch the user set before a legacy consumer that is on too', () => {
    setSearch('?feature=bot,disableEngineWorker&view=ch.sia380-1.heatmap')
    expect(mainThreadEngineReason()).toBe(MainThreadReason.KILL_SWITCH)
  })

  it('with the flag off in FeatureFlags.js (the prod kill switch), nothing runs in a worker', () => {
    const flag = flags.find((f) => f.name === 'engineWorker')
    const was = flag.isActive
    flag.isActive = false
    try {
      setSearch('')
      expect(mainThreadEngineReason()).toBe(MainThreadReason.FLAG_OFF)
    } finally {
      flag.isActive = was
    }
  })

  // Codex review on #2083: the prod rollback must beat a URL opt-in. With
  // `isFeatureEnabled`'s OR, `engineWorker: false` would not: a link that
  // still says `?feature=engineWorker` stayed in the worker.
  it('the rollback (disableEngineWorker on in FeatureFlags.js) wins over ?feature=engineWorker', () => {
    const flag = flags.find((f) => f.name === 'disableEngineWorker')
    const was = flag.isActive
    flag.isActive = true
    try {
      for (const search of ['', '?feature=engineWorker', '?feature=engineWorker,assist']) {
        setSearch(search)
        expect(mainThreadEngineReason()).toBe(MainThreadReason.ROLLBACK)
      }
      expect(mainThreadEngineNote(MainThreadReason.ROLLBACK)).toBe(
        'Engine: main thread (the engine worker is rolled back: disableEngineWorker is on in FeatureFlags.js)')
    } finally {
      flag.isActive = was
    }
  })

  it('says why in one line', () => {
    expect(mainThreadEngineNote(MainThreadReason.VIEW_RULES)).toBe(
      'Engine: main thread (?view= rules need the main-thread engine)')
    expect(mainThreadEngineNote(MainThreadReason.KILL_SWITCH)).toBe(
      'Engine: main thread (?feature=disableEngineWorker)')
  })

  it('hasLegacyViewRules names a non-default view rule set, and nothing else', () => {
    expect(hasLegacyViewRules('?view=ch.sia380-1.heatmap')).toBe(true)
    expect(hasLegacyViewRules('?view=default')).toBe(false)
    expect(hasLegacyViewRules('?feature=engineWorker')).toBe(false)
    expect(hasLegacyViewRules('?view=made-up')).toBe(false)
  })
})

import {flags} from '../FeatureFlags'
import {
  MainThreadReason,
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

  // The `?view=` rules styled nothing on either engine and were deleted
  // (layering.md §7, slice V): no `?view=` moves a load any more.
  it('a ?view= link loads in the worker', () => {
    for (const search of ['?view=ch.sia380-1.heatmap', '?view=default', '?view=made-up']) {
      setSearch(search)
      expect(mainThreadEngineReason()).toBeNull()
    }
  })

  // The bot chat's eval read the main-thread engine; the Assist port (#1675)
  // deleted it, and the chat's tools read either engine, so neither its flag
  // nor its permalink moves a load any more.
  it('?feature=bot and a #bot: permalink load in the worker, as ?feature=assist does', () => {
    for (const [search, hash] of [['?feature=bot', ''], ['?feature=assist', ''], ['', '#bot:'], ['', '#c:1,2,3;bot:']]) {
      setSearch(search, hash)
      expect(mainThreadEngineReason()).toBeNull()
    }
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
    expect(Object.values(MainThreadReason)).toEqual(['rollback', 'flagOff', 'disableEngineWorker'])
    expect(mainThreadEngineNote(MainThreadReason.KILL_SWITCH)).toBe(
      'Engine: main thread (?feature=disableEngineWorker)')
  })
})

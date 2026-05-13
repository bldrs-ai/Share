/**
 * Tests for `PerfMonitor`.
 *
 * The module reads `?feature=perf` once at import and runs a
 * side-effect block (constructing the Monitor singleton, installing
 * `window.perf`) only when the flag is on.  To exercise both paths
 * we override `window.location` *before* `jest.resetModules() +
 * require()`.
 */

/**
 * Replace `window.location` so the module re-reads our chosen search
 * string on next import.  Matches the override pattern used in
 * `AlertDialog.test.jsx`.
 *
 * @param {string} search query string, including leading `?`
 */
function setLocationSearch(search) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {...window.location, search},
  })
}


describe('PerfMonitor — flag off (default jsdom)', () => {
  let mod

  beforeEach(() => {
    setLocationSearch('')
    delete window.perf
    jest.resetModules()
    mod = require('./PerfMonitor')
  })

  test('isPerfEnabled is false', () => {
    expect(mod.isPerfEnabled).toBe(false)
  })

  test('withPerf returns the input function unchanged (zero-cost contract)', () => {
    const fn = () => 0
    expect(mod.withPerf(fn)).toBe(fn)
  })

  test('mountPerfPanel is a no-op', () => {
    const parent = document.createElement('div')
    mod.mountPerfPanel(parent)
    expect(parent.children).toHaveLength(0)
  })

  test('unmountPerfPanel does not throw', () => {
    expect(() => mod.unmountPerfPanel()).not.toThrow()
  })

  test('window.perf is undefined', () => {
    expect(window.perf).toBeUndefined()
  })
})


describe('PerfMonitor — flag on (?feature=perf)', () => {
  let mod

  beforeEach(() => {
    setLocationSearch('?feature=perf')
    delete window.perf
    jest.resetModules()
    mod = require('./PerfMonitor')
  })

  afterEach(() => {
    delete window.perf
  })

  test('isPerfEnabled is true', () => {
    expect(mod.isPerfEnabled).toBe(true)
  })

  test('withPerf returns a wrapper that still calls the inner fn', () => {
    const fn = jest.fn()
    const wrapped = mod.withPerf(fn)
    expect(wrapped).not.toBe(fn)
    wrapped()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('window.perf exposes on/off/toggle', () => {
    expect(typeof window.perf.on).toBe('function')
    expect(typeof window.perf.off).toBe('function')
    expect(typeof window.perf.toggle).toBe('function')
  })

  test('mountPerfPanel attaches #perf-monitor into the parent', () => {
    const parent = document.createElement('div')
    mod.mountPerfPanel(parent)
    expect(parent.querySelector('#perf-monitor')).not.toBeNull()
  })

  test('unmountPerfPanel detaches the panel from its current host', () => {
    const parent = document.createElement('div')
    mod.mountPerfPanel(parent)
    expect(parent.querySelector('#perf-monitor')).not.toBeNull()
    mod.unmountPerfPanel()
    expect(parent.querySelector('#perf-monitor')).toBeNull()
  })

  test('window.perf.toggle flips visibility and returns the new hidden-state', () => {
    const parent = document.createElement('div')
    mod.mountPerfPanel(parent)
    const dom = parent.querySelector('#perf-monitor')
    expect(dom.style.display).toBe('')
    const wasHidden1 = window.perf.toggle()
    expect(wasHidden1).toBe(false)
    expect(dom.style.display).toBe('none')
    const wasHidden2 = window.perf.toggle()
    expect(wasHidden2).toBe(true)
    expect(dom.style.display).toBe('')
  })
})


describe('PerfMonitor — flag parsing', () => {
  /**
   * @param {string} search
   * @return {boolean}
   */
  function isEnabledFor(search) {
    setLocationSearch(search)
    delete window.perf
    jest.resetModules()
    return require('./PerfMonitor').isPerfEnabled
  }

  test('matches when `perf` appears alone', () => {
    expect(isEnabledFor('?feature=perf')).toBe(true)
  })

  test('matches when `perf` appears in a comma-separated list', () => {
    expect(isEnabledFor('?feature=bot,perf,screenshot')).toBe(true)
  })

  test('is case-insensitive', () => {
    expect(isEnabledFor('?feature=PERF')).toBe(true)
  })

  test('does not match for a different feature', () => {
    expect(isEnabledFor('?feature=bot')).toBe(false)
  })

  test('does not match when the `feature` param is absent', () => {
    expect(isEnabledFor('?foo=bar')).toBe(false)
  })
})

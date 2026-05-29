import {isSessionStorageAvailableNow} from './storage'


/*
 * The module-level `STORAGE_AVAILABLE` constant is set at first
 * import — in jsdom it'll be `true`. The runtime helper
 * `isSessionStorageAvailableNow` re-runs the probe so we can mock
 * different storage shapes per test.
 */


describe('isSessionStorageAvailableNow', () => {
  let originalSessionStorage

  beforeEach(() => {
    originalSessionStorage = window.sessionStorage
  })

  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    })
  })

  it('returns true in normal jsdom (sessionStorage available)', () => {
    expect(isSessionStorageAvailableNow()).toBe(true)
  })

  it('returns false when reading window.sessionStorage throws SecurityError', () => {
    // Mirror the SHARE-N7 shape: accessing `.sessionStorage` itself
    // throws the SecurityError, as Chrome does in third-party
    // iframes with cookies blocked.
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        const err = new Error(
          `Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.`,
        )
        err.name = 'SecurityError'
        err.code = 18
        throw err
      },
    })
    expect(isSessionStorageAvailableNow()).toBe(false)
  })

  it('returns false when setItem throws (older iOS Safari private mode shape)', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        },
        removeItem: () => {},
        getItem: () => null,
      },
    })
    expect(isSessionStorageAvailableNow()).toBe(false)
  })

  it('returns false when sessionStorage is null/undefined', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: null,
    })
    expect(isSessionStorageAvailableNow()).toBe(false)
  })
})

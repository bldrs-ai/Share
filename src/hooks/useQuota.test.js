import {act, renderHook} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import {isFeatureEnabled} from '../FeatureFlags'
import useQuota from './useQuota'


// Keep the real `flags` table; only stub the enforcement gate so each test
// drives the flag directly.
jest.mock('../FeatureFlags', () => ({
  ...jest.requireActual('../FeatureFlags'),
  isFeatureEnabled: jest.fn(),
}))


/**
 * The `quotas` feature flag gates enforcement. These cover the gate itself;
 * the per-tier / rolling-window correctness lives in src/quota/quota.test.js.
 */
describe('useQuota — quotas feature flag', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
  })

  it('reports unlimited capacity and makes record() a no-op when the flag is off', async () => {
    isFeatureEnabled.mockReturnValue(false)

    const {result} = renderHook(() => useQuota())

    expect(result.current.hasCapacity).toBe(true)
    expect(result.current.limit).toBe(Infinity)
    expect(result.current.used).toBe(0)

    // A private GitHub path would normally be counted and could be blocked;
    // with the flag off, record() resolves allowed without a server round-trip.
    await expect(result.current.record('/share/v/gh/owner/repo/main/private.ifc'))
      .resolves.toMatchObject({allowed: true})
  })

  it('enforces a finite per-tier limit when the flag is on', async () => {
    isFeatureEnabled.mockReturnValue(true)

    const {result} = renderHook(() => useQuota())

    // Settle the mount cascade (loadQuota → setQuota) inside act so the
    // async state update doesn't land outside act() and warn.
    await act(async () => {})

    // Anonymous (logged-out) tier has a finite cap, so the gate is live.
    expect(Number.isFinite(result.current.limit)).toBe(true)
  })
})


/**
 * In-memory OPFS holding `quota.json`, the shape quota.js reads and writes.
 *
 * @param {object} [initial] quota to start with, as quota.json holds it
 * @return {{read: Function}} the stored quota, parsed, or null
 */
function mockOpfs(initial = null) {
  let stored = initial === null ? null : JSON.stringify(initial)
  const handle = {
    getFile: () => Promise.resolve({
      text: () => (stored === null ? Promise.reject(new Error('not found')) : Promise.resolve(stored)),
    }),
    createWritable: () => Promise.resolve({
      write: (data) => {
        stored = data
        return Promise.resolve()
      },
      close: () => Promise.resolve(),
    }),
  }
  Object.defineProperty(global.navigator, 'storage', {
    value: {getDirectory: () => Promise.resolve({getFileHandle: () => Promise.resolve(handle)})},
    configurable: true,
  })
  return {read: () => (stored === null ? null : JSON.parse(stored))}
}


/**
 * Share#1966 at the hook, signed out (the OPFS-only path): local files are
 * free and unmetered, Drive is counted, and `meterLocalFiles` puts local
 * files back under the cap.
 */
describe('useQuota — local files (signed out)', () => {
  const localKey = (i) => `/share/v/local-only/0b4c2f1e-8d6a-4c3b-9e2f-00000000000${i}.ifc`
  let opfs

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    opfs = mockOpfs()
  })

  afterEach(() => {
    delete global.navigator.storage
  })

  it('never counts or refuses a local file with the local meter off', async () => {
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    const {result} = renderHook(() => useQuota())
    await act(async () => {})

    for (let i = 0; i < 5; i++) {
      let outcome
      await act(async () => {
        outcome = await result.current.record(localKey(i))
      })
      expect(outcome.allowed).toBe(true)
    }
    expect(result.current.used).toBe(0)
    expect(opfs.read()).toBeNull()
  })

  it('counts Drive files, and refuses past the anonymous cap', async () => {
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    const {result} = renderHook(() => useQuota())
    await act(async () => {})

    const outcomes = []
    for (const id of ['a', 'b', 'c']) {
      await act(async () => {
        outcomes.push(await result.current.record(`/share/v/g/${id}`))
      })
    }
    expect(outcomes.map((o) => o.allowed)).toEqual([true, true, false])
    expect(opfs.read().loads).toHaveLength(2)
  })

  // `meterLocalFiles` goes through the URL, not the isFeatureEnabled mock:
  // quota.js, which reads it, is first loaded by the test setup (via the MSW
  // handlers) before this file's jest.mock applies, so it holds the real
  // isFeatureEnabled — which reads `?feature=` like a user's session would.
  it('counts local files and refuses past the cap when meterLocalFiles is on', async () => {
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    window.history.pushState({}, '', '/share/v/p/index.ifc?feature=meterLocalFiles')
    try {
      const {result} = renderHook(() => useQuota())
      await act(async () => {})

      const outcomes = []
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          outcomes.push(await result.current.record(localKey(i)))
        })
      }
      expect(outcomes.map((o) => o.allowed)).toEqual([true, true, false])
      expect(opfs.read().loads.map((l) => l.key)).toEqual([localKey(0), localKey(1)])
    } finally {
      window.history.pushState({}, '', '/')
    }
  })
})


/**
 * The rolling window at the hook (agent review on Share#1974): check()
 * prunes at call time, so a slot that rolls off while the tab stays open is
 * free immediately, not at the next record() or remount.
 */
describe('useQuota — check() re-prunes at call time', () => {
  const WINDOW_MS = 604_800_000 // 7 days
  const SECOND_MS = 1000
  const NOW = Date.parse('2026-10-26T12:00:00.000Z')

  afterEach(() => {
    delete global.navigator.storage
    jest.restoreAllMocks()
  })

  it('frees a slot that rolls off after mount, without a remount', async () => {
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW)
    // Two Drive models: one now, one a second short of rolling off.
    mockOpfs({tier: 'free', loads: [
      {key: '/share/v/g/recent', loadedAt: new Date(NOW).toISOString()},
      {key: '/share/v/g/rolling-off', loadedAt: new Date(NOW - WINDOW_MS + SECOND_MS).toISOString()},
    ]})
    const {result} = renderHook(() => useQuota())
    await act(async () => {})

    expect(result.current.check('/share/v/g/third')).toMatchObject({allowed: false, used: 2})

    nowSpy.mockReturnValue(NOW + SECOND_MS)
    expect(result.current.check('/share/v/g/third')).toMatchObject({allowed: true, used: 1})
  })
})

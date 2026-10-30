import {act, cleanup, renderHook} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import {getProvider} from '../connections/registry'
import {isFeatureEnabled} from '../FeatureFlags'
import {HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_OK} from '../net/http'
import {DRIVE_VISIBILITY, driveFileQuotaVisibility} from '../quota/driveVisibility'
import {FREE_PRIVATE_MODEL_LIMIT} from '../quota/limits'
import useStore from '../store/useStore'
import useQuota from './useQuota'


// Keep the real `flags` table; only stub the enforcement gate so each test
// drives the flag directly.
jest.mock('../FeatureFlags', () => ({
  ...jest.requireActual('../FeatureFlags'),
  isFeatureEnabled: jest.fn(),
}))
// Only getProvider, so a test can hand driveFileQuotaVisibility a Drive
// provider whose lookup fails.
jest.mock('../connections/registry', () => ({
  ...jest.requireActual('../connections/registry'),
  getProvider: jest.fn(),
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
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    const {result} = renderHook(() => useQuota())

    // Settle the mount cascade (loadQuota → setQuota) inside act so the
    // async state update doesn't land outside act() and warn.
    await act(async () => {})

    // A signed-in free user has a finite cap, so the gate is live.
    expect(result.current.tier).toBe('free')
    expect(result.current.limit).toBe(FREE_PRIVATE_MODEL_LIMIT)
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
 * Signed out is never metered: there is no anonymous tier, no OPFS ledger
 * and no refusal, for Drive links (all a signed-out user can open of a
 * cloud model is a link-shared, so public, file) and for local files, even
 * with the `meterLocalFiles` abuse switch on.
 */
describe('useQuota — signed out', () => {
  const localKey = (i) => `/share/v/local-only/0b4c2f1e-8d6a-4c3b-9e2f-00000000000${i}.ifc`
  const realFetch = global.fetch
  let opfs

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    opfs = mockOpfs()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    delete global.navigator.storage
    global.fetch = realFetch
  })

  it('reports no tier and unlimited capacity', async () => {
    const {result} = renderHook(() => useQuota())
    await act(async () => {})
    expect(result.current.tier).toBeNull()
    expect(result.current.limit).toBe(Infinity)
    expect(result.current.hasCapacity).toBe(true)
  })

  it('never counts or refuses a local file with the local meter off', async () => {
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

  it('opens any number of Drive links without recording one', async () => {
    const {result} = renderHook(() => useQuota())
    await act(async () => {})

    const outcomes = []
    for (const id of ['a', 'b', 'c', 'd']) {
      await act(async () => {
        outcomes.push(await result.current.record(`/share/v/g/${id}`))
      })
    }
    expect(outcomes.map((o) => o.allowed)).toEqual([true, true, true, true])
    expect(opfs.read()).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // `meterLocalFiles` goes through the URL, not the isFeatureEnabled mock:
  // quota.js, which reads it, is first loaded by the test setup (via the MSW
  // handlers) before this file's jest.mock applies, so it holds the real
  // isFeatureEnabled — which reads `?feature=` like a user's session would.
  // The switch meters signed-in free users only (design/new/quotas.md
  // §"Metering local files again").
  it('does not meter local files even with meterLocalFiles on', async () => {
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
      expect(outcomes.map((o) => o.allowed)).toEqual([true, true, true])
      expect(opfs.read()).toBeNull()
    } finally {
      window.history.pushState({}, '', '/')
    }
  })
})


/**
 * A record-load stand-in for a free user: counts what it is sent, as the
 * real function does for Drive keys, refusing past the limit with 403.
 *
 * @param {Array<string>} seededKeys keys already on the ledger
 * @return {{fetch: Function, keys: Function}} the fetch mock, and the ledger
 */
function fakeRecordLoad(seededKeys = []) {
  let loads = seededKeys.map((key) => ({key, loadedAt: new Date().toISOString()}))
  const respond = (status, body) => Promise.resolve({ok: status < HTTP_BAD_REQUEST, status, json: () => Promise.resolve(body)})
  const fetch = jest.fn((url, init) => {
    const {key} = JSON.parse(init.body)
    if (loads.some((l) => l.key === key)) {
      return respond(HTTP_OK, {allowed: true, used: loads.length, limit: 2, tier: 'free', alreadyCounted: true, loads})
    }
    if (loads.length >= FREE_PRIVATE_MODEL_LIMIT) {
      return respond(HTTP_FORBIDDEN, {allowed: false, used: loads.length, limit: 2, tier: 'free', alreadyCounted: false, loads})
    }
    loads = [...loads, {key, loadedAt: new Date().toISOString()}]
    return respond(HTTP_OK, {allowed: true, used: loads.length, limit: 2, tier: 'free', alreadyCounted: false, loads})
  })
  return {fetch, keys: () => loads.map((l) => l.key)}
}


/**
 * Drive by visibility, signed in (design/new/quotas.md §"Drive visibility"):
 * a link-shared file is public, like a public GitHub repo, and never sent to
 * record-load; a restricted one is private and counted; and when the
 * visibility can't be learned, the file counts, as every Drive file did.
 */
describe('useQuota — Drive visibility (signed in)', () => {
  const realFetch = global.fetch
  const seeded = ['/share/v/g/seeded-0', '/share/v/g/seeded-1']
  const DRIVE_KEY = '/share/v/g/1BxDriveFileId0000000000000'
  const connection = {id: 'gd-1', providerId: 'google-drive'}
  const visibility = (v) => jest.fn(() => Promise.resolve(v))

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    mockedUserLoggedIn.getAccessTokenSilently.mockResolvedValue('token')
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    act(() => useStore.setState({appMetadata: {subscriptionStatus: 'free'}}))
    mockOpfs()
  })

  afterEach(() => {
    // Unmount first: resetting the tier under a mounted hook would start an
    // OPFS read that settles outside act.
    cleanup()
    delete global.navigator.storage
    global.fetch = realFetch
    act(() => useStore.setState({appMetadata: null}))
  })

  /**
   * @param {string} key
   * @param {object} [options] record() options
   * @return {Promise<object>} record()'s outcome, from a freshly mounted hook
   */
  async function recordOnce(key, options) {
    const {result} = renderHook(() => useQuota())
    await act(async () => {})
    let outcome
    await act(async () => {
      outcome = await result.current.record(key, options)
    })
    return outcome
  }

  it('a link-shared Drive file at the limit opens, and is never sent or counted', async () => {
    const server = fakeRecordLoad(seeded)
    global.fetch = server.fetch
    const resolveDriveVisibility = visibility(DRIVE_VISIBILITY.PUBLIC)

    const outcome = await recordOnce(DRIVE_KEY, {resolveDriveVisibility})

    expect(resolveDriveVisibility).toHaveBeenCalledTimes(1)
    expect(outcome.allowed).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(server.keys()).toEqual(seeded)
  })

  it('a restricted Drive file is counted, and refused at the limit', async () => {
    const server = fakeRecordLoad(seeded.slice(0, 1))
    global.fetch = server.fetch
    expect((await recordOnce(DRIVE_KEY, {resolveDriveVisibility: visibility(DRIVE_VISIBILITY.PRIVATE)})).allowed)
      .toBe(true)
    expect(server.keys()).toEqual([seeded[0], DRIVE_KEY])

    const refused = await recordOnce('/share/v/g/another', {resolveDriveVisibility: visibility(DRIVE_VISIBILITY.PRIVATE)})
    expect(refused.allowed).toBe(false)
    expect(server.keys()).toEqual([seeded[0], DRIVE_KEY])
  })

  /**
   * One fetch for both callers: record-load goes to the fake server, the
   * anonymous Drive download the visibility check tries with the API key goes
   * to `metadata`.
   *
   * @param {{fetch: Function}} server fakeRecordLoad's
   * @param {number} metadataStatus HTTP status the API-key download probe gets
   * @return {Function} the metadata request's mock
   */
  function routeFetch(server, metadataStatus) {
    const metadata = jest.fn(() => Promise.resolve({status: metadataStatus}))
    global.fetch = jest.fn((url, init) => String(url).startsWith('https://www.googleapis.com/drive/v3/files/') ?
      metadata(url) :
      server.fetch(url, init))
    return metadata
  }

  // Drive refuses permissions.list to a user who can only read the file.
  const refusedLookup = () => getProvider.mockReturnValue({
    getVisibility: jest.fn(() => Promise.reject(new Error('403 insufficientFilePermissions'))),
  })

  it('a refused lookup on a file the API key can read is link-shared: not sent, not counted', async () => {
    const server = fakeRecordLoad(seeded)
    const metadata = routeFetch(server, HTTP_OK)
    refusedLookup()

    const outcome = await recordOnce(DRIVE_KEY, {
      resolveDriveVisibility: () => driveFileQuotaVisibility(connection, 'x'),
    })

    expect(metadata).toHaveBeenCalledTimes(1)
    expect(server.fetch).not.toHaveBeenCalled()
    expect(outcome.allowed).toBe(true)
    expect(server.keys()).toEqual(seeded)
  })

  it('a refused lookup the API key cannot read either counts the file as private', async () => {
    const server = fakeRecordLoad(seeded)
    const metadata = routeFetch(server, HTTP_FORBIDDEN)
    refusedLookup()

    const outcome = await recordOnce(DRIVE_KEY, {
      resolveDriveVisibility: () => driveFileQuotaVisibility(connection, 'x'),
    })

    expect(metadata).toHaveBeenCalledTimes(1)
    expect(server.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(server.fetch.mock.calls[0][1].body)).toEqual({key: DRIVE_KEY})
    expect(outcome.allowed).toBe(false)
  })

  it('a Drive key with no way to learn its visibility counts as private', async () => {
    const server = fakeRecordLoad()
    global.fetch = server.fetch
    await recordOnce(DRIVE_KEY)
    expect(server.keys()).toEqual([DRIVE_KEY])
  })

  it('a Pro user costs no lookup', async () => {
    act(() => useStore.setState({appMetadata: {subscriptionStatus: 'sharePro'}}))
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({allowed: true, used: 0, limit: null, tier: 'paid'}),
    }))
    const resolveDriveVisibility = visibility(DRIVE_VISIBILITY.PRIVATE)
    expect((await recordOnce(DRIVE_KEY, {resolveDriveVisibility})).allowed).toBe(true)
    expect(resolveDriveVisibility).not.toHaveBeenCalled()
  })

  it('with record-load unreachable, counts a restricted Drive file locally but not a link-shared one', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    await recordOnce('/share/v/g/public', {resolveDriveVisibility: visibility(DRIVE_VISIBILITY.PUBLIC)})
    await recordOnce(DRIVE_KEY, {resolveDriveVisibility: visibility(DRIVE_VISIBILITY.PRIVATE)})
    const stored = await navigator.storage.getDirectory()
      .then((root) => root.getFileHandle('quota.json'))
      .then((h) => h.getFile())
      .then((f) => f.text())
    expect(JSON.parse(stored).loads.map((l) => l.key)).toEqual([DRIVE_KEY])
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

  // Local files, with the meter on: the one kind check() can refuse on its
  // own. A Drive key passes check() at the limit (its visibility takes a
  // lookup, which record() makes), so it can't show a slot freeing.
  // `meterLocalFiles` goes through the URL, as in the signed-out suite above.
  it('frees a slot that rolls off after mount, without a remount', async () => {
    isFeatureEnabled.mockImplementation((name) => name === 'quotas')
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    window.history.pushState({}, '', '/share/v/p/index.ifc?feature=meterLocalFiles')
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW)
    const localKey = (name) => `/share/v/local-only/${name}.ifc`
    // Two models: one now, one a second short of rolling off.
    mockOpfs({tier: 'free', loads: [
      {key: localKey('recent'), loadedAt: new Date(NOW).toISOString()},
      {key: localKey('rolling-off'), loadedAt: new Date(NOW - WINDOW_MS + SECOND_MS).toISOString()},
    ]})
    try {
      const {result} = renderHook(() => useQuota())
      await act(async () => {})

      expect(result.current.check(localKey('third'))).toMatchObject({allowed: false, used: 2})

      nowSpy.mockReturnValue(NOW + SECOND_MS)
      expect(result.current.check(localKey('third'))).toMatchObject({allowed: true, used: 1})
    } finally {
      window.history.pushState({}, '', '/')
    }
  })
})

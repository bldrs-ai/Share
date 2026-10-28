import {act, renderHook} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import {getProvider} from '../connections/registry'
import useQuota from '../hooks/useQuota'
import {HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_OK} from '../net/http'
import {gtagEventWithCid, trackModelAction} from '../privacy/analytics'
import {handleRoute} from '../routes/routes'
import useStore from '../store/useStore'
import useDirectLinkQuota, {directLinkQuotaKey} from './useDirectLinkQuota'


// The quota hook is the seam under test's collaborator: its own suite
// (hooks/useQuota.test.js) and record-load's cover what record() does with a
// key. In the first suite it is a spy, so those tests pin WHEN the
// direct-link path calls it and what it does with the answer; the second
// puts the real hook back to pin the dedup across the dialog and a link.
jest.mock('../hooks/useQuota')
// GATE_EVENTS stays real so the event name asserted is the one that ships;
// gtagEventWithCid is what attaches open_cid (privacy/analytics.test.js).
jest.mock('../privacy/analytics', () => ({
  ...jest.requireActual('../privacy/analytics'),
  gtagEventWithCid: jest.fn(),
  trackModelAction: jest.fn(),
}))
// getProvider only: the Drive visibility lookup's provider, per test.
jest.mock('../connections/registry', () => ({
  ...jest.requireActual('../connections/registry'),
  getProvider: jest.fn(),
}))


const APP_PREFIX = '/share'
const DRIVE_ID = '17aKaRB6EU2fJtBpmpmZ87IlwZ-J-4XrU'
const DRIVE_KEY = `/share/v/g/${DRIVE_ID}`
const DRIVE_CONNECTION = {id: 'gd-1', providerId: 'google-drive'}
// How CadView#loadModel downloaded the file: with the API key (only a
// link-shared file downloads that way), or through the user's connection.
const API_KEY_DOWNLOAD = {fileId: DRIVE_ID, connection: null}
const CONNECTION_DOWNLOAD = {fileId: DRIVE_ID, connection: DRIVE_CONNECTION}


/**
 * A route result exactly as Share.jsx gets it from a pasted URL.
 *
 * @param {string} pathPrefix e.g. '/share/v/g'
 * @param {object} params react-router params; `*` is the file part
 * @return {object} route result
 */
function routeFor(pathPrefix, params) {
  return handleRoute(pathPrefix, params)
}


const driveRoute = () => routeFor('/share/v/g', {'*': DRIVE_ID})
const githubRoute = (repo = 'private-repo') =>
  routeFor('/share/v/gh', {'org': 'acme', repo, 'branch': 'main', '*': 'models/tower.ifc/12/34'})


/**
 * @param {object} [opts]
 * @param {object} [opts.recordOutcome] what record() resolves to
 * @return {{record: Function, check: Function}} jest mocks
 */
function mockQuota({recordOutcome = {allowed: true, used: 1, limit: 2, tier: 'free', alreadyCounted: false}} = {}) {
  const record = jest.fn(() => Promise.resolve(recordOutcome))
  // check() reports every key as already counted: the hook must not consult
  // it (the local mirror is per browser, not per user; see the hook's doc).
  const check = jest.fn(() => ({allowed: true, used: 0, limit: 2, alreadyCounted: true}))
  useQuota.mockReturnValue({used: 0, limit: 2, tier: 'free', hasCapacity: true, record, check})
  return {record, check}
}


/**
 * Render the hook and meter the given routes, one per CadView load.
 *
 * @param {Array<object>} routes route results, in load order
 * @return {Promise<object>} the renderHook result
 */
async function meter(...routes) {
  const hook = renderHook(() => useDirectLinkQuota(APP_PREFIX))
  for (const route of routes) {
    // A [route, driveDownload] pair passes CadView's second argument too.
    const [modelPath, driveDownload] = Array.isArray(route) ? route : [route]
    await act(async () => {
      hook.result.current(modelPath, driveDownload)
      // Let record()'s resolved promise (and its .then) settle inside act.
      await Promise.resolve()
    })
  }
  return hook
}


describe('quota/useDirectLinkQuota', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
  })

  it('records a direct private Drive load once, under the Open dialog\'s key', async () => {
    const {record, check} = mockQuota()
    await meter(driveRoute())
    expect(check).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(DRIVE_KEY)
    expect(gtagEventWithCid).not.toHaveBeenCalled()
    expect(trackModelAction).not.toHaveBeenCalled()
  })

  it('a Drive file downloaded with the API key is public: record() is told so, without a lookup', async () => {
    const {record} = mockQuota()
    await meter([driveRoute(), API_KEY_DOWNLOAD])
    expect(record).toHaveBeenCalledTimes(1)
    const [key, {resolveDriveVisibility}] = record.mock.calls[0]
    expect(key).toBe(DRIVE_KEY)
    await expect(resolveDriveVisibility()).resolves.toBe('public')
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('a Drive file downloaded through a connection is looked up with that connection', async () => {
    const getVisibility = jest.fn(() => Promise.resolve('private'))
    getProvider.mockReturnValue({getVisibility})
    const {record} = mockQuota()
    await meter([driveRoute(), CONNECTION_DOWNLOAD])
    const [, {resolveDriveVisibility}] = record.mock.calls[0]
    await expect(resolveDriveVisibility()).resolves.toBe('private')
    expect(getVisibility).toHaveBeenCalledWith(DRIVE_CONNECTION, {kind: 'drive-file', fileId: DRIVE_ID})
  })

  it('over the limit, sends quota_soft_limit_exceeded and does not block', async () => {
    const {record} = mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false}})
    const {result} = await meter(driveRoute())
    expect(record).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).toHaveBeenCalledWith('quota_soft_limit_exceeded',
      {tier: 'free', used: 2, limit: 2, route_kind: 'gdrive'})
    // Its normalized twin, with the tier record-load acted on.
    // ...naming the model with real_model_open's value for it (Share#1981).
    expect(trackModelAction.mock.calls).toEqual([['share', {
      gate: 'soft', source: 'hosted', routeKind: 'gdrive', tier: 'free', contentId: String(driveRoute().downloadUrl),
    }]])
    // Fire-and-forget: the meter returns nothing for a caller to await or
    // branch on, so CadView's load cannot be held or undone by it.
    let returned = null
    act(() => {
      returned = result.current(driveRoute())
    })
    expect(returned).toBeUndefined()
  })

  // The id is snapshotted with the route that was metered: record-load
  // answers after the load, and the user may have opened another model by
  // then (Share#1981).
  it('credits the soft-gated share to the model that was metered, not one opened since', async () => {
    const answers = []
    const record = jest.fn(() => new Promise((resolve) => {
      answers.push(resolve)
    }))
    useQuota.mockReturnValue({used: 0, limit: 2, tier: 'free', hasCapacity: true, record, check: jest.fn()})
    const hook = renderHook(() => useDirectLinkQuota(APP_PREFIX))
    act(() => {
      hook.result.current(driveRoute())
    })
    // The user opens a GitHub model before the Drive load's answer lands.
    act(() => {
      hook.result.current(githubRoute())
    })
    expect(answers).toHaveLength(2)
    await act(async () => {
      answers[0]({allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false})
      await Promise.resolve()
    })

    expect(trackModelAction).toHaveBeenCalledTimes(1)
    expect(trackModelAction.mock.calls[0][1].contentId).toBe(String(driveRoute().downloadUrl))
    expect(trackModelAction.mock.calls[0][1].contentId).not.toBe(String(githubRoute().downloadUrl))
  })

  // Share#1977: signed-out users are never metered, so there is no
  // "anonymous" tier for record-load to answer with. Should an outcome carry
  // no tier, model_share falls back to the sign-in tier at emit time and does
  // not claim a tier the gate never gave.
  it('an outcome with no tier sends model_share under the emit-time sign-in tier', async () => {
    act(() => useStore.setState({isAuthResolved: true, appMetadata: {subscriptionStatus: 'free'}}))
    mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, alreadyCounted: false}})
    await meter(driveRoute())
    await act(async () => {})
    expect(trackModelAction).toHaveBeenCalledTimes(1)
    const [action, details] = trackModelAction.mock.calls[0]
    expect(action).toBe('share')
    expect(details).toEqual(expect.objectContaining({gate: 'soft', isAuthenticated: true}))
    expect(details.tier).toBeUndefined()
  })

  it('reports GitHub as route_kind github, keyed like GitHubFileBrowser (no element path)', async () => {
    const {record} = mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false}})
    await meter(githubRoute())
    expect(record).toHaveBeenCalledWith('/share/v/gh/acme/private-repo/main/models/tower.ifc')
    expect(gtagEventWithCid).toHaveBeenCalledWith('quota_soft_limit_exceeded',
      expect.objectContaining({route_kind: 'github'}))
  })

  it('never calls record() for a local file, a hosted /v/p/ model or a generic URL', async () => {
    const {record} = mockQuota()
    await meter(
      routeFor('/share/v/local-only', {'*': '0b4c2f1e-8d6a-4c3b-9e2f-000000000001.ifc'}),
      routeFor('/share/v/p', {'*': 'index.ifc'}),
      routeFor('/share/v/u', {'*': 'https://example.com/model.ifc'}),
    )
    expect(record).not.toHaveBeenCalled()
  })

  it('a public GitHub load the server says is not quotable sends nothing', async () => {
    // Privacy of a /v/gh/ path is record-load's call (its unauthenticated
    // repo lookup), so the client asks; a public repo comes back allowed and
    // uncounted, and the soft gate stays silent.
    const {record} = mockQuota({recordOutcome: {allowed: true, used: 0, limit: 2, tier: 'free', alreadyCounted: false}})
    await meter(githubRoute('Momentum-Public'))
    expect(record).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).not.toHaveBeenCalled()
  })

  it('meters a model once per page load: a re-init or A → B → A is not a second open', async () => {
    const {record} = mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false}})
    await meter(driveRoute(), driveRoute(), githubRoute(), driveRoute())
    expect(record.mock.calls).toEqual([[DRIVE_KEY], ['/share/v/gh/acme/private-repo/main/models/tower.ifc']])
    expect(gtagEventWithCid).toHaveBeenCalledTimes(2)
  })

  it('waits for Auth0 to settle before recording', async () => {
    // While Auth0 is loading, isAuthenticated is still false and record()
    // would treat the user as signed out (never metered), skipping the
    // server's ledger.
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, isAuthenticated: false, isLoading: true})
    const {record} = mockQuota()
    const hook = await meter(driveRoute())
    expect(record).not.toHaveBeenCalled()

    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    await act(async () => {
      hook.rerender()
      await Promise.resolve()
    })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(DRIVE_KEY)
  })
})


/**
 * In-memory OPFS holding `quota.json`, the shape quota.js reads and writes
 * (as hooks/useQuota.test.js mocks it).
 *
 * @param {object|null} initial quota to start with, or null for none
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
 * A record-load stand-in for a free user: counts what it is sent, refusing
 * past the limit with 403 (as hooks/useQuota.test.js fakes it).
 *
 * @param {Array<string>} seededKeys keys already on the ledger
 * @return {{fetch: Function, keys: Function}} the fetch mock, and the ledger
 */
function fakeRecordLoad(seededKeys = []) {
  const limit = 2
  let loads = seededKeys.map((key) => ({key, loadedAt: new Date().toISOString()}))
  const respond = (status, body) => Promise.resolve({ok: status < HTTP_BAD_REQUEST, status, json: () => Promise.resolve(body)})
  const fetch = jest.fn((url, init) => {
    const {key} = JSON.parse(init.body)
    if (loads.some((l) => l.key === key)) {
      return respond(HTTP_OK, {allowed: true, used: loads.length, limit, tier: 'free', alreadyCounted: true, loads})
    }
    if (loads.length >= limit) {
      return respond(HTTP_FORBIDDEN, {allowed: false, used: loads.length, limit, tier: 'free', alreadyCounted: false, loads})
    }
    loads = [...loads, {key, loadedAt: new Date().toISOString()}]
    return respond(HTTP_OK, {allowed: true, used: loads.length, limit, tier: 'free', alreadyCounted: false, loads})
  })
  return {fetch, keys: () => loads.map((l) => l.key)}
}


/**
 * The real useQuota under the direct-link hook, as CadView and the Open
 * dialog share it.
 *
 * @return {Promise<object>} renderHook result; current is {quota, meter}
 */
async function renderWithRealQuota() {
  const hook = renderHook(() => ({quota: useQuota(), meter: useDirectLinkQuota(APP_PREFIX)}))
  // Settle the OPFS read on mount inside act.
  await act(async () => {})
  return hook
}


describe('quota/useDirectLinkQuota with the real useQuota', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    useQuota.mockImplementation(jest.requireActual('../hooks/useQuota').default)
    // A recorded load force-refreshes the token, which needs a promise back.
    mockedUserLoggedIn.getAccessTokenSilently.mockResolvedValue('token')
  })

  afterEach(() => {
    delete global.navigator.storage
    global.fetch = realFetch
  })

  it('a model opened from the Open dialog, then from a pasted link, is counted once', async () => {
    // A restricted Drive file. The link is the Drive-URL form, which has to
    // land on the dialog's key to dedup.
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    mockOpfs()
    getProvider.mockReturnValue({getVisibility: () => Promise.resolve('private')})
    const server = fakeRecordLoad()
    global.fetch = server.fetch
    const {result} = await renderWithRealQuota()

    await act(async () => {
      await result.current.quota.record(DRIVE_KEY, {resolveDriveVisibility: () => Promise.resolve('private')})
    })
    await act(async () => {
      result.current.meter(routeFor('/share/v/g', {'*': `https://drive.google.com/file/d/${DRIVE_ID}/view`}),
        CONNECTION_DOWNLOAD)
      await Promise.resolve()
    })
    await act(async () => {})

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(server.keys()).toEqual([DRIVE_KEY])
    expect(gtagEventWithCid).not.toHaveBeenCalled()
  })

  // The anonymous tier is gone: a signed-out user is never metered. This
  // browser still holds the old anonymous ledger, at its cap of 2, which
  // used to refuse a third Drive link and send the soft-limit event.
  it('a signed-out user opening a link-shared Drive file records nothing and sends nothing', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const anonymousLedger = {tier: 'anonymous', loads: [0, 1].map((i) => (
      {key: `/share/v/g/old-${i}`, loadedAt: new Date().toISOString()}))}
    const opfs = mockOpfs(anonymousLedger)
    global.fetch = jest.fn()
    const {result} = await renderWithRealQuota()

    await act(async () => {
      result.current.meter(driveRoute(), API_KEY_DOWNLOAD)
      await Promise.resolve()
    })
    await act(async () => {})

    expect(opfs.read()).toEqual(anonymousLedger)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(gtagEventWithCid).not.toHaveBeenCalled()
  })

  it('a free user at the limit opening a link-shared Drive file is not counted or flagged', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    mockOpfs()
    const server = fakeRecordLoad(['/share/v/g/seeded-0', '/share/v/g/seeded-1'])
    global.fetch = server.fetch
    const {result} = await renderWithRealQuota()

    await act(async () => {
      result.current.meter(driveRoute(), API_KEY_DOWNLOAD)
      await Promise.resolve()
    })
    await act(async () => {})

    expect(global.fetch).not.toHaveBeenCalled()
    expect(gtagEventWithCid).not.toHaveBeenCalled()
  })

  it('a free user at the limit opening a restricted Drive file through a connection is flagged', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    mockOpfs()
    getProvider.mockReturnValue({getVisibility: () => Promise.resolve('private')})
    const server = fakeRecordLoad(['/share/v/g/seeded-0', '/share/v/g/seeded-1'])
    global.fetch = server.fetch
    const {result} = await renderWithRealQuota()

    await act(async () => {
      result.current.meter(driveRoute(), CONNECTION_DOWNLOAD)
      await Promise.resolve()
    })
    await act(async () => {})

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).toHaveBeenCalledWith('quota_soft_limit_exceeded',
      {tier: 'free', used: 2, limit: 2, route_kind: 'gdrive'})
  })

  it('a signed-in direct load asks the server even when this browser\'s OPFS holds the key', async () => {
    // The row came from another account in this browser; this account's
    // server ledger is full without it. Trusting the local mirror would
    // skip record-load, so the load would go unmetered and uncounted
    // (codex review on Share#1971).
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    mockOpfs({tier: 'free', loads: [{key: DRIVE_KEY, loadedAt: new Date().toISOString()}]})
    const serverLoads = [0, 1].map((i) => ({key: `/share/v/g/other-${i}`, loadedAt: new Date().toISOString()}))
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve({allowed: false, used: 2, limit: 2, tier: 'free', loads: serverLoads}),
    }))
    const {result} = await renderWithRealQuota()

    await act(async () => {
      result.current.meter(driveRoute())
      await Promise.resolve()
    })
    await act(async () => {})

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/.netlify/functions/record-load')
    expect(JSON.parse(init.body)).toEqual({key: DRIVE_KEY})
    expect(gtagEventWithCid).toHaveBeenCalledWith('quota_soft_limit_exceeded',
      {tier: 'free', used: 2, limit: 2, route_kind: 'gdrive'})
  })
})


describe('quota/useDirectLinkQuota#directLinkQuotaKey', () => {
  it('maps a pasted Drive URL to the same key as the bare file id', () => {
    const fromUrl = routeFor('/share/v/g', {'*': `https://drive.google.com/file/d/${DRIVE_ID}/view`})
    expect(directLinkQuotaKey(fromUrl, APP_PREFIX)).toEqual({key: DRIVE_KEY, routeKind: 'gdrive', fileId: DRIVE_ID})
    expect(directLinkQuotaKey(driveRoute(), APP_PREFIX)).toEqual({key: DRIVE_KEY, routeKind: 'gdrive', fileId: DRIVE_ID})
  })

  it('is null for no route', () => {
    expect(directLinkQuotaKey(null, APP_PREFIX)).toBeNull()
  })
})

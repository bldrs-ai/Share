import {act, renderHook} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn} from '../__mocks__/authentication'
import useQuota from '../hooks/useQuota'
import {gtagEventWithCid} from '../privacy/analytics'
import {handleRoute} from '../routes/routes'
import useDirectLinkQuota, {directLinkQuotaKey} from './useDirectLinkQuota'


// The quota hook is the seam under test's collaborator: its own suite
// (hooks/useQuota.test.js) and record-load's cover what record() does with a
// key. Here it is a spy, so these tests pin WHEN the direct-link path calls
// it and what it does with the answer.
jest.mock('../hooks/useQuota')
// GATE_EVENTS stays real so the event name asserted is the one that ships;
// gtagEventWithCid is what attaches open_cid (privacy/analytics.test.js).
jest.mock('../privacy/analytics', () => ({
  ...jest.requireActual('../privacy/analytics'),
  gtagEventWithCid: jest.fn(),
}))


const APP_PREFIX = '/share'
const DRIVE_ID = '17aKaRB6EU2fJtBpmpmZ87IlwZ-J-4XrU'
const DRIVE_KEY = `/share/v/g/${DRIVE_ID}`


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
 * @param {boolean} [opts.alreadyCounted] what check() reports
 * @return {{record: Function, check: Function}} jest mocks
 */
function mockQuota({recordOutcome = {allowed: true, used: 1, limit: 2, tier: 'free', alreadyCounted: false},
  alreadyCounted = false} = {}) {
  const record = jest.fn(() => Promise.resolve(recordOutcome))
  const check = jest.fn(() => ({allowed: true, used: 0, limit: 2, alreadyCounted}))
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
    await act(async () => {
      hook.result.current(route)
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
    const {record} = mockQuota()
    await meter(driveRoute())
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(DRIVE_KEY)
    expect(gtagEventWithCid).not.toHaveBeenCalled()
  })

  it('over the limit, sends quota_soft_limit_exceeded and does not block', async () => {
    const {record} = mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false}})
    const {result} = await meter(driveRoute())
    expect(record).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).toHaveBeenCalledTimes(1)
    expect(gtagEventWithCid).toHaveBeenCalledWith('quota_soft_limit_exceeded',
      {tier: 'free', used: 2, limit: 2, route_kind: 'gdrive'})
    // Fire-and-forget: the meter returns nothing for a caller to await or
    // branch on, so CadView's load cannot be held or undone by it.
    let returned = null
    act(() => {
      returned = result.current(driveRoute())
    })
    expect(returned).toBeUndefined()
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

  it('does not re-record a path the ledger already holds (opened from the dialog, then reloaded)', async () => {
    const {record, check} = mockQuota({alreadyCounted: true})
    await meter(driveRoute())
    expect(check).toHaveBeenCalledWith(DRIVE_KEY)
    expect(record).not.toHaveBeenCalled()
  })

  it('meters a model once per page load: a re-init or A → B → A is not a second open', async () => {
    const {record} = mockQuota({recordOutcome: {allowed: false, used: 2, limit: 2, tier: 'free', alreadyCounted: false}})
    await meter(driveRoute(), driveRoute(), githubRoute(), driveRoute())
    expect(record.mock.calls).toEqual([[DRIVE_KEY], ['/share/v/gh/acme/private-repo/main/models/tower.ifc']])
    expect(gtagEventWithCid).toHaveBeenCalledTimes(2)
  })

  it('waits for Auth0 to settle before recording', async () => {
    // While Auth0 is loading, isAuthenticated is still false and record()
    // would take the anonymous OPFS-only path, off the server's ledger.
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


describe('quota/useDirectLinkQuota#directLinkQuotaKey', () => {
  it('maps a pasted Drive URL to the same key as the bare file id', () => {
    const fromUrl = routeFor('/share/v/g', {'*': `https://drive.google.com/file/d/${DRIVE_ID}/view`})
    expect(directLinkQuotaKey(fromUrl, APP_PREFIX)).toEqual({key: DRIVE_KEY, routeKind: 'gdrive'})
    expect(directLinkQuotaKey(driveRoute(), APP_PREFIX)).toEqual({key: DRIVE_KEY, routeKind: 'gdrive'})
  })

  it('is null for no route', () => {
    expect(directLinkQuotaKey(null, APP_PREFIX)).toBeNull()
  })
})

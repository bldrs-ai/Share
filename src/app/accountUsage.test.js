import {getAuth0AccessToken} from '../connections/auth0Bridge'
import {parseAccountUsageBody} from '../privacy/accountUsageReport'
import useStore from '../store/useStore'
import {
  ACCOUNT_USAGE_PATH,
  accountLoadReport,
  reportAccountLoad,
  reportClientLimitHit,
  reportFunnelStep,
  setUsageReportsPreference,
  usageReportsEnabled,
} from './accountUsage'
import {waitForSettledFor} from './modelActionTracking'


jest.mock('../connections/auth0Bridge', () => ({getAuth0AccessToken: jest.fn()}))
jest.mock('./modelActionTracking', () => ({waitForSettledFor: jest.fn(() => Promise.resolve(true))}))


/* eslint-disable no-magic-numbers */
const MB = 1024 * 1024
const DESKTOP_NAV = {userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0'}
const GITHUB_ROUTE = {kind: 'provider', provider: 'github', getRepoPath: () => '/acme/private/main/tower.ifc'}
const MODEL = {type: 'ifc'}
const EVENT_PARAMS = {
  content_type: 'ifc',
  content_id: '/share/v/gh/acme/private/main/tower.ifc',
  load_outcome: 'displayed',
  stats_fileSize: 3 * MB,
  stats_loadTime: 2310.6,
  stats_firstMeshMs: 880.2,
  stats_openMs: 1204,
  stats_cacheHit: 'false',
  stats_engineErrorTotal: 0,
  local_hour: 'h14',
}


/** @return {Array<object>} the bodies POSTed to account-usage, parsed */
function postedBodies() {
  return global.fetch.mock.calls
    .filter(([url]) => url === ACCOUNT_USAGE_PATH)
    .map(([, init]) => JSON.parse(init.body))
}


describe('app/accountUsage', () => {
  beforeEach(() => {
    getAuth0AccessToken.mockResolvedValue('auth0-token')
    global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 204}))
    useStore.setState({appMetadata: {}})
    waitForSettledFor.mockClear()
  })

  it('is on unless the account turned it off', () => {
    expect(usageReportsEnabled(undefined)).toBe(true)
    expect(usageReportsEnabled({})).toBe(true)
    expect(usageReportsEnabled({usageReports: true})).toBe(true)
    expect(usageReportsEnabled({usageReports: false})).toBe(false)
  })

  it('builds a report the function accepts: enums, integer metrics, and never the content id or exact size', () => {
    const report = accountLoadReport(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', appMetadata: {}, nav: DESKTOP_NAV})
    expect(report).toEqual({
      content_type: 'ifc', size_bucket: '1-10mb', source: 'github', open_kind: 'page', form_factor: 'desktop',
      load_outcome: 'displayed', cache_hit: 'false', tier: 'free',
      loadTime: 2311, firstMeshMs: 880, openMs: 1204, engineErrorTotal: 0,
    })
    expect(parseAccountUsageBody(JSON.stringify({kind: 'load', report}))).not.toBeNull()
    expect(JSON.stringify(report)).not.toContain('tower')
  })

  it('reads a Pro account as tier pro, and a cache hit as such', () => {
    const report = accountLoadReport(GITHUB_ROUTE, {type: 'glb'}, {...EVENT_PARAMS, stats_cacheHit: 'true'},
      {openKind: 'in_app', appMetadata: {subscriptionStatus: 'sharePro'}, nav: DESKTOP_NAV})
    expect(report).toMatchObject({tier: 'pro', cache_hit: 'true', content_type: 'glb', open_kind: 'in_app'})
  })

  it('builds nothing for a route with no source or an open with no kind', () => {
    expect(accountLoadReport({kind: 'other'}, MODEL, EVENT_PARAMS, {openKind: 'page', appMetadata: {}})).toBeNull()
    expect(accountLoadReport(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: undefined, appMetadata: {}})).toBeNull()
  })

  it('posts a signed-in open with the user\'s token, after auth settles', async () => {
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => true})).toBe(true)
    expect(waitForSettledFor).toHaveBeenCalledTimes(1)
    const [[url, init]] = global.fetch.mock.calls
    expect(url).toBe(ACCOUNT_USAGE_PATH)
    expect(init.headers.Authorization).toBe('Bearer auth0-token')
    expect(postedBodies()[0].kind).toBe('load')
  })

  it('sends nothing signed out, or with the opt-out on', async () => {
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => false})).toBe(false)
    useStore.setState({appMetadata: {usageReports: false}})
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => true})).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('never rejects: no token, a network error and a refusal are each just false', async () => {
    getAuth0AccessToken.mockResolvedValue(null)
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => true})).toBe(false)
    getAuth0AccessToken.mockResolvedValue('t')
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => true})).toBe(false)
    global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 400}))
    expect(await reportAccountLoad(GITHUB_ROUTE, MODEL, EVENT_PARAMS, {openKind: 'page', getIsAuthenticated: () => true})).toBe(false)
  })

  it('reports a client-decided refusal even with the opt-out on', async () => {
    useStore.setState({appMetadata: {usageReports: false}})
    await reportClientLimitHit({routeKind: 'github'})
    await reportClientLimitHit({gate: 'soft'})
    expect(postedBodies()).toEqual([
      {kind: 'limit', limit: 'private_model', gate: 'blocked', route_kind: 'github'},
      {kind: 'limit', limit: 'private_model', gate: 'soft'},
    ])
  })

  it('forwards a funnel step with only its known params, and none with the opt-out on', async () => {
    await reportFunnelStep('login', {method: 'github', from: undefined})
    await reportFunnelStep('begin_checkout', {from: 'quota', destination: 'portal'})
    expect(await reportFunnelStep('begin_checkout', {from: 'quota', destination: 'portal', email: 'x'})).toBe(false)
    useStore.setState({appMetadata: {usageReports: false}})
    expect(await reportFunnelStep('login', {method: 'github'})).toBe(false)
    expect(postedBodies()).toEqual([
      {kind: 'funnel', event: 'login', params: {method: 'github'}},
      {kind: 'funnel', event: 'begin_checkout', params: {from: 'quota', destination: 'portal'}},
    ])
  })

  it('saves the preference and shows it at once; a failed save changes nothing', async () => {
    useStore.setState({appMetadata: {subscriptionStatus: 'free'}})
    global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 502}))
    expect(await setUsageReportsPreference(false)).toBe(false)
    expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'free'})
    global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 200}))
    expect(await setUsageReportsPreference(false)).toBe(true)
    expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'free', usageReports: false})
    expect(postedBodies()).toEqual([{kind: 'preference', usage_reports: false}])
  })
})

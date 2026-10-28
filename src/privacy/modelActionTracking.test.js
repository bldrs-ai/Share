import fs from 'fs'
import path from 'path'
import {act} from '@testing-library/react'
import Cookies from 'js-cookie'
import {AUTH_SETTLE_RETRY_MS} from '../Containers/authLoadGate'
import {TIERS} from '../quota/quota'
import useStore from '../store/useStore'
import {
  MODEL_ACTIONS,
  MODEL_GATES,
  _resetGaClientIdForTests,
  modelContentId,
  modelRouteSource,
  setIsAllowed,
} from './analytics'
import {trackModelActionWhenAuthSettled} from './modelActionTracking'


const LOCAL_ROUTE = {kind: 'file', isUploadedFile: true, filepath: '/0b4c2f1e.ifc'}
// What real_model_open sends for it: the route's path (no downloadUrl here).
const LOCAL_CONTENT_ID = '/0b4c2f1e.ifc'


/**
 * @param {string} name a gtag event name
 * @return {Array} params of each such event sent
 */
function sent(name) {
  return window.gtag.mock.calls
    .filter(([kind, eventName]) => kind === 'event' && eventName === name)
    .map(([, , params]) => params)
}


describe('trackModelActionWhenAuthSettled', () => {
  beforeEach(() => {
    _resetGaClientIdForTests()
    Cookies.remove('_ga')
    setIsAllowed(true)
    window.gtag = jest.fn()
    act(() => useStore.setState({isAuthResolved: false, appMetadata: {}}))
  })

  afterEach(() => {
    jest.useRealTimers()
    delete window.gtag
    act(() => useStore.setState({isAuthResolved: false, appMetadata: {}}))
  })

  // codex review on Share#1976, rounds 1 and 2: a local model can finish
  // loading, or Share be clicked, while Auth0 is still restoring a signed-in
  // session. Reading the tier at the call recorded a Pro user as anon.
  it.each([
    [MODEL_ACTIONS.VIEW, 'model_view', MODEL_GATES.NONE],
    [MODEL_ACTIONS.SHARE, 'model_share', MODEL_GATES.NONE],
    [MODEL_ACTIONS.EXPORT, 'model_export', MODEL_GATES.UPSELL],
  ])('%s: waits for auth to settle, then sends the settled tier', async (action, eventName, gate) => {
    let isAuthenticated = false
    const done = trackModelActionWhenAuthSettled(action, {
      gate,
      ...modelRouteSource(LOCAL_ROUTE),
      getIsAuthenticated: () => isAuthenticated,
    })
    await act(async () => {})
    expect(sent(eventName)).toEqual([])

    // The session restores: Auth0 says signed in, BaseRoutes writes the
    // claims, then flips isAuthResolved (its order).
    isAuthenticated = true
    act(() => {
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => done)

    expect(sent(eventName)).toEqual([{tier: 'pro', gate, source: 'local', route_kind: 'local'}])
  })

  it('sends at once when auth has already settled', async () => {
    act(() => useStore.getState().setIsAuthResolved(true))
    await act(() => trackModelActionWhenAuthSettled(MODEL_ACTIONS.VIEW, {
      gate: MODEL_GATES.NONE,
      ...modelRouteSource(LOCAL_ROUTE),
      getIsAuthenticated: () => false,
    }))
    expect(sent('model_view')).toEqual([{tier: 'anon', gate: 'none', source: 'local', route_kind: 'local'}])
  })

  // The caller snapshots the route; the wait must not re-read it.
  it('labels the action by the route it was given, not one navigated to while waiting', async () => {
    const done = trackModelActionWhenAuthSettled(MODEL_ACTIONS.VIEW, {
      gate: MODEL_GATES.NONE,
      ...modelRouteSource(LOCAL_ROUTE),
      getIsAuthenticated: () => false,
    })
    act(() => {
      useStore.setState({modelPath: {kind: 'provider', provider: 'github'}})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => done)
    expect(sent('model_view')).toEqual([expect.objectContaining({source: 'local', route_kind: 'local'})])
  })

  // Share#1981: the model's key rides on all three events, so GA can count
  // distinct models from them. Both the waiting path and the explicit-tier
  // path (which sends at once) must carry it.
  it.each([
    [MODEL_ACTIONS.VIEW, 'model_view'],
    [MODEL_ACTIONS.SHARE, 'model_share'],
    [MODEL_ACTIONS.EXPORT, 'model_export'],
  ])('%s: sends the content_id it was given, whether it waits or not', async (action, eventName) => {
    act(() => useStore.getState().setIsAuthResolved(true))
    await act(() => trackModelActionWhenAuthSettled(action, {
      gate: MODEL_GATES.NONE,
      ...modelRouteSource(LOCAL_ROUTE),
      contentId: modelContentId(LOCAL_ROUTE),
      getIsAuthenticated: () => false,
    }))
    trackModelActionWhenAuthSettled(action, {gate: MODEL_GATES.BLOCKED, tier: TIERS.FREE, contentId: 'explicit-tier-id'})

    expect(sent(eventName)).toEqual([
      {tier: 'anon', gate: 'none', source: 'local', route_kind: 'local', content_id: LOCAL_CONTENT_ID},
      {tier: 'free', gate: 'blocked', content_id: 'explicit-tier-id'},
    ])
  })

  // The caller snapshots the id with the route; the wait must not re-read
  // the store, or an export started on model A and finishing on B would be
  // counted as a distinct model B.
  it('keeps the content_id it was given, not the one of a model navigated to while waiting', async () => {
    useStore.setState({modelPath: LOCAL_ROUTE})
    const done = trackModelActionWhenAuthSettled(MODEL_ACTIONS.EXPORT, {
      gate: MODEL_GATES.NONE,
      contentId: modelContentId(useStore.getState().modelPath),
      getIsAuthenticated: () => false,
    })
    act(() => {
      useStore.setState({modelPath: {kind: 'file', isUploadedFile: true, filepath: '/other.ifc'}})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => done)
    expect(sent('model_export')).toEqual([expect.objectContaining({content_id: LOCAL_CONTENT_ID})])
  })

  // A gate's own verdict, or a refusal that is free by definition
  // (useExport's free_limit), isn't read from auth: nothing to wait for, and
  // the settled claims must not override it.
  it('sends an explicit tier at once, and keeps it over the claims', () => {
    act(() => useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'}))
    trackModelActionWhenAuthSettled(MODEL_ACTIONS.EXPORT, {
      gate: MODEL_GATES.BLOCKED,
      tier: TIERS.FREE,
      getIsAuthenticated: () => true,
    })
    expect(sent('model_export')).toEqual([{tier: 'free', gate: 'blocked'}])
  })

  // Share#1977: a signed-out user is never metered, so a gate's quota tier
  // can be missing (null/undefined) where it used to be "anonymous". That
  // must not become the anon cell for a signed-in user: with no tier, the
  // event waits and reads the sign-in tier at emit time.
  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('a %s explicit tier falls back to the emit-time sign-in tier', async (_, tier) => {
    const done = trackModelActionWhenAuthSettled(MODEL_ACTIONS.SHARE, {
      gate: MODEL_GATES.BLOCKED,
      tier,
      getIsAuthenticated: () => true,
    })
    await act(async () => {})
    expect(sent('model_share')).toEqual([])
    act(() => {
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => done)
    expect(sent('model_share')).toEqual([{tier: 'pro', gate: 'blocked'}])
  })

  it('a missing tier with no sign-in state is anon', async () => {
    act(() => useStore.getState().setIsAuthResolved(true))
    await act(() => trackModelActionWhenAuthSettled(MODEL_ACTIONS.SHARE, {gate: MODEL_GATES.SOFT, tier: null}))
    expect(sent('model_share')).toEqual([{tier: 'anon', gate: 'soft'}])
  })

  it('a stuck token exchange still sends, with the best tier known by then', async () => {
    jest.useFakeTimers()
    const done = trackModelActionWhenAuthSettled(MODEL_ACTIONS.SHARE, {
      gate: MODEL_GATES.NONE,
      source: 'hosted',
      getIsAuthenticated: () => true,
    })
    act(() => jest.advanceTimersByTime(AUTH_SETTLE_RETRY_MS - 1))
    await act(async () => {})
    expect(sent('model_share')).toEqual([])
    act(() => jest.advanceTimersByTime(1))
    await act(() => done)
    expect(sent('model_share')).toEqual([{tier: 'free', gate: 'none', source: 'hosted'}])
  })
})


/**
 * Static guard: every normalized event goes through the auth-settled
 * helper. A direct trackModelAction call reads the tier at the call, which
 * is the race the helper exists to close (codex review on Share#1976); each
 * round found it at one more call site, so this pins the whole class.
 * A name match, not a call shape, so an import or alias is caught too.
 * Test files are not scanned (suites mock it by name).
 */
describe('trackModelAction is only called through trackModelActionWhenAuthSettled', () => {
  const SRC = path.resolve(__dirname, '..')
  const ALLOWED = new Set([
    path.join(SRC, 'privacy', 'analytics.js'), // its definition
    path.join(SRC, 'privacy', 'modelActionTracking.js'), // the helper
  ])

  /**
   * @param {string} dir
   * @return {Array<string>} non-test source files under dir
   */
  function sources(dir) {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' ? [] : sources(full)
      }
      return /\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name) ? [full] : []
    })
  }

  it('has no other caller in src', () => {
    const offenders = sources(SRC)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => /\btrackModelAction\b(?!WhenAuthSettled)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
    expect(offenders).toEqual([])
  })
})

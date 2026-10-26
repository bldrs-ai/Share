import {act} from '@testing-library/react'
import Cookies from 'js-cookie'
import {_resetGaClientIdForTests, setIsAllowed} from '../privacy/analytics'
import useStore from '../store/useStore'
import {trackModelViewWhenAuthSettled} from './modelViewTracking'


const LOCAL_ROUTE = {kind: 'file', isUploadedFile: true, filepath: '/0b4c2f1e.ifc'}


/** @return {Array} params of each model_view gtag sent */
function modelViews() {
  return window.gtag.mock.calls
    .filter(([kind, name]) => kind === 'event' && name === 'model_view')
    .map(([, , params]) => params)
}


describe('trackModelViewWhenAuthSettled', () => {
  beforeEach(() => {
    _resetGaClientIdForTests()
    Cookies.remove('_ga')
    setIsAllowed(true)
    window.gtag = jest.fn()
    act(() => useStore.setState({isAuthResolved: false, appMetadata: {}}))
  })

  afterEach(() => {
    delete window.gtag
    act(() => useStore.setState({isAuthResolved: false, appMetadata: {}}))
  })

  // codex review on Share#1976: a local model can finish loading while
  // Auth0 is still restoring a signed-in session. Sending at the load's end,
  // with that load's `isAuthenticated`, recorded a Pro user's view as anon.
  it('waits for auth to settle, then sends the settled tier', async () => {
    let isAuthenticated = false
    const sent = trackModelViewWhenAuthSettled(LOCAL_ROUTE, () => isAuthenticated)
    await act(async () => {})
    expect(modelViews()).toEqual([])

    // The session restores: Auth0 says signed in, BaseRoutes writes the
    // claims, then flips isAuthResolved (its order).
    isAuthenticated = true
    act(() => {
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => sent)

    expect(modelViews()).toEqual([{tier: 'pro', gate: 'none', source: 'local', route_kind: 'local'}])
  })

  it('sends at once when auth has already settled', async () => {
    act(() => useStore.getState().setIsAuthResolved(true))
    await act(() => trackModelViewWhenAuthSettled(LOCAL_ROUTE, () => false))
    expect(modelViews()).toEqual([{tier: 'anon', gate: 'none', source: 'local', route_kind: 'local'}])
  })

  it('labels the view by the route it was given, not one navigated to while waiting', async () => {
    const sent = trackModelViewWhenAuthSettled(LOCAL_ROUTE, () => false)
    act(() => {
      useStore.setState({modelPath: {kind: 'provider', provider: 'github'}})
      useStore.getState().setIsAuthResolved(true)
    })
    await act(() => sent)
    expect(modelViews()).toEqual([expect.objectContaining({source: 'local', route_kind: 'local'})])
  })
})

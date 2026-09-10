import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {gtagEvent} from '../../privacy/analytics'
import useStore from '../../store/useStore'
import {goToSubscription} from '../Profile/subscriptionNav'
import ExportSection from './ExportSection'


jest.mock('../../privacy/analytics', () => ({gtagEvent: jest.fn()}))
jest.mock('../Profile/subscriptionNav', () => ({goToSubscription: jest.fn()}))
const mockRun = jest.fn()
jest.mock('../../export/useExport', () => ({
  __esModule: true,
  default: () => ({run: mockRun, isExporting: false, error: null}),
}))


const ARTIFACT = {
  cacheKeyArgs: {ns1: 'gh-bldrs-ai', ns2: 'test-models', ns3: 'main', sourcePath: 'box.ifc', sourceHash: 'sha'},
  schemaVer: '0.21.0-batched',
  writtenAt: 1,
}


/**
 * @param {?object} artifact What the loader published for this load
 * @param {?object} appMetadata Auth0 app_metadata, i.e. the tier
 * @return {Promise<void>}
 */
async function setStore(artifact, appMetadata) {
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setGlbArtifact(artifact)
    result.current.setAppMetadata(appMetadata)
    result.current.setIsLoginVisible(false)
  })
}


/**
 * The four states of design/new/glb-export-premium.md §4.4, which resolve in
 * order: no artifact beats every tier, then anonymous, then free, then Pro.
 */
describe('ExportSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
  })

  afterEach(async () => {
    await setStore(null, null)
  })

  it('is disabled while the artifact is still being written', async () => {
    await setStore(null, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    const button = getByTestId('export-glb-button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Preparing GLB…')
  })

  it('enables once the loader publishes the artifact', async () => {
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    const button = getByTestId('export-glb-button')
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Download GLB')
    expect(queryByTestId('export-pro-chip')).toBeNull()
  })

  it('runs the export for a Pro user, carrying the metadata toggle', async () => {
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    // Default ON — it's the user's own model.
    const toggle = getByTestId('export-include-metadata').querySelector('input')
    expect(toggle.checked).toBe(true)

    fireEvent.click(getByTestId('export-glb-button'))
    expect(mockRun).toHaveBeenCalledWith('glb', {stripBldrsMetadata: false})

    // Off means "strip", which is the option the pro module acts on.
    fireEvent.click(toggle)
    fireEvent.click(getByTestId('export-glb-button'))
    expect(mockRun).toHaveBeenLastCalledWith('glb', {stripBldrsMetadata: true})
  })

  it('opens the login dialog for an anonymous user instead of exporting', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    await setStore(ARTIFACT, null)
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.click(getByTestId('export-glb-button'))

    expect(useStore.getState().isLoginVisible).toBe(true)
    expect(mockRun).not.toHaveBeenCalled()
    expect(gtagEvent).toHaveBeenCalledWith('export_gated', {reason: 'anonymous'})
  })

  it('sends a signed-in free user to the subscription flow, with a Pro chip', async () => {
    await setStore(ARTIFACT, {subscriptionStatus: 'free', stripeCustomerId: null, userEmail: 'a@b.c'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(getByTestId('export-pro-chip')).toBeInTheDocument()
    fireEvent.click(getByTestId('export-glb-button'))

    expect(goToSubscription).toHaveBeenCalledWith(
      expect.objectContaining({stripeCustomerId: null, userEmail: 'a@b.c'}))
    expect(mockRun).not.toHaveBeenCalled()
    expect(gtagEvent).toHaveBeenCalledWith('export_gated', {reason: 'free'})
  })

  it('treats shareProPendingReauth as not-Pro, following getTier', async () => {
    // getTier is the entitlement authority and the `pro-module` function
    // mirrors it, so the UI must not offer an export the server will 403.
    await setStore(ARTIFACT, {subscriptionStatus: 'shareProPendingReauth'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.click(getByTestId('export-glb-button'))

    expect(mockRun).not.toHaveBeenCalled()
    expect(goToSubscription).toHaveBeenCalled()
  })
})

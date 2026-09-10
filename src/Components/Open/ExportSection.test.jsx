import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {artifactSizes} from '../../export/artifactSizes'
import {gtagEvent} from '../../privacy/analytics'
import useStore from '../../store/useStore'
import {goToSubscription} from '../Profile/subscriptionNav'
import ExportSection from './ExportSection'


// `mock`-prefixed so the jest.mock factory below may close over it.
const mockUseStore = useStore


jest.mock('../../privacy/analytics', () => ({gtagEvent: jest.fn()}))
// The size line's source is an OPFS header read (`export/artifactSizes.js`),
// which needs a worker and a real artifact; the component's job is what it
// does with the two numbers.
jest.mock('../../export/artifactSizes', () => ({artifactSizes: jest.fn()}))
jest.mock('../Profile/subscriptionNav', () => ({goToSubscription: jest.fn()}))
const mockRun = jest.fn()
// A stand-in for the hook's `run` only: `isExporting` still comes from the
// store slot the real hook reads (`isExportInFlight`), so the disabled state
// asserted below is this component's own reaction to a tab-wide export.
jest.mock('../../export/useExport', () => ({
  __esModule: true,
  // The real formatter: the size line's label is what this suite asserts, and
  // a stub would make "13.0 MB" a property of the stub.
  formatBytes: jest.requireActual('../../export/useExport').formatBytes,
  default: () => ({
    run: mockRun,
    isExporting: mockUseStore((state) => state.isExportInFlight),
    error: null,
  }),
}))


// Sizes the formatter renders as round figures, so the assertions read as
// what the user sees: 13.0 MB of which 4.0 MB is metadata.
/* eslint-disable no-magic-numbers */
const BYTES_PER_MB = 1024 * 1024
const WITH_METADATA_BYTES = 13 * BYTES_PER_MB
const WITHOUT_METADATA_BYTES = 9 * BYTES_PER_MB
const METADATA_BYTES = WITH_METADATA_BYTES - WITHOUT_METADATA_BYTES
/* eslint-enable no-magic-numbers */

const ARTIFACT = {
  cacheKeyArgs: {ns1: 'gh-bldrs-ai', ns2: 'test-models', ns3: 'main', sourcePath: 'box.ifc', sourceHash: 'sha'},
  schemaVer: '0.21.0-batched',
  writtenAt: 1,
}


/**
 * @param {?object} artifact What the loader published for this load
 * @param {?object} appMetadata Auth0 app_metadata, i.e. the tier
 * @param {boolean} [isExportInFlight] Whether an export is running in this tab
 * @return {Promise<void>}
 */
async function setStore(artifact, appMetadata, isExportInFlight = false) {
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setGlbArtifact(artifact)
    result.current.setAppMetadata(appMetadata)
    result.current.setIsLoginVisible(false)
    result.current.setIsExportInFlight(isExportInFlight)
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
    // Sizes stay PENDING unless a test says otherwise — the state the panel
    // is in the moment it opens, and the one that leaves every other
    // assertion here alone. A promise that settles would land its state
    // update outside `act()` in the tests that don't await it.
    artifactSizes.mockReturnValue(new Promise(() => {}))
  })

  afterEach(async () => {
    // Clearing the artifact re-runs the size effect, and a read that settles
    // during the teardown lands its state update outside `act`. Park it.
    artifactSizes.mockReturnValue(new Promise(() => {}))
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
    expect(button).toHaveTextContent('Export GLB')
    expect(queryByTestId('export-pro-chip')).toBeNull()
    // A Pro user gets the real button, not a gate around it.
    expect(queryByTestId('gated-export-pro')).toBeNull()
  })

  it('renders the button in the theme accent colour, sentence case, centred', async () => {
    // Product-owner feedback on #1837's deploy preview (#1838): a grey,
    // all-caps, right-aligned button read as disabled and looked stranded.
    // Pin the enabled-state colour (a disabled contained button renders grey
    // regardless of `color`, so this only means something for a Pro user
    // with a ready artifact), the textTransform override, and the row's
    // justify-content.
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    const button = getByTestId('export-glb-button')
    expect(button).toBeEnabled()
    expect(button).toHaveClass('MuiButton-colorAccent')
    expect(getComputedStyle(button).textTransform).toBe('none')
    expect(getByTestId('export-action-row')).toHaveStyle({justifyContent: 'center'})
  })

  it('is disabled while ANY export in the tab is running', async () => {
    // The in-flight flag is shared (store/UISlice.js): a "Download again"
    // running in the list below this section must disable this button too,
    // or the user gets two exports racing each other's write of the history
    // mirror (#1834).
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'}, true)
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    const button = getByTestId('export-glb-button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Exporting…')
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

  it('shows what the download will weigh, and follows the toggle', async () => {
    artifactSizes.mockResolvedValue(
      {withMetadata: WITH_METADATA_BYTES, withoutMetadata: WITHOUT_METADATA_BYTES, metadataBytes: METADATA_BYTES})
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    // The read is one microtask; settling it inside `act` keeps its state
    // update where React can see it.
    await act(async () => {})

    const size = getByTestId('export-size')
    expect(size).toHaveTextContent('13.0 MB')
    // The raw count beside the rounded label, so the E2E can compare the
    // figure with the downloaded file byte for byte (#1841).
    expect(size).toHaveAttribute('data-bytes', String(WITH_METADATA_BYTES))
    expect(getByTestId('export-section')).toHaveTextContent('4.0 MB of Bldrs metadata included')

    fireEvent.click(getByTestId('export-include-metadata').querySelector('input'))

    expect(getByTestId('export-size')).toHaveTextContent('9.0 MB')
    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITHOUT_METADATA_BYTES))
    expect(getByTestId('export-section')).toHaveTextContent('4.0 MB of Bldrs metadata removed')
  })

  it('shows no size line at all when the sizes are unknown', async () => {
    // Null is both "still reading" and "cannot read" — an artifact evicted
    // by Clear Local Cache, say. A placeholder that flashes a number and
    // then corrects itself is worse than no number, and the export itself
    // still works, so nothing else changes.
    artifactSizes.mockResolvedValue(null)
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    // Settle the read inside `act`, so the "no sizes" state is what is being
    // asserted rather than the pending one that precedes it.
    await act(async () => {})

    expect(getByTestId('export-glb-button')).toBeEnabled()
    expect(queryByTestId('export-size')).toBeNull()
  })

  it('offers an anonymous user the login gate instead of exporting', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    await setStore(ARTIFACT, null)
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.click(getByTestId('gated-export-anonymous'))
    expect(gtagEvent).toHaveBeenCalledWith('export_gated', {reason: 'anonymous'})
    fireEvent.click(getByTestId('gated-help-action'))

    expect(useStore.getState().isLoginVisible).toBe(true)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('offers a signed-in free user the Pro gate, with a Pro chip', async () => {
    await setStore(ARTIFACT, {subscriptionStatus: 'free', stripeCustomerId: null, userEmail: 'a@b.c'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(getByTestId('export-pro-chip')).toBeInTheDocument()
    // The gated look is not the DOM `disabled` attribute: the click has to
    // reach the wrapper, or the help never opens (#1838).
    const gate = getByTestId('gated-export-pro')
    expect(gate).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(gate)

    expect(getByTestId('gated-help')).toHaveTextContent('Pro subscription')
    expect(gtagEvent).toHaveBeenCalledWith('export_gated', {reason: 'free'})

    fireEvent.click(getByTestId('gated-help-action'))
    expect(goToSubscription).toHaveBeenCalledWith(
      expect.objectContaining({stripeCustomerId: null, userEmail: 'a@b.c'}))
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('treats shareProPendingReauth as not-Pro, following getTier', async () => {
    // getTier is the entitlement authority and the `pro-module` function
    // mirrors it, so the UI must not offer an export the server will 403.
    await setStore(ARTIFACT, {subscriptionStatus: 'shareProPendingReauth'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(queryByTestId('gated-export-pro')).toBeInTheDocument()
    fireEvent.click(getByTestId('gated-export-pro'))
    fireEvent.click(getByTestId('gated-help-action'))

    expect(mockRun).not.toHaveBeenCalled()
    expect(goToSubscription).toHaveBeenCalled()
  })
})

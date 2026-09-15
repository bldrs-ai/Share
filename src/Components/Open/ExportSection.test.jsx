import React from 'react'
import {act, fireEvent, render, renderHook, screen, within} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {artifactPositionRange, artifactSizes} from '../../export/artifactSizes'
import useCodecSizes from '../../export/useCodecSizes'
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
jest.mock('../../export/artifactSizes', () => ({
  artifactSizes: jest.fn(),
  artifactPositionRange: jest.fn(),
}))
jest.mock('../Profile/subscriptionNav', () => ({goToSubscription: jest.fn()}))
// The background codec sweep runs three encoders off OPFS; its ordering,
// release and cancellation are pinned in `export/codecSizes.test.js` and
// `export/useCodecSizes.test.js`. Here the hook is a hand the test deals, so
// these assertions are about what the PANEL does with the figures — which is
// the auto-selection, the per-option labels and the Stop control.
jest.mock('../../export/useCodecSizes', () => ({
  __esModule: true,
  default: jest.fn(),
}))
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

// What the compressed estimate comes back with: smaller than the
// uncompressed pair above, because that is the entire promise of the control.
const MESHOPT_WITH_METADATA_BYTES = 7 * BYTES_PER_MB
const MESHOPT_WITHOUT_METADATA_BYTES = 3 * BYTES_PER_MB
/* eslint-enable no-magic-numbers */

// The Momentum fixture's scene range, so the millimetre caption below is the
// figure #1848 measured against rather than an invented one.
const MOMENTUM_RANGE_M = 22.0

// What the sweep hook reports when a test says nothing about it: no figures,
// nothing running, nothing suppressed — the panel exactly as #1842 left it.
const NO_CODEC_SIZES = {
  sizesByCodec: {},
  measuringCodec: null,
  isMeasuring: false,
  isStopping: false,
  isPaused: false,
  start: jest.fn(),
  stop: jest.fn(),
}

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
/**
 * Pick a codec from the Compression dropdown the way a user does: open the
 * menu (MUI's Select opens on mousedown, in a portal off `document.body`,
 * which is why `screen` rather than the render's container) and click the
 * item.
 *
 * @param {string} mode 'none' | 'meshopt' | 'draco'
 */
function chooseCompression(mode) {
  fireEvent.mouseDown(within(screen.getByTestId('export-compression')).getByRole('combobox'))
  fireEvent.click(screen.getByTestId(`export-compression-${mode}`))
}


/**
 * Pick a Quality rung the same way (#1848).
 *
 * @param {string} level 'best' | 'balanced' | 'smallest'
 */
function chooseQuality(level) {
  fireEvent.mouseDown(within(screen.getByTestId('export-quality')).getByRole('combobox'))
  fireEvent.click(screen.getByTestId(`export-quality-${level}`))
}


describe('ExportSection', () => {
  /** Settles the pending compressed estimate, from inside the test's `act`. */
  let resolveMeshoptSizes

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    // Sizes stay PENDING unless a test says otherwise — the state the panel
    // is in the moment it opens, and the one that leaves every other
    // assertion here alone. A promise that settles would land its state
    // update outside `act()` in the tests that don't await it.
    artifactSizes.mockReturnValue(new Promise(() => {}))
    // Parked for the same reason the size read is: a promise that settles
    // outside a test's `act` lands its state update where React can't see it.
    // The caption's own test resolves it.
    artifactPositionRange.mockReturnValue(new Promise(() => {}))
    useCodecSizes.mockReturnValue(NO_CODEC_SIZES)
  })

  afterEach(async () => {
    // Clearing the artifact re-runs the size effect, and a read that settles
    // during the teardown lands its state update outside `act`. Park it.
    artifactSizes.mockReturnValue(new Promise(() => {}))
    artifactPositionRange.mockReturnValue(new Promise(() => {}))
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
    expect(mockRun).toHaveBeenCalledWith(
      'glb', {stripBldrsMetadata: false, compression: 'none', quality: 'balanced', portable: false})

    // Off means "strip", which is the option the pro module acts on.
    fireEvent.click(toggle)
    fireEvent.click(getByTestId('export-glb-button'))
    expect(mockRun).toHaveBeenLastCalledWith(
      'glb', {stripBldrsMetadata: true, compression: 'none', quality: 'balanced', portable: false})
  })

  it('carries the Portable toggle into the export, off by default', async () => {
    // #1843. Off by default: the batched-native shape is the smaller file and
    // the one Share itself reads best, and the rewrite costs ~100 B of JSON
    // per instance that no codec compresses.
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    const portable = getByTestId('export-portable').querySelector('input')
    expect(portable.checked).toBe(false)

    fireEvent.click(portable)
    fireEvent.click(getByTestId('export-glb-button'))

    expect(mockRun).toHaveBeenLastCalledWith(
      'glb', {stripBldrsMetadata: false, compression: 'none', quality: 'balanced', portable: true})
  })

  it('re-estimates for Portable even at compression None, saying so while it runs', async () => {
    // Portable + None is NOT the cheap header read: the rewrite has to read
    // the whole artifact out of OPFS and re-serialise it, so the line goes
    // through "Estimating…" exactly as a codec does (#1843).
    artifactSizes.mockImplementation((artifact, mode, isPortable) => (isPortable ?
      new Promise((resolve) => {
        resolveMeshoptSizes = resolve
      }) :
      Promise.resolve({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
      })))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITH_METADATA_BYTES))

    fireEvent.click(getByTestId('export-portable').querySelector('input'))

    expect(artifactSizes).toHaveBeenLastCalledWith(expect.objectContaining(ARTIFACT), 'none', true, 'balanced')
    expect(queryByTestId('export-size')).toBeNull()
    expect(getByTestId('export-size-pending')).toHaveTextContent('Estimating…')

    await act(async () => {
      resolveMeshoptSizes({
        withMetadata: MESHOPT_WITH_METADATA_BYTES,
        withoutMetadata: MESHOPT_WITHOUT_METADATA_BYTES,
        metadataBytes: MESHOPT_WITH_METADATA_BYTES - MESHOPT_WITHOUT_METADATA_BYTES,
      })
      // Let the `.then` that settles the state run inside this `act`.
      await Promise.resolve()
    })

    expect(queryByTestId('export-size-pending')).toBeNull()
    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(MESHOPT_WITH_METADATA_BYTES))
  })

  it('offers the three compression choices, None selected', async () => {
    // Exclusive, and defaulting to the file that opens everywhere: Meshopt
    // and Draco both need the matching decoder registered in whatever the
    // user opens the download with (#1842).
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(getByTestId('export-compression')).toHaveTextContent('None')
  })

  it('carries the compression choice into the export', async () => {
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})

    chooseCompression('draco')
    fireEvent.click(getByTestId('export-glb-button'))

    expect(mockRun).toHaveBeenLastCalledWith(
      'glb', {stripBldrsMetadata: false, compression: 'draco', quality: 'balanced', portable: false})
  })

  it('re-estimates when the compression choice changes, saying so while it runs', async () => {
    // A compressed estimate IS the compressed file, so it costs an encode —
    // seconds on a real model. The line has to say the number is coming
    // rather than showing the previous codec's figure, which is a promise
    // about a file the next click would not produce (#1842).
    artifactSizes.mockImplementation((artifact, mode, isPortable) => (mode === 'none' && !isPortable ?
      Promise.resolve({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
      }) :
      new Promise((resolve) => {
        resolveMeshoptSizes = resolve
      })))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITH_METADATA_BYTES))

    chooseCompression('meshopt')

    expect(artifactSizes).toHaveBeenLastCalledWith(expect.objectContaining(ARTIFACT), 'meshopt', false, 'balanced')
    expect(queryByTestId('export-size')).toBeNull()
    expect(getByTestId('export-size-pending')).toHaveTextContent('Estimating…')

    await act(async () => {
      resolveMeshoptSizes({
        withMetadata: MESHOPT_WITH_METADATA_BYTES,
        withoutMetadata: MESHOPT_WITHOUT_METADATA_BYTES,
        metadataBytes: MESHOPT_WITH_METADATA_BYTES - MESHOPT_WITHOUT_METADATA_BYTES,
      })
      // Let the `.then` that settles the state run inside this `act`.
      await Promise.resolve()
    })

    expect(queryByTestId('export-size-pending')).toBeNull()
    const size = getByTestId('export-size')
    expect(size).toHaveTextContent('7.0 MB')
    expect(size).toHaveAttribute('data-bytes', String(MESHOPT_WITH_METADATA_BYTES))
    // And the metadata toggle still moves it, off the compressed pair.
    fireEvent.click(getByTestId('export-include-metadata').querySelector('input'))
    expect(getByTestId('export-size'))
      .toHaveAttribute('data-bytes', String(MESHOPT_WITHOUT_METADATA_BYTES))
  })

  it('says which selection the figure on the line is for', async () => {
    // The size line lags the controls by one estimate: the click that changes
    // the codec re-renders the OLD figure under the NEW dropdown value, so a
    // test reading the line right after the click can compare a codec against
    // itself — a red run, not a hypothesis (`tests/e2e/exportEstimate.ts`).
    // `data-estimate-key` is what lets it tell the two apart, and the byte
    // count cannot stand in for it: the Draco estimate settled here weighs
    // exactly what None did, which is what an unavailable encoder produces
    // (#1842) and what a Portable pass-through produces (#1843).
    artifactSizes.mockImplementation((artifact, mode, isPortable) => (mode === 'none' && !isPortable ?
      Promise.resolve({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
      }) :
      new Promise((resolve) => {
        resolveMeshoptSizes = resolve
      })))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    expect(getByTestId('export-size')).toHaveAttribute('data-estimate-key', 'native|none|balanced|meta')

    chooseCompression('draco')
    await act(async () => {
      // The same figures the uncompressed read produced: the fallback hands
      // back the input file.
      resolveMeshoptSizes({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
        compression: 'none',
      })
      await Promise.resolve()
    })

    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITH_METADATA_BYTES))
    expect(getByTestId('export-size')).toHaveAttribute('data-estimate-key', 'native|draco|balanced|meta')

    // The metadata half moves without a re-estimate — one run produced both
    // figures — so it has to be part of the key or the key would name two
    // different figures.
    fireEvent.click(getByTestId('export-include-metadata').querySelector('input'))

    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITHOUT_METADATA_BYTES))
    expect(getByTestId('export-size')).toHaveAttribute('data-estimate-key', 'native|draco|balanced|nometa')
  })

  it('names the fallback when the chosen codec is not available here', async () => {
    // The estimate is honest either way — it measured the uncompressed file
    // the download will also produce — but a pressed Draco button beside an
    // uncompressed figure reads as a Draco figure (#1837 codex round 6).
    artifactSizes.mockImplementation((artifact, mode) => Promise.resolve({
      withMetadata: WITH_METADATA_BYTES,
      withoutMetadata: WITHOUT_METADATA_BYTES,
      metadataBytes: METADATA_BYTES,
      // Whatever was asked for, the encoder was unavailable.
      compression: mode === 'none' ? 'none' : 'none',
    }))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    expect(queryByTestId('export-compression-fallback')).toBeNull()

    chooseCompression('draco')
    await act(async () => {})

    expect(getByTestId('export-compression-fallback'))
      .toHaveTextContent('Draco isn\'t available in this browser — the file is uncompressed')
    expect(getByTestId('export-size')).toHaveAttribute('data-bytes', String(WITH_METADATA_BYTES))

    chooseCompression('none')
    await act(async () => {})

    expect(queryByTestId('export-compression-fallback')).toBeNull()
  })

  it('names the codec a pre-compressed artifact keeps when the chosen one falls back', async () => {
    // A `?feature=glbMeshopt` artifact whose Draco re-encode could not run is
    // handed back as the Meshopt file it is — which still needs a decoder,
    // so "uncompressed" would be the wrong promise (#1837 codex round 7).
    artifactSizes.mockImplementation((artifact, mode) => Promise.resolve({
      withMetadata: WITH_METADATA_BYTES,
      withoutMetadata: WITHOUT_METADATA_BYTES,
      metadataBytes: METADATA_BYTES,
      compression: mode === 'none' ? 'none' : 'meshopt',
    }))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    chooseCompression('draco')
    await act(async () => {})

    expect(getByTestId('export-compression-fallback'))
      .toHaveTextContent('Draco isn\'t available in this browser — the file keeps Meshopt')

    // Asking for the codec the file already has is not a fallback.
    chooseCompression('meshopt')
    await act(async () => {})

    expect(queryByTestId('export-compression-fallback')).toBeNull()
  })

  it('shows no fallback note when the codec did apply', async () => {
    artifactSizes.mockImplementation((artifact, mode) => Promise.resolve({
      withMetadata: WITH_METADATA_BYTES,
      withoutMetadata: WITHOUT_METADATA_BYTES,
      metadataBytes: METADATA_BYTES,
      compression: mode,
    }))
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    chooseCompression('draco')
    await act(async () => {})

    expect(queryByTestId('export-compression-fallback')).toBeNull()
  })

  it('left-justifies its label blocks, and only the action row stays centred', async () => {
    // The theme centres a Dialog's whole paper (theme/Components.js,
    // `MuiDialog.paper.textAlign`), which made each two-line block float its
    // shorter line under its longer one — "Download size" sat off-centre
    // above its own caption (#1842). The fix is local to this section, not a
    // theme-wide change.
    artifactSizes.mockResolvedValue(
      {withMetadata: WITH_METADATA_BYTES, withoutMetadata: WITHOUT_METADATA_BYTES, metadataBytes: METADATA_BYTES})
    await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
    const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
    await act(async () => {})

    expect(getByTestId('export-section')).toHaveStyle({textAlign: 'left'})
    expect(getByTestId('export-action-row')).toHaveStyle({textAlign: 'center'})
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

  describe('the Quality control (#1848)', () => {
    /**
     * Settle every size read at once, so a test can assert the steady state
     * of the panel rather than the pending one.
     */
    function settleSizes() {
      artifactSizes.mockResolvedValue({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
        compression: 'draco',
      })
      artifactPositionRange.mockResolvedValue(MOMENTUM_RANGE_M)
    }

    it('is present but inert until a codec is chosen', async () => {
      // Disabled rather than hidden: showing it only once a codec is picked
      // would change the panel's height under the user's cursor at the exact
      // moment they are reaching for the next control.
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      const quality = within(getByTestId('export-quality')).getByRole('combobox')
      expect(getByTestId('export-quality')).toHaveTextContent('Balanced')
      expect(quality).toHaveAttribute('aria-disabled', 'true')

      chooseCompression('draco')
      await act(async () => {})

      expect(within(getByTestId('export-quality')).getByRole('combobox'))
        .not.toHaveAttribute('aria-disabled')
    })

    it('names the rungs by fidelity, because the size ordering is not guaranteed', async () => {
      // `exportQuality.js` measured the coarse rung HEAVIER than Balanced on
      // some models (+0.5% under SEQUENTIAL on Momentum, +2.4% on an
      // instance-heavy synthetic), so "Smallest" on the control would be a
      // promise the encoders don't keep. The id stays `smallest` — it is
      // written into export-history rows and estimate keys — but what the
      // user reads names fidelity and claims no ordering.
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      chooseCompression('draco')
      chooseQuality('smallest')
      await act(async () => {})

      expect(getByTestId('export-quality')).toHaveTextContent('Reduced')
      expect(getByTestId('export-quality')).not.toHaveTextContent(/small/i)
    })

    it('re-estimates on the rung, because two rungs are two different files', async () => {
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      chooseCompression('draco')
      await act(async () => {})
      expect(artifactSizes)
        .toHaveBeenLastCalledWith(expect.objectContaining(ARTIFACT), 'draco', false, 'balanced')

      chooseQuality('smallest')
      await act(async () => {})

      expect(artifactSizes)
        .toHaveBeenLastCalledWith(expect.objectContaining(ARTIFACT), 'draco', false, 'smallest')
      // …and the figure on the line says which rung it is for, so a test that
      // waits for it cannot read the previous rung's number
      // (`tests/e2e/exportEstimate.ts`).
      expect(getByTestId('export-size'))
        .toHaveAttribute('data-estimate-key', 'native|draco|smallest|meta')
    })

    it('captions what the rung costs, in millimetres off this model', async () => {
      // "Reduced — parts may move up to 4.7 mm" is a decision a building
      // modeller can make; "POSITION: 12 bits" is not (#1848 §5b). The figure
      // is derived from the artifact's own bounds, so it moves with the model.
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      // Nothing to say with no codec: the file is not being re-encoded.
      expect(queryByTestId('export-quality-caption')).toBeNull()

      chooseCompression('draco')
      await act(async () => {})
      expect(getByTestId('export-quality-caption')).toHaveTextContent('parts may move up to 1.2 mm')

      chooseQuality('smallest')
      await act(async () => {})
      expect(getByTestId('export-quality-caption')).toHaveTextContent('parts may move up to 4.7 mm')
    })

    it('says what Meshopt costs instead, which is not a distance', async () => {
      // Positions are bit-exact at every rung, so a millimetre figure here
      // would be a fiction. What FILTER actually rounds is shading.
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      chooseCompression('meshopt')
      await act(async () => {})
      expect(getByTestId('export-quality-caption'))
        .toHaveTextContent('geometry exact; shading normals rounded')

      chooseQuality('best')
      await act(async () => {})
      expect(getByTestId('export-quality-caption'))
        .toHaveTextContent('geometry and shading normals exact')
    })

    it('carries the rung into the export', async () => {
      settleSizes()
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      chooseCompression('draco')
      chooseQuality('smallest')
      await act(async () => {})
      fireEvent.click(getByTestId('export-glb-button'))

      expect(mockRun).toHaveBeenLastCalledWith(
        'glb', {stripBldrsMetadata: false, compression: 'draco', quality: 'smallest', portable: false})
    })
  })

  describe('the background codec sweep (#1850)', () => {
    // Momentum's real figures: Draco wins by 5× on a geometry-heavy building
    // model. Which codec wins swings with model shape, so the panel measures
    // rather than recommending on reputation (#1850).
    const CODEC_SIZES = {
      none: {withMetadata: 1959196, withoutMetadata: 1800000},
      meshopt: {withMetadata: 1347740, withoutMetadata: 1200000},
      draco: {withMetadata: 250184, withoutMetadata: 220000},
    }

    /**
     * Deal the panel a sweep state.
     *
     * @param {object} [state] merged over "nothing measured, nothing running"
     */
    function sweepState(state = {}) {
      useCodecSizes.mockReturnValue({...NO_CODEC_SIZES, ...state})
    }

    beforeEach(() => {
      artifactSizes.mockResolvedValue({
        withMetadata: WITH_METADATA_BYTES,
        withoutMetadata: WITHOUT_METADATA_BYTES,
        metadataBytes: METADATA_BYTES,
        compression: 'none',
      })
    })

    it('defaults to the smallest codec once every figure is in', async () => {
      sweepState({sizesByCodec: CODEC_SIZES})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(getByTestId('export-compression')).toHaveTextContent('Draco')
      // …and that selection is what the button exports.
      fireEvent.click(getByTestId('export-glb-button'))
      expect(mockRun).toHaveBeenLastCalledWith(
        'glb', {stripBldrsMetadata: false, compression: 'draco', quality: 'balanced', portable: false})
    })

    it('leaves the selection alone until every figure is in', async () => {
      // Meshopt is the smallest SO FAR here and Draco has not reported. A
      // recommendation the next second contradicts is worse than none.
      sweepState({sizesByCodec: {none: CODEC_SIZES.none, meshopt: CODEC_SIZES.meshopt}, isMeasuring: true})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(getByTestId('export-compression')).toHaveTextContent('None')
    })

    it('never overrides a codec the user chose themselves', async () => {
      // Even though Draco is measurably smaller. A dropdown that moves under
      // the cursor because a later figure came in smaller is worse than a
      // suboptimal default.
      sweepState({sizesByCodec: {none: CODEC_SIZES.none, meshopt: CODEC_SIZES.meshopt}, isMeasuring: true})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      chooseCompression('meshopt')
      await act(async () => {})
      sweepState({sizesByCodec: CODEC_SIZES})
      // Re-render with the completed sweep, the way the hook's own state
      // change would.
      fireEvent.click(getByTestId('export-include-metadata').querySelector('input'))
      await act(async () => {})

      expect(getByTestId('export-compression')).toHaveTextContent('Meshopt')
    })

    it('treats picking the codec already selected as a choice', async () => {
      // MUI fires a Select's `onChange` only when the value CHANGES, so a user
      // who opens the dropdown mid-sweep, reads the sizes and clicks the one
      // already showing would otherwise have said nothing — and the sweep
      // would move it out from under them a second later.
      sweepState({sizesByCodec: {none: CODEC_SIZES.none, meshopt: CODEC_SIZES.meshopt}, isMeasuring: true})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})
      expect(getByTestId('export-compression')).toHaveTextContent('None')

      chooseCompression('none')
      await act(async () => {})
      sweepState({sizesByCodec: CODEC_SIZES})
      fireEvent.click(getByTestId('export-include-metadata').querySelector('input'))
      await act(async () => {})

      expect(getByTestId('export-compression')).toHaveTextContent('None')
    })

    it('puts each codec\'s measured size on its own option, following the toggle', async () => {
      // Appended to the dropdown OPTION, not to the closed control: the menu
      // is where the comparison happens and where there is room for it.
      sweepState({sizesByCodec: CODEC_SIZES})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      fireEvent.mouseDown(within(getByTestId('export-compression')).getByRole('combobox'))

      expect(screen.getByTestId('export-compression-draco'))
        .toHaveAttribute('data-bytes', String(CODEC_SIZES.draco.withMetadata))
      expect(screen.getByTestId('export-compression-meshopt'))
        .toHaveAttribute('data-bytes', String(CODEC_SIZES.meshopt.withMetadata))
      expect(screen.getByTestId('export-compression-draco')).toHaveTextContent('Draco')
      // The closed control stays a bare label — at 390px a figure beside it
      // would ellipsize away the half that matters or push the dialog
      // sideways (#1838).
      expect(getByTestId('export-compression')).not.toHaveTextContent('MB')
    })

    it('says which codec it is sizing, and offers one honest way to stop', async () => {
      // The encoders are synchronous wasm with no abort, so Stop ends the
      // QUEUE and the codec in flight finishes. The status line says so
      // rather than claiming the work stopped.
      const stop = jest.fn()
      sweepState({isMeasuring: true, measuringCodec: 'draco', stop})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId, rerender} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(getByTestId('export-codec-sizes-status')).toHaveTextContent('Sizing Draco…')

      fireEvent.click(getByTestId('export-codec-sizes-stop'))
      expect(stop).toHaveBeenCalled()

      sweepState({isMeasuring: true, isStopping: true, measuringCodec: 'draco', stop})
      rerender(<ExportSection/>)
      await act(async () => {})

      expect(getByTestId('export-codec-sizes-status')).toHaveTextContent('Finishing Draco…')
      expect(getByTestId('export-codec-sizes-stop')).toBeDisabled()
    })

    it('offers to calculate rather than starting on a huge artifact', async () => {
      const start = jest.fn()
      sweepState({isPaused: true, start})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId, queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(getByTestId('export-codec-sizes-status')).toHaveTextContent('Codec sizes not measured')
      expect(queryByTestId('export-codec-sizes-stop')).toBeNull()

      fireEvent.click(getByTestId('export-codec-sizes-start'))

      expect(start).toHaveBeenCalled()
    })

    it('publishes which codecs it has a figure for', async () => {
      // The seam an E2E needs: the auto-selection lands the moment the last
      // figure does, so a test that touches the codec control before then is
      // clicking at a dropdown that is about to move
      // (`tests/e2e/export.ts#waitForCodecSizing`).
      sweepState({sizesByCodec: {none: CODEC_SIZES.none, meshopt: CODEC_SIZES.meshopt}, isMeasuring: true})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId, rerender} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(getByTestId('export-section')).toHaveAttribute('data-codec-sizes', 'none,meshopt')

      sweepState({sizesByCodec: CODEC_SIZES})
      rerender(<ExportSection/>)
      await act(async () => {})

      expect(getByTestId('export-section')).toHaveAttribute('data-codec-sizes', 'none,meshopt,draco')
    })

    it('says nothing at all once the sweep is done', async () => {
      // A finished sweep on a small model is over before most users have read
      // the label above it; a permanent status line for it would be noise.
      sweepState({sizesByCodec: CODEC_SIZES})
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {queryByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      expect(queryByTestId('export-codec-sizes')).toBeNull()
    })

    it('keeps offering to finish a sweep the user stopped part-way', async () => {
      // The counterpart to the test above, and the one the row's visibility
      // used to get wrong: nothing running, nothing suppressed by the
      // threshold, so the whole row unmounted — taking Stop and Calculate
      // sizes with it — while two codecs of three had figures and no winner
      // could ever be named. Reopening the dialog was the only way back
      // (#1852 review).
      const start = jest.fn()
      sweepState({
        sizesByCodec: {none: CODEC_SIZES.none, meshopt: CODEC_SIZES.meshopt},
        isPaused: true,
        start,
      })
      await setStore(ARTIFACT, {subscriptionStatus: 'sharePro'})
      const {getByTestId} = render(<ExportSection/>, {wrapper: HelmetStoreRouteThemeCtx})
      await act(async () => {})

      // Said as what it is: some figures are in, the rest never ran.
      expect(getByTestId('export-codec-sizes-status')).toHaveTextContent('Codec sizing stopped')

      fireEvent.click(getByTestId('export-codec-sizes-start'))

      expect(start).toHaveBeenCalled()
    })
  })
})

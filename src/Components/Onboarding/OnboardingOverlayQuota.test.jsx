import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import ViewerContainer from '../../Containers/ViewerContainer'
import useQuota from '../../hooks/useQuota'
import useStore from '../../store/useStore'
import {handleFileDrop} from '../../utils/dragAndDrop'
import HelpControl, {testId as helpTestId} from '../Help/HelpControl'


// The drop itself is dragAndDrop.test.js's subject. Here it is refused
// outright, so what is under test is what the overlay does with the refusal:
// handleFileDrop's own quota wiring calls onExceeded once record() says no.
jest.mock('../../utils/dragAndDrop', () => ({
  ...jest.requireActual('../../utils/dragAndDrop'),
  handleFileDrop: jest.fn(),
}))
jest.mock('../../hooks/useQuota')


/**
 * A drop on the onboarding overlay refused by the quota (bldrs-ai/ops#39).
 * The overlay closes itself, which unmounts it: HelpControl renders it only
 * while the store gives it a source. A QuotaLimitDialog kept in its own state
 * went with it, so the refusal showed nothing. These render the overlay the
 * way the app does, inside HelpControl, beside the ViewerContainer that
 * CadView always mounts.
 */
describe('OnboardingOverlay over the quota', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useQuota.mockReturnValue({tier: 'free', record: jest.fn()})
    handleFileDrop.mockImplementation(async (event, navigate, appPrefix, isOpfsAvailable, setAlert,
      onSuccess, onError, quotaOptions) => {
      // record() answers after a network hop.
      await Promise.resolve()
      quotaOptions.onExceeded()
    })
    act(() => useStore.setState({isDropQuotaDialogVisible: false, isHelpVisible: false}))
  })

  it('shows the limit dialog, and not Help, after the overlay unmounts', async () => {
    render(<><HelpControl/><ViewerContainer/></>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId(helpTestId))
    const overlay = await screen.findByTestId('onboarding-overlay')

    await act(async () => {
      fireEvent.drop(overlay, {dataTransfer: {files: []}})
      // The refusal lands after handleFileDrop's own await.
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByTestId('button-quota-subscribe')).toBeVisible())
    // Unmounted, not just hidden: no source, so HelpControl renders nothing.
    expect(useStore.getState().onboardingOverlaySource).toBeNull()
    expect(screen.queryByTestId('onboarding-overlay')).not.toBeInTheDocument()
    // The overlay's close would otherwise open Help over the dialog.
    expect(useStore.getState().isHelpVisible).toBe(false)
    expect(screen.queryByText('Study the model using standard sections')).not.toBeInTheDocument()
  })
})

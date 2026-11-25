import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {CONSENT_LEVELS} from '../../privacy/consent'
import useStore from '../../store/useStore'
import {navigateToModel} from '../../app/navigate'
import LocalOnlyDialog from './LocalOnlyDialog'


jest.mock('../../app/navigate', () => ({
  ...jest.requireActual('../../app/navigate'),
  navigateToModel: jest.fn(),
}))


const BLOCKED = {path: '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc#c:1,2,3,4,5,6', source: 'github'}


describe('LocalOnlyDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.setState({
        privacyLevel: CONSENT_LEVELS.RESTRICTED,
        blockedRemoteModel: BLOCKED,
        isAboutVisible: false,
      })
    })
  })

  test('says where the refused model is and what local-only mode opens', () => {
    render(<LocalOnlyDialog/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByTestId('local-only-message')).toHaveTextContent('This model is on GitHub')
    expect(screen.getByTestId('local-only-message')).toHaveTextContent('files from your computer and the sample models')
  })

  test('Not now drops the refused link', async () => {
    render(<LocalOnlyDialog/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('local-only-not-now'))
    await waitFor(() => expect(useStore.getState().blockedRemoteModel).toBeNull())
    expect(navigateToModel).not.toHaveBeenCalled()
  })

  test('Privacy settings opens About and steps aside for it', async () => {
    render(<LocalOnlyDialog/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('local-only-privacy-settings'))
    expect(useStore.getState().isAboutVisible).toBe(true)
    await waitFor(() => expect(screen.queryByTestId('local-only-message')).toBeNull())
    // Still refused until the visitor chooses.
    expect(useStore.getState().blockedRemoteModel).toEqual(BLOCKED)
  })

  test('opens the refused link once About closes with a higher level', async () => {
    render(<LocalOnlyDialog/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('local-only-privacy-settings'))
    act(() => {
      useStore.setState({privacyLevel: CONSENT_LEVELS.FUNCTIONAL, isAboutVisible: false})
    })
    await waitFor(() => expect(navigateToModel).toHaveBeenCalledWith(BLOCKED.path, expect.any(Function)))
    expect(useStore.getState().blockedRemoteModel).toBeNull()
  })

  test('comes back, without opening anything, when About closes still declined', async () => {
    render(<LocalOnlyDialog/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('local-only-privacy-settings'))
    act(() => {
      useStore.setState({isAboutVisible: false})
    })
    expect(await screen.findByTestId('local-only-message')).toBeInTheDocument()
    expect(navigateToModel).not.toHaveBeenCalled()
  })
})

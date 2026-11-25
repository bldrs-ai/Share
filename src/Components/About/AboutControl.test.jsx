import Cookies from 'js-cookie'
import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import * as FirstTime from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import AboutControl, {testId} from './AboutControl'
import {X_PROFILE_URL} from './AboutDialog'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'


describe('AboutControl', () => {
  beforeEach(() => {
    Cookies.remove(FirstTime.COOKIE_NAME)
  })

  it('renders the AboutControl button', () => {
    const {getByTestId} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTestId(testId)
    expect(aboutControl).toBeInTheDocument()
  })

  it('renders AboutDialog when control is pressed and updates the document title', async () => {
    const {getByTestId, getByText} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTestId(testId)
    fireEvent.click(aboutControl)
    const dialogTitle = getByText(ABOUT_MISSION)
    expect(dialogTitle).toBeInTheDocument()
    await(waitFor(() => expect(document.title).toBe(ABOUT_PAGE_TITLE)))
  })

  it('lists X @bldrs_ai first among the socials', () => {
    // The store is shared across tests; start closed, open it as a
    // visitor would, and leave it closed for the next test.
    act(() => useStore.setState({isAboutVisible: false}))
    render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId(testId))
    const x = screen.getByTestId('about-social-x')
    expect(x).toHaveAttribute('href', X_PROFILE_URL)
    expect(X_PROFILE_URL).toBe('https://x.com/bldrs_ai')
    expect(x).toHaveAttribute('target', '_blank')
    expect(x).toHaveTextContent('@bldrs_ai')
    // First: the Discord link comes after it in the same row.
    const discord = screen.getByRole('link', {name: /Discord/})
    expect(x.compareDocumentPosition(discord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    act(() => useStore.setState({isAboutVisible: false}))
  })

  // Named for the org, not the site (owner, 2026-11-25).
  it('labels the GitHub link with the bldrs-ai org, and lists IFC without versions', () => {
    act(() => useStore.setState({isAboutVisible: false}))
    render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId(testId))
    const github = screen.getByTestId('about-social-github')
    expect(github).toHaveAttribute('href', 'https://github.com/bldrs-ai/Share')
    expect(github).toHaveTextContent('bldrs-ai')
    expect(github).not.toHaveTextContent('GitHub')
    expect(screen.getByText('Open: IFC, STEP, STL, OBJ, ...')).toBeInTheDocument()
    act(() => useStore.setState({isAboutVisible: false}))
  })

  // A first-timer who dismissed About any way but OK was never marked
  // visited, so the reload after their first drag-and-drop replayed About +
  // the onboarding overlay. Each close path must set the cookie.
  describe('first-time visit is recorded however About is dismissed', () => {
    const closeBy = {
      'OK button': () => fireEvent.click(screen.getByTestId('button-dialog-main-action')),
      'X button': () => fireEvent.click(screen.getByTestId(/^button-close-dialog-/)),
      'Escape key': () => fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'}),
      'backdrop click': () => {
        // MUI closes on a click whose target is the backdrop itself, which
        // needs both mousedown and click on it.
        const backdrop = document.querySelector('.MuiBackdrop-root')
        fireEvent.mouseDown(backdrop)
        fireEvent.click(backdrop)
      },
    }
    Object.entries(closeBy).forEach(([how, close]) => {
      it(`via ${how}`, async () => {
        render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
        fireEvent.click(screen.getByTestId(testId))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(FirstTime.isFirst()).toBe(true)
        close()
        await waitFor(() => expect(FirstTime.isFirst()).toBe(false))
      })
    })
  })
})

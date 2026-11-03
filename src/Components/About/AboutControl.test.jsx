import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import * as FirstTime from '../../privacy/firstTime'
import AboutControl, {testId} from './AboutControl'
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

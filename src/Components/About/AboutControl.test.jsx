import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
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
})

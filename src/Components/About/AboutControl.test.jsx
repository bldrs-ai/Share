import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import * as FirstTime from '../../privacy/firstTime'
import AboutControl, {testId} from './AboutControl'


describe('AboutControl', () => {
  beforeEach(() => {
    Cookies.remove(FirstTime.COOKIE_NAME)
  })

  it('renders the AboutControl button', () => {
    const {getByTestId} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTestId(testId)
    expect(aboutControl).toBeInTheDocument()
  })

  it('renders AboutDialog when control is pressed', () => {
    const {getByTestId, getByText} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTestId(testId)
    fireEvent.click(aboutControl)
    const dialogTitle = getByText('Build every thing together')
    expect(dialogTitle).toBeInTheDocument()
  })

  it('updates the document title when the dialog is open', async () => {
    const {getByTestId} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTestId(testId)
    fireEvent.click(aboutControl)
    await(waitFor(() => expect(document.title).toBe('About — bldrs.ai')))
  })
})

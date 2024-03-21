import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import * as FirstTime from '../../privacy/firstTime'
import AboutControl from './AboutControl'
import PkgJson from '../../../package.json'


const bldrsVersionString = `Bldrs: ${PkgJson.version}`
describe('AboutControl', () => {
  beforeEach(() => {
    Cookies.remove(FirstTime.COOKIE_NAME)
  })

  it('renders the AboutControl button', () => {
    const {getByTitle} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)
    expect(aboutControl).toBeInTheDocument()
  })

  it('renders AboutDialog when control is pressed', () => {
    const {getByTitle, getByText} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)
    fireEvent.click(aboutControl)
    const dialogTitle = getByText('Build every thing together')
    expect(dialogTitle).toBeInTheDocument()
  })

  it('updates the document title when the dialog is open', async () => {
    const {getByTitle} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)
    fireEvent.click(aboutControl)
    await(waitFor(() => expect(document.title).toBe('About — Bldrs.ai')))
  })
})

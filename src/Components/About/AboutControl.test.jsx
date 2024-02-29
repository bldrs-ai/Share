import React from 'react'
import {render, fireEvent, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import AboutControl from './AboutControl'
import PkgJson from '../../../package.json'


const bldrsVersionString = `Bldrs: ${PkgJson.version}`
describe('About control tests', () => {
  test('renders the AboutControl button', () => {
    const {getByTitle} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)
    expect(aboutControl).toBeInTheDocument()
  })

  test('renders AboutDialog when control is pressed', () => {
    const {getByTitle, getByText} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)

    fireEvent.click(aboutControl)
    const dialogTitle = getByText('Build every thing together')
    expect(dialogTitle).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    const {getByTitle} = render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    const aboutControl = getByTitle(bldrsVersionString)
    fireEvent.click(aboutControl)
    await(waitFor(() => expect(document.title).toBe('About — Bldrs.ai')))
  })
})

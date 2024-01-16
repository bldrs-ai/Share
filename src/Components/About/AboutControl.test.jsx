import React from 'react'
import {render, fireEvent, waitFor} from '@testing-library/react'
import PkgJson from '../../../package.json'
import AboutFixture from './About.fixture'


const AboutTestComponent = () => <>{AboutFixture.AboutControl}</>

const bldrsVersionString = `Bldrs: ${PkgJson.version}`


describe('AboutControl', () => {
  it('renders the AboutControl button', () => {
    const {getByTitle} = render(<AboutTestComponent/>)
    const controlButton = getByTitle(bldrsVersionString)
    expect(controlButton).toBeInTheDocument()
  })


  it('renders AboutDialog when controlButton is pressed', async () => {
    const {getByText, getByTitle} = render(<AboutTestComponent/>)
    const controlButton = getByTitle(bldrsVersionString)
    fireEvent.click(controlButton)

    // Dialog title
    const dialogTitle = getByText('Build Every Thing Together')
    expect(dialogTitle).toBeInTheDocument()

    // Document title
    await(waitFor(() => expect(document.title).toBe('About — Bldrs.ai')))
  })
})

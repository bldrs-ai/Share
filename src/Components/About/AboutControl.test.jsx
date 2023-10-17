import React from 'react'
import {render, fireEvent, waitFor} from '@testing-library/react'
import {MockComponent} from '../../__mocks__/MockComponent'
import PkgJson from '../../../package.json'
import AboutControl from './AboutControl'


describe('About control tests', () => {
  test('renders the AboutControl button', () => {
    const {getByTitle} = render(<MockComponent><AboutControl/></MockComponent>)
    const aboutControl = getByTitle(`Bldrs: ${PkgJson.version}`)
    expect(aboutControl).toBeInTheDocument()
  })

  test('renders AboutDialog when control is pressed', () => {
    const {getByTitle, getByText} = render(<MockComponent><AboutControl/></MockComponent>)
    const aboutControl = getByTitle(`Bldrs: ${PkgJson.version}`)
    fireEvent.click(aboutControl)
    const dialogTitle = getByText('Build every thing together')
    expect(dialogTitle).toBeInTheDocument()
  })

  it('updates the title when the dialog is open', async () => {
    render(<AboutControl/>, {
      wrapper: MockComponent,
    })

    await(waitFor(() => expect(document.title).toBe('About — Bldrs.ai')))
  })
})

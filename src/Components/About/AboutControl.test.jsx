import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import {MockComponent} from '../../__mocks__/MockComponent'
import AboutControl from './AboutControl'


describe('About control tests', () => {
  test('renders the AboutControl button', () => {
    const {getByTitle} = render(<MockComponent><AboutControl/></MockComponent>)
    const aboutControl = getByTitle('About BLDRS')
    expect(aboutControl).toBeInTheDocument()
  })

  test('renders AbotDialog when control is pressed', () => {
    const {getByTitle, getByText} = render(<MockComponent><AboutControl/></MockComponent>)
    const aboutControl = getByTitle('About BLDRS')
    fireEvent.click(aboutControl)
    const dialogTitle = getByText('build every thing together')
    expect(dialogTitle).toBeInTheDocument()
  })
})

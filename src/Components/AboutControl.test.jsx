import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import * as Privacy from '../privacy/Privacy'
import {MockComponent} from '../__mocks__/MockComponent'
import AboutControl from './AboutControl'
import {setPrivacy} from './AboutControl'


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
    const dialogTitle = getByText('Build Every Thing Together')
    expect(dialogTitle).toBeInTheDocument()
  })

  test('sets privacy settings correctly', () => {
    // Test setting privacy to disabled
    setPrivacy(true)
    expect(Privacy.isPrivacySocialEnabled()).toBe(false)
    // Test setting privacy to enabled
    setPrivacy(false)
    expect(Privacy.isPrivacySocialEnabled()).toBe(true)
  })
})

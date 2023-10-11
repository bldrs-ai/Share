import React from 'react'
import {render, screen} from '@testing-library/react'
import ControlsGroup from './ControlsGroup'


jest.mock('./Buttons', () => ({
  TooltipIconButton: (props) => <button>{props.title}</button>,
}))


describe('ControlsGroup', () => {
  it('renders the search toggle', () => {
    render(<ControlsGroup fileOpen={jest.fn()}/>)
    const searchToggle = screen.getByText('Search')
    expect(searchToggle).toBeInTheDocument()
  })

  it('renders the navigation toggle', () => {
    render(<ControlsGroup fileOpen={jest.fn()}/>)
    const navigationToggle = screen.getByText('Navigation')
    expect(navigationToggle).toBeInTheDocument()
  })

  it('renders open model control button', () => {
    render(<ControlsGroup fileOpen={jest.fn()}/>)
    const navigationToggle = screen.getByText('Open IFC')
    expect(navigationToggle).toBeInTheDocument()
  })
})

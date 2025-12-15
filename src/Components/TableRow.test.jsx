// CustomTableRow.test.js
import React from 'react'
import {render, fireEvent, screen} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import CustomTableRow from './TableRow'


describe('<CustomTableRow />', () => {
  test('renders heading and subtext', () => {
    render(<CustomTableRow heading="Test Heading" subtext="Test Subtext"/>)
    expect(screen.getByText('Test Heading')).toBeInTheDocument()
    expect(screen.getByText('Test Subtext')).toBeInTheDocument()
  })

  test('shows input field when edit button is clicked', () => {
    render(<CustomTableRow heading="Test Heading" subtext="Test Subtext"/>)
    fireEvent.click(screen.getByRole('button')) // Click the edit button
    expect(screen.getByDisplayValue('Test Subtext')).toBeInTheDocument()
  })

  it('switches to select editing mode', () => {
    const {getByTestId} = render(
      <CustomTableRow heading="Test Heading" subtext="Option 1" inputType="select" options={['Option 1', 'Option 2']}/>,
    )

    fireEvent.click(screen.getByRole('button')) // Click the edit button

    const select = getByTestId('select')
    expect(select).toBeInTheDocument()
  })

  test('submits edited text when Enter key is pressed', () => {
    render(<CustomTableRow heading="Test Heading" subtext="Test Subtext"/>)
    fireEvent.click(screen.getByRole('button')) // Click the edit button

    const inputField = screen.getByDisplayValue('Test Subtext')
    fireEvent.change(inputField, {target: {value: 'Updated Text'}})
    fireEvent.keyDown(inputField, {key: 'Enter'})

    expect(screen.getByText('Updated Text')).toBeInTheDocument()
  })
})

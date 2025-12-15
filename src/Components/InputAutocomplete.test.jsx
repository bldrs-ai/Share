import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import InputAutocomplete from './InputAutocomplete' // Adjust the import path


describe('InputAutocomplete', () => {
  const elements = [
    {title: 'Option 1'},
    {title: 'Option 2'},
    {title: 'Option 3'},
  ]

  it('renders the input with placeholder', () => {
    const placeholderText = 'Type something'
    const {getByPlaceholderText} = render(
      <InputAutocomplete elements={elements} placeholder={placeholderText}/>,
    )
    const inputElement = getByPlaceholderText(placeholderText)
    expect(inputElement).toBeInTheDocument()
  })

  it('displays suggestions when typing', () => {
    const {getByPlaceholderText, getByText} = render(
      <InputAutocomplete elements={elements} placeholder="Type something"/>,
    )

    const inputElement = getByPlaceholderText('Type something')

    // Type some text into the input
    fireEvent.change(inputElement, {target: {value: 'Option'}})

    // Wait for suggestions to appear
    const suggestion1 = getByText('Option 1')
    const suggestion2 = getByText('Option 2')
    const suggestion3 = getByText('Option 3')

    expect(suggestion1).toBeInTheDocument()
    expect(suggestion2).toBeInTheDocument()
    expect(suggestion3).toBeInTheDocument()
  })
})

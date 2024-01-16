import {render, fireEvent} from '@testing-library/react'
import {
  createFixture,
  exampleElements,
  examplePlaceholderText,
} from './InputAutocomplete.fixture'


describe('InputAutocomplete', () => {
  it('renders the input with placeholder', () => {
    const {getByPlaceholderText} = render(createFixture({exampleElements, examplePlaceholderText}))
    const inputElement = getByPlaceholderText(examplePlaceholderText)
    expect(inputElement).toBeInTheDocument()
  })


  it('displays suggestions when typing', () => {
    const {getByPlaceholderText, getByText} = render(createFixture({exampleElements, examplePlaceholderText}))
    const inputElement = getByPlaceholderText(examplePlaceholderText)

    // Type some text into the input
    fireEvent.change(inputElement, {target: {value: 'Option'}})

    // Wait for suggestions to appear
    const suggestion1 = getByText(exampleElements[0].title)
    const suggestion2 = getByText(exampleElements[1].title)
    const suggestion3 = getByText(exampleElements[2].title)

    expect(suggestion1).toBeInTheDocument()
    expect(suggestion2).toBeInTheDocument()
    expect(suggestion3).toBeInTheDocument()
  })
})

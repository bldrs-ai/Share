import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import {ThemeProvider, createTheme} from '@mui/material/styles'
import InputAutocomplete from './InputAutocomplete'


describe('InputAutocomplete', () => {
  const theme = createTheme({
    palette: {
      scene: {
        background: '#fafafa',
      },
    },
  })

  const renderWithTheme = (component) => {
    return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>)
  }
  const mockOnClear = jest.fn()
  const setInputTextMock = jest.fn()
  const initialText = 'Option 1'

  it('renders the component', () => {
    const {getByRole} = renderWithTheme(
        <InputAutocomplete
          inputText={initialText}
          setInputText={setInputTextMock}
          error=''
          onClear={mockOnClear}
          options={['Option 1']}
        />)
    expect(getByRole('combobox')).toBeInTheDocument()
  })

  it('renders with the correct initial input text', () => {
    const {getByRole} = renderWithTheme(
        <InputAutocomplete
          inputText={initialText}
          setInputText={setInputTextMock}
          error=''
          onClear={mockOnClear}
          options={['Option 1', 'Option 2']}
        />,
    )
    const input = getByRole('combobox')
    expect(input.value).toBe(initialText)
  })

  it('updates the displayed input value when prop changes', () => {
    const {getByRole, rerender} = renderWithTheme(
        <InputAutocomplete
          inputText={initialText}
          setInputText={setInputTextMock}
          error=''
          onClear={mockOnClear}
          options={['Option 1', 'Option 2']}
        />,
    )

    const updatedText = 'Option 2'
    rerender(
        <ThemeProvider theme={theme}>
          <InputAutocomplete
            inputText={updatedText}
            setInputText={setInputTextMock}
            error=''
            onClear={mockOnClear}
            options={['Option 1', 'Option 2']}
          />
        </ThemeProvider>,
    )

    const input = getByRole('combobox')
    expect(input.value).toBe(updatedText)
  })

  it('renders input with given placeholder', () => {
    const placeholderText = 'Search something...'
    const {getByPlaceholderText} = renderWithTheme(
        <InputAutocomplete
          inputText={''}
          setInputText={setInputTextMock}
          error=''
          onClear={mockOnClear}
          options={[]}
          placeholder={placeholderText}
        />,
    )
    expect(getByPlaceholderText(placeholderText)).toBeInTheDocument()
  })

  it('displays the error state when error prop is passed', () => {
    const errorMsg = 'Sample error'
    const {getByRole} = renderWithTheme(
        <InputAutocomplete
          inputText={''}
          setInputText={setInputTextMock}
          error={errorMsg}
          onClear={mockOnClear}
          options={[]}
        />,
    )
    const input = getByRole('combobox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('displays options based on partial input string', () => {
    const {getByRole, getByText} = renderWithTheme(
        <InputAutocomplete
          inputText=''
          setInputText={setInputTextMock}
          error=''
          onClear={mockOnClear}
          options={['Option 1', 'Option 2', 'Test 3']}
        />,
    )

    const input = getByRole('combobox')

    // Simulating user typing 'Opt' in the input
    fireEvent.change(input, {target: {value: 'Opt'}})

    // Simulating focus on the input to trigger the dropdown
    fireEvent.focus(input)

    // Check if the options that contain 'Opt' are present in the document
    expect(getByText('Option 1')).toBeInTheDocument()
    expect(getByText('Option 2')).toBeInTheDocument()
  })
})

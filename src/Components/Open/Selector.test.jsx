import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import Selector from './Selector'


jest.useFakeTimers()

const mockSetSelected = jest.fn()
const mockValidate = jest.fn()

const defaultProps = {
  'label': 'Organization',
  'selected': '',
  'setSelected': mockSetSelected,
  'list': ['acme', 'test-org'],
  'data-testid': 'selector-org',
}


/**
 * @param {object} [overrides]
 * @return {void}
 */
function renderSelector(overrides = {}) {
  render(<Selector {...defaultProps} {...overrides}/>, {wrapper: HelmetStoreRouteThemeCtx})
}


/**
 * Open the MUI Select dropdown by firing mouseDown on the combobox trigger.
 *
 * @return {void}
 */
function openDropdown() {
  fireEvent.mouseDown(screen.getByRole('combobox'))
}


describe('Selector — dropdown mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a select input', () => {
    renderSelector()
    expect(screen.getByTestId('selector-org')).toBeInTheDocument()
  })

  it('does not show Enter name... when validate is not provided', async () => {
    renderSelector()
    openDropdown()
    await waitFor(() => {
      expect(screen.queryByText('Enter name...')).not.toBeInTheDocument()
    })
  })

  it('shows Enter name... when validate is provided', async () => {
    renderSelector({validate: mockValidate})
    openDropdown()
    await waitFor(() => {
      expect(screen.getByText('Enter name...')).toBeInTheDocument()
    })
  })

  it('switches to text mode when Enter name... is clicked', async () => {
    renderSelector({validate: mockValidate})
    openDropdown()
    const otherOption = await screen.findByText('Enter name...')
    fireEvent.click(otherOption)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})


describe('Selector — text mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockValidate.mockResolvedValue(false)
  })

  /**
   * Helper: render Selector in validate mode and activate Enter name... text mode.
   *
   * @return {HTMLElement} The text input element.
   */
  async function enterTextMode() {
    renderSelector({validate: mockValidate})
    openDropdown()
    const otherOption = await screen.findByText('Enter name...')
    fireEvent.click(otherOption)
    return screen.getByRole('textbox')
  }

  it('shows Checking... status while debounce is pending', async () => {
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'some-org'}})
    expect(screen.getByText('Checking...')).toBeInTheDocument()
  })

  it('shows No match when validate returns false', async () => {
    mockValidate.mockResolvedValue(false)
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'no-such-org'}})
    act(() => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(screen.getByText('No match')).toBeInTheDocument()
    })
  })

  it('shows Found when validate returns true', async () => {
    mockValidate.mockResolvedValue(true)
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'valid-org'}})
    act(() => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(screen.getByText('Found')).toBeInTheDocument()
    })
  })

  it('calls setSelected with typed value when Enter pressed after Found', async () => {
    mockValidate.mockResolvedValue(true)
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'valid-org'}})
    act(() => {
      jest.runAllTimers()
    })
    await waitFor(() => screen.getByText('Found'))
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(mockSetSelected).toHaveBeenCalledWith('valid-org')
  })

  it('does not call setSelected when Enter pressed before Found', async () => {
    mockValidate.mockResolvedValue(false)
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'bad-org'}})
    act(() => {
      jest.runAllTimers()
    })
    await waitFor(() => screen.getByText('No match'))
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(mockSetSelected).not.toHaveBeenCalled()
  })

  it('resets to dropdown mode when Escape is pressed', async () => {
    const input = await enterTextMode()
    fireEvent.keyDown(input, {key: 'Escape'})
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('selector-org')).toBeInTheDocument()
  })

  it('resets to dropdown mode when Clear button is clicked', async () => {
    await enterTextMode()
    const clearBtn = screen.getByTestId('selector-clear-organization')
    fireEvent.click(clearBtn)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('selector-org')).toBeInTheDocument()
  })

  it('calls setSelected on blur when status is Found', async () => {
    mockValidate.mockResolvedValue(true)
    const input = await enterTextMode()
    fireEvent.change(input, {target: {value: 'valid-org'}})
    act(() => {
      jest.runAllTimers()
    })
    await waitFor(() => screen.getByText('Found'))
    fireEvent.blur(input)
    expect(mockSetSelected).toHaveBeenCalledWith('valid-org')
  })
})

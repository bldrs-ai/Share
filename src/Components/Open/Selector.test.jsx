import React from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
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


describe('Selector — empty list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows default <None> placeholder when list is empty', () => {
    renderSelector({list: []})
    expect(screen.getByText('<None>')).toBeInTheDocument()
  })

  it('shows custom emptyText when provided', () => {
    renderSelector({list: [], emptyText: '<No subfolders>'})
    expect(screen.getByText('<No subfolders>')).toBeInTheDocument()
  })

  it('does not call setSelected when empty placeholder is clicked', async () => {
    renderSelector({list: []})
    fireEvent.mouseDown(screen.getByRole('combobox'))
    await waitFor(() => screen.getByRole('listbox'))
    const item = screen.getAllByText('<None>')[0]
    fireEvent.click(item)
    expect(mockSetSelected).not.toHaveBeenCalled()
  })
})


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


describe('Selector — dropdown pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const longList = Array.from({length: 25}, (_, i) => `repo-${i}`)

  it('shows no pager when the list fits on one page', async () => {
    renderSelector({list: ['a', 'b', 'c']})
    openDropdown()
    await waitFor(() => screen.getByRole('listbox'))
    expect(screen.queryByTestId('selector-next-organization')).not.toBeInTheDocument()
  })

  it('shows only the first page plus a pager for a long list', async () => {
    renderSelector({list: longList})
    openDropdown()
    await waitFor(() => screen.getByRole('listbox'))
    expect(screen.getByText('repo-0')).toBeInTheDocument()
    expect(screen.getByText('repo-9')).toBeInTheDocument()
    expect(screen.queryByText('repo-10')).not.toBeInTheDocument()
    expect(screen.getByTestId('selector-next-organization')).toBeInTheDocument()
  })

  it('pages forward to the next set of options without closing', async () => {
    renderSelector({list: longList})
    openDropdown()
    await waitFor(() => screen.getByRole('listbox'))
    fireEvent.click(screen.getByTestId('selector-next-organization'))
    await waitFor(() => screen.getByText('repo-10'))
    expect(screen.getByText('repo-19')).toBeInTheDocument()
    expect(screen.queryByText('repo-0')).not.toBeInTheDocument()
    // Menu stayed open across the page change.
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('selects a later-page option with its global list index', async () => {
    renderSelector({list: longList})
    openDropdown()
    await waitFor(() => screen.getByRole('listbox'))
    fireEvent.click(screen.getByTestId('selector-next-organization'))
    const target = 'repo-12'
    await waitFor(() => screen.getByText(target))
    fireEvent.click(screen.getByText(target))
    expect(mockSetSelected).toHaveBeenCalledWith(longList.indexOf(target))
  })
})


describe('Selector — text-mode live filter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockValidate.mockResolvedValue(false)
  })

  const repoList = ['acme', 'test-models', 'test-models-private', 'zeta']
  const longList = Array.from({length: 25}, (_, i) => `repo-${i}`)

  /**
   * @param {Array} list option list
   * @return {HTMLElement} the text input
   */
  async function enterFilterMode(list) {
    renderSelector({validate: mockValidate, list})
    openDropdown()
    const other = await screen.findByText('Enter name...')
    fireEvent.click(other)
    return screen.getByRole('textbox')
  }

  it('filters the list live as the user types', async () => {
    const input = await enterFilterMode(repoList)
    fireEvent.change(input, {target: {value: 'test-models'}})
    expect(screen.getByText('test-models')).toBeInTheDocument()
    expect(screen.getByText('test-models-private')).toBeInTheDocument()
    expect(screen.queryByText('acme')).not.toBeInTheDocument()
  })

  it('selects a filtered match with its list index', async () => {
    const input = await enterFilterMode(repoList)
    fireEvent.change(input, {target: {value: 'private'}})
    fireEvent.click(screen.getByText('test-models-private'))
    expect(mockSetSelected).toHaveBeenCalledWith(repoList.indexOf('test-models-private'))
  })

  it('paginates a long filtered result set', async () => {
    const input = await enterFilterMode(longList)
    fireEvent.change(input, {target: {value: 'repo-'}})
    expect(screen.getByText('repo-0')).toBeInTheDocument()
    expect(screen.queryByText('repo-10')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('selector-next-organization'))
    await waitFor(() => screen.getByText('repo-10'))
  })

  it('does not call the API validator for a query already in the list', async () => {
    const input = await enterFilterMode(repoList)
    fireEvent.change(input, {target: {value: 'test'}})
    act(() => {
      jest.runAllTimers()
    })
    expect(mockValidate).not.toHaveBeenCalled()
  })

  it('accepts an exact in-list match on Enter (even when it is also a prefix)', async () => {
    const input = await enterFilterMode(repoList)
    fireEvent.change(input, {target: {value: 'test-models'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(mockSetSelected).toHaveBeenCalledWith(repoList.indexOf('test-models'))
  })

  it('does not accept a prefix-only query on Enter', async () => {
    const input = await enterFilterMode(repoList)
    fireEvent.change(input, {target: {value: 'test-mod'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(mockSetSelected).not.toHaveBeenCalled()
  })
})


describe('Selector — defensive value handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockValidate.mockResolvedValue(false)
  })

  it('skips null/undefined entries in the dropdown but keeps their list index', async () => {
    const sparse = ['acme', null, 'beta', undefined, 'gamma']
    renderSelector({list: sparse})
    openDropdown()
    await waitFor(() => screen.getByRole('listbox'))
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument()
    // 'gamma' is at index 4 in the full list — selecting it must report 4,
    // not a compacted index, so the parent resolves the right entry.
    fireEvent.click(screen.getByText('gamma'))
    expect(mockSetSelected).toHaveBeenCalledWith(sparse.indexOf('gamma'))
  })

  it('filters null/undefined/empty entries out of the text-mode match list', async () => {
    const sparse = ['acme', null, '', undefined, 'beta']
    renderSelector({validate: mockValidate, list: sparse})
    openDropdown()
    fireEvent.click(await screen.findByText('Enter name...'))
    const input = screen.getByRole('textbox')
    // Empty query shows the full list, but the holes must not render as blank
    // rows — only the two real names should appear as matches.
    const matches = screen.getByTestId('selector-matches-organization')
    expect(within(matches).getByText('acme')).toBeInTheDocument()
    expect(within(matches).getByText('beta')).toBeInTheDocument()
    // Exactly two rows render — the null/undefined/'' holes produce no blanks.
    expect(within(matches).getAllByText(/\w/)).toHaveLength(2)
    expect(input).toBeInTheDocument()
  })

  it('renders an out-of-range numeric selection as empty, never "undefined"', () => {
    renderSelector({list: ['a', 'b'], selected: 99})
    // A stale index past the end of the list must not surface the literal
    // string "undefined" in the closed field.
    expect(screen.getByRole('combobox').textContent).not.toMatch(/undefined/)
  })
})


describe('Selector — clear (×) affordance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the clear × only when onClear is set and a value is selected', () => {
    renderSelector({onClear: jest.fn(), selected: 0})
    expect(screen.getByTestId('selector-clear-select-organization')).toBeInTheDocument()
  })

  it('does not show the clear × without a selection', () => {
    renderSelector({onClear: jest.fn(), selected: ''})
    expect(screen.queryByTestId('selector-clear-select-organization')).not.toBeInTheDocument()
  })

  it('does not show the clear × without an onClear handler', () => {
    renderSelector({selected: 0})
    expect(screen.queryByTestId('selector-clear-select-organization')).not.toBeInTheDocument()
  })

  it('calls onClear when the × is clicked', () => {
    const onClear = jest.fn()
    renderSelector({onClear, selected: 0})
    fireEvent.click(screen.getByTestId('selector-clear-select-organization'))
    expect(onClear).toHaveBeenCalled()
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

import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {StoreCtx} from '../../store/Store.fixture'
import useStore from '../../store/useStore'
import {ThemeCtx} from '../../theme/Theme.fixture'
import BotChat from './BotChat'


describe('BotChat', () => {
  let viewerMock: any
  beforeEach(() => {
    window.alert = jest.fn()
    viewerMock = {
      getSelectedElementsProps: jest.fn().mockResolvedValue([]),
      isolator: {
        hideElementsById: jest.fn(),
        initTemporaryIsolationSubset: jest.fn(),
      },
    }

    act(() => {
      useStore.setState({viewer: viewerMock, selectedElements: []})
    })
  })

  afterEach(() => {
    act(() => {
      useStore.setState({
        viewer: undefined,
        selectedElements: [],
      })
    })
    localStorage.clear()
    jest.clearAllMocks()
  })

  it('opens, toggles pin state, and closes', () => {
    const {container} = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    const openButton = screen.getByRole('button', {name: /chat/i})
    fireEvent.click(openButton)

    expect(screen.getByText('Bot')).toBeInTheDocument()

    const pinButton = screen.getByRole('button', {name: 'Unpin bot'})
    expect(pinButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pinButton)
    expect(screen.getByRole('button', {name: 'Pin bot'})).toHaveAttribute('aria-pressed', 'true')

    const closeButton = container.querySelector('button [data-testid="CloseIcon"]')?.parentElement as HTMLButtonElement
    expect(closeButton).toBeTruthy()
    fireEvent.click(closeButton)

    expect(screen.queryByText('Bot')).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: /chat/i})).toBeInTheDocument()
  })

  it('sends a message and displays the MSW mock response', async () => {
    const {container} = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: /chat/i}))

    fireEvent.change(
      screen.getByPlaceholderText('Paste your OpenRouter API Key…'),
      {target: {value: 'test-key'}},
    )

    fireEvent.change(
      screen.getByPlaceholderText('Type a message…'),
      {target: {value: 'Hello bot'}},
    )

    const sendButton = container.querySelector('button [data-testid="SendIcon"]')?.parentElement as HTMLButtonElement
    expect(sendButton).toBeTruthy()
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText('Test received.')).toBeInTheDocument()
    })

    expect(viewerMock.getSelectedElementsProps).toHaveBeenCalledWith([])
  })
})

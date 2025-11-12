import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import BotChat from './BotChat'


type StoreState = ReturnType<typeof useStore.getState> & {
  viewer?: unknown
  selectedElements: string[]
  isBotVisible: boolean
}

const setStoreState = useStore.setState as unknown as (partial: Record<string, unknown>) => void


describe('BotChat', () => {
  let viewerMock
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
      setStoreState({viewer: viewerMock, selectedElements: [], isBotVisible: true})
    })
  })

  afterEach(() => {
    act(() => {
      setStoreState({
        viewer: undefined,
        selectedElements: [],
        isBotVisible: true,
      })
    })
    localStorage.clear()
    jest.clearAllMocks()
  })

  it('closes when the panel close button is clicked', () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

    expect(screen.getByText('Bot')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Close'}))

    expect((useStore.getState() as StoreState).isBotVisible).toBe(false)
  })

  it('sends a message and displays the MSW mock response', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.change(
      screen.getByPlaceholderText('Paste your OpenRouter API Key…'),
      {target: {value: 'test-key'}},
    )

    fireEvent.change(
      screen.getByPlaceholderText('Type a message…'),
      {target: {value: 'Hello bot'}},
    )

    fireEvent.click(screen.getByTestId('BotChat-SendButton'))

    await waitFor(() => {
      expect(screen.getByText('Test received.')).toBeInTheDocument()
    })

    expect(viewerMock.getSelectedElementsProps).toHaveBeenCalledWith([])
  })

  it('scrolls to the latest message when messages update', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

    const endNode = await screen.findByTestId('BotChat-MessagesEnd')
    const scrollIntoView = jest.fn()
    Object.defineProperty(endNode, 'scrollIntoView', {value: scrollIntoView, writable: true})

    fireEvent.change(
      screen.getByPlaceholderText('Paste your OpenRouter API Key…'),
      {target: {value: 'test-key'}},
    )

    fireEvent.change(
      screen.getByPlaceholderText('Type a message…'),
      {target: {value: 'Scroll test'}},
    )

    fireEvent.click(screen.getByTestId('BotChat-SendButton'))

    await waitFor(() => {
      expect(screen.getByText('Test received.')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled()
    })
  })
})

import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import BotChat, {WORKER_ENGINE_BOT_MESSAGE} from './BotChat'
import {BOT_TITLE} from './component'


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

    localStorage.setItem('openrouter_api_key', 'test-key')
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

    expect(screen.getByText(BOT_TITLE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Close'}))

    expect((useStore.getState() as StoreState).isBotVisible).toBe(false)
  })

  it('sends a message and displays the MSW mock response', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

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

  it('on a model whose engine is in a worker, answers that it cannot, without reading it', async () => {
    // engine-worker.md §8 item 7: the legacy chat reads through the
    // main-thread engine, which holds no model under ?feature=engineWorker.
    act(() => {
      setStoreState({model: {ifcManager: {ifcAPI: {engineSession: {}}}}})
    })
    try {
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      fireEvent.change(screen.getByPlaceholderText('Type a message…'), {target: {value: 'Select walls'}})
      fireEvent.click(screen.getByTestId('BotChat-SendButton'))
      await waitFor(() => {
        expect(screen.getByText(WORKER_ENGINE_BOT_MESSAGE)).toBeInTheDocument()
      })
      expect(viewerMock.getSelectedElementsProps).not.toHaveBeenCalled()
      expect(screen.queryByText('Test received.')).not.toBeInTheDocument()
    } finally {
      act(() => {
        setStoreState({model: null})
      })
    }
  })

  it('scrolls to the latest message when messages update', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

    const endNode = await screen.findByTestId('BotChat-MessagesEnd')
    const scrollIntoView = jest.fn()
    Object.defineProperty(endNode, 'scrollIntoView', {value: scrollIntoView, writable: true})

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

  it('updates API key from settings panel', () => {
    localStorage.setItem('openrouter_api_key', 'old-key')
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})

    fireEvent.click(screen.getByTestId('BotSettings-OpenButton'))
    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    fireEvent.change(input, {target: {value: 'new-key'}})
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))

    expect(localStorage.getItem('openrouter_api_key')).toBe('new-key')
    expect(screen.queryByTestId('BotSettings')).not.toBeInTheDocument()
  })
})

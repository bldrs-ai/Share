import React from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import BotChat from './BotChat'
import {LEGACY_KEY_NAME, assistKeyStore, resetAssistChat} from './assistState'
import {BOT_TITLE} from './component'


// The lazy runtime is a URL import in the app (assistRuntime.js); Jest loads
// the module directly. Everything under it is real: the AI SDK, the
// OpenRouter provider, and MSW's scripted SSE (api-handlers-openrouter.ts).
jest.mock('../../viewer/tools/assistRuntime', () => ({
  loadAssistRuntime: () => import('../../assist/runtime'),
}))

// Share's registry needs a loaded model, which jsdom has none of. These
// tests swap in a small registry with the same tool names, over a fake view,
// and keep everything else of createShareAssist.
const mockView: {selected: string[], undos: number} = {selected: ['e9'], undos: 0}
jest.mock('../../viewer/tools/assistHost', () => {
  const actual = jest.requireActual('../../viewer/tools/assistHost')
  return {
    ...actual,
    createShareAssist: (runtime: {
      createAssist: (o: object) => object,
      openRouterTransport: (o: object) => {label: string},
    }, deps: {keyStore: {get: (id: string) => string | null}, conversationStore: object}) => {
      // A factory may not close over imports (jest hoists it above them).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {createRegistry: make} = require('../../assist')
      const registry = make([mockModelTools(), mockViewTools()])
      const transport = runtime.openRouterTransport({
        getKey: () => deps.keyStore.get('openrouter'), model: 'mock/model',
        baseURL: `${process.env.OPENROUTER_BASE_URL}/api/v1`,
      })
      const assist = runtime.createAssist({transport, registry, store: deps.conversationStore,
        instructions: 'Use the tools.', maxRetries: 0})
      return {assist, transport, dispose: () => registry.dispose()}
    },
  }
})


/** @return a `model` provider whose query lists two proxies */
function mockModelTools() {
  return {
    id: 'model',
    tools: () => [{
      name: 'model.query', description: 'Find.', annotations: {readOnly: true},
      inputSchema: {type: 'object', properties: {ifcType: {type: 'string'}}, additionalProperties: false},
      run: () => Promise.resolve({content: {total: 2, items: [{ref: 'e1'}, {ref: 'e2'}]}, echo: 'Found 2 elements'}),
    }],
  }
}


/** @return a `view` provider whose select changes {@link mockView} and can undo */
function mockViewTools() {
  return {
    id: 'view',
    tools: () => [{
      name: 'view.select', description: 'Select.', annotations: {viewState: true},
      inputSchema: {type: 'object', properties: {refs: {type: 'array', items: {type: 'string'}}},
        required: ['refs'], additionalProperties: false},
      run: ({refs}: {refs: string[]}) => {
        const before = mockView.selected
        mockView.selected = refs
        return Promise.resolve({
          content: {selected: refs.length, refs}, echo: `Selected ${refs.length} elements`, refs,
          undo: () => {
            mockView.undos++
            mockView.selected = before
            return Promise.resolve()
          },
        })
      },
    }],
  }
}


type StoreState = ReturnType<typeof useStore.getState> & {isBotVisible: boolean}
const setStoreState = useStore.setState as unknown as (partial: Record<string, unknown>) => void


/** @param text the message to send */
function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Type a message…'), {target: {value: text}})
  fireEvent.click(screen.getByTestId('BotChat-SendButton'))
}


describe('BotChat', () => {
  beforeEach(() => {
    mockView.selected = ['e9']
    mockView.undos = 0
    act(() => {
      setStoreState({isBotVisible: true})
      assistKeyStore.set(OPENROUTER_KEY_ID, 'test-key')
    })
  })

  afterEach(() => {
    act(() => {
      resetAssistChat()
      assistKeyStore.forget(OPENROUTER_KEY_ID)
    })
    localStorage.clear()
  })

  it('closes when the panel close button is clicked', () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByText(BOT_TITLE)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Close'}))
    expect((useStore.getState() as StoreState).isBotVisible).toBe(false)
  })

  it('streams the reply into a bubble, and the Send button comes back', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByText('Test received.')).toBeInTheDocument()
    expect(screen.getByText('Hello bot')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
  })

  it('shows each step\'s actions from the tools\' echo, and Undo reverses the select once', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    expect(await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    expect(mockView.selected).toEqual(['e1', 'e2'])

    const actions = screen.getAllByTestId('BotChat-Action')
    expect(actions.map((a) => a.textContent)).toEqual(['Found 2 elements', 'Selected 2 elementsUndo'])
    // The read-only step has no Undo; the select's has one, labelled with what it undoes.
    expect(within(actions[0]).queryByTestId('BotChat-UndoButton')).toBeNull()
    const undo = within(actions[1]).getByRole('button', {name: 'Undo: Selected 2 elements'})
    fireEvent.click(undo)
    expect(await within(actions[1]).findByTestId('BotChat-Undone')).toHaveTextContent('Undone')
    expect(mockView.selected).toEqual(['e9'])
    expect(mockView.undos).toBe(1)
    expect(within(actions[1]).queryByTestId('BotChat-UndoButton')).toBeNull()
  })

  it('keeps the conversation when the panel unmounts and comes back (a phone\'s drawer tabs)', async () => {
    const first = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    expect(await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    first.unmount()
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Undo: Selected 2 elements'}))
    expect(await screen.findByTestId('BotChat-Undone')).toHaveTextContent('Undone')
    expect(mockView.selected).toEqual(['e9'])
  })

  it('Stop ends a streaming reply and says so', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.longPrompt)
    const reply = await screen.findByTestId('BotChat-Reply')
    fireEvent.click(screen.getByRole('button', {name: 'Stop the reply'}))
    expect(await screen.findByText(assistErrorMessage('aborted', 'OpenRouter'))).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
    const stopped = reply.textContent ?? ''
    expect(stopped.length).toBeLessThan(SCRIPT.longWord.repeat(SCRIPT.longWords).length)
    // Nothing more arrives after the stop.
    await new Promise((resolve) => setTimeout(resolve, SCRIPT.longDelayMs * 3))
    expect(reply.textContent).toBe(stopped)
  })

  it('without a key, says where to add one and sends nothing', async () => {
    act(() => {
      assistKeyStore.forget(OPENROUTER_KEY_ID)
    })
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(assistErrorMessage('no_key', 'OpenRouter'))
    expect(screen.queryByText('Test received.')).toBeNull()
  })

  it('saves the key from settings to the session key store only, and deletes the old plaintext key', () => {
    localStorage.setItem(LEGACY_KEY_NAME, 'old-plaintext-key')
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(localStorage.getItem(LEGACY_KEY_NAME)).toBeNull()

    fireEvent.click(screen.getByTestId('BotSettings-OpenButton'))
    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    expect(input.value).toBe('test-key')
    fireEvent.change(input, {target: {value: 'new-key'}})
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))

    expect(assistKeyStore.get(OPENROUTER_KEY_ID)).toBe('new-key')
    expect(JSON.stringify({...localStorage})).not.toContain('new-key')
    expect(screen.queryByTestId('BotSettings')).not.toBeInTheDocument()
  })

  it('scrolls to the latest message when messages update', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    const endNode = await screen.findByTestId('BotChat-MessagesEnd')
    const scrollIntoView = jest.fn()
    Object.defineProperty(endNode, 'scrollIntoView', {value: scrollIntoView, writable: true})
    send('Scroll test')
    expect(await screen.findByText('Test received.')).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })
})


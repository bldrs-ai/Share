import React from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {http} from 'msw'
import {OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import {DEFAULT_MAX_STEPS} from '../../assist/loop'
import {SCRIPT, SSE_HEADERS, sseText, toolCalls} from '../../assist/openrouterSse.fixture'
import {getServer} from '../../__mocks__/server'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import BotChat, {
  RUNTIME_LOAD_FAILED_MESSAGE,
  START_FAILED_MESSAGE,
  TURN_FAILED_MESSAGE,
  stepLimitMessage,
} from './BotChat'
import {assistKeyStore, resetAssistChat} from './assistState'
import {BOT_TITLE} from './component'
import {reportAssistCondition} from './reportAssistCondition'


jest.mock('./reportAssistCondition', () => ({reportAssistCondition: jest.fn()}))
const mockControl = {runtimeFails: false, runtimeDelayMs: 0, startThrows: false, labelThrows: false}


// The lazy runtime is a URL import in the app (assistRuntime.js); Jest loads
// the module directly. Everything under it is real: the AI SDK, the
// OpenRouter provider, and MSW's scripted SSE (api-handlers-openrouter.ts).
jest.mock('../../viewer/tools/assistRuntime', () => ({
  loadAssistRuntime: () => {
    if (mockControl.runtimeFails) {
      return Promise.reject(new Error('404 assist/runtime.js'))
    }
    const runtime = import('../../assist/runtime')
    return mockControl.runtimeDelayMs === 0 ? runtime :
      new Promise((resolve) => setTimeout(() => resolve(runtime), mockControl.runtimeDelayMs))
  },
}))

// Share's registry needs a loaded model, which jsdom has none of. These
// tests swap in a small registry with the same tool names, over a fake view,
// and keep everything else of createShareAssist.
const mockView: {selected: string[], undos: number, holdUndo: Promise<void> | null} =
  {selected: ['e9'], undos: 0, holdUndo: null}
jest.mock('../../viewer/tools/assistHost', () => {
  const actual = jest.requireActual('../../viewer/tools/assistHost')
  return {
    ...actual,
    createShareAssist: (runtime: {
      createAssist: (o: object) => object,
      openRouterTransport: (o: object) => {label: string},
    }, deps: {keyStore: {get: (id: string) => string | null}, conversationStore: object}) => {
      if (mockControl.startThrows) {
        throw new Error('builder broke')
      }
      // A factory may not close over imports (jest hoists it above them).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {createRegistry: make} = require('../../assist')
      const registry = make([mockModelTools(), mockViewTools()])
      const transport = runtime.openRouterTransport({
        getKey: () => deps.keyStore.get('openrouter'), model: 'mock/model',
        baseURL: `${process.env.OPENROUTER_BASE_URL}/api/v1`,
      })
      // A transport whose label throws makes the panel's event handling throw.
      const shown = mockControl.labelThrows ? Object.defineProperty({...transport}, 'label', {get: () => {
        throw new Error('label broke')
      }}) : transport
      const assist = runtime.createAssist({transport, registry, store: deps.conversationStore,
        instructions: 'Use the tools.', maxRetries: 0})
      return {assist, transport: shown, dispose: () => registry.dispose()}
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
          undo: () => (mockView.holdUndo ?? Promise.resolve()).then(() => {
            mockView.undos++
            mockView.selected = before
          }),
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
    mockView.holdUndo = null
    Object.assign(mockControl, {runtimeFails: false, runtimeDelayMs: 0, startThrows: false, labelThrows: false})
    jest.mocked(reportAssistCondition).mockClear()
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

  it('saves the key from settings to the session key store only', () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('BotSettings-OpenButton'))
    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    expect(input.value).toBe('test-key')
    fireEvent.change(input, {target: {value: 'new-key'}})
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))

    expect(assistKeyStore.get(OPENROUTER_KEY_ID)).toBe('new-key')
    expect(JSON.stringify({...localStorage})).not.toContain('new-key')
    expect(screen.queryByTestId('BotSettings')).not.toBeInTheDocument()
  })

  it('while an undo runs, Undo, Send and New chat are disabled, and Undo says it is working', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
    let release = () => undefined
    mockView.holdUndo = new Promise((resolve) => {
      release = resolve
    })
    await act(() => Promise.resolve(fireEvent.click(screen.getByTestId('BotChat-UndoButton'))))
    const undo = screen.getByTestId('BotChat-UndoButton')
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('aria-busy', 'true')
    expect(undo).toHaveTextContent('Undoing…')
    expect(screen.getByTestId('BotChat-SendButton')).toBeDisabled()
    expect(screen.getByRole('button', {name: 'New chat'})).toBeDisabled()
    // Enter in the box doesn't send either.
    fireEvent.change(screen.getByPlaceholderText('Type a message…'), {target: {value: 'Hello bot'}})
    fireEvent.keyDown(screen.getByPlaceholderText('Type a message…'), {key: 'Enter'})
    expect(screen.queryByText('Hello bot')).toBeNull()

    await act(() => Promise.resolve(release()).then(() => new Promise((resolve) => setTimeout(resolve, 10))))
    expect(await screen.findByTestId('BotChat-Undone')).toHaveTextContent('Undone')
    expect(screen.getByTestId('BotChat-SendButton')).toBeEnabled()
    expect(screen.getByRole('button', {name: 'New chat'})).toBeEnabled()
    expect(mockView.selected).toEqual(['e9'])
  })

  it('offers Undo on the newest step only, across turns, and walks back one step at a time', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
    mockView.selected = ['e5']
    send(SCRIPT.selectPrompt)
    await waitFor(() => expect(screen.getAllByText(SCRIPT.selectedAnswer(2), {exact: false})).toHaveLength(2))
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
    expect(mockView.selected).toEqual(['e1', 'e2'])

    const selects = () => screen.getAllByTestId('BotChat-Action').filter((a) => a.textContent?.startsWith('Selected'))
    expect(selects().map((a) => Boolean(within(a).queryByTestId('BotChat-UndoButton')))).toEqual([false, true])
    // Undo settles after the click's handler returns, so wait for it inside act.
    await act(() => Promise.resolve(fireEvent.click(within(selects()[1]).getByTestId('BotChat-UndoButton'))))
    // The second turn's select is undone, and the first's Undo is now the one offered.
    await waitFor(() => expect(mockView.selected).toEqual(['e5']))
    await waitFor(() => expect(within(selects()[0]).queryByTestId('BotChat-UndoButton')).not.toBeNull())
    await act(() => Promise.resolve(fireEvent.click(within(selects()[0]).getByTestId('BotChat-UndoButton'))))
    await waitFor(() => expect(mockView.selected).toEqual(['e9']))
    await waitFor(() => expect(screen.queryByTestId('BotChat-UndoButton')).toBeNull())
  })

  it('New chat clears the conversation, and the next message starts a fresh one', async () => {
    const bodies: Array<{messages: unknown[]}> = []
    const onRequest = ({request}: {request: Request}) => {
      void request.clone().json().then((body) => bodies.push(body))
    }
    getServer().events.on('request:start', onRequest)
    try {
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      expect(await screen.findByText('Test received.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', {name: 'New chat'}))
      expect(screen.queryByText('Test received.')).toBeNull()
      expect(screen.queryByText('Hello bot')).toBeNull()
      send('Hello again')
      expect(await screen.findByText('Test received.')).toBeInTheDocument()
      await waitFor(() => expect(bodies).toHaveLength(2))
      // The second request carries only its own user message, not the first chat's.
      const users = (body: {messages: unknown[]}) => body.messages.filter((m) => (m as {role: string}).role === 'user')
      expect(users(bodies[1])).toEqual([expect.objectContaining({content: 'Hello again'})])
    } finally {
      getServer().events.removeListener('request:start', onRequest)
    }
  })

  it('says so when a turn hits the step cap', async () => {
    let n = 0
    getServer().use(http.post(`${process.env.OPENROUTER_BASE_URL}/api/v1/chat/completions*`, () =>
      new Response(sseText(toolCalls([{id: `q${n++}`, name: 'model_query', args: {}}])),
        {status: 200, headers: SSE_HEADERS})))
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('loop')
    expect(await screen.findByText(stepLimitMessage(DEFAULT_MAX_STEPS))).toBeInTheDocument()
  })

  it('a 404 from the model is reported to Sentry by its fields only, and the user is told it isn\'t theirs to fix', async () => {
    getServer().use(http.post(`${process.env.OPENROUTER_BASE_URL}/api/v1/chat/completions*`, () =>
      new Response(JSON.stringify({error: {message: 'No endpoints found matching your data policy', code: 404}}),
        {status: 404, headers: {'Content-Type': 'application/json'}})))
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(assistErrorMessage('unavailable', 'OpenRouter'))
    expect(reportAssistCondition).toHaveBeenCalledWith('model_unavailable', {status: 404, transport: 'openrouter'})
  })

  it('a 401 is the user\'s to fix: shown, and not reported', async () => {
    getServer().use(http.post(`${process.env.OPENROUTER_BASE_URL}/api/v1/chat/completions*`, () =>
      new Response(JSON.stringify({error: {message: 'bad key', code: 401}}),
        {status: 401, headers: {'Content-Type': 'application/json'}})))
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(assistErrorMessage('bad_key', 'OpenRouter'))
    expect(reportAssistCondition).not.toHaveBeenCalled()
  })

  it('a runtime that won\'t load says so in its own words, and is reported', async () => {
    mockControl.runtimeFails = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(RUNTIME_LOAD_FAILED_MESSAGE)
    // The console line names the condition, not the error (which could name a URL).
    expect(warn).toHaveBeenCalledWith('assist: could not load the assistant runtime')
    warn.mockRestore()
    expect(reportAssistCondition).toHaveBeenCalledWith('runtime_load_failed')
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
  })

  it('an assistant that fails to build shows an error, not an unhandled rejection', async () => {
    mockControl.startThrows = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(START_FAILED_MESSAGE)
    expect(warn).toHaveBeenCalledWith('assist: the assistant failed to start')
    warn.mockRestore()
    expect(reportAssistCondition).toHaveBeenCalledWith('start_failed')
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
  })

  it('New chat while the first send loads the runtime: the old send never runs, and the new chat is new', async () => {
    mockControl.runtimeDelayMs = 50
    const bodies: Array<{messages: Array<{role: string, content: unknown}>}> = []
    const onRequest = ({request}: {request: Request}) => {
      void request.clone().json().then((body) => bodies.push(body))
    }
    getServer().events.on('request:start', onRequest)
    try {
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send(SCRIPT.selectPrompt)
      fireEvent.click(screen.getByRole('button', {name: 'New chat'}))
      await act(() => new Promise((resolve) => setTimeout(resolve, mockControl.runtimeDelayMs * 3)))
      // The old send ran no tool and sent nothing.
      expect(mockView.selected).toEqual(['e9'])
      expect(bodies).toEqual([])
      expect(screen.queryByText(SCRIPT.selectPrompt)).toBeNull()
      // The new chat isn't busy, and its first request holds only its own message.
      send('Hello again')
      expect(await screen.findByText('Test received.')).toBeInTheDocument()
      await waitFor(() => expect(bodies).toHaveLength(1))
      expect(bodies[0].messages.filter((m) => m.role === 'user')).toEqual([{role: 'user', content: 'Hello again'}])
      expect(mockView.selected).toEqual(['e9'])
    } finally {
      getServer().events.removeListener('request:start', onRequest)
    }
  })

  it('a throw while showing a reply is its own condition, reported, with a bubble', async () => {
    mockControl.labelThrows = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(TURN_FAILED_MESSAGE)
    expect(reportAssistCondition).toHaveBeenCalledWith('turn_failed', {transport: 'openrouter'})
    expect(reportAssistCondition).not.toHaveBeenCalledWith('start_failed')
    expect(warn).toHaveBeenCalledWith('assist: a reply failed while it was shown')
    warn.mockRestore()
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
  })

  it('Stop while the first send is still loading the runtime means the turn never starts', async () => {
    mockControl.runtimeDelayMs = 50
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send('Hello bot')
    fireEvent.click(screen.getByRole('button', {name: 'Stop the reply'}))
    expect(await screen.findByText(assistErrorMessage('aborted', 'OpenRouter'))).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, mockControl.runtimeDelayMs * 2))
    expect(screen.queryByText('Test received.')).toBeNull()
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


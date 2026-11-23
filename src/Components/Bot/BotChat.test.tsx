import {transferableAbortController} from 'node:util'
import React from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {http} from 'msw'
import {HOSTED_TRANSPORT_LABEL, OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import {DEFAULT_MAX_STEPS} from '../../assist/loop'
import {SCRIPT, SSE_HEADERS, sseText, textReply, toolCalls} from '../../assist/openrouterSse.fixture'
import {AI_RELAY_PATH, MOCK_ANON_TOKEN_PREFIX} from '../../__mocks__/api-handlers-openrouter'
import {getServer} from '../../__mocks__/server'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import BotChat, {
  RUNTIME_LOAD_FAILED_MESSAGE,
  START_FAILED_MESSAGE,
  TURN_FAILED_MESSAGE,
  stepLimitMessage,
} from './BotChat'
import {ANON_TOKEN_KEY, assistKeyStore, markCreditsExhausted, overflowNotice, resetAssistChat} from './assistState'
import {BOT_TITLE} from './component'
import {reportAssistCondition} from './reportAssistCondition'


// The test DOM's AbortController must be Node's. The loop's AbortSignal
// reaches fetch, and MSW's fetch interceptor builds a `Request` from it with
// the global Request, which jest-fixed-jsdom takes from Node. Node 24's (undici
// 7) brand-checks the signal against Node's own AbortSignal and refuses
// jsdom's, so every request failed before MSW answered, on Node 24 (CI) only:
// Node 22's undici 6 duck-types the signal. A browser has one realm, so the
// app itself never meets this. `util.transferableAbortController()` is the
// sandbox's way to reach Node's class.
const NodeAbortController = transferableAbortController().constructor as typeof AbortController
globalThis.AbortController = NodeAbortController
globalThis.AbortSignal = new NodeAbortController().signal.constructor as typeof AbortSignal


jest.mock('./reportAssistCondition', () => ({reportAssistCondition: jest.fn()}))
// The panel reads the sign-in for the hosted transport (assistState.js
// assistAuth); signed out unless a test says otherwise.
const mockAuth = {isAuthenticated: false, getAccessTokenSilently: () => Promise.resolve('auth0-access-token')}
jest.mock('../../Auth0/Auth0Proxy', () => ({
  ...jest.requireActual('../../Auth0/Auth0Proxy'),
  useAuth0: () => mockAuth,
}))
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
const mockView: {selected: string[], undos: number, holdUndo: Promise<void> | null, holdQuery: Promise<void> | null} =
  {selected: ['e9'], undos: 0, holdUndo: null, holdQuery: null}
jest.mock('../../viewer/tools/assistHost', () => {
  const actual = jest.requireActual('../../viewer/tools/assistHost')
  return {
    ...actual,
    createShareAssist: (runtime: {
      createAssist: (o: object) => object,
      openRouterTransport: (o: object) => {label: string},
      hostedTransport: (o: object) => {label: string},
      selectTransport: (choose: () => object) => {label: string},
    }, deps: {keyStore: {get: (id: string) => string | null}, conversationStore: object, hosted: object}) => {
      if (mockControl.startThrows) {
        throw new Error('builder broke')
      }
      // A factory may not close over imports (jest hoists it above them).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {createRegistry: make} = require('../../assist')
      const registry = make([mockModelTools(), mockViewTools()])
      // The same choice as the real createShareAssist: the user's key, else the relay.
      const byok = runtime.openRouterTransport({
        getKey: () => deps.keyStore.get('openrouter'), model: 'mock/model',
        baseURL: `${process.env.OPENROUTER_BASE_URL}/api/v1`,
      })
      const hosted = runtime.hostedTransport({relayUrl: '/.netlify/functions/ai-chat', model: 'mock/model',
        ...deps.hosted})
      const transport = runtime.selectTransport(() => (deps.keyStore.get('openrouter') ? byok : hosted))
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
      run: () => (mockView.holdQuery ?? Promise.resolve()).then(() =>
        ({content: {total: 2, items: [{ref: 'e1'}, {ref: 'e2'}]}, echo: 'Found 2 elements'})),
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
    mockView.holdQuery = null
    Object.assign(mockControl, {runtimeFails: false, runtimeDelayMs: 0, startThrows: false, labelThrows: false})
    jest.mocked(reportAssistCondition).mockClear()
    mockAuth.isAuthenticated = false
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

  it('shows a turn\'s tool steps as one chip: the latest task compact, every task expanded, Undo reverses the select once', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    expect(await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    expect(mockView.selected).toEqual(['e1', 'e2'])

    // Compact: one chip, only the latest task, from the tool's own echo.
    expect(screen.getAllByTestId('BotChat-Tasks')).toHaveLength(1)
    expect(screen.getAllByTestId('BotChat-Action').map((a) => a.textContent)).toEqual(['Selected 2 elementsUndo'])

    // Expanded: both, the read-only step without an Undo.
    fireEvent.click(screen.getByRole('button', {name: 'Steps'}))
    expect(screen.getByRole('button', {name: 'Steps'})).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('BotChat-TasksCount')).toHaveTextContent('2 commands')
    const actions = screen.getAllByTestId('BotChat-Action')
    expect(actions.map((a) => a.textContent)).toEqual([expect.stringMatching(/^Found 2 elements\(\d+s\)$/),
      expect.stringMatching(/^Selected 2 elements\(\d+s\)Undo$/)])
    expect(within(actions[0]).queryByTestId('BotChat-UndoButton')).toBeNull()
    const undo = within(actions[1]).getByRole('button', {name: 'Undo: Selected 2 elements'})
    fireEvent.click(undo)
    expect(await within(actions[1]).findByTestId('BotChat-Undone')).toHaveTextContent('Undone')
    expect(mockView.selected).toEqual(['e9'])
    expect(mockView.undos).toBe(1)
    expect(within(actions[1]).queryByTestId('BotChat-UndoButton')).toBeNull()
  })

  it('shows the running task while its tool runs, then replaces it with the result and its duration', async () => {
    let release = () => undefined
    mockView.holdQuery = new Promise((resolve) => {
      release = resolve
    })
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    // The call has been made and not answered: its label and a progress mark, no duration, no Undo.
    const running = await screen.findByText('Finding elements…')
    expect(within(screen.getByTestId('BotChat-Tasks')).getByTestId('BotChat-TaskRunning')).toBeInTheDocument()
    expect(screen.getAllByTestId('BotChat-Action')).toHaveLength(1)
    expect(screen.queryByText('Found 2 elements')).toBeNull()
    expect(screen.queryByTestId('BotChat-UndoButton')).toBeNull()
    expect(screen.queryByTestId('BotChat-TasksStart')).toBeNull()

    await act(() => Promise.resolve(release()))
    // Compact follows the latest task: the select's result replaces the read.
    expect(await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    expect(running).not.toBeInTheDocument()
    expect(screen.queryByTestId('BotChat-TaskRunning')).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Steps'}))
    expect(screen.getAllByTestId('BotChat-Action').map((a) => a.textContent)).toEqual([
      expect.stringMatching(/^Found 2 elements\(\d+s\)$/), expect.stringMatching(/^Selected 2 elements\(\d+s\)Undo$/)])
  })

  it('shows the chip\'s times once the turn is done, and a click swaps a time to its full form', async () => {
    render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
    send(SCRIPT.selectPrompt)
    expect(await screen.findByText(SCRIPT.selectedAnswer(2), {exact: false})).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('BotChat-TasksStart')).toBeInTheDocument())
    const start = screen.getByTestId('BotChat-TasksStart')
    expect(start.textContent).toMatch(/^\(\d{1,2}:\d{2}.*, \d+s\)$/)
    // The hover carries the date, seconds and zone.
    expect(start.getAttribute('title')).toMatch(/\d{4}.*:\d{2}:\d{2}/)
    const full = start.getAttribute('title') ?? ''
    fireEvent.click(start)
    expect(start.textContent).toContain(full)
    fireEvent.click(start)
    expect(start.textContent).not.toContain(full)
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

  describe('without a key of the user\'s own (the hosted relay)', () => {
    const HTTP_PAYMENT_REQUIRED = 402
    const HTTP_SERVICE_UNAVAILABLE = 503

    /**
     * Record the relay requests a test makes.
     *
     * @return the requests seen, and `stop` to stop watching
     */
    function watchRelay() {
      const requests: Array<{authorization: string | null}> = []
      const onRequest = ({request}: {request: Request}) => {
        if (new URL(request.url).pathname === AI_RELAY_PATH) {
          requests.push({authorization: request.headers.get('authorization')})
        }
      }
      getServer().events.on('request:start', onRequest)
      return {requests, stop: () => getServer().events.removeListener('request:start', onRequest)}
    }

    /**
     * @param status
     * @param body the relay's JSON
     * @param headers more response headers
     */
    function relayAnswers(status: number, body: object, headers: Record<string, string> = {}) {
      getServer().use(http.post(AI_RELAY_PATH, () => new Response(JSON.stringify(body),
        {status, headers: {'Content-Type': 'application/json', ...headers}})))
    }

    /** @return quota_limit_reached gtag calls so far */
    function limitEvents() {
      return (window.gtag as jest.Mock).mock.calls.filter(([kind, name]) => kind === 'event' && name === 'quota_limit_reached')
    }

    beforeEach(() => {
      window.gtag = jest.fn()
      act(() => {
        assistKeyStore.forget(OPENROUTER_KEY_ID)
      })
    })

    afterEach(() => {
      delete window.gtag
    })

    it('answers through the relay, anonymously, and keeps the token it is given for the next turn', async () => {
      const relay = watchRelay()
      try {
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Test received.')).toBeInTheDocument()
        expect(screen.queryByTestId('BotChat-Error')).toBeNull()
        expect(localStorage.getItem(ANON_TOKEN_KEY)).toMatch(new RegExp(`^${MOCK_ANON_TOKEN_PREFIX.replace(/\./g, '\\.')}`))
        await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
        send('Hello again')
        await waitFor(() => expect(screen.getAllByText('Test received.')).toHaveLength(2))
        expect(relay.requests.map((r) => r.authorization)).toEqual([null, `Bearer ${localStorage.getItem(ANON_TOKEN_KEY)}`])
      } finally {
        relay.stop()
      }
    })

    it('a signed-in user\'s turns carry their Auth0 token, not an anonymous one', async () => {
      mockAuth.isAuthenticated = true
      const relay = watchRelay()
      try {
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Test received.')).toBeInTheDocument()
        expect(relay.requests.map((r) => r.authorization)).toEqual(['Bearer auth0-access-token'])
        expect(localStorage.getItem(ANON_TOKEN_KEY)).toBeNull()
      } finally {
        relay.stop()
      }
    })

    // The dialog is the one sender of the funnel event for this wall: the
    // panel sends none of its own, so the user's one wall is one event.
    it('an exhausted allowance says to sign in, opens the dialog, and is counted once, not reported', async () => {
      relayAnswers(HTTP_PAYMENT_REQUIRED, {error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'})
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent(
        assistErrorMessage('credits_exhausted', HOSTED_TRANSPORT_LABEL, HTTP_PAYMENT_REQUIRED, 'anonymous'))
      expect(screen.getByTestId('BotChat-Error')).toHaveTextContent('Sign in for more')
      const dialog = await screen.findByTestId('dialog-ai-credits')
      expect(dialog).toHaveTextContent('Out of assistant credits for today')
      expect(within(dialog).getByTestId('button-quota-sign-in')).toBeInTheDocument()
      expect(limitEvents().map(([, , params]) => params)).toEqual([{tier: 'anonymous', feature: 'ai_credits'}])
      expect(reportAssistCondition).not.toHaveBeenCalled()
    })

    it('a free user out of credits is told to upgrade, with the Pro offer in the dialog', async () => {
      relayAnswers(HTTP_PAYMENT_REQUIRED, {error: {code: 'ai_credits_exhausted'}, tier: 'free'})
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      expect(await screen.findByTestId('BotChat-Error')).toHaveTextContent('Upgrade to Pro')
      const dialog = await screen.findByTestId('dialog-ai-credits')
      expect(within(dialog).getByTestId('button-quota-subscribe')).toHaveTextContent('Upgrade to Pro')
      expect(limitEvents().map(([, , params]) => params)).toEqual([{tier: 'free', feature: 'ai_credits'}])
    })

    it('a Pro user out of credits is told to wait: no purchase button', async () => {
      relayAnswers(HTTP_PAYMENT_REQUIRED, {error: {code: 'ai_credits_exhausted'}, tier: 'pro'})
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      const dialog = await screen.findByTestId('dialog-ai-credits')
      expect(dialog).toHaveTextContent('They come back as the days roll on')
      expect(within(dialog).queryByRole('button', {name: /upgrade|sign in/i})).toBeNull()
      expect(limitEvents().map(([, , params]) => params)).toEqual([{tier: 'pro', feature: 'ai_credits'}])
    })

    describe('the out-of-credits dialog owed across an unmount', () => {
      const REFUSAL_DELAY_MS = 150
      const SETTLE_MS = 400

      /** Make the relay refuse after a pause, so the panel can be closed meanwhile. */
      function slowRefusal() {
        getServer().use(http.post(AI_RELAY_PATH, async () => {
          await new Promise((resolve) => setTimeout(resolve, REFUSAL_DELAY_MS))
          return new Response(JSON.stringify({error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'}),
            {status: 402, headers: {'Content-Type': 'application/json'}})
        }))
      }

      it('opens on remount when the refusal landed while the panel was closed', async () => {
        slowRefusal()
        const first = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        first.unmount()
        await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        expect(await screen.findByTestId('dialog-ai-credits')).toBeInTheDocument()
        expect(screen.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'exhausted')
        expect(limitEvents()).toHaveLength(1)
      })

      it('does not reopen once dismissed and the panel is remounted', async () => {
        slowRefusal()
        const first = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        first.unmount()
        await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)))
        const second = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        const dialog = await screen.findByTestId('dialog-ai-credits')
        fireEvent.click(within(dialog).getByRole('button', {name: 'Not now'}))
        await waitFor(() => expect(screen.queryByTestId('dialog-ai-credits')).toBeNull())
        second.unmount()
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        await act(() => Promise.resolve())
        expect(screen.queryByTestId('dialog-ai-credits')).toBeNull()
        expect(limitEvents()).toHaveLength(1)
      })
    })

    // Codex on #2253: one quota_limit_reached per refusal, keyed by refusal id
    // (assistState.js assistCreditsWall), not per showing of the dialog.
    describe('one funnel event per refusal', () => {
      it('a refusal while the dialog is already open counts again', async () => {
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        act(() => markCreditsExhausted('anonymous'))
        await screen.findByTestId('dialog-ai-credits')
        expect(limitEvents()).toHaveLength(1)
        // An automatic resend refused again, the dialog still up.
        act(() => markCreditsExhausted('anonymous'))
        await waitFor(() => expect(limitEvents()).toHaveLength(2))
        expect(screen.getAllByTestId('dialog-ai-credits')).toHaveLength(1)
      })

      it('refusals while the panel was away are each counted when it mounts, under one showing', async () => {
        act(() => {
          markCreditsExhausted('anonymous')
          markCreditsExhausted('anonymous')
        })
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        await screen.findByTestId('dialog-ai-credits')
        await waitFor(() => expect(limitEvents()).toHaveLength(2))
        expect(limitEvents().map(([, , params]) => params)).toEqual([
          {tier: 'anonymous', feature: 'ai_credits'}, {tier: 'anonymous', feature: 'ai_credits'}])
      })

      it('a reopen from the meter is no new refusal: no event', async () => {
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        act(() => markCreditsExhausted('free'))
        const dialog = await screen.findByTestId('dialog-ai-credits')
        fireEvent.click(within(dialog).getByRole('button', {name: 'Not now'}))
        await waitFor(() => expect(screen.queryByTestId('dialog-ai-credits')).toBeNull())
        fireEvent.click(screen.getByTestId('BotChat-CreditsMeterMore'))
        await screen.findByTestId('dialog-ai-credits')
        await act(() => Promise.resolve())
        expect(limitEvents()).toHaveLength(1)
      })
    })

    describe('the credits meter', () => {
      const MICRO = 1000000
      const USED_85_PERCENT = 850000
      const USED_25_PERCENT = 250000
      const USED_30_PERCENT = 300000
      const FREE_USED = 499990
      const FREE_LIMIT = 500000
      const meterHeaders = (used: number, limit: number, tier = 'anonymous') => ({
        'x-bldrs-ai-tier': tier, 'x-bldrs-ai-used': String(used), 'x-bldrs-ai-limit': String(limit),
      })
      /** @param headers the relay's metering headers for the next reply */
      function relayReplies(headers: Record<string, string>) {
        getServer().use(http.post(AI_RELAY_PATH, () => new Response(sseText(textReply('Hosted reply.')),
          {status: 200, headers: {...SSE_HEADERS, ...headers}})))
      }

      it('is absent until a hosted response has said, then follows each response, normal to low', async () => {
        relayReplies(meterHeaders(0, MICRO))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        expect(screen.queryByTestId('BotChat-CreditsMeter')).toBeNull()
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        const meter = screen.getByTestId('BotChat-CreditsMeter')
        expect(meter).toHaveAttribute('data-state', 'normal')
        expect(screen.getByRole('progressbar', {name: '0% of today\'s AI credits used'})).toHaveAttribute('aria-valuenow', '0')

        relayReplies(meterHeaders(USED_85_PERCENT, MICRO))
        await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
        send('Hello again')
        await waitFor(() => expect(screen.getAllByText('Hosted reply.')).toHaveLength(2))
        expect(screen.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'low')
        expect(screen.getByRole('progressbar', {name: '85% of today\'s AI credits used'})).toHaveAttribute('aria-valuenow', '85')
      })

      it('never shows dollars, and words a signed-in tier by its 30-day window', async () => {
        mockAuth.isAuthenticated = true
        relayReplies(meterHeaders(USED_25_PERCENT, MICRO, 'free'))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        const meter = screen.getByTestId('BotChat-CreditsMeter')
        expect(meter).toHaveTextContent('25% of your AI credits used over the last 30 days')
        expect(meter).not.toHaveTextContent('$')
      })

      it('turns exhausted on the relay\'s refusal, even with used still under limit, and offers the next step again', async () => {
        relayAnswers(HTTP_PAYMENT_REQUIRED, {error: {code: 'ai_credits_exhausted'}, tier: 'free'},
          meterHeaders(FREE_USED, FREE_LIMIT, 'free'))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        const dialog = await screen.findByTestId('dialog-ai-credits')
        expect(screen.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'exhausted')
        // The open dialog hides the panel from the accessibility tree.
        expect(screen.getByRole('progressbar', {hidden: true})).toHaveAttribute('aria-valuenow', '100')
        fireEvent.click(within(dialog).getByRole('button', {name: 'Not now'}))
        await waitFor(() => expect(screen.queryByTestId('dialog-ai-credits')).toBeNull())
        fireEvent.click(screen.getByTestId('BotChat-CreditsMeterMore'))
        expect(await screen.findByTestId('dialog-ai-credits')).toBeInTheDocument()
        // One refusal, one event: the reopen from the meter isn't counted.
        expect(limitEvents()).toHaveLength(1)
      })

      it('a successful reply with used at or past limit is a full low meter, not exhausted, and opens no dialog', async () => {
        relayReplies(meterHeaders(MICRO, MICRO))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        expect(screen.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'low')
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        expect(screen.queryByTestId('BotChat-CreditsMeterMore')).toBeNull()
        expect(screen.queryByTestId('dialog-ai-credits')).toBeNull()
        expect(limitEvents()).toEqual([])
      })

      it('drops the reading when the user signs in while the panel is closed', async () => {
        relayReplies(meterHeaders(MICRO, MICRO))
        const first = render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        expect(screen.getByTestId('BotChat-CreditsMeter')).toBeInTheDocument()
        first.unmount()

        mockAuth.isAuthenticated = true
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        expect(screen.queryByTestId('BotChat-CreditsMeter')).toBeNull()
      })

      it('is not shown with a key of the user\'s own', async () => {
        relayReplies(meterHeaders(0, MICRO))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        expect(screen.getByTestId('BotChat-CreditsMeter')).toBeInTheDocument()
        act(() => {
          assistKeyStore.set(OPENROUTER_KEY_ID, 'test-key')
        })
        expect(screen.queryByTestId('BotChat-CreditsMeter')).toBeNull()
      })

      it('leaves the last reading when a response says nothing of credits', async () => {
        relayReplies(meterHeaders(USED_30_PERCENT, MICRO))
        render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
        send('Hello bot')
        expect(await screen.findByText('Hosted reply.')).toBeInTheDocument()
        relayReplies({})
        await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
        send('Hello again')
        await waitFor(() => expect(screen.getAllByText('Hosted reply.')).toHaveLength(2))
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
      })
    })

    it('a hosted outage is shown, and left to the relay to report', async () => {
      relayAnswers(HTTP_SERVICE_UNAVAILABLE, {error: {code: 'ai_unavailable'}, tier: 'anonymous'})
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      expect(await screen.findByTestId('BotChat-Error'))
        .toHaveTextContent(assistErrorMessage('service_unavailable', HOSTED_TRANSPORT_LABEL))
      expect(reportAssistCondition).not.toHaveBeenCalled()
      expect(limitEvents()).toEqual([])
    })

    it('past the breaker, says once that replies now come from free models', async () => {
      getServer().use(http.post(AI_RELAY_PATH, () => new Response(sseText(textReply('Free reply.')),
        {status: 200, headers: {...SSE_HEADERS, 'x-bldrs-ai-overflow': 'free_models', 'x-bldrs-ai-tier': 'anonymous'}})))
      render(<BotChat/>, {wrapper: HelmetStoreRouteThemeCtx})
      send('Hello bot')
      expect(await screen.findByText('Free reply.')).toBeInTheDocument()
      expect(screen.getByTestId('BotChat-Notice')).toHaveTextContent(overflowNotice('anonymous'))
      await waitFor(() => expect(screen.getByTestId('BotChat-SendButton')).toBeInTheDocument())
      send('Hello again')
      await waitFor(() => expect(screen.getAllByText('Free reply.')).toHaveLength(2))
      expect(screen.getAllByTestId('BotChat-Notice')).toHaveLength(1)
    })
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

  it('says so when a turn hits the step cap and the provider ignored tool_choice none', async () => {
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


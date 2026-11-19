import React, {
  ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {v4 as uuid} from 'uuid'
import {
  Box, Button, IconButton, InputBase, Stack, Typography, useTheme,
} from '@mui/material'
import {
  AddCommentOutlined as NewChatIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Stop as StopIcon,
} from '@mui/icons-material'
import {HOSTED_TRANSPORT_LABEL, OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import {AI_CREDITS_FEATURE} from '../../quota/aiCredits'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useStore from '../../store/useStore'
import {createShareAssist} from '../../viewer/tools/assistHost'
import {loadAssistRuntime} from '../../viewer/tools/assistRuntime'
import QuotaLimitDialog from '../Open/QuotaLimitDialog'
import Panel from '../SideDrawer/Panel'
import BotSettings from './BotSettings'
import ChatMessage from './ChatMessage'
import CreditsMeter from './CreditsMeter'
import {
  assistAuth,
  assistChat,
  assistConversationStore,
  assistCredits,
  assistHostedSide,
  assistInstance,
  assistKeyStore,
  markCreditsExhausted,
  newAssistChat,
  noteAssistAuth,
} from './assistState'
import {reportAssistCondition} from './reportAssistCondition'
import 'react-chat-elements/dist/main.css'
import './chat-bubbles.css'


/**
 * Until the transport has loaded, errors still name the one this turn would
 * use: the user's own OpenRouter key when given, else Bldrs' hosted relay
 * (assistHost.js `createShareAssist` makes the same choice).
 *
 * @return {string}
 */
function providerLabel() {
  return assistKeyStore.get(OPENROUTER_KEY_ID) ? 'OpenRouter' : HOSTED_TRANSPORT_LABEL
}

/** What the panel says for failures that aren't the provider's. */
export const RUNTIME_LOAD_FAILED_MESSAGE = 'Couldn\'t load the assistant. Check your connection and try again.'
export const START_FAILED_MESSAGE = 'The assistant couldn\'t start. Reload the page to try again.'
export const TURN_FAILED_MESSAGE = 'Something went wrong showing this reply. Try again, or start a new chat.'

/** Bubbles by kind; a 'notice' is the panel's own (the free-models overflow, assistState.js). */
const BUBBLE_TEST_IDS = {error: 'BotChat-Error', assistant: 'BotChat-Reply', notice: 'BotChat-Notice'}

/**
 * @param {number} steps
 * @return {string} what the panel says when a turn hit the step cap
 */
export function stepLimitMessage(steps) {
  return `Stopped after ${steps} steps without an answer. Ask again to let it carry on, or ask something narrower.`
}


/**
 * The assistant panel (#1675): the user's message goes to the agent loop
 * (src/assist/loop.ts, loaded on first send), the reply streams into the
 * bubbles, and each step's viewer actions show as a compact line from the
 * tools' own `echo`, with Undo. Stop ends a reply mid-stream.
 *
 * With no key of the user's own, it answers through Bldrs' hosted relay
 * within the plan's credits (#1932); with one, straight from OpenRouter.
 *
 * Kept in the prototype's place and look (ai-workspace.md D13: keep the
 * panel, bubbles and settings; the tray, sessions and rename are #1672 /
 * #2193). The prototype's `new Function` eval of model-written code and its
 * JSON-in-a-code-block protocol are gone: the model acts only through the
 * tool registry, whose tools validate their input and return JSON summaries.
 *
 * @return {ReactElement}
 */
export default function BotChat() {
  const setIsBotVisible = useStore((state) => state.setIsBotVisible)
  // The hosted transport reads the sign-in at each request (assistState.js).
  const {isAuthenticated, getAccessTokenSilently} = useAuth0()
  assistAuth.current = {isAuthenticated, getAccessTokenSilently}
  const apiKey = useSyncExternalStore(assistKeyStore.subscribe, () => assistKeyStore.get(OPENROUTER_KEY_ID) ?? '')

  // The chat lives outside the panel (assistState.js): the panel unmounts
  // when closed, and on a phone whenever another drawer tab is shown.
  const {messages, streamingTurn, conversationId, undoTop, undoPending} =
    useSyncExternalStore(assistChat.subscribe, assistChat.get)
  const isStreaming = streamingTurn !== null
  const [input, setInput] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // The tier the out-of-credits dialog is showing for, or null when closed.
  const [creditsDialogTier, setCreditsDialogTier] = useState(null)
  const credits = useSyncExternalStore(assistCredits.subscribe, assistCredits.get)

  // The meter's figures belong to the sign-in state they were read under.
  // The last-seen state lives in assistState, so a change made while the
  // panel was closed is seen on reopening. Layout effect: no frame of the
  // old tier's meter.
  useLayoutEffect(() => {
    noteAssistAuth(isAuthenticated)
  }, [isAuthenticated])

  const theme = useTheme()
  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)

  const userBg = theme.palette.primary.main
  const userText = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]
  const botText = theme.palette.getContrastText(botBg)

  useLayoutEffect(() => {
    const endNode = messagesEndRef.current
    if (!endNode) {
      return
    }
    if (typeof endNode.scrollIntoView === 'function') {
      endNode.scrollIntoView({behavior: 'smooth', block: 'end'})
      return
    }

    if (!messagesContainerRef.current) {
      return
    }
    const container = messagesContainerRef.current
    container.scrollTop = container.scrollHeight
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({top: container.scrollHeight, behavior: 'smooth'})
    }
  }, [messages])

  const handleClose = useCallback(() => {
    setIsSettingsOpen(false)
    setIsBotVisible(false)
  }, [setIsBotVisible])

  const handleApiKeySave = useCallback((value) => {
    assistKeyStore.set(OPENROUTER_KEY_ID, value)
  }, [])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isStreaming || undoPending) {
      return
    }
    setInput('')
    const turn = uuid()
    // Updates from this send apply only to the chat it was sent in, so a
    // turn still finishing after the chat was reset can't write into the next.
    const update = (change) => assistChat.update((chat) => (chat.conversationId === conversationId ? change(chat) : chat))
    const setMessages = (change) => update((chat) => ({...chat, messages: change(chat.messages)}))
    setMessages((prev) => [...prev, {id: uuid(), kind: 'user', text: content}])
    update((chat) => ({...chat, streamingTurn: turn}))
    try {
      let instance
      try {
        instance = await ensureAssistInstance()
      } catch (e) {
        if (e?.assistStage === 'load') {
          // The lazy bundle didn't arrive. Offline is the user's to fix;
          // online, it's a broken deploy (reportAssistCondition.js).
          console.warn('assist: could not load the assistant runtime')
          if (navigator.onLine !== false) {
            reportAssistCondition('runtime_load_failed')
          }
          setMessages((prev) => [...prev, textMessage('error', RUNTIME_LOAD_FAILED_MESSAGE)])
        } else {
          // Building the assistant threw: a bug, not the user's doing. Its
          // message isn't logged: it could carry whatever the builder was given.
          console.warn('assist: the assistant failed to start')
          reportAssistCondition('start_failed')
          setMessages((prev) => [...prev, textMessage('error', START_FAILED_MESSAGE)])
        }
        return
      }
      // While the first send loaded the runtime there was no session to stop
      // or replace: the user may have pressed Stop, or started a New chat, in
      // the meantime. Either way this send never runs. (A New chat's own
      // view is a different conversation, which `update` leaves alone.)
      const chatNow = assistChat.get()
      if (chatNow.conversationId !== conversationId || chatNow.stoppedTurn === turn) {
        setMessages((prev) => [...prev, errorMessage('aborted', providerLabel())])
        return
      }
      const {session, transport} = instance
      try {
        for await (const event of session.send(content)) {
          if (event.type === 'error' && event.code === 'unavailable') {
            reportAssistCondition('model_unavailable', {status: event.status, transport: transport.id})
          }
          if (event.type === 'error' && event.code === 'credits_exhausted') {
            // The dialog sends the one `quota_limit_reached` for this wall.
            markCreditsExhausted(event.tier)
            setCreditsDialogTier(event.tier ?? 'anonymous')
          }
          update((chat) => ({
            ...chat,
            messages: applyEvent(chat.messages, event, turn, transport.label),
            undoTop: session.lastUndoable(),
          }))
        }
      } catch (e) {
        // Showing the reply threw: a bug in this panel's event handling,
        // not the provider or the user. The session ends its turn itself.
        console.warn('assist: a reply failed while it was shown')
        reportAssistCondition('turn_failed', {transport: transport.id})
        setMessages((prev) => [...prev, textMessage('error', TURN_FAILED_MESSAGE)])
      }
    } finally {
      update((chat) => ({
        ...chat,
        streamingTurn: chat.streamingTurn === turn ? null : chat.streamingTurn,
        messages: chat.messages.map((message) => (message.live ? {...message, live: false} : message)),
      }))
    }
  }, [conversationId, input, isStreaming, undoPending])

  const handleStop = useCallback(() => {
    assistChat.update((chat) => ({...chat, stoppedTurn: chat.streamingTurn}))
    assistInstance.current?.session?.abort()
  }, [])

  const handleNewChat = useCallback(() => {
    newAssistChat()
    setInput('')
  }, [])

  // Undo is a stack (assist/session.ts): only the newest undoable step
  // offers it, and undoing it may take newer steps with it via the API, so
  // every step the report names is marked.
  //
  // An undo can wait (bounded) for calls still running, so while it does,
  // Undo, Send and New chat are disabled and the Undo button says so: a
  // second undo or a new turn meanwhile is what the session's ordering
  // guards against (assist/loop.ts `undo`, `send`), and the user should see
  // it is still working.
  const handleUndo = useCallback(async (stepId) => {
    const session = assistInstance.current?.session
    if (!session || assistChat.get().undoPending) {
      return
    }
    assistChat.update((chat) => ({...chat, undoPending: true}))
    let report
    try {
      report = await session.undo(stepId)
    } finally {
      assistChat.update((chat) => ({...chat, undoPending: false}))
    }
    const failed = report.failed.length > 0
    assistChat.update((chat) => ({
      ...chat,
      undoTop: session.lastUndoable(),
      messages: chat.messages.map((message) => (message.kind === 'action' && report.steps.includes(message.stepId) ?
        {...message, undone: true, undoFailed: failed} : message)),
    }))
  }, [])

  const settingsActions = !isSettingsOpen ? (
    <>
      <IconButton
        aria-label='New chat'
        title='New chat'
        onClick={handleNewChat}
        disabled={undoPending}
        data-testid='BotChat-NewChatButton'
      >
        <NewChatIcon/>
      </IconButton>
      <IconButton
        aria-label='Open bot settings'
        onClick={() => setIsSettingsOpen(true)}
        data-testid='BotSettings-OpenButton'
      >
        <SettingsIcon/>
      </IconButton>
    </>
  ) : null

  const bubble = (message, index) => {
    const isUser = message.kind === 'user'
    const fg = isUser ? userText : botText
    return (
      <ChatMessage
        key={message.id ?? index}
        position={isUser ? 'right' : 'left'}
        type='text'
        title={isUser ? 'You:' : 'Assistant:'}
        titleColor={fg}
        text={
          <span
            style={{color: fg}}
            data-testid={BUBBLE_TEST_IDS[message.kind]}
          >
            {message.text}
          </span>
        }
        notch={false}
        style={{
          backgroundColor: isUser ? userBg : botBg,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
        }}
      />
    )
  }

  // A step's viewer actions: one compact line per tool call, from the tool's
  // own echo, and Undo on the newest step that can still be undone.
  const actionLine = (message) => (
    <Box
      key={message.id}
      data-testid='BotChat-Action'
      data-step-id={message.stepId}
      sx={{display: 'flex', alignItems: 'center', gap: 1, alignSelf: 'flex-start', maxWidth: '80%', px: 1}}
    >
      <Typography variant='caption' sx={{color: theme.palette.text.secondary, fontStyle: 'italic'}}>
        {message.lines.join(' · ')}
      </Typography>
      {message.stepId === undoTop && !message.undone && (
        <Button
          size='small'
          variant='text'
          onClick={() => handleUndo(message.stepId)}
          disabled={undoPending}
          aria-busy={undoPending}
          aria-label={`Undo: ${message.lines.join(', ')}`}
          data-testid='BotChat-UndoButton'
          sx={{minWidth: 0, py: 0, textTransform: 'none'}}
        >
          {undoPending ? 'Undoing…' : 'Undo'}
        </Button>
      )}
      {message.undone && (
        <Typography variant='caption' sx={{color: theme.palette.text.secondary}} data-testid='BotChat-Undone'>
          {message.undoFailed ? 'Couldn\'t undo all of it' : 'Undone'}
        </Typography>
      )}
    </Box>
  )

  const renderChat = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '0.75em',
      }}
      data-testid='BotChat'
    >
      <Stack
        direction='column'
        spacing={2}
        ref={messagesContainerRef}
        data-testid='BotChat-Messages'
        role='log'
        aria-live='polite'
        aria-busy={isStreaming}
        sx={Object.assign({
          flex: 1,
          overflowY: 'auto',
          pb: 0.75,
          backgroundColor: theme.palette.background.paper,
        }, {
          '& .rce-mbox': {marginBottom: 8},
        })}
      >
        {messages.map((message, index) => (message.kind === 'action' ? actionLine(message) : bubble(message, index)))}
        <Box ref={messagesEndRef} data-testid='BotChat-MessagesEnd' sx={{height: '1px', width: '100%'}}/>
      </Stack>

      {/* Hosted only: with the user's own key, Bldrs' credits aren't what's spent. */}
      {credits && !apiKey && (
        <CreditsMeter credits={credits} onMore={() => setCreditsDialogTier(credits.tier)}/>
      )}

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          paddingTop: '0.75em',
        }}
      >
        <InputBase
          fullWidth
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSend()}
          placeholder='Type a message…'
          inputProps={{'aria-label': 'Message the assistant'}}
          sx={{
            color: theme.palette.text.primary,
            backgroundColor: theme.palette.background.default,
            borderRadius: 2,
            px: 2,
            py: 1,
            boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`,
          }}
        />
        {isStreaming ? (
          <IconButton
            onClick={handleStop}
            color='primary'
            aria-label='Stop the reply'
            data-testid='BotChat-StopButton'
          >
            <StopIcon/>
          </IconButton>
        ) : (
          <IconButton
            onClick={handleSend}
            disabled={undoPending}
            color='primary'
            aria-label='Send'
            data-testid='BotChat-SendButton'
          >
            <SendIcon data-testid='SendIcon'/>
          </IconButton>
        )}
      </Box>
    </Box>
  )

  return (
    <Panel
      title='AI Assistant'
      onClose={handleClose}
      actions={settingsActions}
      data-testid='BotPanel'
    >
      {isSettingsOpen ? (
        <BotSettings
          apiKey={apiKey}
          onApiKeyChange={handleApiKeySave}
          onClose={() => setIsSettingsOpen(false)}
        />
      ) : (
        renderChat()
      )}
      <QuotaLimitDialog
        tier={creditsDialogTier ?? 'anonymous'}
        isOpen={creditsDialogTier !== null}
        onClose={() => setCreditsDialogTier(null)}
        feature={AI_CREDITS_FEATURE}
      />
    </Panel>
  )
}


/**
 * The assistant, built once per page on the first send: the lazy runtime
 * loaded, Share's assistant made from it, and a session opened on the chat
 * as it is when the build finishes (not when the send began, which a New
 * chat may have replaced meanwhile). Concurrent first sends share one build.
 *
 * @return {Promise<object>} `assistInstance.current`
 * @throws {Error} with `assistStage` 'load' (the runtime didn't arrive) or
 *   'start' (building the assistant threw)
 */
function ensureAssistInstance() {
  if (assistInstance.current) {
    return Promise.resolve(assistInstance.current)
  }
  if (!building) {
    building = loadAssistRuntime()
      .catch((e) => {
        throw Object.assign(new Error('assist runtime did not load', {cause: e}), {assistStage: 'load'})
      })
      .then((runtime) => {
        try {
          const built = createShareAssist(runtime, {keyStore: assistKeyStore, conversationStore: assistConversationStore,
            hosted: assistHostedSide})
          assistInstance.current = {...built, session: built.assist.open(assistChat.get().conversationId)}
          return assistInstance.current
        } catch (e) {
          throw Object.assign(new Error('assist failed to start', {cause: e}), {assistStage: 'start'})
        }
      })
      .finally(() => {
        building = null
      })
  }
  return building
}
let building = null


/**
 * Fold one loop event into the message list.
 *
 * - Text streams into the turn's live assistant bubble, and a new bubble
 *   starts after an action line, so the reply reads in the order it happened.
 * - A tool result becomes a line under its step: the tool's echo, or what
 *   went wrong. A call declined for approval says so (#1675).
 * - An error is a bubble saying what happened and what to do.
 *
 * Exported for tests.
 *
 * @param {Array<object>} messages
 * @param {object} event an AssistEvent
 * @param {string} turn this send's id
 * @param {string} provider the transport's label, for error wording
 * @return {Array<object>} the next list
 */
export function applyEvent(messages, event, turn, provider) {
  const last = messages[messages.length - 1]
  switch (event.type) {
    case 'text-delta':
      if (last?.kind === 'assistant' && last.live && last.turn === turn) {
        return [...messages.slice(0, -1), {...last, text: last.text + event.text}]
      }
      return [...messages, {id: uuid(), kind: 'assistant', text: event.text, live: true, turn}]
    case 'tool-result': {
      const line = actionText(event)
      const index = messages.findIndex((message) => message.kind === 'action' && message.stepId === event.stepId)
      if (index >= 0) {
        const action = messages[index]
        return messages.map((message, i) => (i === index ?
          {...action, lines: [...action.lines, line], undoable: action.undoable || event.undoable} : message))
      }
      return [...messages, {id: uuid(), kind: 'action', stepId: event.stepId, lines: [line], undoable: event.undoable}]
    }
    case 'error':
      return [...messages, errorMessage(event.code, provider, event.status, event.tier)]
    case 'step-limit':
      return [...messages, textMessage('error', stepLimitMessage(event.steps))]
    default:
      return messages
  }
}


/**
 * @param {object} event a tool-result AssistEvent
 * @return {string} the line the user sees for it
 */
function actionText(event) {
  if (event.ok) {
    return event.echo ?? `Ran ${event.name}`
  }
  if (event.error?.code === 'rolled_back') {
    return `${event.name} didn't take effect: it was stopped or undone`
  }
  if (event.error?.code === 'denied') {
    return `Didn't run ${event.name}: it needs your approval, which isn't available yet`
  }
  return `${event.name} failed`
}


/**
 * @param {string} code an AssistErrorCode
 * @param {string} provider
 * @param {number} [status]
 * @param {string} [tier] the hosted relay's, for its codes' wording
 * @return {object} an error bubble
 */
function errorMessage(code, provider, status, tier) {
  return {id: uuid(), kind: 'error', code, text: assistErrorMessage(code, provider, status, tier)}
}


/**
 * @param {string} kind 'error' or 'assistant'
 * @param {string} text
 * @return {object} a bubble
 */
function textMessage(kind, text) {
  return {id: uuid(), kind, text}
}

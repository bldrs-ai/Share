import React, {
  ReactElement,
  useCallback,
  useEffect,
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
  Send as SendIcon,
  Settings as SettingsIcon,
  Stop as StopIcon,
} from '@mui/icons-material'
import {OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import useStore from '../../store/useStore'
import {createShareAssist} from '../../viewer/tools/assistHost'
import {loadAssistRuntime} from '../../viewer/tools/assistRuntime'
import Panel from '../SideDrawer/Panel'
import BotSettings from './BotSettings'
import ChatMessage from './ChatMessage'
import {
  assistChat,
  assistConversationStore,
  assistInstance,
  assistKeyStore,
  forgetLegacyKey,
} from './assistState'
import 'react-chat-elements/dist/main.css'
import './chat-bubbles.css'


/** Until the transport has loaded, errors still name the provider. */
const PROVIDER_LABEL = 'OpenRouter'


/**
 * The assistant panel (#1675): the user's message goes to the agent loop
 * (src/assist/loop.ts, loaded on first send), the reply streams into the
 * bubbles, and each step's viewer actions show as a compact line from the
 * tools' own `echo`, with Undo. Stop ends a reply mid-stream.
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
  const apiKey = useSyncExternalStore(assistKeyStore.subscribe, () => assistKeyStore.get(OPENROUTER_KEY_ID) ?? '')

  // The chat lives outside the panel (assistState.js): the panel unmounts
  // when closed, and on a phone whenever another drawer tab is shown.
  const {messages, streamingTurn, conversationId} = useSyncExternalStore(assistChat.subscribe, assistChat.get)
  const isStreaming = streamingTurn !== null
  const [input, setInput] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const theme = useTheme()
  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)

  const userBg = theme.palette.primary.main
  const userText = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]
  const botText = theme.palette.getContrastText(botBg)

  useEffect(() => {
    forgetLegacyKey()
  }, [])

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
    if (!content || isStreaming) {
      return
    }
    setInput('')
    const turn = uuid()
    // Updates from this send apply only to the chat it was sent in, so a
    // turn still finishing after the chat was reset can't write into the next.
    const update = (change) => assistChat.update((chat) => (chat.conversationId === conversationId ? change(chat) : chat))
    const setMessages = (change) => update((chat) => ({...chat, messages: change(chat.messages)}))
    setMessages((prev) => [...prev, {id: uuid(), kind: 'user', text: content}])
    if (!assistKeyStore.get(OPENROUTER_KEY_ID)) {
      setMessages((prev) => [...prev, errorMessage('no_key', PROVIDER_LABEL)])
      return
    }
    update((chat) => ({...chat, streamingTurn: turn}))
    try {
      if (!assistInstance.current) {
        let runtime
        try {
          runtime = await loadAssistRuntime()
        } catch (e) {
          // The lazy bundle didn't arrive (offline at first send).
          console.warn('assist: could not load the assistant runtime:', e)
          setMessages((prev) => [...prev, errorMessage('network', PROVIDER_LABEL)])
          return
        }
        const built = createShareAssist(runtime, {keyStore: assistKeyStore, conversationStore: assistConversationStore})
        assistInstance.current = {...built, session: built.assist.open(conversationId)}
      }
      const {session, transport} = assistInstance.current
      for await (const event of session.send(content)) {
        setMessages((prev) => applyEvent(prev, event, turn, transport.label))
      }
    } finally {
      update((chat) => ({
        ...chat,
        streamingTurn: chat.streamingTurn === turn ? null : chat.streamingTurn,
        messages: chat.messages.map((message) => (message.live ? {...message, live: false} : message)),
      }))
    }
  }, [conversationId, input, isStreaming])

  const handleStop = useCallback(() => {
    assistInstance.current?.session?.abort()
  }, [])

  const handleUndo = useCallback(async (stepId) => {
    const session = assistInstance.current?.session
    if (!session) {
      return
    }
    const report = await session.undo(stepId)
    assistChat.update((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => (message.kind === 'action' && message.stepId === stepId ?
        {...message, undone: true, undoFailed: report.failed.length > 0} : message)),
    }))
  }, [])

  const settingsActions = !isSettingsOpen ? (
    <IconButton
      aria-label='Open bot settings'
      onClick={() => setIsSettingsOpen(true)}
      data-testid='BotSettings-OpenButton'
    >
      <SettingsIcon/>
    </IconButton>
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
            data-testid={message.kind === 'error' ? 'BotChat-Error' : (isUser ? undefined : 'BotChat-Reply')}
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
  // own echo, and one Undo for the step when any call in it can be undone.
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
      {message.undoable && !message.undone && (
        <Button
          size='small'
          variant='text'
          onClick={() => handleUndo(message.stepId)}
          aria-label={`Undo: ${message.lines.join(', ')}`}
          data-testid='BotChat-UndoButton'
          sx={{minWidth: 0, py: 0, textTransform: 'none'}}
        >
          Undo
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
    </Panel>
  )
}


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
      return [...messages, errorMessage(event.code, provider, event.status)]
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
  if (event.error?.code === 'denied') {
    return `Didn't run ${event.name}: it needs your approval, which isn't available yet`
  }
  return `${event.name} failed`
}


/**
 * @param {string} code an AssistErrorCode
 * @param {string} provider
 * @param {number} [status]
 * @return {object} an error bubble
 */
function errorMessage(code, provider, status) {
  return {id: uuid(), kind: 'error', code, text: assistErrorMessage(code, provider, status)}
}

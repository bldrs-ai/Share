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
  AddCommentOutlined as NewChatIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Stop as StopIcon,
} from '@mui/icons-material'
import {HOSTED_TRANSPORT_ID, HOSTED_TRANSPORT_LABEL, OPENROUTER_KEY_ID, assistErrorMessage} from '../../assist'
import {AI_CREDITS_FEATURE} from '../../quota/aiCredits'
import {aiCreditsCopy} from '../../quota/aiCreditsCopy'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {TIERS, getTier} from '../../quota/quota'
import modelIdentity from '../../routes/modelIdentity'
import useStore from '../../store/useStore'
import {createShareAssist} from '../../viewer/tools/assistHost'
import {loadAssistRuntime} from '../../viewer/tools/assistRuntime'
import QuotaLimitDialog, {useQuotaActions} from '../Open/QuotaLimitDialog'
import Panel from '../SideDrawer/Panel'
import BotSettings from './BotSettings'
import AssistantMarkdown from './AssistantMarkdown'
import ChatMessage from './ChatMessage'
import CreditsMeter from './CreditsMeter'
import TaskChip from './TaskChip'
import {
  assistLoggedConversationStore,
  attachAssistSession,
  cancelPausedTurn,
  forgetAssistConversation,
  resumePausedTurnNow,
  setTurnSender,
  submitTurn,
} from './assistForward'
import {
  PICKED_MODEL_UNAVAILABLE_MESSAGE,
  assistModelChoice,
  isUserChosenModel,
} from './assistModelChoice'
import {assistScope} from './assistSessionKey'
import {
  assistAuth,
  assistChat,
  assistCredits,
  assistCreditsWall,
  assistHostedSide,
  assistInstance,
  assistKeyStore,
  markCreditsExhausted,
  newAssistChat,
  noteAssistAuth,
} from './assistState'
import {pausedNoticeText} from './pausedNotice'
import {reportAssistCondition} from './reportAssistCondition'
import {runningLabel} from './taskLabels'
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
 * bubbles as Markdown, and the turn's tool steps show as one task chip from
 * the tools' own `echo`, with Undo (TaskChip.jsx). Stop ends a reply
 * mid-stream.
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
  const {isAuthenticated, isLoading, user, getAccessTokenSilently} = useAuth0()
  // Pro decides whether a picked model is sent (assistModelChoice.js); the
  // relay decides whether it is served.
  const appMetadata = useStore((state) => state.appMetadata)
  const isPro = getTier(appMetadata, isAuthenticated) === TIERS.PAID
  assistAuth.current = {isAuthenticated, getAccessTokenSilently, isPro}
  const modelChoice = useSyncExternalStore(assistModelChoice.subscribe, assistModelChoice.get)
  const apiKey = useSyncExternalStore(assistKeyStore.subscribe, () => assistKeyStore.get(OPENROUTER_KEY_ID) ?? '')
  const modelPath = useStore((state) => state.modelPath)
  const modelRoute = modelPath ? modelIdentity(modelPath) : null

  // The chat lives outside the panel (assistState.js): the panel unmounts
  // when closed, and on a phone whenever another drawer tab is shown.
  const {messages, streamingTurn, undoTop, undoPending, paused} =
    useSyncExternalStore(assistChat.subscribe, assistChat.get)
  const isStreaming = streamingTurn !== null
  const isPaused = paused !== null && Number.isFinite(paused.notBefore)
  const quotaActions = useQuotaActions()
  const [input, setInput] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // The out-of-credits dialog, `{tier, refusal}`, or null when closed.
  // `refusal` is `{id, count}` when relay refusals opened (or re-opened) it:
  // the dialog sends one quota_limit_reached per refusal, once per id
  // (assistState.js assistCreditsWall). It is null when the user reopened it
  // from the meter, which is informational: no new refusal, no event.
  const [creditsDialog, setCreditsDialog] = useState(null)
  // Refusals that landed, here or while the panel was away, leave the wall;
  // the dialog opens (or stays open) for them, and taking it keeps a
  // dismissed one from reopening.
  const owedWall = useSyncExternalStore(assistCreditsWall.subscribe, assistCreditsWall.get)
  useEffect(() => {
    if (owedWall !== null) {
      setCreditsDialog({tier: owedWall.tier, refusal: {id: owedWall.id, count: owedWall.unreported}})
      assistCreditsWall.update(() => null)
    }
  }, [owedWall])
  const credits = useSyncExternalStore(assistCredits.subscribe, assistCredits.get)

  // The meter's figures belong to the sign-in state they were read under.
  // The last-seen state lives in assistState, so a change made while the
  // panel was closed is seen on reopening. Layout effect: no frame of the
  // old tier's meter.
  useLayoutEffect(() => {
    noteAssistAuth(isAuthenticated)
  }, [isAuthenticated])

  // The session log (assistForward.js), keyed by this model and sign-in,
  // once Auth0 has settled: a reload's first, signed-out render must not
  // read as a sign-out. Its first call restores the chat and any paused
  // turn; a sign-in change later sends a paused turn at once on the new tier.
  const userSub = user?.sub ?? null
  useEffect(() => {
    if (!isLoading) {
      attachAssistSession({modelRoute, scope: assistScope({isAuthenticated, userSub})})
    }
  }, [isLoading, isAuthenticated, userSub, modelRoute])

  // A key of the user's own while paused: the wait was for Bldrs' credits,
  // which the key doesn't spend, so the turn goes now.
  const hasKey = apiKey !== ''
  useEffect(() => {
    if (hasKey) {
      void resumePausedTurnNow()
    }
  }, [hasKey])

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
  }, [messages, paused])

  const handleClose = useCallback(() => {
    setIsSettingsOpen(false)
    setIsBotVisible(false)
  }, [setIsBotVisible])

  const handleApiKeySave = useCallback((value) => {
    assistKeyStore.set(OPENROUTER_KEY_ID, value)
  }, [])

  const handleSend = useCallback(() => {
    const content = input.trim()
    // While a turn waits for its credits, it goes first: Cancel gives its
    // text back to edit, or it is sent at its time.
    if (!content || isStreaming || undoPending || paused !== null) {
      return
    }
    setInput('')
    void submitTurn(content)
  }, [input, isStreaming, undoPending, paused])

  const handleCancelPaused = useCallback(() => {
    const text = cancelPausedTurn()
    if (text !== null) {
      setInput(text)
    }
  }, [])

  const handleStop = useCallback(() => {
    assistChat.update((chat) => ({...chat, stoppedTurn: chat.streamingTurn}))
    assistInstance.current?.session?.abort()
  }, [])

  const handleNewChat = useCallback(() => {
    forgetAssistConversation()
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
      messages: chat.messages.map((message) => (message.kind === 'tasks' ? {
        ...message,
        tasks: message.tasks.map((task) => (report.steps.includes(task.stepId) ?
          {...task, undone: true, undoFailed: failed} : task)),
      } : message)),
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
    // The model's replies are Markdown; the user's own words, the panel's
    // notices and its errors are plain text.
    const isMarkdown = message.kind === 'assistant'
    return (
      <ChatMessage
        key={message.id ?? index}
        position={isUser ? 'right' : 'left'}
        type='text'
        title={isUser ? 'You:' : 'Assistant:'}
        titleColor={fg}
        isRich={isMarkdown}
        text={isMarkdown ? (
          <div style={{color: fg}} data-testid={BUBBLE_TEST_IDS[message.kind]}>
            <AssistantMarkdown text={message.text}/>
          </div>
        ) : (
          <span
            style={{color: fg}}
            data-testid={BUBBLE_TEST_IDS[message.kind]}
          >
            {message.text}
          </span>
        )}
        notch={false}
        style={{
          backgroundColor: isUser ? userBg : botBg,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
        }}
      />
    )
  }

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
        {messages.map((message, index) => (message.kind === 'tasks' ?
          <TaskChip
            key={message.id}
            message={message}
            undoTop={undoTop}
            undoPending={undoPending}
            onUndo={handleUndo}
          /> :
          bubble(message, index)))}
        {isPaused && (
          <PausedNotice
            paused={paused}
            onAction={() => (aiCreditsCopy(paused.tier).cta === 'subscribe' ? quotaActions.subscribe() :
              quotaActions.signIn())}
            onCancel={handleCancelPaused}
            onResume={() => void resumePausedTurnNow()}
          />
        )}
        <Box ref={messagesEndRef} data-testid='BotChat-MessagesEnd' sx={{height: '1px', width: '100%'}}/>
      </Stack>

      {/* Hosted only: with the user's own key, Bldrs' credits aren't what's spent. */}
      {credits && !apiKey && (
        <CreditsMeter credits={credits} onMore={() => setCreditsDialog({tier: credits.tier, refusal: null})}/>
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
            disabled={undoPending || paused !== null}
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
          modelChoice={modelChoice}
          onModelChoiceChange={assistModelChoice.set}
          isPro={isPro}
          onClose={() => setIsSettingsOpen(false)}
        />
      ) : (
        renderChat()
      )}
      <QuotaLimitDialog
        tier={creditsDialog?.tier ?? 'anonymous'}
        isOpen={creditsDialog !== null}
        onClose={() => setCreditsDialog(null)}
        refusal={creditsDialog?.refusal ?? null}
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
          const built = createShareAssist(runtime, {keyStore: assistKeyStore,
            conversationStore: assistLoggedConversationStore, hosted: assistHostedSide})
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
 * Run one claimed turn (assistForward.js forwards it): its user bubble is on
 * screen and `streamingTurn` is set. Streams the reply into the chat as it
 * comes, whether or not the panel is mounted.
 *
 * @param {object} turn
 * @param {string} turn.text the user's message
 * @param {string} turn.turn the `streamingTurn` id
 * @param {string} turn.conversationId the chat it was sent in
 * @return {Promise<object>} `{refusal: {resumeAt, tier}}` when the relay refused it for credits and
 *   said when they come back (the forwarder pauses the turn, and no error bubble is added); else `{}`
 */
async function runTurn({text, turn, conversationId}) {
  const turnStartedAt = Date.now()
  let refusal = null
  // Updates from this send apply only to the chat it was sent in, so a
  // turn still finishing after the chat was reset can't write into the next.
  const update = (change) => assistChat.update((chat) => (chat.conversationId === conversationId ? change(chat) : chat))
  const setMessages = (change) => update((chat) => ({...chat, messages: change(chat.messages)}))
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
      return {}
    }
    // While the first send loaded the runtime there was no session to stop
    // or replace: the user may have pressed Stop, or started a New chat, in
    // the meantime. Either way this send never runs. (A New chat's own
    // view is a different conversation, which `update` leaves alone.)
    const chatNow = assistChat.get()
    if (chatNow.conversationId !== conversationId || chatNow.stoppedTurn === turn) {
      setMessages((prev) => [...prev, errorMessage('aborted', providerLabel())])
      return {}
    }
    const {session, transport} = instance
    try {
      for await (const event of session.send(text)) {
        if (event.type === 'error' && event.code === 'unavailable') {
          if (transport.id === HOSTED_TRANSPORT_ID && isUserChosenModel(assistHostedSide.lastModel)) {
            // The relay refused the model the user picked (#1934): another
            // tier's, or no longer in its catalogue. Theirs to change, not
            // ours to fix, so no report; the bubble says where.
            setMessages((prev) => [...prev, textMessage('error', PICKED_MODEL_UNAVAILABLE_MESSAGE)])
            continue
          }
          reportAssistCondition('model_unavailable', {status: event.status, transport: transport.id})
        }
        if (event.type === 'error' && event.code === 'credits_exhausted') {
          // The dialog sends the one `quota_limit_reached` for this wall.
          // Also owes the dialog (assistCreditsWall), which the panel opens
          // even if it was unmounted when this arrived. A resend refused
          // again is a new refusal, and counts again.
          markCreditsExhausted(event.tier)
          if (Number.isFinite(event.resumeAt)) {
            // The relay says when the credits come back: the turn waits for
            // it (the paused notice) instead of ending in an error.
            refusal = {resumeAt: event.resumeAt, tier: event.tier ?? null}
            continue
          }
        }
        update((chat) => ({
          ...chat,
          messages: applyEvent(chat.messages, event, turn, transport.label, {turnStartedAt}),
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
      messages: chat.messages.map((message) => {
        if (message.live) {
          return {...message, live: false}
        }
        // The turn is over however it ended, so its chip gets its end time.
        // A call still running never came back (a stop): it has nothing
        // to report, so it goes.
        return message.kind === 'tasks' && message.turn === turn && message.endedAt === undefined ?
          {...message, endedAt: Date.now(), tasks: message.tasks.filter((task) => !task.running)} : message
      }),
    }))
  }
  return refusal ? {refusal} : {}
}
setTurnSender(runTurn)


/**
 * The turn waiting for its credits (assistForward.js): what is used up, when
 * it will be sent, the tier's way out (sign in, or upgrade; Pro has none)
 * and Cancel, which gives the text back to the input. In a browser without
 * Web Locks nothing is sent on its own (assistLog.js "The lock"), so once
 * its time has come it offers Resume instead.
 *
 * @property {object} paused the chat's `paused`
 * @property {Function} onAction the tier's call to action
 * @property {Function} onCancel Drops the turn and gives its text back to the input
 * @property {Function} onResume Sends it now, from this tab
 * @return {ReactElement}
 */
function PausedNotice({paused, onAction, onCancel, onResume}) {
  const theme = useTheme()
  const {cta, ctaLabel} = aiCreditsCopy(paused.tier)
  const {awaitingResume} = paused
  return (
    <Box
      role='status'
      data-testid='BotChat-Paused'
      sx={{
        alignSelf: 'stretch',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: `${theme.shape.borderRadius}px`,
        px: 1.5,
        py: 1,
      }}
    >
      <Typography variant='body2' data-testid='BotChat-PausedText'>
        {pausedNoticeText(paused.tier, paused.notBefore, {awaitingResume})}
      </Typography>
      <Box sx={{display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5}}>
        <Button
          size='small'
          onClick={onCancel}
          data-testid='BotChat-PausedCancel'
          sx={{textTransform: 'none'}}
        >
          Cancel
        </Button>
        {cta !== null && !awaitingResume && (
          <Button
            size='small'
            onClick={onAction}
            data-testid='BotChat-PausedAction'
            sx={{textTransform: 'none', whiteSpace: 'nowrap'}}
          >
            {ctaLabel}
          </Button>
        )}
        {awaitingResume && (
          <Button
            size='small'
            variant='contained'
            color='accent'
            onClick={onResume}
            data-testid='BotChat-PausedResume'
            sx={{textTransform: 'none'}}
          >
            Resume
          </Button>
        )}
      </Box>
    </Box>
  )
}


/**
 * Fold one loop event into the message list.
 *
 * - Text streams into the turn's live assistant bubble, and a new bubble
 *   starts after the task chip, so the reply reads in the order it happened.
 * - A turn's tool calls are one 'tasks' message (the chip), made where the
 *   turn's first tool call lands and added to as later ones come, even
 *   after text that came in between. A task is running from its `tool-call`
 *   (a label from taskLabels.js), then the tool's echo, or what went wrong;
 *   a call declined for approval says so (#1675).
 * - Times, from `now`: a task runs from its `tool-call` event to its
 *   `tool-result`; the turn from `turnStartedAt` to the chip's `endedAt`,
 *   which the send sets when the turn ends. They are when the panel saw the
 *   events, which is when the user did.
 * - An error is a bubble saying what happened and what to do.
 *
 * Exported for tests.
 *
 * @param {Array<object>} messages
 * @param {object} event an AssistEvent
 * @param {string} turn this send's id
 * @param {string} provider the transport's label, for error wording
 * @param {object} [times]
 * @param {number} [times.now] the event's time, default the clock's
 * @param {number} [times.turnStartedAt] when the send began, default `now`
 * @return {Array<object>} the next list
 */
export function applyEvent(messages, event, turn, provider, times = {}) {
  const now = times.now ?? Date.now()
  const last = messages[messages.length - 1]
  const chatIndex = messages.findIndex((message) => message.kind === 'tasks' && message.turn === turn)
  switch (event.type) {
    case 'text-delta':
      if (last?.kind === 'assistant' && last.live && last.turn === turn) {
        return [...messages.slice(0, -1), {...last, text: last.text + event.text}]
      }
      return [...messages, {id: uuid(), kind: 'assistant', text: event.text, live: true, turn}]
    case 'tool-call': {
      // Shown at once as a running task, so a long read isn't silent. Its
      // result replaces the label with the tool's echo.
      const chip = chatIndex >= 0 ? messages[chatIndex] : newTasksMessage(turn, times.turnStartedAt ?? now)
      const task = {callId: event.callId, stepId: event.stepId, name: event.name, line: runningLabel(event.name),
        running: true, ok: true, undoable: false, startedAt: now}
      return withChip(messages, chatIndex, {...chip, tasks: [...chip.tasks, task]})
    }
    case 'tool-result': {
      const chip = chatIndex >= 0 ? messages[chatIndex] : newTasksMessage(turn, times.turnStartedAt ?? now)
      const done = {stepId: event.stepId, line: actionText(event), running: false, ok: event.ok,
        undoable: event.undoable, endedAt: now}
      const known = chip.tasks.some((task) => task.callId === event.callId)
      const tasks = known ?
        chip.tasks.map((task) => (task.callId === event.callId ? {...task, ...done} : task)) :
        [...chip.tasks, {callId: event.callId, name: event.name, startedAt: now, ...done}]
      return withChip(messages, chatIndex, {...chip, tasks})
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
 * @param {string} turn
 * @param {number} startedAt when the send began
 * @return {object} an empty chip for the turn, still running (no `endedAt`)
 */
function newTasksMessage(turn, startedAt) {
  return {id: uuid(), kind: 'tasks', turn, startedAt, tasks: []}
}


/**
 * @param {Array<object>} messages
 * @param {number} index the chip's place, or -1 if it is new
 * @param {object} chip
 * @return {Array<object>} the list with the chip replaced, or added at the end
 */
function withChip(messages, index, chip) {
  return index >= 0 ? messages.map((message, i) => (i === index ? chip : message)) : [...messages, chip]
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

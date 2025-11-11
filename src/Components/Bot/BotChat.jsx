import React, {
  useCallback,
  useRef,
  useState,
  ReactElement,
} from 'react'
import {v4 as uuid} from 'uuid'
import {
  Box, Card, CardHeader, Fab, IconButton, InputBase, Stack, useTheme,
} from '@mui/material'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import ChatMessage from './ChatMessage'
import {safeJsonFromCodeBlock} from './eval'
import {askLLM} from './openRouterClient'
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  PushPin as PushPinIcon,
  PushPinOutlined as PushPinOutlinedIcon,
} from '@mui/icons-material'
import 'react-chat-elements/dist/main.css'
import './chat-bubbles.css'


/** @return {ReactElement} */
export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const theme = useTheme()
  const viewer = useStore((state) => state.viewer)
  const [isPinned, setIsPinned] = useState(true)
  const [position, setPosition] = useState(getDefaultPosition)
  const dragState = useRef({
    dragging: false,
    pointerId: null,
    startPointer: {x: 0, y: 0},
    startPosition: {x: 0, y: 0},
  })

  /*  theme-aware colours  */
  const userBg = theme.palette.primary.main
  const userText = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]
  const botText = theme.palette.getContrastText(botBg)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openrouter_api_key') ?? '')
  const [isApiKeyEditing, setIsApiKeyEditing] = useState(false)

  const clampPosition = useCallback((next) => {
    if (typeof window === 'undefined') {
      return next
    }
    const maxX = Math.max(CARD_MARGIN, window.innerWidth - CARD_WIDTH - CARD_MARGIN)
    const maxY = Math.max(CARD_MARGIN, window.innerHeight - CARD_HEIGHT - CARD_MARGIN)
    return {
      x: Math.min(Math.max(next.x, CARD_MARGIN), maxX),
      y: Math.min(Math.max(next.y, CARD_MARGIN), maxY),
    }
  }, [])

  const handlePointerDown = useCallback((event) => {
    if (isPinned) {
      return
    }
    const handleEl = event.currentTarget
    handleEl.setPointerCapture(event.pointerId)
    dragState.current = {
      dragging: true,
      pointerId: event.pointerId,
      startPointer: {x: event.clientX, y: event.clientY},
      startPosition: position,
    }
  }, [isPinned, position])

  const handlePointerMove = useCallback((event) => {
    if (!dragState.current.dragging || dragState.current.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - dragState.current.startPointer.x
    const deltaY = event.clientY - dragState.current.startPointer.y
    const nextPosition = {
      x: dragState.current.startPosition.x + deltaX,
      y: dragState.current.startPosition.y + deltaY,
    }
    setPosition(clampPosition(nextPosition))
  }, [clampPosition])

  const endDrag = useCallback((event) => {
    if (!dragState.current.dragging || dragState.current.pointerId !== event.pointerId) {
      return
    }
    dragState.current.dragging = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const togglePinned = useCallback(() => {
    setIsPinned((prev) => {
      if (prev) {
        // switching to unpinned; ensure position is initialised relative to current viewport
        setPosition((current) => clampPosition(current || getDefaultPosition()))
        return false
      }
      // switching to pinned → snap back to default corner
      setPosition(getDefaultPosition())
      return true
    })
  }, [clampPosition])

  /* eslint-disable max-len */

  const BASE_SYSTEM_MSG = {
    role: 'system',
    content: [
      'You are Bldrs AI, an IFC model viewer assistant.',
      'When context is small, return JSON with:',
      '- "assistant_response": string  (always shown to the user)',
      '- optional "selectedElements": [expressID,…]  (we will highlight via setSelectedElements)',
      '- optional "shouldSelect": true/false  (set to true if the user asked to select elements)',
      '- optional "shouldHide": true/false    (set to true if the user asked to hide elements)',
      '',
      'If context is too large (system message “ContextTooLarge”), return JSON with:',
      '- "assistant_response": string',
      '- "client_code": string  (JS function body that receives (viewer, store, setSelectedElements))',
      '- optional "shouldSelect": true/false',
      '- optional "shouldHide": true/false',
      '- optional "shouldIsolate": true/false',
      '',
      'Inside client_code you have access to:',
      '- viewer.IFC.loader.ifcManager.idsByType(modelID, "IfcWindow")',
      '    → shorthand for all IDs of a class name, needed for selecting and hiding.',
      '- viewer.IFC.loader.ifcManager.getItemProperties(modelID, expressID)',
      '    → full property map if you need more data',
      '- await viewer.getByFloor(floorNumber)',
      '    → select or isolate all elements on a floor (floorNumber). If you use this, just return await viewer.getByFloor(whatever floor number you should use). NO OTHER CODE AND DONT WRAP IN A FUNCTION.',
      'Use these in your client_code to build any custom selection. Use 0 for modelID. Do NOT use getAllItemsOfType, and do not map or mutate the result before returning. Just return the function without doing any mapping of the return value.',
      'At the end of client_code, return an array of expressIDs to highlight.',
      'ALWAYS RETURN an assistant_response!',
      '',
      'If the user’s request includes selecting elements (e.g. “select”, “highlight”), set "shouldSelect": true and include the IDs in "selectedElements".',
      'If the user’s request includes hiding elements (e.g. “hide”, “remove from view”), set "shouldHide": true and include the IDs in "selectedElements".',
      '',
      'Always wrap your JSON reply in a ```json … ``` code block and include ONLY JSON—no extra text.',
    ].join('\\n'),
  }

  /* eslint-enable max-len */

  /* ---------------- main callback ---------------- */
  const handleSend = async () => {
    if (!apiKey || apiKey === '') { // ← guard early
      alert('Please enter your OpenRouter API key first.')
      return
    }
    const content = input.trim()
    if (!content) {
      return
    }
    setInput('')

    /* access the global setter once */
    const setSelectedElements = useStore.getState().setSelectedElements
    const selectedElements = useStore.getState().selectedElements

    /* 1️⃣ user bubble */
    const userMsg = {id: uuid(), position: 'right', title: 'You:', text: content, date: new Date()}

    /* 2️⃣ placeholder */
    const phId = uuid()
    const phMsg = {id: phId, position: 'left', title: 'Assistant:', text: '…', loading: true, date: new Date()}

    setMessages((prev) => [...prev, userMsg, phMsg])

    try {
      /* 3️⃣ prompt */
      const selectedProps = await viewer.getSelectedElementsProps(selectedElements)

      let context = null
      const many = false
      let prompt = null

      if (selectedProps.length > 0) {
        context = JSON.stringify(selectedProps)

        prompt = [
          BASE_SYSTEM_MSG,
          {role: 'system', content: many ? 'ContextTooLarge' : `Selected elements: ${context}`},
          {role: 'user', content: content},
        ]
      } else {
        prompt = [
          BASE_SYSTEM_MSG,
          {role: 'system', content: 'ContextTooLarge'},
          {role: 'user', content: content},
        ]
      }

      /* … unchanged code … */
      const raw = await askLLM({
        messages: prompt,
        apiKey, // ← pass it through
      })

      /* 5️⃣ extract JSON payload */
      const payload = safeJsonFromCodeBlock(raw)

      debug().log('LLM response:', payload)
      const assistantText = payload?.assistant_response || raw

      /* 6️⃣ update selected elements if present */
      if (Array.isArray(payload?.selectedElements)) {
        const strIds = payload.selectedElements.map(String)
        setSelectedElements(strIds)
      }

      /* 6️⃣  execute client_code if provided */
      /* 7️⃣ execute client_code if provided */
      if (typeof payload.client_code === 'string') {
        try {
          /* Wrap the code, then invoke any function it defines */
          // eslint-disable-next-line no-console
          console.log(payload.client_code)


          const asyncWrapper = `
         // wrap client_code in an async IIFE so await works
         return (async (viewer, store, setSelectedElements) => {
           ${payload.client_code}
           // call any helper function the LLM defined
           if (typeof selectElements === 'function') return await selectElements(viewer, store, setSelectedElements);
           if (typeof selectByType === 'function')   return await selectByType(viewer, store, setSelectedElements);
           if (typeof main === 'function')           return await main(viewer, store, setSelectedElements);
           return undefined;
         })(viewer, store, setSelectedElements);
       `
          const fn = new Function('viewer', 'store', 'setSelectedElements', asyncWrapper)
          const result = await fn(viewer, useStore.getState(), setSelectedElements)
          // unwrap WebIFC.Vector or similar
          let ids = []
          if (Array.isArray(result)) {
            ids = result
          } else if (result && typeof result.size === 'function' && typeof result.get === 'function') {
            const n = result.size()
            for (let i = 0; i < n; i++) {
              ids.push(result.get(i))
            }
          }
          if (ids.length) {
            setSelectedElements(ids.map(String))
          }

          if (payload?.shouldIsolate) {
            viewer.isolator.initTemporaryIsolationSubset(ids)
          } else if (payload?.shouldHide) {
            viewer.isolator.hideElementsById(ids)
          }
        } catch (e) {
          console.warn('client_code execution error:', e)
        }
      }

      /* 7️⃣  final assistant bubble */
      const aiMsg = {id: uuid(), position: 'left', title: 'Assistant:', text: assistantText, date: new Date()}
      setMessages((p) => [...p.filter((m) => m.id !== phId), aiMsg])
    } catch (err) {
      console.error(err)
      setMessages((prev) =>
        prev.map((m) => (m.id === phId ? {...m, text: '(LLM error)', loading: false} : m)),
      )
    }
  }

  return (
    <Box
      sx={{
        margin: '2em',
      }}
    >
      {!isOpen &&
       <Fab
         color='secondary'
         aria-label='chat'
         onClick={() => setIsOpen((o) => !o)}
         sx={{
           position: 'fixed',
           bottom: '0.5em',
           right: '0.5em',
         }}
       >
         <ChatIcon/>
       </Fab>
      }

      {isOpen && (
        <Card
          elevation={6}
          sx={{
            width: 360,
            height: 520,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'fixed',
            ...(isPinned ? {
              bottom: CARD_MARGIN,
              right: CARD_MARGIN,
            } : {
              top: position.y,
              left: position.x,
            }),
            zIndex: 1299,
          }}
        >
          {/* header */}
          <CardHeader
            disableTypography
            title={(
              (
                <Box
                  data-drag-handle='true'
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: 18,
                    cursor: isPinned ? 'default' : 'grab',
                    userSelect: 'none',
                    flexGrow: 1,
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  Bot
                </Box>
              )
            )}
            action={
              <Stack direction='row' spacing={0.5}>
                <IconButton
                  aria-label={isPinned ? 'Unpin bot' : 'Pin bot'}
                  aria-pressed={!isPinned}
                  onClick={togglePinned}
                  sx={{color: 'inherit'}}
                >
                  {isPinned ? <PushPinOutlinedIcon/> : <PushPinIcon/>}
                </IconButton>
                <IconButton
                  onClick={() => setIsOpen(false)}
                  sx={{color: 'inherit'}}
                >
                  <CloseIcon/>
                </IconButton>
              </Stack>
            }
            sx={{
              p: '1em 1em 0 1em',
              display: 'flex',
              alignItems: 'center',
            }}
          />

          {/* API-key row – add right under the header */}
          <Box sx={{display: 'flex', gap: 1, p: 1, borderBottom: (theme_) => `1px solid ${theme_.palette.divider}`}}>
            <InputBase
              fullWidth
              type={isApiKeyEditing ? 'text' : 'password'}
              value={apiKey}
              placeholder='Paste your OpenRouter API Key…'
              onChange={(e) => {
                setApiKey(e.target.value)
                localStorage.setItem('openrouter_api_key', e.target.value)
              }}
              onFocus={() => setIsApiKeyEditing(true)}
              onBlur={() => setIsApiKeyEditing(false)}
              sx={{
                fontSize: 14,
                backgroundColor: (theme__) => theme__.palette.mode === 'dark' ?
                  'rgba(255,255,255,0.08)' :
                  'rgba(0,0,0,0.04)',
                borderRadius: 2, px: 2, py: 1,
              }}
            />
          </Box>

          {/* messages */}
          <Stack
            direction='column'
            spacing={2}
            sx={{
              'flex': 1,
              'overflowY': 'auto',
              'p': 1,
              'backgroundColor': theme.palette.background.paper,
              /* vertical rhythm without turning the box into flex */
              '& .rce-mbox': {marginBottom: 8},
            }}
          >
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                position={m.position} // 'right' or 'left'
                type='text'
                title={m.title}
                titleColor={m.position === 'right' ? userText : botText}
                text={
                  <span style={{color: m.position === 'right' ? userText : botText}}>
                    {m.text}
                  </span>
                }
                date={m.date}
                notch={false}
                /* bubble colour + left / right alignment */
                style={{
                  backgroundColor: m.position === 'right' ? userBg : botBg,
                  alignSelf: m.position === 'right' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%', // keeps long messages tidy
                }}
              />
            ))}
          </Stack>

          {/* input row */}
          <Box sx={{display: 'flex', gap: 1, p: 1.5, borderTop: `1px solid ${theme.palette.divider}`}}>
            <InputBase
              fullWidth value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder='Type a message…'
              sx={{
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.background.default,
                borderRadius: 2, px: 2, py: 1,
                boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`,
              }}
            />
            <IconButton onClick={handleSend} color='primary'><SendIcon/></IconButton>
          </Box>
        </Card>
      )}
    </Box>
  )
}


const CARD_WIDTH = 360
const CARD_HEIGHT = 520
const CARD_MARGIN = 24

/**
 * Compute the default chat position relative to the viewport.
 *
 * @return {{x: number, y: number}} Position coordinates.
 */
function getDefaultPosition() {
  if (typeof window === 'undefined') {
    return {x: CARD_MARGIN, y: CARD_MARGIN}
  }
  return {
    x: Math.max(CARD_MARGIN, window.innerWidth - CARD_WIDTH - CARD_MARGIN),
    y: Math.max(CARD_MARGIN, window.innerHeight - CARD_HEIGHT - CARD_MARGIN),
  }
}

import React, {useState, ReactElement} from 'react'
// import {MessageBox} from 'react-chat-elements'
import {
  Fab, useTheme, Paper, IconButton, Box, Typography, InputBase,
} from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import 'react-chat-elements/dist/main.css'
import './chat-bubbles.css' // ← step 2 (see CSS below)
import ChatMessage from './ChatMessage'
import useStore from '../../store/useStore'
import {askLLM} from './openRouterClient'
import {v4 as uuid} from 'uuid' // npm i uuid   (tiny helper)

/**
 * @return {ReactElement}
 */
export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const theme = useTheme()
  const viewer = useStore((state) => state.viewer)

  /*  theme-aware colours  */
  const userBg = theme.palette.primary.main
  const userText = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]
  const botText = theme.palette.getContrastText(botBg)

  const MAX_IDS = 15 // threshold for “too big”

  const BASE_SYSTEM_MSG = {
    role: 'system',
    content: [
      'You are Bldrs AI, an IFC model assistant.',
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
      '',
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

  /**
   *
   */
  function safeJsonFromCodeBlock(text) {
    const match = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/i)
    if (!match) {
return null
}
    try {
 return JSON.parse(match[1])
} catch {
 return null
}
  }


  /* helper — pull first {...} JSON inside a ``` block */
/**
 *
 */
function extractSelectedIds(text) {
  const block = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/i)
  if (!block) {
return null
}
  try {
    const parsed = JSON.parse(block[1])
    return Array.isArray(parsed.selectedElements) ? parsed.selectedElements : null
  } catch {
    return null
  }
}

  /* ---------------- main callback ---------------- */
  const handleSend = async () => {
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
      const visible = null
      const many = false
      let prompt = null

      if (selectedProps.length > 0) {
        context = JSON.stringify(selectedProps)

        prompt = [
          BASE_SYSTEM_MSG,
          {role: 'system', content: many ? 'ContextTooLarge' : `Selected elements: ${context}`},
          {role: 'user', content: content},
        ]
      }

      /* 4️⃣ LLM request */
      const raw = await askLLM({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: prompt,
      })

      /* 5️⃣ extract JSON payload */
      const payload = safeJsonFromCodeBlock(raw)
      console.log('LLM response:', payload)
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
    <>
      <Fab
        color="primary"
        aria-label="chat"
        onClick={() => setIsOpen((o) => !o)}
        sx={{position: 'fixed', bottom: 24, right: 24, zIndex: 1300}}
      >
        <ChatIcon/>
      </Fab>

      {isOpen && (
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            width: 360,
            height: 520,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1299,
            overflow: 'hidden',
            backgroundColor: theme.palette.background.paper,
          }}
        >
          {/* header */}
          <Box sx={{
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            p: 2, display: 'flex', justifyContent: 'space-between',
          }}
          >
            <Typography variant="subtitle1" fontWeight="bold">Bldrs AI Assistant</Typography>
            <IconButton onClick={() => setIsOpen(false)} sx={{color: 'inherit'}}>
              <CloseIcon/>
            </IconButton>
          </Box>

          {/* messages */}
          <Box
          sx={{
            'flex': 1,
            'overflowY': 'auto',
            'p': 1,
            'backgroundColor': theme.palette.grey[100],
            /* vertical rhythm without turning the box into flex */
            '& .rce-mbox': {marginBottom: 8},
          }}
          >
          {messages.map((m, i) => (
          <ChatMessage
            key={i}
            position={m.position} // 'right' or 'left'
            type="text"
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
          </Box>

          {/* input row */}
          <Box sx={{display: 'flex', gap: 1, p: 1.5, borderTop: `1px solid ${theme.palette.divider}`}}>
            <InputBase
              fullWidth value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={async (e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              sx={{
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.background.default,
                borderRadius: 2, px: 2, py: 1,
                boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`,
              }}
            />
            <IconButton onClick={handleSend} color="primary"><SendIcon/></IconButton>
          </Box>
        </Paper>
      )}
    </>
  )
}

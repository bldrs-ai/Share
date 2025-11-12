import React, {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  ReactElement,
} from 'react'
import {v4 as uuid} from 'uuid'
import {
  Box, IconButton, InputBase, Stack, useTheme,
} from '@mui/material'
import {Send as SendIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import Panel from '../SideDrawer/Panel'
import ChatMessage from './ChatMessage'
import {safeJsonFromCodeBlock} from './eval'
import {askLLM} from './openRouterClient'
import 'react-chat-elements/dist/main.css'
import './chat-bubbles.css'


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
    '    → select or isolate all elements on a floor (floorNumber).',
    '    If you use this, just return await viewer.getByFloor(whatever floor number you should use).',
    '    NO OTHER CODE AND DONT WRAP IN A FUNCTION.',
    'Use these in your client_code to build any custom selection.',
    'Use 0 for modelID. Do NOT use getAllItemsOfType, and do not map or mutate the result before returning.',
    'Just return the function without doing any mapping of the return value.',
    'At the end of client_code, return an array of expressIDs to highlight.',
    'ALWAYS RETURN an assistant_response!',
    '',
    'If the user’s request includes selecting elements (e.g. “select”, “highlight”), set "shouldSelect": true.',
    'Include the IDs in "selectedElements".',
    'If the user’s request includes hiding elements (e.g. “hide”, “remove from view”), set "shouldHide": true.',
    'Include the IDs in "selectedElements" for hides as well.',
    '',
    'Always wrap your JSON reply in a ```json … ``` code block and include ONLY JSON—no extra text.',
  ].join('\n'),
}


/** @return {ReactElement} */
export default function BotChat() {
  const viewer = useStore((state) => state.viewer)
  const setIsBotVisible = useStore((state) => state.setIsBotVisible)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openrouter_api_key') ?? '')
  const [isApiKeyEditing, setIsApiKeyEditing] = useState(false)

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
    setIsBotVisible(false)
  }, [setIsBotVisible])

  const handleSend = useCallback(async () => {
    if (!apiKey || apiKey === '') {
      alert('Please enter your OpenRouter API key first.')
      return
    }
    const content = input.trim()
    if (!content) {
      return
    }
    setInput('')

    const setSelectedElements = useStore.getState().setSelectedElements
    const selectedElements = useStore.getState().selectedElements

    const userMsg = {id: uuid(), position: 'right', title: 'You:', text: content, date: new Date()}

    const phId = uuid()
    const phMsg = {id: phId, position: 'left', title: 'Assistant:', text: '…', loading: true, date: new Date()}

    setMessages((prev) => [...prev, userMsg, phMsg])

    try {
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

      const raw = await askLLM({
        messages: prompt,
        apiKey,
      })

      const payload = safeJsonFromCodeBlock(raw)

      debug().log('LLM response:', payload)
      const assistantText = payload?.assistant_response || raw

      if (Array.isArray(payload?.selectedElements)) {
        const strIds = payload.selectedElements.map(String)
        setSelectedElements(strIds)
      }

      if (typeof payload.client_code === 'string') {
        try {
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
        } catch (error) {
          console.warn('client_code execution error:', error)
        }
      }

      const aiMsg = {id: uuid(), position: 'left', title: 'Assistant:', text: assistantText, date: new Date()}
      setMessages((prev) => [...prev.filter((message) => message.id !== phId), aiMsg])
    } catch (error) {
      console.error(error)
      setMessages((prev) =>
        prev.map((message) => (message.id === phId ? {...message, text: '(LLM error)', loading: false} : message)),
      )
    }
  }, [apiKey, input, viewer])

  return (
    <Panel title='Bot' onClose={handleClose} data-testid='BotPanel'>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: '0.75em',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            borderBottom: (theme_) => `1px solid ${theme_.palette.divider}`,
            padding: '0 0 0.75em 0',
          }}
        >
          <InputBase
            fullWidth
            type={isApiKeyEditing ? 'text' : 'password'}
            value={apiKey}
            placeholder='Paste your OpenRouter API Key…'
            onChange={(event) => {
              setApiKey(event.target.value)
              localStorage.setItem('openrouter_api_key', event.target.value)
            }}
            onFocus={() => setIsApiKeyEditing(true)}
            onBlur={() => setIsApiKeyEditing(false)}
            sx={{
              fontSize: 14,
              backgroundColor: (theme_) => theme_.palette.mode === 'dark' ?
                'rgba(255,255,255,0.08)' :
                'rgba(0,0,0,0.04)',
              borderRadius: 2,
              px: 2,
              py: 1,
            }}
          />
        </Box>

        <Stack
          direction='column'
          spacing={2}
          ref={messagesContainerRef}
          data-testid='BotChat-Messages'
          sx={Object.assign({
            flex: 1,
            overflowY: 'auto',
            pb: 0.75,
            backgroundColor: theme.palette.background.paper,
          }, {
            '& .rce-mbox': {marginBottom: 8},
          })}
        >
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              position={message.position}
              type='text'
              title={message.title}
              titleColor={message.position === 'right' ? userText : botText}
              text={
                <span style={{color: message.position === 'right' ? userText : botText}}>
                  {message.text}
                </span>
              }
              date={message.date}
              notch={false}
              style={{
                backgroundColor: message.position === 'right' ? userBg : botBg,
                alignSelf: message.position === 'right' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
              }}
            />
          ))}
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
            sx={{
              color: theme.palette.text.primary,
              backgroundColor: theme.palette.background.default,
              borderRadius: 2,
              px: 2,
              py: 1,
              boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`,
            }}
          />
          <IconButton
            onClick={handleSend}
            color='primary'
            data-testid='BotChat-SendButton'
          >
            <SendIcon data-testid='SendIcon'/>
          </IconButton>
        </Box>
      </Box>
    </Panel>
  )
}


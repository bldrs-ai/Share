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


/**
 * @return {ReactElement}
 */
export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const theme = useTheme()

  /*  theme-aware colours  */
  const userBg = theme.palette.primary.main
  const userText = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[200]
  const botText = theme.palette.getContrastText(botBg)

  const handleSend = () => {
    if (!input.trim()) {
return
}

    const userMsg = {
      position: 'right',
      text: input,
      title: 'You:',
      date: new Date(),
    }
    const botMsg = {
      position: 'left',
      text: `You said: ${input}`,
      title: 'Assistant:',
      date: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    const testTimeout = 600
    setTimeout(() => setMessages((prev) => [...prev, botMsg]), testTimeout)
    setInput('')
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
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
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

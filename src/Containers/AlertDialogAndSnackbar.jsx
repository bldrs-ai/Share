import React, {ReactElement, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box, Collapse, IconButton, Snackbar, Stack, Typography} from '@mui/material'
import {
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import AlertDialog from '../Components/AlertDialog'
import useStore from '../store/useStore'
import {assert} from '../utils/assert'
import {navToDefault} from '../utils/navigate'


const LOAD_LINE_SX = {
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  whiteSpace: 'pre',
}


/** @return {ReactElement} */
export default function AlertAndSnackbar() {
  const appPrefix = useStore((state) => state.appPrefix)

  const snackMessage = useStore((state) => state.snackMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  // Live load-log surface (conway #301): while a load runs, the snackbar
  // shows the current stage line with an expand toggle for the accumulated
  // report — the same lines the JS console shows. This replaces the
  // separate bottom-bar status slot.
  const currentLoadLine = useStore((state) => state.currentLoadLine)
  const loadReportLines = useStore((state) => state.loadReportLines)
  const isLoadActive = currentLoadLine !== null

  const [isSnackOpen, setIsSnackOpen] = useState(false)
  const [text, setText] = useState(null)
  const [duration, setDuration] = useState(null)
  const [isLoadExpanded, setIsLoadExpanded] = useState(false)

  const navigate = useNavigate()


  useEffect(() => {
    if (snackMessage === null) {
      setIsSnackOpen(false)
      return
    }
    if (typeof snackMessage === 'string') {
      setText(snackMessage)
      setDuration(null)
    } else {
      assert(typeof snackMessage.text === 'string' && snackMessage.text.length > 0,
        'snackMessage.text must be valid string')
      assert(typeof snackMessage.autoDismiss === 'boolean' && snackMessage.autoDismiss,
        'snackMessage.autoDismiss must be true')
      setText(snackMessage.text)
      const dismissTimeMs = 5000
      setDuration(dismissTimeMs)
    }
    setIsSnackOpen(true)
  }, [snackMessage, setIsSnackOpen])


  // The load view takes over the snackbar while a load is active — never
  // auto-dismisses and stays open regardless of snackMessage.
  const snackOpen = isLoadActive || isSnackOpen
  const snackDuration = isLoadActive ? null : duration

  const loadMessage = (
    <Box sx={{maxWidth: '60vw'}}>
      <Collapse in={isLoadExpanded}>
        <Box sx={{...LOAD_LINE_SX, opacity: 0.8, mb: 0.5, overflowX: 'auto'}} data-testid='LoadStatusHistory'>
          {loadReportLines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </Box>
      </Collapse>
      <Stack direction='row' alignItems='center' spacing={0.5}>
        <IconButton
          size='small'
          aria-label={isLoadExpanded ? 'Collapse load log' : 'Expand load log'}
          onClick={() => setIsLoadExpanded(!isLoadExpanded)}
          data-testid='LoadStatusExpandToggle'
        >
          {isLoadExpanded ? <ExpandMoreIcon fontSize='inherit'/> : <ExpandLessIcon fontSize='inherit'/>}
        </IconButton>
        <Typography component='span' sx={LOAD_LINE_SX} data-testid='LoadStatusLine'>
          {currentLoadLine}
        </Typography>
      </Stack>
    </Box>
  )

  const textMessage = (
    <Typography
      variant='body2'
      sx={{
        maxWidth: '19em',
        overflowWrap: 'break-word',
      }}
    >
      {text}
    </Typography>
  )

  const closeAction = (
    <IconButton
      onClick={() => setIsSnackOpen(false)}
      size='small'
      sx={{marginRight: '-.5em'}}
    >
      <CloseIcon color='primary' fontSize='inherit'/>
    </IconButton>
  )


  return (
    <>
      <AlertDialog
        onClose={() => {
          setSnackMessage(null)
          navToDefault(navigate, appPrefix)
        }}
      />
      <Snackbar
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        autoHideDuration={snackDuration}
        sx={{marginBottom: '-.3em'}}
        open={snackOpen}
        onClose={() => setIsSnackOpen(false)}
        action={isLoadActive ? null : closeAction}
        message={isLoadActive ? loadMessage : textMessage}
        data-testid='snackbar'
      />
    </>
  )
}

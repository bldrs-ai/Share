import React, {ReactElement, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import AlertDialog from '../Components/AlertDialog'
import useStore from '../store/useStore'
import {assert} from '../utils/assert'
import {navToDefault} from '../utils/routes'
import CloseIcon from '@mui/icons-material/Close'


/** @return {ReactElement} */
export default function AlertAndSnackbar() {
  const appPrefix = useStore((state) => state.appPrefix)

  const snackMessage = useStore((state) => state.snackMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  const [isSnackOpen, setIsSnackOpen] = useState(false)
  const [text, setText] = useState(null)
  const [duration, setDuration] = useState(null)

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
        autoHideDuration={duration}
        sx={{marginBottom: '-.3em'}}
        open={isSnackOpen}
        onClose={(event, reason) => setIsSnackOpen(false)}
        action={
          <IconButton
            onClick={() => setIsSnackOpen(false)}
            size='small'
            sx={{marginRight: '-.5em'}}
          >
            <CloseIcon color='primary' fontSize='inherit'/>
          </IconButton>
        }
        message={
          <Typography
            variant='body2'
            sx={{
              maxWidth: '19em',
              overflowWrap: 'break-word',
            }}
          >
            {text}
          </Typography>
        }
        data-testid='snackbar'
      />
    </>
  )
}

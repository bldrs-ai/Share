import React, {ReactElement, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import AlertDialog from '../Components/AlertDialog'
import {navToDefault} from '../Share'
import useStore from '../store/useStore'
import CloseIcon from '@mui/icons-material/Close'


/** @return {ReactElement} */
export default function AlertAndSnackbar() {
  const appPrefix = useStore((state) => state.appPrefix)

  const snackMessage = useStore((state) => state.snackMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  const [isSnackOpen, setIsSnackOpen] = useState(false)

  const navigate = useNavigate()


  useEffect(() => {
    setIsSnackOpen(snackMessage !== null)
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
        open={isSnackOpen}
        onClose={(event, reason) => setIsSnackOpen(false)}
        message={
          <Stack direction='row'>
            {snackMessage}
            <IconButton onClick={() => setIsSnackOpen(false)}><CloseIcon className='icon-share'/></IconButton>
          </Stack>
        }
      />
    </>
  )
}

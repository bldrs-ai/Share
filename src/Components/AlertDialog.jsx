import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import useStore from '../store/useStore'
import CheckIcon from '@mui/icons-material/Check'


/** @return {React.ReactElement} */
export default function AlertDialog({onCloseCb, children}) {
  const alertMessage = useStore((state) => state.alertMessage)
  const setAlertMessage = useStore((state) => state.setAlertMessage)
  const onCloseClick = () => setAlertMessage(null)
  return (
    <Dialog
      open={alertMessage !== null}
      onClose={onCloseClick}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{'Alert'}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">{alertMessage}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={onCloseClick}><CheckIcon/></IconButton>
      </DialogActions>
    </Dialog>
  )
}

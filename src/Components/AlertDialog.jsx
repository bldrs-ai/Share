import React, {ReactElement} from 'react'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import useStore from '../store/useStore'
import CheckIcon from '@mui/icons-material/Check'


/** @return {ReactElement} */
export default function AlertDialog({onClose, children}) {
  const alertMessage = useStore((state) => state.alertMessage)
  const setAlertMessage = useStore((state) => state.setAlertMessage)
  const onCloseInner = () => {
    setAlertMessage(null)
    onClose()
  }
  return (
    <Dialog
      open={alertMessage !== null}
      onClose={onCloseInner}
      aria-labelledby='alert-dialog-title'
      aria-describedby='alert-dialog-description'
    >
      <DialogTitle id='alert-dialog-title'>{'Alert'}</DialogTitle>
      <DialogContent>
        {alertMessage}
      </DialogContent>
      <DialogActions>
        <IconButton onClick={onCloseInner}><CheckIcon/></IconButton>
      </DialogActions>
    </Dialog>
  )
}

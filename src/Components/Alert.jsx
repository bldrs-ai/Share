import React, {useState} from 'react'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import CheckIcon from '@mui/icons-material/Check'


/**
 * @param {Function} onCloseCb
 * @param {string} title
 * @param {string} message
 * @return {object} React component
 */
export default function Alert({onCloseCb, title = 'Oops', message}) {
  const [isOpen, setIsOpen] = useState(true)


  const handleClose = () => {
    setIsOpen(false)
    onCloseCb()
  }


  return (
    <Dialog
      open={isOpen}
      onClose={onCloseCb}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleClose}><CheckIcon/></IconButton>
      </DialogActions>
    </Dialog>
  )
}

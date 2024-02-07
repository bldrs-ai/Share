import React, {useState} from 'react'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import CheckIcon from '@mui/icons-material/Check'


/**
 * @property {Function} onCloseCb Called on close
 * @property {string} [title] Optional title. Default: 'Oops'
 * @return {React.ReactElement}
 */
export default function Alert({onCloseCb, title = 'Oops', children}) {
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
        <DialogContentText id="alert-dialog-description">{children}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleClose}><CheckIcon/></IconButton>
      </DialogActions>
    </Dialog>
  )
}

import React, {useState} from 'react'
import {Alert, AlertTitle, Snackbar} from '@mui/material'
import SlideDown from '../Transitions/SlideDown'


const Toast = ({visible, severity, title, closeTimeout, children}) => {
  const [visibility, setVisibility] = useState(visible !== false)
  const onClose = () => setVisibility(false)
  const alertTitle = title ? <AlertTitle>{title}</AlertTitle> : null

  return (
    <Snackbar
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center',
      }}
      autoHideDuration={closeTimeout}
      onClose={onClose}
      open={visibility}
      transitionDuration={{
        enter: 350,
        exit: 500,
      }}
      TransitionComponent={SlideDown}
    >
      <Alert severity={severity}>
        {alertTitle}
        {children}
      </Alert>
    </Snackbar>
  )
}

export default Toast

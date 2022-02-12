import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'


/**
 * @param {string} message
 * @param {string} type
 * @param {function} open
 * @return {Object}
 */
export default function SnackBarMessage({message, type, open}) {
  return (
    <Snackbar
      open={open}
      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
    >
      <Alert
        severity={type}
        sx = {{backgroundColor: '#848484'}}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}


const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props} />
})

import React from 'react'
import Snackbar from '@mui/material/Snackbar'


/**
 * @property {string} message Message for user
 * @property {string} severity Alert severity
 * @property {Function} open Progress callback
 * @return {object}
 */
export default function SnackBarMessage({message, severity, open}) {
  return (
    <Snackbar
      anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      open={open}
      message={message}
    />
  )
}

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
      style={{bottom: '1em'}}
      message={
        <div style={{wordWrap: 'break-word', whiteSpace: 'normal', maxWidth: '250px'}}>
          {message}
        </div>
      }
    />

  )
}

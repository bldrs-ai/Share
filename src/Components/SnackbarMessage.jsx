import React from 'react'
import Snackbar from '@mui/material/Snackbar'


/**
 * @property {string} message Message for user
 * @property {string} severity Alert severity
 * @property {Function} open Progress callback
 * @return {object}
 */
export default function SnackBarMessage({
  message,
  severity,
  open,
  anchorOrigin = {vertical: 'bottom', horizontal: 'center'},
  style = {bottom: '1em'}}) {
  return (
    <Snackbar
      anchorOrigin={anchorOrigin}
      open={open}
      style={style}
      message={
        <div style={{wordWrap: 'break-word', whiteSpace: 'normal', maxWidth: '250px'}}>
          {message}
        </div>
      }
    />

  )
}

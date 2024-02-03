import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import useStore from '../store/useStore'


/**
 * @property {Function} open Progress callback
 * @return {object}
 */
export default function SnackBarMessage() {
  const message = useStore((state) => state.snackMessage)
  return (
    <Snackbar
      anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      open={message !== ''}
      style={{bottom: '1em'}}
      message={
        <div style={{wordWrap: 'break-word', whiteSpace: 'normal', maxWidth: '250px'}}>
          {message}
        </div>
      }
    />

  )
}

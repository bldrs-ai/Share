import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import {makeStyles} from '@mui/styles'


/**
 * @param {string} message
 * @param {string} type
 * @param {function} open
 * @return {Object}
 */
export default function SnackBarMessage({message, type, open}) {
  const classes = useStyles()
  return (
    <Snackbar
      open={open}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      autoHideDuration={6000}
    >
      <Alert
        className={classes.alert}
        severity={type}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}


const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props} />
})


const useStyles = makeStyles({
  alert: {
    backgroundColor: '#787878',
    width: 'auto',
    paddingRight: 20,
    textTransform: 'uppercase',
  },
})

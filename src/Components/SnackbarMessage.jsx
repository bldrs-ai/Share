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
      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
    >
      <Alert
        severity={type}
        className = {classes.root}
        sx = {{backgroundColor: '#848484'}}
        icon={false}
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
  root: {
    'position': 'relative',
    'bottom': '70px',
    'left': '6px',
    '@media (max-width: 900px)': {
      left: '18px',
      bottom: '90px',
      width: '305px',
      inlineSize: '305px',
      overflow: 'visible',
      overflowWrap: 'anywhere',
    },
  }})


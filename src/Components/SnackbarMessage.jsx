import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import {useTheme} from '@mui/styles'


/**
 * @param {string} message
 * @param {string} type
 * @param {Function} open
 * @return {object}
 */
export default function SnackBarMessage({message, type, open}) {
  const theme = useTheme()


  return (
    <Snackbar
      open={open}
      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
    >
      <Alert
        sx={{
          'backgroundColor': theme.palette.primary.background,
          'color': theme.palette.primary.contrastText,
          'position': 'relative',
          'bottom': '90px',
          'left': '-6px',
          '@media (max-width: 900px)': {
            left: '18px',
            bottom: '110px',
            width: '305px',
            inlineSize: '305px',
            overflow: 'visible',
            overflowWrap: 'anywhere',
          },
        }}
        severity={type}
        elevation={0}
        icon={false}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}

const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props}/>
})

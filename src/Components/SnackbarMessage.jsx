import React from 'react'
import MuiAlert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import useTheme from '@mui/styles/useTheme'


/**
 * @property {string} message Message for user
 * @property {string} severity Alert severity
 * @property {Function} open Progress callback
 * @return {object}
 */
export default function SnackBarMessage({message, severity, open}) {
  const theme = useTheme()
  return (
    <Snackbar
      open={open}
      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
    >
      <Alert
        sx={{
          'color': theme.palette.primary.background,
          'backgroundColor': theme.palette.primary.main,
          'width': '20em',
          'borderRadius': '10px',
          'position': 'relative',
          'bottom': '2.5em',
          'left': '-.5em',
          '@media (max-width: 900px)': {
            left: '18px',
            bottom: '90px',
            width: '305px',
            inlineSize: '305px',
            overflow: 'visible',
            overflowWrap: 'anywhere',
          },
        }}
        severity={severity}
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

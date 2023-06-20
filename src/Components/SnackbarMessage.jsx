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
          'backgroundColor': theme.palette.background.control,
          'color': theme.palette.primary.contrastText,
          'boxShadow': '0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)',
          'position': 'relative',
          'bottom': '60px',
          'left': '-6px',
          'fontWeight': 500,
          'maxWidth': '450px',
          '@media (max-width: 900px)': {
            left: '18px',
            bottom: '80px',
            width: '256px',
            inlineSize: '256px',
            overflow: 'visible',
            fontSize: '1em',
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

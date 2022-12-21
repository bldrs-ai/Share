import React, {useContext} from 'react'
import {Snackbar} from '@mui/material'
import MuiAlert from '@mui/material/Alert'
import {ColorModeContext} from '../Context/ColorMode'


/**
 * @param {string} message
 * @param {string} type
 * @param {Function} open
 * @return {object}
 */
export default function SnackBarMessage({message, type, open}) {
  const colorMode = useContext(ColorModeContext)


  return (
    <Snackbar
      open={open}
      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
    >
      <Alert
        sx={{
          'backgroundColor': colorMode.isDay() ? '#A9A9A9' : '#4C4C4C',
          'opacity': .8,
          'position': 'relative',
          'bottom': '60px',
          'left': '6px',
          '@media (max-width: 900px)': {
            left: '18px',
            bottom: '70px',
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

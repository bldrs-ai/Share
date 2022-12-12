import React, {useContext} from 'react'
import Switch from '@mui/material/Switch'
import {ColorModeContext} from '../Context/ColorMode'


/**
 * Toggle Switch
 *
 * @param {string} installPrefix node
 * @return {object} React component
 */
export default function Toggle({onChange, checked}) {
  const theme = useContext(ColorModeContext).getTheme()
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      sx={{
        '& .MuiSwitch-root': {
          float: 'right',
        },
        '& .MuiSwitch-track': {
          backgroundColor: theme.palette.highlight.heavy,
          border: 'solid 1px grey',
        },
        '& .MuiSwitch-thumb': {
          backgroundColor: theme.palette.highlight.main,
        },
        '&$checked': {
          backgroundColor: 'green',
        },
      }}
    />
  )
}

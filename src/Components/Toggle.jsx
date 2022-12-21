import React, {useContext} from 'react'
import {Switch} from '@mui/material'
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
        '& .MuiSwitch-thumb': {
          backgroundColor: theme.palette.highlight.main,
        },
        '& .MuiSwitch-track': {
          backgroundColor: theme.palette.highlight.heavier,
        },
        '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': {
          backgroundColor: theme.palette.highlight.secondary,
        },
      }}
    />
  )
}

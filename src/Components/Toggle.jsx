import React from 'react'
import Switch from '@mui/material/Switch'
import {useTheme} from '@mui/styles'


/**
 * Toggle Switch
 *
 * @property {Function} onChange callback
 * @property {boolean} checked react state
 * @return {React.ReactElement} React component
 */
export default function Toggle({onChange, checked}) {
  const theme = useTheme()
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

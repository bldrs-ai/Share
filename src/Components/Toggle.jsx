import React from 'react'
import Switch from '@mui/material/Switch'
import useTheme from '@mui/styles/useTheme'


/**
 * Toggle Switch
 *
 * @property {Function} onChange callback
 * @property {boolean} checked react state
 * @return {React.ReactComponent}
 */
export default function Toggle({onChange, checked}) {
  const theme = useTheme()
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      sx={{
        '& .MuiSwitch-thumb': {
          backgroundColor: theme.palette.secondary.main,
        },
        '& .MuiSwitch-track': {
          backgroundColor: theme.palette.primary.background,
          border: `solid 1px ${theme.palette.primary.main}`,
        },
        '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': {
          backgroundColor: theme.palette.secondary.main,
        },
      }}
    />
  )
}

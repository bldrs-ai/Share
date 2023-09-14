import React from 'react'
import Switch from '@mui/material/Switch'


/**
 * Toggle Switch
 *
 * @property {Function} onChange callback
 * @property {boolean} checked react state
 * @return {React.ReactComponent}
 */
export default function Toggle({onChange, checked}) {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
    />
  )
}

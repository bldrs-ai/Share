import React from 'react'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'


/**
 * Toggle Switch
 *
 * @property {Function} onChange callback
 * @property {boolean} checked react state
 * @property {sting} label the name next to the toggle
 * @property {string} labelPlacement the location of the label relative to the toggle
 * @return {React.ReactComponent}
 */
export default function Toggle({onChange, checked, label = '', labelPlacement = 'start'}) {
  return (
    <FormControlLabel
      control={
        <Switch
          checked={checked}
          onChange={onChange}
        />}
      label={label}
      labelPlacement={labelPlacement}
    />
  )
}


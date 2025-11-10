import React, {ReactElement} from 'react'
import {Switch} from '@mui/material'


/**
 * Toggle Switch
 *
 * @property {Function} onChange callback
 * @property {boolean} checked react state
 * @return {ReactElement}
 */
export default function Toggle({onChange, checked, ...props}) {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      {...props}
    />
  )
}

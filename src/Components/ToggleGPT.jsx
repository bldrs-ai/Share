import React from 'react'
import {makeStyles} from '@material-ui/core/styles'
import Switch from '@material-ui/core/Switch'


const useStyles = makeStyles({
  track: {
    backgroundColor: 'lime',
    border: '1px solid black',
  },
  thumb: {
    backgroundColor: 'yellow',
  },
  checked: {
    '& .MuiSwitch-track': {
      backgroundColor: 'blue',
      border: '1px solid blue',
    },
    '& .MuiSwitch-thumb': {
      backgroundColor: 'lime',
    },
  },
})

/**
 * Button to toggle About panel on and off
 *
 * @param {string} installPrefix For use in static asset links.
 * @return {object} The AboutControl react component.
 */
function Toggle({onChange, checked}) {
  const classes = useStyles()

  return (
    <Switch
      checked={checked}
      onChange={onChange}
      classes={{
        track: classes.track,
        thumb: classes.thumb,
        checked: classes.checked,
      }}
    />
  )
}

export default Toggle

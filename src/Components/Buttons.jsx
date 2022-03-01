import React, {useState} from 'react'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'


/**
 * @param {string} title Tooltip text
 * @param {function} onClick
 * @param {Object} icon
 * @param {string} placement
 * @param {string} size
 * @return {Object} React component
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  placement='left',
  size='medium',
}) {
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <IconButton onClick={onClick} size={size}>
          {icon}
        </IconButton>
      </Tooltip>
    </div>
  )
}


/**
 * @param {string} title Tooltip text
 * @param {string} toggleValue Unique key for toggle group
 * @param {function} onClick
 * @param {Object} icon
 * @param {string} placement Default: left
 * @return {Object} React component
 */
export function TooltipToggleButton({
  title,
  toggleValue,
  onClick,
  icon,
  placement='left',
}) {
  const [isPressed, setIsPressed] = useState(false)
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <ToggleButton
          value={toggleValue}
          selected={isPressed}
          onClick={(event) => {
            setIsPressed(!isPressed)
            if (event === null || event === undefined) throw new Error('Undefined event!')
            onClick(event)
          }}
          color='success'>
          {icon}
        </ToggleButton>
      </Tooltip>
    </div>)
}


/**
 * @param {string} title The text for tooltip
 * @param {string} toggleValue Unique key for toggle group
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @param {Object} icon The header icon
 * @param {string} placement Default: left
 * @param {Object} dialog The controlled dialog
 * @return {Object} React component
 */
export function ControlButton({
  title,
  toggleValue,
  isDialogDisplayed,
  setIsDialogDisplayed,
  icon,
  placement='left',
  dialog,
}) {
  const toggleIsDialogDisplayed = () => setIsDialogDisplayed(!isDialogDisplayed)
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement='left'>
        <ToggleButton
          value={toggleValue}
          selected={isDialogDisplayed}
          onClick={toggleIsDialogDisplayed}
          color='success'>
          {icon}
        </ToggleButton>
      </Tooltip>
      {isDialogDisplayed && dialog}
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    '& button': {
      width: '50px',
      height: '50px',
      border: 'none',
      borderRadius: '50%',
    },
    '& svg': {
      width: '30px',
      height: '30px',
      border: 'none',
      borderRadius: '50%',
      backgroundColor: 'white',
    },
  },
})

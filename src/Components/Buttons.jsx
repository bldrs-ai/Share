import React, {useState} from 'react'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import {assertDefined} from '../utils/assert'


/**
 * @param {string} title Tooltip text
 * @param {function} onClick
 * @param {Object} icon
 * @param {string} placement
 * @param {string} size
 * @param {string} dataTestId Internal attribute for component testing
 * @return {Object} React component
 */
export const TooltipIconButton = ({
  title,
  onClick,
  icon,
  placement = 'right',
  size = 'medium',
  dataTestId = 'test-button',
}) => {
  assertDefined(title, icon, onClick)
  const classes = useStyles(useTheme())

  return (
    <Tooltip classes={{tooltip: classes.root}} title={title} describeChild placement={placement}
      data-testid={dataTestId}>
      <IconButton className = {classes.root} onClick={onClick} size={size}>
        {icon}
      </IconButton>
    </Tooltip>
  )
}


/**
 * @param {function} onClick
 * @param {string} title Tooltip text
 * @param {Object} icon
 * @param {string} placement Default: left
 * @return {Object} React component
 */
export function TooltipToggleButton({
  onClick,
  title,
  icon,
  placement='left',
}) {
  assertDefined(title, icon, onClick)
  const [isPressed, setIsPressed] = useState(false)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <ToggleButton
          value={title}
          selected={isPressed}
          onClick={(event) => {
            setIsPressed(!isPressed)
            if (event === null || event === undefined) {
              console.error('Buttons#TooltipToggleButton: undefined event')
            }
            if (onClick) {
              onClick(event)
            }
          }}
          color='primary'>
          {icon}
        </ToggleButton>
      </Tooltip>
    </div>)
}


/**
 * @param {string} title The text for tooltip
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @param {Object} icon The header icon
 * @param {string} placement Default: left
 * @param {Object} dialog The controlled dialog
 * @return {Object} React component
 */
export function ControlButton({
  title,
  isDialogDisplayed,
  setIsDialogDisplayed,
  icon,
  placement='left',
  dialog,
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)
  const toggleIsDialogDisplayed = () => setIsDialogDisplayed(!isDialogDisplayed)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <ToggleButton
          value={title}
          selected={isDialogDisplayed}
          onClick={toggleIsDialogDisplayed}
          color='primary'>
          {icon}
        </ToggleButton>
      </Tooltip>
      {isDialogDisplayed && dialog}
    </div>
  )
}


/**
 * A FormButton is a TooltipIconButton but with parameterized type for
 * form actions.
 * @param {string} title
 * @param {Object} icon
 * @return {Object} React component
 */
export function FormButton({title, icon, type='submit', placement='left', size='medium'}) {
  assertDefined(title, icon)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <IconButton type={type} size={size}>
          {icon}
        </IconButton>
      </Tooltip>
    </div>
  )
}


/**
 * @param {string} fullString Tooltip text
 * @param {function} onClick
 * @param {string} placement
 * @param {string} size
 * @return {Object} React component
 */
export function TooltipLetterButton({
  fullString,
  onClick,
  placement='right',
  size='medium',
}) {
  assertDefined(fullString, onClick)
  if (fullString.length == 0) {
    throw new Error('Cannot make a TooltipLetterButton with empty string')
  }
  const classes = useStyles(useTheme())
  const innerTextLetter = fullString.charAt(0).toUpperCase()
  return (
    <div className={classes.root}>
      <Tooltip title={fullString} describeChild placement={placement}>
        <button onClick={onClick}>
          <Typography variant='p' color='info'>{innerTextLetter}</Typography>
        </button>
      </Tooltip>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
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
      fill: theme.palette.primary.contrastText,
    },
  },
}))

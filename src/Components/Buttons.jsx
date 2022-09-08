import React from 'react'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles, useTheme} from '@mui/styles'
import {assertDefined} from '../utils/assert'


/**
 * @param {string} title Tooltip text
 * @param {Function} onClick
 * @param {object} icon
 * @param {string} placement
 * @param {boolean} selected
 * @param {string} dataTestId Internal attribute for component testing
 * @return {React.Component} React component
 */
export function TooltipIconButton({title, onClick, icon, placement = 'left', selected = false}) {
  assertDefined(icon, onClick, title)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement} data-testid="test-button">
        <ToggleButton
          selected={selected}
          onClick={onClick}
          color='primary'
        >
          {icon}
        </ToggleButton>
      </Tooltip>
    </div>
  )
}

/**
 * A RectangularButton is used in dialogs
 *
 * @param {string} title
 * @param {object} icon
 * @param {string} type Type of button (and icon to render)
 * @param {string} placement Placement of tooltip
 * @param {string} size Size of button component
 * @return {object} React component
 */
export function RectangularButton({
  title,
  icon,
  onClick,
}) {
  assertDefined(title, icon, onClick)
  return (
    <Button
      onClick={onClick}
      variant='rectangular'
      startIcon={icon}
      sx={{
        '& .MuiButton-startIcon': {position: 'absolute', left: '20px'},
        '&.MuiButtonBase-root:hover': {bgcolor: 'none'},
      }}
    >
      {title}
    </Button>
  )
}

/**
 * @param {string} title The text for tooltip
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {object} icon The header icon
 * @param {string} placement Default: left
 * @param {string} size Size of button component
 * @param {object} dialog The controlled dialog
 * @return {React.Component} React component
 */
export function ControlButton({
  title,
  isDialogDisplayed,
  setIsDialogDisplayed,
  icon,
  placement = 'left',
  dialog,
  state = false,
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)
  const classes = useStyles(useTheme())
  return (
    <div>
      <div className={classes.root}>
        <Tooltip title={title} describeChild placement={placement}>
          <ToggleButton
            className={classes.root}
            selected={isDialogDisplayed}
            onClick={setIsDialogDisplayed}
            color='primary'
          >
            {icon}
          </ToggleButton>
        </Tooltip>
      </div>
      {isDialogDisplayed && dialog}
    </div>
  )
}


/**
 * A FormButton is a TooltipIconButton but with parameterized type for
 * form actions.
 *
 * @param {string} title
 * @param {object} icon
 * @param {string} type Type of button (and icon to render)
 * @param {string} placement Placement of tooltip
 * @param {string} size Size of button component
 * @return {React.Component} React component
 */
export function FormButton({title, icon, placement = 'left'}) {
  assertDefined(title, icon)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <ToggleButton
          type='submit'
          className={classes.root}
          selected={false}
          color='primary'
        >
          {icon}
        </ToggleButton>
      </Tooltip>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    opacity: .9,
    height: '340px',
  },
  root: {
    '& button': {
      'width': '40px',
      'height': '40px',
      'border': 'none ',
      '&.Mui-selected, &.Mui-selected:hover': {
        backgroundColor: '#97979770',
      },
    },
    '& svg': {
      width: '22px',
      height: '22px',
      fill: theme.palette.primary.contrastText,
    },
  },
  iconContainer: {
    width: '20px',
    height: '20px',
  },
}))


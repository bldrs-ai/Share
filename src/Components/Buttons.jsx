import React from 'react'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles, useTheme} from '@mui/styles'
import {assertDefined} from '../utils/assert'
import {useIsMobile} from './Hooks'


/**
 * @param {string} title Tooltip text
 * @param {Function} onClick
 * @param {object} icon
 * @param {string} placement
 * @param {boolean} selected
 * @param {string} dataTestId Internal attribute for component testing
 * @return {React.Component} React component
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  placement = 'left',
  selected = false,
  dataTestId = '',
}) {
  assertDefined(icon, onClick, title)
  const classes = useStyles(useTheme())
  const isMobile = useIsMobile()
  return (
    <div className={classes.root}>
      {isMobile ?
       <ToggleButton
         selected={selected}
         onClick={onClick}
         color='primary'
         value={''}
       >
         {icon}
       </ToggleButton> :
       <Tooltip title={title} describeChild placement={placement} data-testid={dataTestId}>
         <ToggleButton
           selected={selected}
           onClick={onClick}
           color='primary'
           value={''}
         >
           {icon}
         </ToggleButton>
       </Tooltip>
      }
    </div>
  )
}

/**
 * A RectangularButton is used in dialogs
 *
 * @param {string} title
 * @param {object} icon
 * @param {Function} onClick
 * @param {boolean} border Default: false
 * @param {boolean} background Default: true
 * @return {object} React component
 */
export function RectangularButton({
  title,
  onClick,
  icon = null,
  border = false,
  background = true,
}) {
  assertDefined(title, onClick)
  return (
    <Button onClick={onClick} variant='contained' startIcon={icon}>
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
            onClick={() => {
              setIsDialogDisplayed(true)
            }}
            color='primary'
            value={''}
          >
            {icon}
          </ToggleButton>
        </Tooltip>
      </div>
      {isDialogDisplayed && dialog}
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  root: {
    '& button': {
      border: 'none',
      margin: '4px 0px',
    },
  },
}))


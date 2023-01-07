import React from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import {assertDefined} from '../utils/assert'
import {useIsMobile} from './Hooks'


/**
 * @property {string} title Tooltip text
 * @property {Function} onClick callback
 * @property {object} icon button icon
 * @property {string} placement Tooltip location. Default: left
 * @property {boolean} selected Selected state.  Default: false
 * @property {string} dataTestId Internal attribute for component testing. Default: ''
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
  const isMobile = useIsMobile()


  return (
    <Box>
      {isMobile ?
       <ToggleButton selected={selected} onClick={onClick} value={''}>
         {icon}
       </ToggleButton> :
       <Tooltip title={title} describeChild placement={placement} data-testid={dataTestId}>
         <ToggleButton selected={selected} onClick={onClick} value={''}>
           {icon}
         </ToggleButton>
       </Tooltip>
      }
    </Box>
  )
}


/**
 * A RectangularButton is used in dialogs
 *
 * @property {string} title Text to show in button
 * @property {Function} onClick callback
 * @property {object} icon Start icon to left of text
 * @property {boolean} border Default: false
 * @property {boolean} background Default: true
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
  return <Button onClick={onClick} startIcon={icon} variant='rectangular'>{title}</Button>
}


/**
 * @property {string} title The text for tooltip
 * @property {boolean} isDialogDisplayed Initial state
 * @property {Function} setIsDialogDisplayed Handler
 * @property {object} icon The header icon
 * @property {object} dialog The controlled dialog
 * @property {string} placement Default: left
 * @return {React.Component} React component
 */
export function ControlButton({
  title,
  isDialogDisplayed,
  setIsDialogDisplayed,
  icon,
  dialog,
  placement = 'left',
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)


  return (
    <Box>
      <TooltipIconButton
        title={title}
        icon={icon}
        selected={isDialogDisplayed}
        onClick={() => setIsDialogDisplayed(true)}
      />
      {isDialogDisplayed && dialog}
    </Box>
  )
}

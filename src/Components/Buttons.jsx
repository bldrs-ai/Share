import React from 'react'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import {assertDefined} from '../utils/assert'
import useStore from '../store/useStore'
import BackIcon from '../assets/icons/Back.svg'
import ExpandIcon from '../assets/icons/Expand.svg'


/**
 * @property {string} tooltip Tooltip text
 * @property {Function} onClick callback
 * @property {object} icon button icon
 * @property {boolean} [selected] Selected state.  Default: false
 * @property {string} [placement] Tooltip location enum: right (default), left, top, bottom
 * @property {string} [size] Size enum: small (default), medium or large
 * @property {string} [variant] Style enum: rounded (default) or rectangular
 * @property {boolean} [isHelpTooltip] Whether acts as help tooltip.
 * @return {React.Component} React component
 */
export function TooltipIconButton({
  tooltip,
  onClick,
  icon,
  placement = 'right',
  selected = false,
  size = 'medium',
  variant = 'rounded',
  isHelpTooltip = true,
}) {
  assertDefined(tooltip, onClick, icon)
  const [openLocal, setOpenLocal] = React.useState(false)
  const isHelpTooltips = useStore((state) => state.isHelpTooltips)
  const open = isHelpTooltip && isHelpTooltips
  const handleClose = () => {
    setOpenLocal(false)
  }
  const handleOpen = () => {
    setOpenLocal(true)
  }
  return (
    <>
      <Tooltip
        open={openLocal || open}
        onClose={handleClose}
        onOpen={handleOpen}
        title={tooltip}
        describeChild
        placement={placement}
        data-testid={tooltip}
        PopperProps={{style: {zIndex: 0}}}
      >
        <ToggleButton selected={selected} onClick={onClick} value={''} size={size} variant={variant}>
          {icon}
        </ToggleButton>
      </Tooltip>
    </>
  )
}


/**
 * Displayed as an icon with tooltip.
 *
 * @property {object} icon The icon is the only visual element of the button.
 * @property {string} tooltip The text for tooltip
 * @property {object} dialog The controlled dialog
 * @property {boolean} isDialogDisplayed Initial state
 * @property {Function} setIsDialogDisplayed Handler
 * @property {string} [placement] Default: left
 * @property {string} [variant] Default: rounded
 * @return {React.Component}
 */
export function ControlButton({
  icon,
  tooltip,
  dialog,
  isDialogDisplayed,
  setIsDialogDisplayed,
  placement = 'left',
  variant = 'rounded',
}) {
  assertDefined(icon, tooltip, dialog, isDialogDisplayed, setIsDialogDisplayed)
  return (
    <>
      <TooltipIconButton
        tooltip={tooltip}
        icon={icon}
        onClick={() => setIsDialogDisplayed(true)}
        selected={isDialogDisplayed}
        variant={variant}
      />
      {isDialogDisplayed && dialog}
    </>
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.Component}
 */
export function CloseButton({onClick}) {
  assertDefined(onClick)
  return (
    <TooltipIconButton
      tooltip='Close'
      icon={<CloseIcon className='icon-share icon-small'/>}
      onClick={onClick}
      placement='bottom'
      isHelpTooltip={false}
      variant='noBackground'
    />
  )
}


/**
 * A RectangularButton is used in dialogs
 *
 * @property {string} title Text to show in button
 * @property {Function} onClick callback
 * @property {object} [icon] Start icon to left of text
 * @property {boolean} [border] Default: false
 * @property {boolean} [background] Default: true
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
    icon ?
      <Button onClick={onClick} startIcon={icon} variant='rectangular'>{title}</Button> :
      <Button onClick={onClick} variant='rectangular'>{title}</Button>
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.Component}
 */
export function FullScreenButton({onClick}) {
  return (
    <TooltipIconButton
      tooltip='Full screen'
      icon={<ExpandIcon className='icon-share'/>}
      onClick={onClick}
      size='medium'
    />
  )
}


/**
 * @property {Function} onClick Handler for back event.
 * @return {React.Component}
 */
export function BackButton({onClick}) {
  return (
    <TooltipIconButton
      tooltip='Back'
      icon={<BackIcon className='icon-share'/>}
      onClick={onClick}
      size='medium'
    />
  )
}

import React from 'react'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import {assertDefined} from '../utils/assert'
import useStore from '../store/useStore'
import ExpandIcon from '../assets/icons/Expand.svg'
import BackIcon from '../assets/icons/Back.svg'
import CloseIcon from '@mui/icons-material/Close'


/**
 * @property {string} title Tooltip text
 * @property {Function} onClick callback
 * @property {object} icon button icon
 * @property {boolean} [enabled] Whether the button can be clicked.  Default: true
 * @property {string} [placement] Tooltip location. Default: left
 * @property {boolean} [selected] Selected state.  Default: false
 * @property {string} [size] Size enum: 'small', 'medium' or 'large'.  Default: 'medium'
 * @property {string} dataTestId Internal attribute for component testing. Default: ''
 * @return {React.Component} React component
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  enabled = true,
  placement = 'right',
  selected = false,
  size = 'medium',
  dataTestId = '',
  aboutInfo = true,
  variant = 'rounded',
}) {
  assertDefined(title, onClick, icon)
  const [openLocal, setOpenLocal] = React.useState(false)
  const isHelpTooltips = useStore((state) => state.isHelpTooltips)
  const open = aboutInfo ? isHelpTooltips : false
  const handleClose = () => {
    setOpenLocal(false)
  }
  const handleOpen = () => {
    setOpenLocal(true)
  }
  return (
    <Tooltip
      open={openLocal || open}
      onClose={handleClose}
      onOpen={handleOpen}
      title={title}
      describeChild
      placement={placement}
      data-testid={dataTestId || title}
      PopperProps={{style: {zIndex: 0}}}
    >
      <ToggleButton
        selected={selected}
        onClick={onClick}
        value={''}
        size={size}
        variant={variant}
        disabled={!enabled}
        sx={{
          // TODO(pablo): couldn't figure how to set this in theme
          opacity: enabled ? '1.0' : '0.35',
        }}
      >
        {icon}
      </ToggleButton>
    </Tooltip>
  )
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
  variant = 'rounded',
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)
  return (
    <>
      <TooltipIconButton
        title={title}
        onClick={() => setIsDialogDisplayed(true)}
        icon={icon}
        selected={isDialogDisplayed}
        className='icon-share'
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
  return (
    <TooltipIconButton
      title='Close'
      onClick={onClick}
      placement='bottom'
      icon={<CloseIcon className='icon-share icon-small'/>}
      aboutInfo={false}
      className='closeButton'
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
  disabled = false,
}) {
  assertDefined(title, onClick)
  return (
    icon ?
      <Button onClick={onClick} startIcon={icon} variant='rectangular'>{title}</Button> :
      <Button onClick={onClick} variant='rectangular' disabled={disabled}>{title}</Button>
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.Component}
 */
export function FullScreenButton({onClick}) {
  return (
    <TooltipIconButton
      title='Full screen'
      onClick={onClick}
      icon={<ExpandIcon style={{width: '15px', height: '15px'}}/>}
      size='medium'
    />
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.Component}
 */
export function BackButton({onClick}) {
  return (
    <TooltipIconButton
      title='Back'
      onClick={onClick}
      icon={<BackIcon style={{width: '15px', height: '15px'}}/>}
      size='medium'
    />
  )
}

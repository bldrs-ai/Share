import React, {ReactElement, useEffect, useState} from 'react'
import {useLocation} from 'react-router'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import SvgIcon from '@mui/material/SvgIcon'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {addHashParams, hasHashParams, removeHashParams} from '../utils/location'
import {useIsMobile} from './Hooks'
import CloseIcon from '@mui/icons-material/Close'
import ExpandIcon from '../assets/icons/Expand.svg'
import BackIcon from '../assets/icons/Back.svg'


/**
 * An icon button with a tooltip.  The button will use a given dataTestId or the
 * tip title as the data-testid on the button.
 *
 * @property {string} title Tooltip text
 * @property {Function} onClick Callback
 * @property {object} icon Button icon
 * @property {string} placement Tooltip placement
 * @property {Array<ReactElement>} [children] Optional child elts, e.g. a hosted dialog
 * @property {boolean} [enabled] Whether the button can be clicked.  Default: true
 * @property {boolean} [selected] Selected state.  Default: false
 * @property {string} [size] Size enum: 'small', 'medium' or 'large'.  Default: 'medium'
 * @property {string} [dataTestId] Internal attribute for component testing.
 * @return {ReactElement}
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  placement,
  children,
  enabled = true,
  selected = false,
  color,
  size,
  variant,
  dataTestId,
}) {
  assertDefined(title, onClick, icon, placement)
  const isMobile = useIsMobile()
  const isHelpTooltipsVisible = useStore((state) => state.isHelpTooltipsVisible) && !isMobile
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  // This moves the tooltip close to the icon instead of edge of button, which
  // has a large margin.  Just eyeballed.
  const offset = -15
  return (
    <Tooltip
      open={isHelpTooltipsVisible || isTooltipVisible}
      onClose={() => setIsTooltipVisible(false)}
      onOpen={() => setIsTooltipVisible(true)}
      title={title}
      describeChild
      placement={placement}
      PopperProps={{style: {zIndex: 0}}}
      arrow={true}
      enterDelay={1000}
      slotProps={{
        popper: {
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, offset],
              },
            },
          ],
        },
      }}
    >
      <ToggleButton
        selected={selected}
        onClick={onClick}
        value=''
        size={size}
        color={color}
        variant={variant}
        disabled={!enabled}
        data-testid={dataTestId || title}
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
 * @property {object} icon The header icon
 * @property {boolean} isDialogDisplayed Initial state
 * @property {Function} setIsDialogDisplayed Handler
 * @property {object} children The controlled dialog
 * @property {string} [placement] See default in TooltipIconButton
 * @property {string} [variant] See default in TooltipIconButton
 * @return {ReactElement}
 */
export function ControlButton({
  title,
  icon,
  isDialogDisplayed,
  setIsDialogDisplayed,
  children,
  dataTestId,
  ...props
}) {
  assertDefined(title, icon, isDialogDisplayed, setIsDialogDisplayed)
  return (
    <>
      <TooltipIconButton
        title={title}
        onClick={() => setIsDialogDisplayed(!isDialogDisplayed)}
        icon={icon}
        selected={isDialogDisplayed}
        variant='control'
        color='success'
        size='small'
        dataTestId={dataTestId || `control-button-${title.toLowerCase()}`}
        {...props}
      />
      {children}
    </>
  )
}


/**
 * ControlButtonWithHashState component that accepts a hashPrefix parameter
 * and forwards the rest of the props to the ControlButton component
 *
 * @property {string} hashPrefix The hash prefix for storing state
 * @property {string} props See ControlButton
 * @return {ReactElement}
 */
export function ControlButtonWithHashState({
  hashPrefix,
  isDialogDisplayed,
  setIsDialogDisplayed,
  children,
  ...props
}) {
  assertDefined(hashPrefix, isDialogDisplayed, setIsDialogDisplayed)

  const location = useLocation()
  useEffect(() => {
    // If dialog displayed by initial state value (e.g. About for isFirstTime)
    // or if hashPrefix is present
    const isActiveHash = hasHashParams(window.location, hashPrefix)
    if (isDialogDisplayed) {
      if (!isActiveHash) {
        addHashParams(window.location, hashPrefix)
      }
    } else if (isActiveHash) {
      removeHashParams(window.location, hashPrefix)
    }
  }, [hashPrefix, isDialogDisplayed, location])

  return (
    <ControlButton
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={() => setIsDialogDisplayed(!isDialogDisplayed)}
      {...props}
    >
      {children}
    </ControlButton>
  )
}


/**
 * @property {Function} onCloseClick Handler for close event.
 * @return {ReactElement}
 */
export function CloseButton({onCloseClick, ...props}) {
  return (
    <IconButton
      title='Close'
      onClick={onCloseClick}
      size='small'
      disableFocusRipple={true}
      disableRipple={true}
      {...props}
    >
      <CloseIcon className='icon-share'/>
    </IconButton>
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
  disabled = false,
}) {
  assertDefined(title, onClick)
  return (
    icon ?
      <Button onClick={onClick} startIcon={icon} variant='contained'>{title}</Button> :
      <Button onClick={onClick} variant='contained' disabled={disabled}>{title}</Button>
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {ReactElement}
 */
export function FullScreenButton({onClick}) {
  return (
    <TooltipIconButton
      title='Full screen'
      onClick={onClick}
      icon={<ExpandIcon style={{width: '15px', height: '15px'}}/>}
      placement='left'
      size='medium'
    />
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {ReactElement}
 */
export function BackButton({onClick}) {
  return (
    <TooltipIconButton
      title='Back'
      onClick={onClick}
      icon={<SvgIcon><BackIcon className='icon-share'/></SvgIcon>}
      placement='left'
      size='medium'
    />
  )
}

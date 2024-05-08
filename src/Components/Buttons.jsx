import React, {ReactElement, useEffect, useState} from 'react'
import {useLocation} from 'react-router'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
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
 * An icon button with a tooltip.  THe button will use a given buttonTestId or
 * the tip title as the data-testid on the button.
 *
 * @property {string} title Tooltip text
 * @property {Function} onClick Callback
 * @property {object} icon Button icon
 * @property {string} placement Tooltip placement
 * @property {boolean} [enabled] Whether the button can be clicked.  Default: true
 * @property {boolean} [selected] Selected state.  Default: false
 * @property {string} [size] Size enum: 'small', 'medium' or 'large'.  Default: 'medium'
 * @property {string} [buttonTestId] Internal attribute for component testing.
 * @return {ReactElement}
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  placement,
  enabled = true,
  selected = false,
  aboutInfo = true,
  color,
  size,
  variant,
  buttonTestId,
}) {
  assertDefined(title, onClick, icon, placement)
  const isMobile = useIsMobile()
  const isHelpTooltipsVisible = useStore((state) => state.isHelpTooltipsVisible) && !isMobile

  const [openLocal, setOpenLocal] = useState(false)

  return (
    <Tooltip
      open={isHelpTooltipsVisible || openLocal}
      onClose={() => setOpenLocal(false)}
      onOpen={() => setOpenLocal(aboutInfo)}
      title={title}
      describeChild
      placement={placement}
      PopperProps={{style: {zIndex: 0}}}
    >
      <ToggleButton
        selected={selected}
        onClick={onClick}
        value={''}
        size={size}
        color={color}
        variant={variant}
        disabled={!enabled}
        data-testid={buttonTestId || title}
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
  ...props
}) {
  assertDefined(title, icon, isDialogDisplayed, setIsDialogDisplayed)
  return (
    <>
      <TooltipIconButton
        title={title}
        icon={icon}
        onClick={() => setIsDialogDisplayed(!isDialogDisplayed)}
        selected={isDialogDisplayed}
        variant='control'
        color='success'
        size='small'
        buttonTestId={props['data-testid'] || `control-button-${title.toLowerCase()}`}
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


  /*
  // On first load, show dialog if state token present
  useEffect(() => {
    setIsDialogDisplayed(getHashParams(window.location, hashPrefix) !== undefined)
  }, [hashPrefix, location, setIsDialogDisplayed])

  // Enforce invariant
  useEffect(() => {
    if (isDialogDisplayed) {
      console.log('Buttons#ControlButtonWithHashState#useEffect, isDialogDisplayed: true, adding hash param')
      addHashParams(window.location, hashPrefix)
    } else {
      console.log('Buttons#ControlButtonWithHashState#useEffect, isDialogDisplayed: false, removing hash param')
      const currentHash = window.location.hash
      const prefixRegex = new RegExp(`${hashPrefix}:[^;]*;?`, 'g')
      const newHash = currentHash.replace(prefixRegex, '')
      window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
    }
  }, [hashPrefix, isDialogDisplayed])
*/
  return (
    <ControlButton
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={() => setIsDialogDisplayed(!isDialogDisplayed)}
      {...props}
    />
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
  border = false,
  background = true,
  disabled = false,
}) {
  assertDefined(title, onClick)
  return (
    icon ?
      <Button onClick={onClick} startIcon={icon} variant='rectangular' color='secondary'>{title}</Button> :
      <Button onClick={onClick} variant='rectangular' color='secondary' disabled={disabled}>{title}</Button>
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
      icon={<BackIcon style={{width: '15px', height: '15px'}}/>}
      size='medium'
    />
  )
}

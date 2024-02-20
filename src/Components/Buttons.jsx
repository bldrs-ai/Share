import React, {useCallback, useEffect, useState} from 'react'
import {useLocation} from 'react-router'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import CloseIcon from '@mui/icons-material/Close'
import ExpandIcon from '../assets/icons/Expand.svg'
import BackIcon from '../assets/icons/Back.svg'


/**
 * An icon button with a tooltip.
 *
 * @property {string} title Tooltip text
 * @property {Function} onClick callback
 * @property {object} icon button icon
 * @property {boolean} [enabled] Whether the button can be clicked.  Default: true
 * @property {string} [placement] Tooltip location.  Default: right
 * @property {boolean} [selected] Selected state.  Default: false
 * @property {string} [size] Size enum: 'small', 'medium' or 'large'.  Default: 'medium'
 * @property {string} dataTestId Internal attribute for component testing.  Default: ''
 * @return {React.ReactElement}
 */
export function TooltipIconButton({
  title,
  onClick,
  icon,
  enabled = true,
  selected = false,
  size = 'medium',
  variant = 'rounded',
  placement = 'right',
  aboutInfo = true,
  dataTestId = '',
}) {
  assertDefined(title, onClick, icon)
  const isHelpTooltips = useStore((state) => state.isHelpTooltips)

  const [openLocal, setOpenLocal] = useState(false)

  const open = aboutInfo ? isHelpTooltips : false

  return (
    <Tooltip
      open={openLocal || open}
      onClose={() => setOpenLocal(false)}
      onOpen={() => setOpenLocal(true)}
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
 * @property {object} icon The header icon
 * @property {boolean} isDialogDisplayed Initial state
 * @property {Function} setIsDialogDisplayed Handler
 * @property {object} children The controlled dialog
 * @property {string} [placement] See default in TooltipIconButton
 * @property {string} [variant] See default in TooltipIconButton
 * @return {React.ReactElement}
 */
export function ControlButton({
  title,
  icon,
  isDialogDisplayed,
  setIsDialogDisplayed,
  children,
  placement,
  variant,
}) {
  assertDefined(title, icon, isDialogDisplayed, setIsDialogDisplayed)
  return (
    <>
      <TooltipIconButton
        title={title}
        icon={icon}
        onClick={() => setIsDialogDisplayed(!isDialogDisplayed)}
        selected={isDialogDisplayed}
        variant={variant}
        placement={placement}
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
 * @return {React.ReactElement}
 */
export function ControlButtonWithHashState({
  hashPrefix,
  isDialogDisplayed,
  setIsDialogDisplayed,
  ...props
}) {
  assertDefined(hashPrefix, isDialogDisplayed, setIsDialogDisplayed)

  const location = useLocation()

  // On first load, show dialog if state token present
  useEffect(() => {
    setIsDialogDisplayed(getHashParams(location, hashPrefix) !== undefined)
  }, [hashPrefix, location, setIsDialogDisplayed])

  // Enforce invariant
  useEffect(() => {
    // TODO(pablo): useNavigate
    if (isDialogDisplayed) {
      addHashParams(window.location, hashPrefix)
    } else {
      const currentHash = window.location.hash
      const prefixRegex = new RegExp(`${hashPrefix}:`, 'g')
      const newHash = currentHash.replace(prefixRegex, '')
      window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
    }
  }, [isDialogDisplayed, hashPrefix])

  return (
    <ControlButton
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={() => setIsDialogDisplayed(!isDialogDisplayed)}
      {...props}
    />
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.ReactElement}
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
      <Button onClick={onClick} startIcon={icon} variant='rectangular' color='secondary'>{title}</Button> :
      <Button onClick={onClick} variant='rectangular' color='secondary' disabled={disabled}>{title}</Button>
  )
}


/**
 * @property {Function} onClick Handler for close event.
 * @return {React.ReactElement}
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
 * @return {React.ReactElement}
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

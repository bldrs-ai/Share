import React from 'react'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import useTheme from '@mui/styles/useTheme'
import {assertDefined} from '../utils/assert'
import useStore from '../store/useStore'
import {useIsMobile} from './Hooks'
import CloseIcon from '../assets/icons/Close.svg'
import ExpandIcon from '../assets/icons/Expand.svg'
import BackIcon from '../assets/icons/Back.svg'


/**
 * @property {string} title Tooltip text
 * @property {Function} onClick callback
 * @property {object} icon button icon
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
  placement = 'right',
  selected = false,
  size = 'medium',
  dataTestId = '',
  aboutInfo = true,
  showTitle = false,
}) {
  assertDefined(title, onClick, icon)
  const [openLocal, setOpenLocal] = React.useState(false)
  const isHelpTooltips = useStore((state) => state.isHelpTooltips)
  const isMobile = useIsMobile()
  const open = aboutInfo ? isHelpTooltips : false
  const theme = useTheme()
  const handleClose = () => {
    setOpenLocal(false)
  }
  const handleOpen = () => {
    setOpenLocal(true)
  }
  return (
    <>
      {isMobile ?
          <ToggleButton selected={selected} onClick={onClick} value={''} size={size}>
            { showTitle === true ?
          <Box sx={{display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '36px',
          }}
          >
            {icon}
            <Typography
              sx={{
                fontSize: '9px',
                color: theme.palette.secondary.contrastText,
                textTransform: 'capitalize',
              }}
            >
              {title}
            </Typography>
          </Box> :
          <Box sx={{display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '40px',
          }}
          >
            {icon}
          </Box>
            }
          </ToggleButton> :
       <Tooltip
         open={openLocal || open}
         onClose={handleClose}
         onOpen={handleOpen}
         title={title}
         describeChild
         placement={placement}
         data-testid={dataTestId}
         PopperProps={{style: {zIndex: 0}}}
       >

         <ToggleButton selected={selected} onClick={onClick} value={''} size={size}>
           { showTitle === true ?
           <Box sx={{display: 'flex',
             flexDirection: 'column',
             justifyContent: 'space-between',
             alignItems: 'center',
             height: '36px',
           }}
           >
             {icon}
             <Typography
               sx={{
                 fontSize: '9px',
                 color: theme.palette.secondary.contrastText,
                 textTransform: 'capitalize',
               }}
             >
               {title}
             </Typography>
           </Box> :
           <Box sx={{display: 'flex',
             flexDirection: 'column',
             justifyContent: 'center',
             alignItems: 'center',
             height: '40px',
           }}
           >
             {icon}
           </Box>
           }
         </ToggleButton>
       </Tooltip>
      }

    </>
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
  showTitle = false,
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)
  return (
    <>
      <TooltipIconButton
        title={title}
        placement={placement}
        onClick={() => setIsDialogDisplayed(true)}
        icon={icon}
        selected={isDialogDisplayed}
        showTitle={showTitle}
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
      showTitle={false}
      title='Close'
      onClick={onClick}
      placement='bottom'
      icon={<CloseIcon style={{width: '15px', height: '15px'}}/>}
      size='medium'
      aboutInfo={false}
    />
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
 * A ComponenetButton is used in panels
 *
 * @property {string} title Text to show in button
 * @property {Function} onClick callback
 * @property {object} icon Start icon to left of text
 * @property {boolean} border Default: false
 * @property {boolean} background Default: true
 * @return {object} React component
 */
export function ComponenetButton({
  title,
  onClick,
  icon = null,
  border = false,
  background = true,
}) {
  assertDefined(title, onClick)
  return <Button onClick={onClick} startIcon={icon} variant='component'>{title}</Button>
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

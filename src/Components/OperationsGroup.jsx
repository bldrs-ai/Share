import React from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {hexToRgba} from '../utils/color'
import {useIsMobile} from './Hooks'
import AboutControl from './About/AboutControl'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import ShareControl from './ShareControl'
import {TooltipIconButton} from './Buttons'
import AuthNav from './AuthNav'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({deselectItems}) {
  const toggleIsNotesOn = useStore((state) => state.toggleIsNotesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const isNotesOn = useStore((state) => state.isNotesOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const levelInstance = useStore((state) => state.levelInstance)
  const selectedElement = useStore((state) => state.selectedElement)
  const isLoginVisible = useStore((state) => state.isLoginVisible)
  const isCollaborationGroupVisible = useStore((state) => state.isCollaborationGroupVisible)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const isAppStoreEnabled = useExistInFeature('apps')
  const toggleIsHelpTooltips = useStore((state) => state.toggleIsHelpTooltips)
  const isHelpTooltips = useStore((state) => state.isHelpTooltips)
  const turnOffIsHelpTooltips = useStore((state) => state.turnOffIsHelpTooltips)
  const isMobile = useIsMobile()
  const turnOffTooltips = () => {
    return isMobile ? turnOffIsHelpTooltips() : null
  }

  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null ||
      cutPlanes.length !== 0 ||
      levelInstance !== null
    )
    return ifSelected
  }

  const toggle = (panel) => {
    openDrawer()
    if (panel === 'Properties') {
      toggleIsPropertiesOn()
    }
    if (panel === 'Notes') {
      toggleIsNotesOn()
    }
  }

  const theme = useTheme()
  // When the model has dark/black colors, then the icons (also dark)
  // disappear. This keeps them visible.
  const bgOpacity = 0.2
  const bgColor = hexToRgba(assertDefined(theme.palette.scene.background), bgOpacity)
  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'backgroundColor': `${bgColor}`,
        'padding': '1em',
        '@media (max-width: 900px)': {
          padding: '1em 0.5em',
        },
      }}
    >
      {isLoginVisible &&
       <ButtonGroup orientation='vertical'>
         <AuthNav/>
       </ButtonGroup>
      }

      {isCollaborationGroupVisible &&
       <ButtonGroup orientation='vertical'>
         <ShareControl/>
       </ButtonGroup>
      }

      {isModelInteractionGroupVisible &&
       <ButtonGroup orientation='vertical'>
         <TooltipIconButton
           title='Notes'
           icon={<ChatOutlinedIcon className='icon-share' color='secondary'/>}
           selected={isNotesOn}
           onClick={() => {
             turnOffTooltips()
             toggle('Notes')
           }}
         />
         <TooltipIconButton
           title='Properties'
           onClick={() => {
             turnOffTooltips()
             toggle('Properties')
           }}
           selected={isPropertiesOn}
           icon={<FormatListBulletedOutlinedIcon className='icon-share' color='secondary'/>}
         />
         <CutPlaneMenu/>
         {/* <ExtractLevelsMenu/> */}
         <TooltipIconButton
           title='Clear'
           onClick={deselectItems}
           selected={isSelected()}
           icon={<HighlightOffIcon className='icon-share'color='secondary'/>}
         />

       </ButtonGroup>
      }

      {isSettingsVisible &&
       <ButtonGroup orientation='vertical'>
         {isAppStoreEnabled &&
         <TooltipIconButton
           title='Open App Store'
           icon={<AppStoreIcon/>}
           selected={isAppStoreOpen}
           onClick={() => toggleAppStoreDrawer()}
         />
         }
         <TooltipIconButton
           title={`${theme.palette.mode === 'light' ? 'Day' : 'Night'} theme`}
           onClick={() => theme.toggleColorMode()}
           icon={
             theme.palette.mode === 'light' ?
               <WbSunnyOutlinedIcon className='icon-share' color='secondary'/> :
               <NightlightOutlinedIcon className='icon-share' color='secondary'/> }
         />
         <AboutControl/>
         <TooltipIconButton
           title='Help'
           onClick={() => toggleIsHelpTooltips()}
           selected={isHelpTooltips}
           icon={<HelpOutlineIcon className='icon-share' color='secondary'/>}
         />
       </ButtonGroup>
      }
      {/* Invisible */}
      <CameraControl/>
    </Box>
  )
}

import React from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import {useIsMobile} from './Hooks'
import AboutControl from './About/AboutControl'
import CameraControl from './CameraControl'
import ShareControl from './ShareControl'
import {TooltipIconButton} from './Buttons'
import AuthNav from './AuthNav'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
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
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const isLoginVisible = useStore((state) => state.isLoginVisible)
  const isCollaborationGroupVisible = useStore((state) => state.isCollaborationGroupVisible)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const isAppStoreEnabled = useExistInFeature('apps')
  const turnOffIsHelpTooltips = useStore((state) => state.turnOffIsHelpTooltips)
  const isMobile = useIsMobile()
  const turnOffTooltips = () => {
    return isMobile ? turnOffIsHelpTooltips() : null
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
  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{margin: '1em 1em'}}
    >
      {isLoginVisible &&
          <AuthNav/>
      }

      {isCollaborationGroupVisible &&
        <Box>
          <ShareControl/>
        </Box>
      }

      {isModelInteractionGroupVisible &&
        <>
          <TooltipIconButton
            title='Notes'
            icon={<ChatOutlinedIcon className='icon-share' color='secondary'/>}
            selected={isNotesOn}
            onClick={() => {
              turnOffTooltips()
              toggle('Notes')
            }}
          />
        </>
      }

      {isSettingsVisible &&
        <>
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
                <NightlightOutlinedIcon className='icon-share'/> }
          />
          <AboutControl/>
        </>

      }
      {/* Invisible */}
      <CameraControl/>
    </ButtonGroup>
  )
}

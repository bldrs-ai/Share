import React from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import {useIsMobile} from './Hooks'
import CameraControl from './CameraControl'
import LoginMenu from './LoginMenu'
import ShareControl from './ShareControl'
import ImagineControl from './ImagineControl'
import {TooltipIconButton} from './Buttons'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({deselectItems}) {
  const toggleIsNotesOn = useStore((state) => state.toggleIsNotesOn)
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const isNotesOn = useStore((state) => state.isNotesOn)
  const isLoginVisible = useStore((state) => state.isLoginVisible)
  const isCollaborationGroupVisible = useStore((state) => state.isCollaborationGroupVisible)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const isAppStoreEnabled = useExistInFeature('apps')
  const isMobile = useIsMobile()
  const turnOffTooltips = () => {
    return isMobile ? turnOffIsHelpTooltips() : null
  }
  // Properties
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnOffIsHelpTooltips = useStore((state) => state.turnOffIsHelpTooltips)
  const selectedElement = useStore((state) => state.selectedElement)
  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null
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

  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{'margin': '1em', '& > *:not(:last-child)': {mb: .6}}} // Add space between buttons
    >
      {isLoginVisible &&
        <LoginMenu/>
      }
      {isCollaborationGroupVisible &&
        <Box sx={{marginTop: '8px'}}>
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

      {isSelected() && selectedElement !== null &&
       <TooltipIconButton
         title='Properties'
         onClick={() => {
           turnOffIsHelpTooltips()
           toggleIsPropertiesOn()
           openDrawer()
         }}
         selected={isPropertiesOn}
         icon={<FormatListBulletedIcon className='icon-share' color='secondary'/>}
       />
      }

      {isSettingsVisible && isAppStoreEnabled &&
          <TooltipIconButton
            title='Open App Store'
            icon={<AppStoreIcon/>}
            selected={isAppStoreOpen}
            onClick={() => toggleAppStoreDrawer()}
          />
      }
      {isCollaborationGroupVisible &&
        <Box sx={{marginTop: '8px'}}>
          <ImagineControl/>
        </Box>
      }
      {/* Invisible */}
      <CameraControl/>
    </ButtonGroup>
  )
}

import React from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
// import LoginMenu from './LoginMenu'
// import NotesControl from './Notes/NotesContol'
import ShareControl from './ShareControl'
import ImagineControl from './ImagineControl'
import {TooltipIconButton} from './Buttons'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  // const isLoginVisible = useStore((state) => state.isLoginVisible)
  const isCollaborationGroupVisible = useStore((state) => state.isCollaborationGroupVisible)
  // const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const isAppStoreEnabled = useExistInFeature('apps')
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

  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{'margin': '1em', '& > *:not(:last-child)': {mb: .6}}} // Add space between buttons
    >
      {/* {isLoginVisible &&
        <LoginMenu/>
      } */}
      {isCollaborationGroupVisible &&
        <Box sx={{marginTop: '.5em'}}>
          <ShareControl/>
        </Box>
      }

      {/* {isModelInteractionGroupVisible &&
      <NotesControl/>
      } */}

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
        <ImagineControl/>
      }
      {/* Invisible */}
      <CameraControl/>
    </ButtonGroup>
  )
}

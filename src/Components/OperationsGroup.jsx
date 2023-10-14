import React from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import ButtonGroup from '@mui/material/ButtonGroup'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
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
  return (
    <Stack
      spacing={2}
      direction="column"
      justifyContent="space-around"
      alignItems="center"
      sx={{margin: '1em 1em'}}
    >
      <ButtonGroup
        orientation='vertical'
        variant='contained'
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
            {/* <TooltipIconButton
              title='Properties'
              onClick={() => {
                turnOffTooltips()
                toggle('Properties')
              }}
              selected={isPropertiesOn}
              icon={<FormatListBulletedOutlinedIcon className='icon-share' color='secondary'/>}
            /> */}
            <CutPlaneMenu/>
            {/* <TooltipIconButton
              title='Clear'
              onClick={deselectItems}
              selected={isSelected()}
              icon={<HighlightOffIcon className='icon-share'color='secondary'/>}
            /> */}
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
            <TooltipIconButton
              title='Help'
              onClick={() => toggleIsHelpTooltips()}
              selected={isHelpTooltips}
              icon={<HelpOutlineIcon className='icon-share' color='secondary'/>}
            />
          </>
        }
        {/* Invisible */}
        <CameraControl/>
      </ButtonGroup >
      {isSelected() &&
        <ButtonGroup
          orientation='vertical'
          variant='contained'
        >
          {selectedElement !== null &&
            <TooltipIconButton
              title='Properties'
              onClick={() => {
                turnOffTooltips()
                toggle('Properties')
              }}
              selected={isPropertiesOn}
              icon={<FormatListBulletedOutlinedIcon className='icon-share' color='secondary'/>}
            />
          }
          <TooltipIconButton
            title='Clear'
            onClick={deselectItems}
            selected={isSelected()}
            icon={<HighlightOffIcon className='icon-share'color='secondary'/>}
          />
        </ButtonGroup>
      }
    </Stack>
  )
}

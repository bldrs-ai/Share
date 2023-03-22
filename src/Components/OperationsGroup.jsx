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
import ClearIcon from '../assets/icons/Clear.svg'
import ListIcon from '../assets/icons/List.svg'
import MoonIcon from '../assets/icons/Moon.svg'
import NotesIcon from '../assets/icons/Notes.svg'
import SunIcon from '../assets/icons/Sun.svg'
import QuestionIcon from '../assets/icons/Question.svg'


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
  const separatorOpacity = 0.1
  const separatorColor = hexToRgba(assertDefined(theme.palette.primary.contrastText), separatorOpacity)
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
        '.MuiButtonGroup-root + .MuiButtonGroup-root': {
          marginTop: '0.5em',
          paddingTop: '0.5em',
          borderTop: `solid 1px ${separatorColor}`,
          borderRadius: 0,
        },
        '.MuiButtonBase-root + .MuiButtonBase-root': {
          marginTop: '0.5em',
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
           icon={<NotesIcon/>}
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
           icon={<ListIcon/>}
         />
         <CutPlaneMenu/>
         {/* <ExtractLevelsMenu/> */}
         <TooltipIconButton
           title='Clear'
           onClick={deselectItems}
           selected={isSelected()}
           icon={<ClearIcon/>}
         />

       </ButtonGroup>
      }

      {isSettingsVisible &&
       <ButtonGroup orientation='vertical'>
         <TooltipIconButton
           title={`${theme.palette.mode === 'light' ? 'Day' : 'Night'} theme`}
           onClick={() => theme.toggleColorMode()}
           icon={theme.palette.mode === 'light' ? <MoonIcon/> : <SunIcon/>}
         />
         <TooltipIconButton
           title='Help'
           onClick={() => toggleIsHelpTooltips()}
           selected={isHelpTooltips}
           icon={<QuestionIcon/>}
         />
         <AboutControl/>
       </ButtonGroup>
      }
      {/* Invisible */}
      <CameraControl/>
    </Box>
  )
}

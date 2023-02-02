import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import useStore from '../store/useStore'
import {ColorModeContext} from '../Context/ColorMode'
import AboutControl from './About/AboutControl'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import ShareControl from './ShareControl'
import {TooltipIconButton} from './Buttons'
import AuthNav from './AuthNav'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import MoonIcon from '../assets/2D_Icons/Moon.svg'
import NotesIcon from '../assets/2D_Icons/Notes.svg'
import SunIcon from '../assets/2D_Icons/Sun.svg'


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
  const colorMode = useContext(ColorModeContext)

  const isCollaborationGroupVisible = useStore((state) => state.isCollaborationGroupVisible)
  const isModelInteractionGroupVisible = useStore((state) => state.isModelInteractionGroupVisible)
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)

  const isFirstDividerVisible = useStore((state) => state.getFirstDividerVisiblility)
  const isSecondDividerVisible = useStore((state) => state.getSecondDividerVisiblility)

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

  return (
    <Box sx={{
      'display': 'flex',
      'flexDirection': 'column',
      'margin': '1em 1em 0 0',
      '@media (max-width: 900px)': {
        margin: '1em 0.5em 0 0',
      },
    }}
    >
      <AuthNav/>
      <Divider/>

      {isCollaborationGroupVisible &&
        <ButtonGroup orientation="vertical" >
          <ShareControl/>
        </ButtonGroup>}
      {isFirstDividerVisible() && <Divider sx={{margin: '0.5em 0'}}/>}
      {isModelInteractionGroupVisible &&
      <ButtonGroup orientation="vertical" >
        <TooltipIconButton
          title='Notes'
          icon={<NotesIcon/>}
          selected={isNotesOn}
          onClick={() => toggle('Notes')}
        />
        <TooltipIconButton
          title="Properties"
          onClick={() => toggle('Properties')}
          selected={isPropertiesOn}
          icon={<ListIcon/>}
        />
        <CutPlaneMenu/>
        {/* <ExtractLevelsMenu/> */}
        <TooltipIconButton
          title="Clear"
          onClick={deselectItems}
          selected={isSelected()}
          icon={<ClearIcon/>}
        />
      </ButtonGroup>}
      {isSecondDividerVisible() && <Divider sx={{margin: '0.5em 0'}}/>}
      {isSettingsVisible &&
      <ButtonGroup orientation="vertical">
        <TooltipIconButton
          title={`${colorMode.isDay() ? 'Night' : 'Day'} theme`}
          onClick={() => colorMode.toggleColorMode()}
          icon={colorMode.isDay() ? <MoonIcon/> : <SunIcon/>}
        />
        <AboutControl/>
      </ButtonGroup>}
      {/* Invisible */}
      <CameraControl/>
    </Box>
  )
}

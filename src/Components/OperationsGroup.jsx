import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import AboutControl from './AboutControl'
import AuthControl from './AuthControl'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import useStore from '../store/useStore'
import {ColorModeContext} from '../Context/ColorMode'
import {TooltipIconButton} from './Buttons'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import MoonIcon from '../assets/2D_Icons/Moon.svg'
import NotesIcon from '../assets/2D_Icons/Notes.svg'
import ShareControl from './ShareControl'
import SunIcon from '../assets/2D_Icons/Sun.svg'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Function} unSelectItem deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({
  unSelectItem,
}) {
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)
  const openDrawer = useStore((state) => state.openDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const levelInstance = useStore((state) => state.levelInstance)
  const selectedElement = useStore((state) => state.selectedElement)
  const colorMode = useContext(ColorModeContext)


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
      if (isCommentsOn) {
        turnCommentsOff()
      } else {
        turnCommentsOn()
      }
    }
  }


  return (
    <Box sx={{
      'display': 'flex',
      'flexDirection': 'column',
      'height': 'calc(100vh - 40px)',
      'margin': '20px 20px 0 0',
      '@media (max-width: 900px)': {
        margin: '20px 10px 0 0',
      },
    }}
    >
      <ButtonGroup orientation="vertical" >
        <AuthControl/>
        <ShareControl/>
      </ButtonGroup>
      <Divider/>
      <ButtonGroup orientation="vertical" >
        <TooltipIconButton
          title='Notes'
          icon={<NotesIcon/>}
          selected={isCommentsOn}
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
          onClick={unSelectItem}
          selected={isSelected()}
          icon={<ClearIcon/>}
        />
      </ButtonGroup>
      <Divider/>
      <ButtonGroup orientation="vertical">
        <TooltipIconButton
          title={`${colorMode.isDay() ? 'Night' : 'Day'} theme`}
          onClick={() => colorMode.toggleColorMode()}
          icon={colorMode.isDay() ? <MoonIcon/> : <SunIcon/>}
        />
        <AboutControl/>
      </ButtonGroup>
      {/* Invisible */}
      <CameraControl/>
    </Box>
  )
}

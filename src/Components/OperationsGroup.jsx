import React, {useContext} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import CameraControl from './CameraControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
// import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import Notes from '../assets/2D_Icons/Notes.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import Sun from '../assets/2D_Icons/Sun.svg'
import Moon from '../assets/2D_Icons/Moon.svg'
import useStore from '../store/useStore'
import AboutControl from './AboutControl'

// import SampleModelsControl from './SampleModelsControl'
import {ColorModeContext} from '../Context/ColorMode'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem, installPrefix}) {
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  // const selectedElement = useStore((state) => state.selectedElement)
  const classes = useStyles(useTheme())
  const theme = useContext(ColorModeContext)

  const toggle = (panel) => {
    openDrawer()
    panel === 'Properties' ? toggleIsPropertiesOn() : null
    panel === 'Notes' ? turnCommentsOn() : null
  }

  return (
    <div className={classes.container}>
      <ShareControl viewer={viewer}/>
      <TooltipIconButton
        title='Notes'
        icon={<Notes/>}
        onClick={() => toggle('Notes')}
      />
      {/* <TooltipIconButton
        title="Section plane"
        onClick={() => viewer.clipper.createPlane()}
        icon={<CutPlaneIcon/>}/> */}
      <TooltipIconButton title="Clear selection" onClick={unSelectItem} icon={<ClearIcon/>}/>
      <ShortcutsControl/>
      <TooltipIconButton
        title="Properties"
        onClick={() => toggle('Properties')}
        icon={<ListIcon/>}/>
      {/* <SampleModelsControl/> */}
      <AboutControl installPrefix={installPrefix}/>
      <TooltipIconButton
        title={`Change theme from ${theme.isDay() ? 'Day' : 'Night'}` +
              ` to ${theme.isDay() ? 'Night' : 'Day'}`}
        onClick={() => theme.toggleColorMode()}
        icon={theme.isDay() ? <Moon/> : <Sun/>}
      />
      {/* Invisible */}
      <CameraControl viewer={viewer}/>
    </div>
  )
}


const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    opacity: .9,
    height: '340px',
    background: 'rgba(245, 245, 245, 0.5)',
    // boxShadow: '0px 0px 5px rgba(0, 0, 0, 0.15)',
    bordeRadius: '5px 5px 5px 5px',
  },
})


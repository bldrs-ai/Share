import React, {useContext} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import CameraControl from './CameraControl'
// import ShareControl from './ShareControl'
// import ShortcutsControl from './ShortcutsControl'
import {TooltipToggleButton} from './Buttons_redesign'
// import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import Notes from '../assets/2D_Icons/Notes.svg'
import Share from '../assets/2D_Icons/Share.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import Sun from '../assets/2D_Icons/Sun.svg'
import Moon from '../assets/2D_Icons/Moon.svg'
import Knowledge from '../assets/2D_Icons/Knowledge.svg'
import InfoIcon from '../assets/2D_Icons/Info.svg'
// import useStore from '../store/useStore'
// import AboutControl from './AboutControl'
// import ToggleButton from '@mui/material/ToggleButton'

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
  // const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  // const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  // const openDrawer = useStore((state) => state.openDrawer)
  // const selectedElement = useStore((state) => state.selectedElement)
  const classes = useStyles(useTheme())
  const theme = useContext(ColorModeContext)

  return (
    <div className={classes.container}>
      <TooltipToggleButton
        state={true}
        icon={<Share/>}
      />
      <TooltipToggleButton
        icon={<Notes/>}
      />
      <TooltipToggleButton
        icon={<ListIcon/>}
      />
      <TooltipToggleButton
        state={true}
        icon={<Knowledge/>}
      />
      <TooltipToggleButton
        icon={<ClearIcon/>}
      />
      <TooltipToggleButton
        icon={<InfoIcon/>}
      />
      <TooltipToggleButton
        icon={theme.isDay() ? <Moon/> : <Sun/>}
      />
      {/* Invisible */}
      <CameraControl viewer={viewer}/>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    opacity: .9,
    height: '340px',
  },
  root: {
    '& button': {
      'width': '40px',
      'height': '40px',
      'borderRadius': '50%',
      'border': 'none',
      '&.Mui-selected, &.Mui-selected:hover': {
        backgroundColor: theme.palette.primary.contrastText,
        color: 'white',
      },
    },
    '& svg': {
      width: '20px',
      height: '20px',
      fill: theme.palette.primary.contrastText,
    },
  },
}))


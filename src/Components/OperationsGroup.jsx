import React, {useContext} from 'react'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
// import CutPlaneMenu from './CutPlaneMenu'
import ShareControl from './ShareControl'
import AboutControl from './AboutControl'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import MoonIcon from '../assets/2D_Icons/Moon.svg'
import NotesIcon from '../assets/2D_Icons/Notes.svg'
import SunIcon from '../assets/2D_Icons/Sun.svg'
import {ColorModeContext} from '../Context/ColorMode'
import {TooltipIconButton} from './Buttons'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {object} viewer The IFC viewer
 * @param {Function} unSelectItem deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({viewer, unSelectItem, installPrefix, fileOpen}) {
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const classes = useStyles({isCommentsOn: isCommentsOn})
  const theme = useContext(ColorModeContext)
  const selectedElement = useStore((state) => state.selectedElement)

  const toggle = (panel) => {
    openDrawer()
    if (panel === 'Properties') {
      toggleIsPropertiesOn()
    }
    if (panel === 'Notes') {
      turnCommentsOn()
    }
  }


  return (
    <div className={classes.container}>
      <div className={classes.topGroup}>
        <ShareControl viewer={viewer}/>
        <TooltipIconButton
          title='Notes'
          icon={<NotesIcon/>}
          onClick={() => toggle('Notes')}
        />
        <TooltipIconButton
          title="Properties"
          onClick={() => toggle('Properties')}
          icon={<ListIcon/>}
        />
        <TooltipIconButton
          title="Section plane"
          onClick={() => viewer.clipper.createPlane()}
          icon={<CutPlaneIcon/>}
        />
        <TooltipIconButton
          title="Clear selected element"
          onClick={unSelectItem}
          selected={selectedElement !== null}
          icon={<ClearIcon />}
        />
        <div>
          <TooltipIconButton
            title={`${theme.isDay() ? 'Night' : 'Day'} theme`}
            onClick={() => theme.toggleColorMode()}
            icon={theme.isDay() ? <MoonIcon/> : <SunIcon/>}
          />
        </div>
        <AboutControl installPrefix={installPrefix}/>
        {/* Invisible */}
        <CameraControl viewer={viewer}/>
      </div>
    </div>
  )
}


const useStyles = makeStyles({
  container: {
    // Actually want 100 - size of settings button
    'height': 'calc(100vh - 40px)',
    'margin': '26px 20px 0 0',
    '@media (max-width: 900px)': {
      margin: '30px 10px 0 0',
    },
  },
  topGroup: {
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'space-between',
    'height': '360px',
    '@media (max-width: 900px)': {
      height: '380px',
    },
  },
  lowerGroup: {
    position: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    bottom: 0,
    paddingBottom: '70px',
    minHeight: '150px',
  },
})


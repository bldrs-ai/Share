import React from 'react'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import GuidePanelControl from './GuidePanel'
import IssuesControl from './IssuesControl'
import ShareDialogControl from './ShareDialog'
import ShortcutsControl from './ShortcutsPanel'
import CutPlane from '../assets/Icons/CutPlane.svg'
import Delete from '../assets/Icons/Delete.svg'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} placeCutPlane places cut plances for mobile devices
 * @param {function} unSelectItem deselects currently selected element
 * @return {Object}
 */
export default function OperationsGroup({viewer, placeCutPlane, unSelectItem}) {
  const classes = useStyles()
  const width = window.innerWidth
  return (
    <div>
      { viewer &&
        <>
          <ShareDialogControl viewer={viewer} />
          <IssuesControl viewer={viewer} />
          <CameraControl camera={viewer.IFC.context.ifcCamera.cameraControls}
          />
        </>
      }
      { width > 500 ?
          <div className = {classes.container}>
            <ShortcutsControl />
            <Tooltip title="Clear Selection" placement="left">
              <IconButton onClick ={unSelectItem} aria-label="cutPlane" size="small">
                <Delete className = {classes.icon}/>
              </IconButton>
            </Tooltip>
          </div> :
          <div className = {classes.container}>
            <IconButton aria-label="cutPlane" size="small">
              <GuidePanelControl/>
            </IconButton>
            <Tooltip title="Section Plane" placement="left">
              <IconButton onClick ={placeCutPlane} aria-label="cutPlane" size="small">
                <CutPlane className = {classes.icon}/>
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear Selection" placement="left">
              <IconButton onClick ={unSelectItem} aria-label="cutPlane" size="small">
                <Delete className = {classes.icon}/>
              </IconButton>
            </Tooltip>
          </div>
      }
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    'width': '80px',
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'space-between',
    'alignItems': 'center',
    'zIndex': 10,
    '@media (max-width: 900px)': {
      'width': '10px',
      'flexDirection': 'column',
      'justifyContent': 'space-between',
    },
  },
  icon: {
    width: '30px',
    height: '30px',
    cursor: 'pointer',
  },
}))


import React from 'react'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import GuideControl from './GuideControl'
import IssuesControl from './IssuesControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import CutPlane from '../assets/Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @param {function} itemPanel The ItemPanel component
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem, itemPanel}) {
  const classes = useStyles()
  const width = window.innerWidth

  /** Add a clipping plane. */
  function placeCutPlane() {
    viewer.clipper.createPlane()
  }

  return (
    <div className={classes.container}>
      <div className={classes.shareAndIssues}>
        <ShareControl viewer={viewer}/>
        <IssuesControl viewer={viewer}/>
      </div>
      <div className={classes.clearAndCut}>
        {itemPanel}
        <TooltipIconButton title="Clear selection" onClick={unSelectItem} icon={<ClearIcon/>}/>
        { width > 500 ?
          <ShortcutsControl/> :
          <>
            <TooltipIconButton title="Add cut plane" icon={<GuideControl/>}/>
            <TooltipIconButton title="Section plane" onClick={placeCutPlane} icon={<CutPlane/>}/>
          </>
        }
      </div>
      {/* Invisible */}
      <CameraControl viewer={viewer}/>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    // Actually want 100 - size of settings button
    'height': '100vh',
    'zIndex': 10,
    'margin': '10px 10px 0 0',
    '@media (max-width: 900px)': {
      width: '10px',
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
  },
  clearAndCut: {
    position: 'absolute',
    bottom: 0,
    paddingBottom: '60px',
  },
}))


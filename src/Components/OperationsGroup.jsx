import React from 'react'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import IssuesControl from './IssuesControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import {useWindowDimensions} from './Hooks'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @param {function} itemPanelControl The ItemPanel component
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem, itemPanelControl}) {
  const classes = useStyles()
  const {width} = useWindowDimensions()
  const isMobile = width < 500

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
      <div className={classes.lowerGroup}>
        {itemPanelControl}
        {isMobile ?
          <TooltipIconButton title="Section plane" onClick={placeCutPlane} icon={<CutPlaneIcon/>}/>:
          ''
        }
        <TooltipIconButton title="Clear selection" onClick={unSelectItem} icon={<ClearIcon/>}/>
        <ShortcutsControl/>
      </div>
      {/* Invisible */}
      <CameraControl viewer={viewer}/>
    </div>
  )
}


const useStyles = makeStyles({
  container: {
    // Actually want 100 - size of settings button
    height: 'calc(100vh - 40px)',
    margin: '20px 20px 0 0',
  },
  lowerGroup: {
    position: 'fixed',
    bottom: 0,
    paddingBottom: '70px',
    // 4x the size of a button
    minHeight: '200px',
  },
})


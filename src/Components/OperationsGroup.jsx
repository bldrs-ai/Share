import React from 'react'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import IssuesControl from './IssuesControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import {useIsMobile} from './Hooks'
import useStore from '../store/useStore'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem}) {
  const classes = useStyles()
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const selectedElement = useStore((state) => state.selectedElement)

  const toggle = () => {
    isDrawerOpen ? closeDrawer() : openDrawer(),
    toggleIsPropertiesOn()
  }

  return (
    <div className={classes.container}>
      <div className={classes.shareAndIssues}>
        <ShareControl viewer={viewer}/>
        <IssuesControl viewer={viewer}/>


      </div>
      <div className={classes.lowerGroup}>
        {
          selectedElement ?
          <TooltipIconButton
            title="Open Side Drawer"
            onClick={toggle}
            icon={<ListIcon/>}/>:null
        }
        {useIsMobile() ?
         <TooltipIconButton
           title="Section plane"
           onClick={() => viewer.clipper.createPlane()}
           icon={<CutPlaneIcon/>}/>:
          null
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
    // 3x the size of a button
    minHeight: '150px',
  },
})


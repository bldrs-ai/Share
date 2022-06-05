import React from 'react'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import MarkupIcon from '../assets/2D_Icons/Markup.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import {useIsMobile} from './Hooks'
import useStore from '../utils/store'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @param {function} itemPanelControl The ItemPanel component
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem}) {
  const classes = useStyles()
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)

  return (
    <div className={classes.container}>
      <div className={classes.topGroup}>
        <ShareControl viewer={viewer}/>
        <TooltipIconButton
          title='Notes'
          icon ={<MarkupIcon/>}
          onClick = {()=>{
            openDrawer()
            toggleIsCommentsOn()
          }}/>
      </div>
      <div className={classes.lowerGroup}>
        <TooltipIconButton
          title = 'Properties'
          icon = {<ListIcon/>}
          onClick = {()=>{
            openDrawer()
            toggleIsPropertiesOn()
          }}
        />
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
  topGroup: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '110px',
    width: '50px',
  },
  lowerGroup: {
    position: 'fixed',
    bottom: 0,
    paddingBottom: '70px',
    minHeight: '150px',
  },
})


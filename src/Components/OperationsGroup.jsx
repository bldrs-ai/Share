import React from 'react'
import {makeStyles} from '@mui/styles'
import CameraControl from './CameraControl'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import CommentIcon from '../assets/2D_Icons/Comment.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import {useIsMobile} from './Hooks'
import SidePanelControl from '../Components/SidePanelControl'
import useStore from '../utils/store'


const CommentsPanel = ()=> {
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  return (
    <>
      {/* {toggleIsCommentsOn ? <div>comments</div>:null} */}
      <div style = {{width: '100%', height: '300px', background: 'yellow'}}>comments</div>
      <TooltipIconButton
        title='toggle drawer'
        onClick={toggleIsCommentsOn}
        icon={<CloseIcon/>}/>
    </>
  )
}

const PropertiesPanel = ()=> {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  return (
    <>
      {/* {toggleIsPropertiesOn ? <div>properties</div>:null} */}
      <div style = {{width: '100%', height: '300px', background: 'lime'}}>properties</div>
      <TooltipIconButton
        title='toggle drawer'
        onClick={toggleIsPropertiesOn}
        icon={<CloseIcon/>}/>
    </>
  )
}


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {Object} viewer The IFC viewer
 * @param {function} unSelectItem deselects currently selected element
 * @param {function} itemPanelControl The ItemPanel component
 * @return {Object}
 */
export default function OperationsGroup({viewer, unSelectItem, sidePanelControl}) {
  const classes = useStyles()
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  return (
    <div className={classes.container}>
      <div className={classes.shareAndIssues}>
        <ShareControl viewer={viewer}/>
        <SidePanelControl
          icon ={<CommentIcon/>}
          content = {<CommentsPanel/>}
          onClick = {()=>{
            openDrawer()
            toggleIsCommentsOn()
          }}
        />
      </div>
      <div className={classes.lowerGroup}>
        <SidePanelControl
          icon ={<ListIcon/>}
          content = {<PropertiesPanel/>}
          onClick = {()=>{
            console.log('side panel is triggered')
            openDrawer()
            toggleIsPropertiesOn()
          }}
        />
        {useIsMobile() ?
         <TooltipIconButton
           title="Section plane"
           onClick={() => viewer.clipper.createPlane()}
           icon={<CutPlaneIcon/>}/>:
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
    // 3x the size of a button
    minHeight: '150px',
  },
})


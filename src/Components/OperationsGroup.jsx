import React from 'react'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import AppTray from './AppTray'
import CameraControl from './CameraControl'
import CutPlaneMenu from './CutPlaneMenu'
import ShareControl from './ShareControl'
import ShortcutsControl from './ShortcutsControl'
import {TooltipIconButton} from './Buttons'
import ClearIcon from '../assets/2D_Icons/Clear.svg'
import MarkupIcon from '../assets/2D_Icons/Markup.svg'
import ListIcon from '../assets/2D_Icons/List.svg'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {object} viewer The IFC viewer
 * @param {Function} unSelectItem deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({unSelectItem}) {
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const selectedElement = useStore((state) => state.selectedElement)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const viewer = useStore((state) => state.viewerStore)

  const classes = useStyles({isCommentsOn: isCommentsOn})
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
        App Button <AppTray/>
        <ShareControl viewer={viewer}/>
        <TooltipIconButton
          title='Notes'
          icon={<MarkupIcon/>}
          onClick={() => toggle('Notes')}
        />
      </div>
      <div className={classes.lowerGroup}>
        {
          selectedElement ?
          <TooltipIconButton
            title="Properties"
            onClick={() => toggle('Properties')}
            icon={<ListIcon/>}
          /> :
          null
        }
        <CutPlaneMenu/>
        <TooltipIconButton title="Clear selection" onClick={unSelectItem} icon={<ClearIcon/>}/>
        <ShortcutsControl/>
      </div>
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
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    bottom: 0,
    paddingBottom: '70px',
    minHeight: '150px',
  },
})


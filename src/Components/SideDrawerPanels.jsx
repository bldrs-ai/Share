import React from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../store/useStore'
import ItemProperties from './ItemProperties'
import {TooltipIconButton} from './Buttons'
import {IssuesNavBar, Issues} from './IssuesControl'
import CloseIcon from '../assets/2D_Icons/Close.svg'


/**
 * Panel Title
 * @param {String} title Panel title
 * @param {Object} controlsGroup Controls Group is placed on the right of the title
 * @return {Object} Properties Panel react component
 */
function PanelTitle({title, controlsGroup}) {
  const classes = useStyles(useTheme())
  return (
    <div className={classes.titleContainer}>
      <div className={classes.title}>
        {title}
      </div>
      {controlsGroup}
    </div>
  )
}


/**
 * PropertiesPanel is a wrapper for the item properties component.
 * It containe the title with additional controls, and the item properties styled container.
 * @return {Object} Properties Panel react component
 */
export function PropertiesPanel() {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const selectedElement = useStore((state) => state.selectedElement)
  const classes = useStyles(useTheme())
  // TODO(pablo): this render was sometimes coming up with a react
  // error where createElement is undefined.  I've refactored a little
  // and now can't reproduce.
  return (
    <>
      <PanelTitle
        title='Properties'
        controlsGroup={
          <TooltipIconButton
            title='Close'
            onClick={toggleIsPropertiesOn}
            icon={<CloseIcon style={{width: '24px', height: '24px'}}/>}
          />
        }
      />
      <div className={classes.contentContainerProperties}>
        {selectedElement ? <ItemProperties/> : null}

      </div>
    </>
  )
}


export const NotesPanel = () => {
  const classes = useStyles(useTheme())
  return (
    <>
      <IssuesNavBar/>
      <div className={classes.contentContainerNotes}>
        <Issues/>
      </div>
    </>
  )
}


const useStyles = makeStyles((theme) => ({
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '10px',
    borderRadius: '5px',
  },
  title: {
    height: '30px',
    display: 'flex',
    fontSize: '18px',
    textDecoration: 'underline',
    fontWeight: 'bold',
    marginRight: '10px',
    paddingLeft: '2px',
    alignItems: 'center',
  },
  contentContainerProperties: {
    marginTop: '4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    overflow: 'scroll',
  },
  contentContainerNotes: {
    marginTop: '4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    overflow: 'auto',
  },
  controls: {
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rightGroup: {
    width: '160px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  leftGroup: {
    width: '100px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  container: {
    background: '#7EC43B',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifications: {
    width: '19px',
    height: '20px',
    border: '1px solid lime',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '10px',
    color: 'black',
    borderRadius: '20px',
  },
}))

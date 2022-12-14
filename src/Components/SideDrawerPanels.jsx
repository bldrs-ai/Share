import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../store/useStore'
import ItemProperties from './ItemProperties'
import {TooltipIconButton} from './Buttons'
import Notes from './notes/Notes'
import NotesNavBar from './notes/NotesNavBar'
import CloseIcon from '../assets/2D_Icons/Close.svg'


/**
 * Panel Title
 *
 * @param {string} title Panel title
 * @param {object} controlsGroup Controls Group is placed on the right of the title
 * @return {object} Properties Panel react component
 */
function PanelTitle({title, controlsGroup}) {
  const classes = useStyles(useTheme())
  return (
    <div className={classes.titleContainer}>
      <Typography variant='h2'>
        {title}
      </Typography>
      {controlsGroup}
    </div>
  )
}


/**
 * PropertiesPanel is a wrapper for the item properties component.
 * It contains the title with additional controls, and the item properties styled container.
 *
 * @return {object} Properties Panel react component
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
          <div>
            <TooltipIconButton
              title='toggle drawer'
              onClick={toggleIsPropertiesOn}
              icon={<div className={classes.iconContainerClose}><CloseIcon/></div>}
            />
          </div>
        }
      />
      <div className={classes.contentContainerProperties}>
        {selectedElement ?
          <ItemProperties/> :
          <Box sx={{width: '100%'}}>
            <Typography
              variant='h4'
              sx={{textAlign: 'left'}}
            >
              Please select an element
            </Typography>
          </Box>
        }
      </div>
    </>
  )
}


export const NotesPanel = () => {
  const classes = useStyles(useTheme())
  return (
    <>
      <NotesNavBar/>
      <div className={classes.contentContainerNotes}>
        <Notes/>
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
    borderRadius: '5px',
  },
  title: {
    height: '30px',
    display: 'flex',
    fontSize: '1.3em',
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
  iconContainerClose: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '14px',
    height: '14px',
  },
}))

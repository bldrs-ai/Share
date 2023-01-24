import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useStore from '../../store/useStore'
import ItemProperties from '../ItemProperties/ItemProperties'
import {TooltipIconButton} from '../Buttons'
import Notes from '../Notes/Notes'
import NotesNavBar from '../Notes/NotesNavBar'
import CloseIcon from '../../assets/2D_Icons/Close.svg'


/**
 * Panel Title
 *
 * @param {string} title Panel title
 * @param {object} controlsGroup Controls Group is placed on the right of the title
 * @return {object} Properties Panel react component
 */
function PanelTitle({title, controlsGroup}) {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: '5px',
    }}
    >
      <Typography variant='h2'>
        {title}
      </Typography>
      {controlsGroup}
    </Box>
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


  // TODO(pablo): this render was sometimes coming up with a react
  // error where createElement is undefined.  I've refactored a little
  // and now can't reproduce.
  return (
    <>
      <PanelTitle
        title='Properties'
        controlsGroup={
          <Box>
            <TooltipIconButton
              title='toggle drawer'
              onClick={toggleIsPropertiesOn}
              icon={
                <Box sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '14px',
                  height: '14px',
                }}
                >
                  <CloseIcon/>
                </Box>}
            />
          </Box>
        }
      />
      <Box sx={{
        paddingTop: '4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        top: 0,
        bottom: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
      >
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
      </Box>
    </>
  )
}


export const NotesPanel = () => {
  return (
    <>
      <NotesNavBar/>
      <Box sx={{
        paddingTop: '4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        top: 0,
        bottom: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
      >
        <Notes/>
      </Box>
    </>
  )
}

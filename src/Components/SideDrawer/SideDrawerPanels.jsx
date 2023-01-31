import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useStore from '../../store/useStore'
import PanelTitle from '../PanelTitle'
import {CloseButton} from '../Buttons'
import ItemProperties from '../ItemProperties/ItemProperties'
import Notes from '../Notes/Notes'
import NotesNavBar from '../Notes/NotesNavBar'


/**
 * @return {React.Element}
 */
export function NotesPanel() {
  // const selectedNoteId = useStore((state) => state.selectedNoteId)
  return (
    <>
      <PanelTitle title='Notes' controlsGroup={<NotesNavBar/>}/>
      <Notes/>
    </>
  )
}


/**
 * PropertiesPanel is a wrapper for the item properties component.
 * It contains the title with additional controls, and the item properties styled container.
 *
 * @return {React.Element} Properties Panel react component
 */
export function PropertiesPanel() {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const selectedElement = useStore((state) => state.selectedElement)


  return (
    <>
      <PanelTitle
        title='Properties'
        controlsGroup={<CloseButton onClick={toggleIsPropertiesOn}/>}
      />
      <Box
        sx={{
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
      >
        {selectedElement ?
          <ItemProperties/> :
          <Box sx={{width: '100%'}}>
            <Typography variant='p'>Please select an element</Typography>
          </Box>
        }
      </Box>
    </>
  )
}

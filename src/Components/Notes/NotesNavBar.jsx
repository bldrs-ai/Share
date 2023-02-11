import React from 'react'
import Box from '@mui/material/Box'
import {CloseButton, TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../CameraControl'
import {addHashParams, removeHashParams} from '../../utils/location'
import useStore from '../../store/useStore'
import {NOTE_PREFIX} from './Notes'
import AddNoteIcon from '../../assets/icons/AddNote.svg'
import BackIcon from '../../assets/icons/Back.svg'
import NextIcon from '../../assets/icons/NavNext.svg'
import PreviousIcon from '../../assets/icons/NavPrev.svg'


/** @return {React.Component} */
export default function NotesNavBar() {
  const notes = useStore((state) => state.notes)
  const createNote = useStore((state) => state.createNote)
  const createNoteOn = useStore((state) => state.createNoteOn)
  const createNoteOff = useStore((state) => state.createNoteOff)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const selectedNoteIndex = useStore((state) => state.selectedNoteIndex)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const closeNotes = useStore((state) => state.closeNotes)


  const selectNote = (direction) => {
    const index = direction === 'next' ? selectedNoteIndex + 1 : selectedNoteIndex - 1
    if (index >= 0 && index < notes.length) {
      const note = notes.filter((n) => n.index === index)[0]
      setSelectedNoteId(note.id)
      setSelectedNoteIndex(note.index)
      removeHashParams(window.location, NOTE_PREFIX)
      addHashParams(window.location, NOTE_PREFIX, {id: note.id})
      if (note.url) {
        setCameraFromParams(note.url)
        addCameraUrlParams()
      } else {
        removeCameraUrlParams()
      }
    }
  }


  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Box
        sx={{
          'display': 'flex',
          'flexDirection': 'row',
          'justifyContent': 'center',
          'alignItems': 'center',
          '@media (max-width: 900px)': {
            paddingLeft: '12px',
          },
        }}
      >
        {selectedNoteId && !createNote &&
         <TooltipIconButton
           title='Back to the list'
           placement='bottom'
           onClick={() => {
             removeHashParams(window.location, NOTE_PREFIX)
             setSelectedNoteId(null)
           }}
           icon={<BackIcon style={{width: '16px', height: '16px'}}/>}
         />
        }
      </Box>
      <Box sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      >
        {(notes && selectedNoteId) && !createNote && notes.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              onClick={() => selectNote('previous')}
              icon={<PreviousIcon/>}
              placement='bottom'
            />
            <TooltipIconButton
              title='Next Note'
              onClick={() => selectNote('next')}
              icon={<NextIcon/>}
              placement='bottom'
            />
          </>
        }
      </Box>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
      >

        {!selectedNoteId && (createNote ?
          <TooltipIconButton
            title='Back to the list'
            placement='bottom'
            onClick={createNoteOff}
            icon={<BackIcon style={{width: '16px', height: '16px'}}/>}
            size='medium'
          /> :
          <TooltipIconButton
            title='Add a note'
            placement='bottom'
            onClick={createNoteOn}
            icon={<AddNoteIcon style={{width: '18px', height: '18px'}}/>}
            size='medium'
          />
        )}
        <CloseButton onClick={closeNotes}/>
      </Box>
    </Box>
  )
}

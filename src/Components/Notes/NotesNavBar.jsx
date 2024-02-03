import React from 'react'
import Box from '@mui/material/Box'
import {CloseButton, TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../CameraControl'
import useStore from '../../store/useStore'
import {addHashParams, removeHashParams} from '../../utils/location'
import {NOTE_PREFIX} from './Notes'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'


/** @return {React.Component} */
export default function NotesNavBar() {
  const closeNotes = useStore((state) => state.closeNotes)
  const notes = useStore((state) => state.notes)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const selectedNoteIndex = useStore((state) => state.selectedNoteIndex)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const toggleIsCreateNoteActive = useStore((state) => state.toggleIsCreateNoteActive)


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
        {selectedNoteId && !isCreateNoteActive &&
         <TooltipIconButton
           title='Back to the list'
           variant='noBackground'
           placement='bottom'
           onClick={() => {
             removeHashParams(window.location, NOTE_PREFIX)
             setSelectedNoteId(null)
           }}
           icon={<ArrowBackIcon className='icon-share'/>}
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
        {(notes && selectedNoteId) && !isCreateNoteActive && notes.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              onClick={() => selectNote('previous')}
              icon={<NavigateBeforeIcon className='icon-share' color='secondary'/>}
              placement='bottom'
              variant='noBackground'
            />
            <TooltipIconButton
              title='Next Note'
              onClick={() => selectNote('next')}
              icon={<NavigateNextIcon className='icon-share' color='secondary'/>}
              placement='bottom'
              variant='noBackground'
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

        {!selectedNoteId && (isCreateNoteActive ?
          <TooltipIconButton
            title='Back to the list'
            placement='bottom'
            onClick={toggleIsCreateNoteActive}
            icon={<ArrowBackIcon className='icon-share' color='secondary'/>}
            size='medium'
            variant='noBackground'
          /> :
            <TooltipIconButton
              title='Add a note'
              placement='bottom'
              onClick={toggleIsCreateNoteActive}
              icon={<AddCommentOutlinedIcon className='icon-share' color='secondary'/>}
              size='medium'
              variant='noBackground'
            />

        )}
        <CloseButton onClick={closeNotes}/>
      </Box>
    </Box>
  )
}

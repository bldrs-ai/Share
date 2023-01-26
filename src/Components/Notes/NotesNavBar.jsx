import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {addHashParams, removeHashParams} from '../../utils/location'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../CameraControl'
import {NOTE_PREFIX} from './Notes'
import BackIcon from '../../assets/2D_Icons/Back.svg'
import CloseIcon from '../../assets/2D_Icons/Close.svg'
import NextIcon from '../../assets/2D_Icons/NavNext.svg'
import PreviousIcon from '../../assets/2D_Icons/NavPrev.svg'


/** @return {object} React component. */
export default function NotesNavBar() {
  const notes = useStore((state) => state.notes)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const selectedNoteIndex = useStore((state) => state.selectedNoteIndex)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)


  const selectNote = (direction) => {
    const index = direction === 'next' ? selectedNoteIndex + 1 : selectedNoteIndex - 1
    if (index >= 0 && index < notes.length) {
      const note = notes.filter((n) => n.index === index)[0]
      setSelectedNoteId(note.id)
      setSelectedNoteIndex(note.index)
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
    <Box sx={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
    >
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      >
        <Typography variant='h2'>
          {!selectedNoteId && 'Notes'}
        </Typography>
        {selectedNoteId &&
          <Box>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              onClick={() => {
                removeHashParams(window.location, NOTE_PREFIX)
                setSelectedNoteId(null)
              }}
              icon={
                <Box sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '14px',
                  height: '14px',
                }}
                >
                  <BackIcon/>
                </Box>}
            />
          </Box>
        }
      </Box>
      <Box sx={{
        width: '400px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      >
        {(notes && selectedNoteId) && notes.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              placement='bottom'
              size='small'
              onClick={() => selectNote('previous')}
              icon={<PreviousIcon/>}
            />
            <TooltipIconButton
              title='Next Note'
              size='small'
              placement='bottom'
              onClick={() => selectNote('next')}
              icon={<NextIcon/>}
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
        <Box>
          <TooltipIconButton
            title='Close Comments'
            placement='bottom'
            onClick={turnCommentsOff}
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
      </Box>
    </Box>
  )
}

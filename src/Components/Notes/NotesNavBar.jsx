import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams} from '../Camera/CameraControl'
import {removeCameraUrlParams} from '../Camera/hashState'
import {navBackToIssue, setHashParams} from './hashState'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'


/** @return {ReactElement} */
export default function NotesNavBar() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)

  const notes = useStore((state) => state.notes)

  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)

  const selectedNoteIndex = useStore((state) => state.selectedNoteIndex)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)

  const toggleIsCreateNoteVisible = useStore((state) => state.toggleIsCreateNoteVisible)
  const setSelectedPlaceMarkId = useStore((state) => state.setSelectedPlaceMarkId)
  const setSelectedPlaceMarkInNoteIdData = useStore((state) => state.setSelectedPlaceMarkInNoteIdData)


  /**
   * Navigation through notes, updating url state token and setting
   * camera if note has attached view
   *
   * @param {string} direction 'previous' or 'next'
   */
  function onNavClick(direction) {
    const index = direction === 'next' ? selectedNoteIndex + 1 : selectedNoteIndex - 1
    if (index >= 0 && index < notes.length) {
      const note = notes.filter((n) => n.index === index)[0]
      setSelectedNoteId(note.id)
      setSelectedNoteIndex(note.index)
      setHashParams({id: note.id})
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
        {selectedNoteId && !isCreateNoteVisible &&
         <TooltipIconButton
           title='Back to the list'
           onClick={() => {
             setSelectedPlaceMarkId(null)
             setSelectedNoteId(null)
             setSelectedPlaceMarkInNoteIdData(null)
             navBackToIssue()
           }}
           icon={<ArrowBackIcon className='icon-share'/>}
           variant='noBackground'
           placement='bottom'
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
        {(notes && selectedNoteId) && !isCreateNoteVisible && notes.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              onClick={() => onNavClick('previous')}
              icon={<NavigateBeforeIcon className='icon-share'/>}
              placement='bottom'
              variant='noBackground'
            />
            <TooltipIconButton
              title='Next Note'
              onClick={() => onNavClick('next')}
              icon={<NavigateNextIcon className='icon-share'/>}
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
        {!selectedNoteId && (isCreateNoteVisible ?
          <TooltipIconButton
            title='Back to the list'
            onClick={toggleIsCreateNoteVisible}
            icon={<ArrowBackIcon className='icon-share'/>}
            placement='bottom'
            size='medium'
            variant='noBackground'
          /> :
          <TooltipIconButton
            title='Add a note'
            onClick={toggleIsCreateNoteVisible}
            icon={<AddCommentOutlinedIcon className='icon-share'/>}
            placement='bottom'
            size='medium'
            variant='noBackground'
          />
        )}
      </Box>
    </Box>
  )
}

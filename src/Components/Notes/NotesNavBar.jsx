import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import {setParams, removeParams, removeParamsFromHash, setParamsToHash, batchUpdateHash} from '../../utils/location'
import {CloseButton, TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../Camera/CameraControl'
import {removeMarkerUrlParams} from '../Markers/MarkerControl'
import {HASH_PREFIX_COMMENT, HASH_PREFIX_NOTES} from './hashState'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'


/** @return {ReactElement} */
export default function NotesNavBar() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const notes = useStore((state) => state.notes)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const selectedNoteIndex = useStore((state) => state.selectedNoteIndex)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const toggleIsCreateNoteVisible = useStore((state) => state.toggleIsCreateNoteVisible)
  const setSelectedPlaceMarkId = useStore((state) => state.setSelectedPlaceMarkId)
  const setSelectedPlaceMarkInNoteIdData = useStore((state) => state.setSelectedPlaceMarkInNoteIdData)


  /**
   * Navigation through notes, updating url state token and setting
   * camera if note has attached view
   *
   * @param {string} 'previous' or 'next'
   */
  function onNavClick(direction) {
    const index = direction === 'next' ? selectedNoteIndex + 1 : selectedNoteIndex - 1
    if (index >= 0 && index < notes.length) {
      const note = notes.filter((n) => n.index === index)[0]
      setSelectedNoteId(note.id)
      setSelectedNoteIndex(note.index)
      setParams(HASH_PREFIX_NOTES, {id: note.id})
      if (note.url) {
        setCameraFromParams(note.url)
        addCameraUrlParams()
      } else {
        removeCameraUrlParams()
      }
    }
  }


  /** Hide panel and remove hash state */
  function onCloseClick() {
    setIsNotesVisible(false)
    removeParams(HASH_PREFIX_NOTES)
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
             const _location = window.location
             batchUpdateHash(_location, [
              (hash) => removeMarkerUrlParams({hash}), // Remove marker params
              (hash) => removeParamsFromHash(hash, HASH_PREFIX_NOTES), // Remove notes params
              (hash) => removeParamsFromHash(hash, HASH_PREFIX_COMMENT), // Remove comment params
              (hash) => setParamsToHash(hash, HASH_PREFIX_NOTES), // Add notes params
            ])
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
        <CloseButton onCloseClick={onCloseClick}/>
      </Box>
    </Box>
  )
}

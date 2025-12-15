import React, {ReactElement, useState} from 'react'
import {Box, CardActions, Stack} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useExistInFeature from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {PlacemarkHandlers as placemarkHandlers} from '../Markers/MarkerControl'
import {MARKER_COLOR_ACTIVE_CSS, MARKER_COLOR_INACTIVE_CSS} from '../Markers/component'
import {
  AddCommentOutlined as AddCommentOutlinedIcon,
  AddLocationOutlined as AddLocationIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ForumOutlined as ForumOutlinedIcon,
  GitHub as GitHubIcon,
  PhotoCameraOutlined as PhotoCameraIcon,
  Place as PlaceIcon,
  Share as ShareIcon,
} from '@mui/icons-material'


/**
 * @property {Array<number>} noteNumber Array of expressIDs
 * @return {ReactElement}
 */
export default function NoteFooter({
  editMode,
  embeddedCameras,
  id,
  isNote = true,
  noteNumber,
  numberOfComments,
  onClickCamera,
  onClickShare,
  selectCard,
  selected,
  showCreateComment,
  submitNoteUpdate,
  submitCommentUpdate,
  synched,
  username,
}) {
  const isScreenshotEnabled = useExistInFeature('screenshot')

  const editOriginalBodies = useStore((state) => state.editOriginalBodies)
  const repository = useStore((state) => state.repository)
  const setEditModeGlobal = useStore((state) => state.setEditMode)
  const setEditBodyGlobal = useStore((state) => state.setEditBody)
  const viewer = useStore((state) => state.viewer)

  // Markers
  const placeMarkId = useStore((state) => state.placeMarkId)
  const placeMarkActivated = useStore((state) => state.placeMarkActivated)
  const markers = useStore((state) => state.markers)
  const {togglePlaceMarkActive} = placemarkHandlers()
  const selectedPlaceMarkId = useStore((state) => state.selectedPlaceMarkId)

  const [shareIssue, setShareIssue] = useState(false)
  const [screenshotUri, setScreenshotUri] = useState(null)

  const {user} = useAuth0()
  const theme = useTheme()

  const hasCameras = embeddedCameras.length > 0
  const selectedNoteId = useStore((state) => state.selectedNoteId)

  /** Navigate to github issue */
  function openGithubIssue() {
    window.open(
      `https://github.com/${repository.orgName}/${repository.name}/issues/${noteNumber}`,
      '_blank')
  }

  /** Navigate to github comment */
  function openGithubComment() {
    window.open(
      `https://github.com/${repository.orgName}/${repository.name}/issues/${noteNumber}#issuecomment-${id}`,
      '_blank')
  }

  let marker = null
  marker = markers.find((m) => m.id === id)

  if (!marker) {
    // check comment IDs
    marker = markers.find((m) => m.commentId === id)
  }

  let hasActiveMarker = false

  if (marker) {
    if (marker.commentId !== null) {
      hasActiveMarker = marker ? marker.commentId === selectedPlaceMarkId : false
    } else {
      hasActiveMarker = marker ? marker.id === selectedPlaceMarkId : false
    }
  }


  return (
    <CardActions>
      <Stack direction='row' justifyContent='space-between' sx={{width: '100%'}}>
        <Stack direction='row'>
          {marker &&
           <Box
             sx={{
               'display': 'flex',
               'alignItems': 'center',
               'justifyContent': 'center',
               'height': '48px',
               'width': '48px',
               'margin': '5px',
               '& .Mui-disabled': {
                 opacity: '1.0',
                 border: 'none !important',
               },
               '& svg': {
                 fill: hasActiveMarker ? MARKER_COLOR_ACTIVE_CSS : MARKER_COLOR_INACTIVE_CSS,
               },
             }}
           >
             <PlaceIcon className='icon-share'/>
           </Box>
          }

          {((isNote && selected) || !isNote) && synched &&
           user && user.nickname === username &&
           <Box
             sx={{
               '& .Mui-disabled': {
                 border: 'none !important',
               },
               '& svg': {
                 fill: (placeMarkId === id && placeMarkActivated) ?
                   'red' :
                   theme.palette.mode === 'light' ? 'black' : 'white',
               },
             }}
           >
             <TooltipIconButton
               title='Add Placemark'
               enabled={editMode}
               size='small'
               placement='bottom'
               onClick={() => togglePlaceMarkActive(id)}
               icon={<AddLocationIcon className='icon-share'/>}
             />
           </Box>
          }

          {hasCameras &&
           <TooltipIconButton
             title='Show the camera view'
             size='small'
             placement='bottom'
             onClick={onClickCamera}
             icon={<PhotoCameraIcon className='icon-share'/>}
           />}
          {isScreenshotEnabled && screenshotUri &&
           <img src={screenshotUri} width="40" height="40" alt="screenshot"/>
          }

          {isScreenshotEnabled &&
           <TooltipIconButton
             title='Take Screenshot'
             size='small'
             placement='bottom'
             onClick={() => {
               setScreenshotUri(viewer.takeScreenshot())
             }}
             icon={<PhotoCameraIcon className='icon-share'/>}
           />
          }

          {editMode && (
            <>
              <TooltipIconButton
                title='Save'
                placement='left'
                icon={<CheckIcon className='icon-share'/>}
                onClick={() => isNote ? submitNoteUpdate(id) : submitCommentUpdate(id)}
              />
              <TooltipIconButton
                title='Cancel'
                placement='left'
                icon={<CloseIcon className='icon-share'/>}
                onClick={() => {
                  setEditBodyGlobal(id, editOriginalBodies[id])
                  setEditModeGlobal(id, false) // Update global edit mode state
                }}
              />
            </>
          )}

          {isNote && !selected &&
           <TooltipIconButton
             title='Add Comment'
             size='small'
             placement='bottom'
             selected={showCreateComment}
             onClick={selectCard}
             icon={<AddCommentOutlinedIcon className='icon-share'/>}
           />
          }

          {numberOfComments > 0 && !editMode &&
           <Box sx={{marginLeft: 'auto', padding: '0 0.5em'}}>
             {!selected &&
              <TooltipIconButton
                title='Discussion'
                size='small'
                placement='bottom'
                onClick={selectCard}
                icon={<ForumOutlinedIcon className='icon-share'/>}
              />
             }
             {!selected && numberOfComments}
           </Box>
          }
        </Stack>
        <Stack direction='row'>
          <TooltipIconButton
            title='Open in Github'
            size='small'
            placement='bottom'
            onClick={isNote ? openGithubIssue : openGithubComment}
            icon={<GitHubIcon className='icon-share'/>}
          />

          {selected &&
           <TooltipIconButton
             title='Share'
             size='small'
             placement='bottom'
             onClick={() => {
               onClickShare()
               setShareIssue(!shareIssue)
             }}
             icon={<ShareIcon className='icon-share'/>}
           />
          }

          {!isNote &&
           <TooltipIconButton
             title='Share'
             size='small'
             placement='bottom'
             onClick={() => {
               onClickShare(selectedNoteId, id)
               setShareIssue(!shareIssue)
             }}
             icon={<ShareIcon className='icon-share'/>}
           />
          }
        </Stack>
      </Stack>
    </CardActions>
  )
}

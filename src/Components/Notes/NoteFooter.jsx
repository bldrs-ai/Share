import React, {ReactElement, useState} from 'react'
import Box from '@mui/material/Box'
import CardActions from '@mui/material/CardActions'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import usePlaceMark from '../../hooks/usePlaceMark'
import {useExistInFeature} from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import CheckIcon from '@mui/icons-material/Check'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CameraIcon from '../../assets/icons/Camera.svg'
import PlaceMarkIcon from '../../assets/icons/PlaceMark.svg'
import ShareIcon from '../../assets/icons/Share.svg'

/**
 * @property {Array<number>} noteNumber Array of expressIDs
 * @return {ReactElement}
 */
export default function NoteFooter({
  accessToken,
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
  username,
  submitCommentUpdate,
  setEditMode,
}) {
  const existPlaceMarkInFeature = useExistInFeature('placemark')
  const isScreenshotEnabled = useExistInFeature('screenshot')
  const viewer = useStore((state) => state.viewer)
  const repository = useStore((state) => state.repository)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const placeMarkActivated = useStore((state) => state.placeMarkActivated)
  const [shareIssue, setShareIssue] = useState(false)
  const [screenshotUri, setScreenshotUri] = useState(null)
  const {user} = useAuth0()
  const theme = useTheme()
  const {togglePlaceMarkActive} = usePlaceMark()
  const hasCameras = embeddedCameras.length > 0

  /** Navigate to github issue */
  function openGithubIssue() {
    window.open(
      `https://github.com/${repository.orgName}/${repository.name}/issues/${noteNumber}`,
      '_blank',
    )
  }

  return (
    <CardActions>
      {isNote && (
        <TooltipIconButton
          title="Open in Github"
          size="small"
          placement="top"
          onClick={openGithubIssue}
          icon={<GitHubIcon className="icon-share"/>}
        />
      )}

      {hasCameras && (
        <TooltipIconButton
          title="Show the camera view"
          size="small"
          placement="top"
          onClick={onClickCamera}
          icon={<CameraIcon className="icon-share"/>}
        />
      )}

      {selected && (
        <TooltipIconButton
          title="Share"
          size="small"
          placement="top"
          onClick={() => {
            onClickShare()
            setShareIssue(!shareIssue)
          }}
          icon={<ShareIcon className="icon-share"/>}
        />
      )}

      {isNote && selected && existPlaceMarkInFeature && user && user.nickname === username && (
        <Box
          sx={{
            '& svg': {
              fill:
                placeMarkId === id && placeMarkActivated ?
                  'red' :
                  theme.palette.mode === 'light' ?
                  'black' :
                  'white',
            },
          }}
        >
          <TooltipIconButton
            title="Place Mark"
            size="small"
            placement="top"
            onClick={() => {
              togglePlaceMarkActive(id)
            }}
            icon={<PlaceMarkIcon className="icon-share"/>}
          />
        </Box>
      )}

      {isScreenshotEnabled && screenshotUri && <img src={screenshotUri} width="40" height="40" alt="screenshot"/>}

      {isScreenshotEnabled && (
        <TooltipIconButton
          title="Take Screenshot"
          size="small"
          placement="top"
          onClick={() => {
            setScreenshotUri(viewer.takeScreenshot())
          }}
          icon={<PhotoCameraIcon className="icon-share"/>}
        />
      )}

      {isNote && !selected && (
        <TooltipIconButton
          title="Add Comment"
          size="small"
          placement="top"
          selected={showCreateComment}
          onClick={selectCard}
          icon={<AddCommentOutlinedIcon className="icon-share"/>}
        />
      )}

      <Box sx={{marginLeft: 'auto', padding: '0 0.5em'}}>
        {editMode && isNote && (
          <TooltipIconButton
            title="Save"
            placement="top"
            icon={<CheckIcon className="icon-share"/>}
            onClick={() => submitNoteUpdate(id)}
          />
        )}

        {!editMode && isNote && !selected && numberOfComments > 0 && (
          <>
            <TooltipIconButton
              title="Discussion"
              size="small"
              placement="top"
              onClick={selectCard}
              icon={<ForumOutlinedIcon className="icon-share"/>}
            />
            {numberOfComments}
          </>
        )}

        {!editMode && !isNote && user && username === user.nickname && (
          <TooltipIconButton
            title="Edit"
            placement="top"
            buttonTestId="editComment"
            icon={<EditOutlinedIcon className="icon-share"/>}
            onClick={() => setEditMode(true)}
          />
        )}

        {editMode && !isNote && (
          <TooltipIconButton
            title="Save"
            placement="top"
            icon={<CheckIcon className="icon-share"/>}
            onClick={() => submitCommentUpdate(id)}
          />
        )}
      </Box>
    </CardActions>
  )
}

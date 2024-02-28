/* eslint-disable no-console */
import React, {useState} from 'react'
import ReactMarkdown from 'react-markdown'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {usePlaceMark} from '../../hooks/usePlaceMark'
import {useExistInFeature} from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import WrongLocationOutlinedIcon from '@mui/icons-material/WrongLocationOutlined'
import EditLocationAltOutlinedIcon from '@mui/icons-material/EditLocationAltOutlined'
import CameraIcon from '../../assets/icons/Camera.svg'
import ShareIcon from '../../assets/icons/Share.svg'


export const CardMenu = ({
  handleMenuClick,
  handleMenuClose,
  anchorEl,
  actviateEditMode,
  deleteNote,
  noteNumber,
  open,
}) => {
  return (
    <>
      <TooltipIconButton
        title={'Note Actions'}
        placement='left'
        icon={<MoreVertIcon className='icon-share' color='secondary'/>}
        onClick={handleMenuClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            left: '200px',
            transform: 'translateX(-70px) translateY(0px)',
          },
        }}
      >
        <MenuItem onClick={actviateEditMode}>
          <EditOutlinedIcon/>
          <Typography variant='overline' sx={{marginLeft: '10px'}}>Edit</Typography>
        </MenuItem>
        <MenuItem onClick={() => deleteNote(noteNumber)}>
          <DeleteOutlineOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Delete</Typography>
        </MenuItem>
      </Menu>
    </>

  )
}

export const RegularCardBody = ({selectCard, editBody}) => {
  return (
    <CardActionArea
      onClick={() => selectCard()}
      data-testid="selectionContainer"
      disableRipple
      disableTouchRipple
    >
      <CardContent>
        <ReactMarkdown>
          {editBody}
        </ReactMarkdown>
      </CardContent>
    </CardActionArea>
  )
}

export const SelectedCardBody = ({editBody}) => {
  return (
    <CardContent>
      <ReactMarkdown>
        {editBody}
      </ReactMarkdown>
    </CardContent>
  )
}

export const CommentCardBody = ({editBody}) => {
  return (
    <CardContent>
      <ReactMarkdown>
        {editBody}
      </ReactMarkdown>
    </CardContent>
  )
}

export const CardFooter = ({
  id,
  noteNumber,
  editMode,
  username,
  onClickCamera,
  onClickShare,
  numberOfComments,
  selectCard,
  embeddedCameras,
  selected,
  isComment,
  submitUpdate,
  selectedNote,
  placemarkHash,
}) => {
  const {accessToken} = useAuth0()
  const [shareIssue, setShareIssue] = useState(false)
  const viewer = useStore((state) => state.viewer)
  const repository = useStore((state) => state.repository)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const placeMarkMode = useStore((state) => state.placeMarkMode)
  const hasCameras = embeddedCameras.length > 0
  const theme = useTheme()
  const {user} = useAuth0()
  const {togglePlaceMarkActive} = usePlaceMark()
  // const existPlaceMarkInFeature = useExistInFeature('placemark')
  const existPlaceMarkInFeature = true
  const isScreenshotEnabled = useExistInFeature('screenshot')
  const [screenshotUri, setScreenshotUri] = useState(null)

  console.log('selectedNote', selectedNote)
  /**
   * Navigate to github issue
   *
   * @param {Array} noteNumber Array of expressIDs
   */
  function openGithubIssue() {
    window.open(`https://github.com/${repository.orgName}/${repository.name}/issues/${noteNumber}`, '_blank')
  }

  const deletePlacemark = () => {
    const placemarkPattern = /---\s*\[placemark\]\(https?:\/\/[^\s]+?\)/
    console.log('placemark pattern', placemarkPattern )
    const placeMarkNote = selectedNote
    console.log('placeMarkNote', placeMarkNote)
    if (!placeMarkNote) {
      return
    }
    const editedBody = selectedNote.body.replace(placemarkPattern, ``)
    submitUpdate(editedBody)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px 5px 0px 14px',
        height: '50px',
      }}
    >
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
      }}
      >
        {!isComment &&
        <TooltipIconButton
          title='Open in Github'
          size='small'
          placement='bottom'
          onClick={openGithubIssue}
          icon={<GitHubIcon className='icon-share'/>}
          aboutInfo={false}
        />
        }
        {hasCameras &&
          <TooltipIconButton
            title='Show the camera view'
            size='small'
            placement='bottom'
            onClick={onClickCamera}
            icon={<CameraIcon className='icon-share'/>}
            aboutInfo={false}
          />}
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
        {
          !isComment && selected && existPlaceMarkInFeature &&
          user && user.nickname === username &&
            <TooltipIconButton
              title='Place Mark'
              size='small'
              placement='bottom'
              selected={placeMarkId === id && placeMarkMode}
              onClick={() => {
                togglePlaceMarkActive(id)
                if (!placeMarkMode) {
                  setSnackMessage('Double click on the Canvas to drop a placemark')
                  const pauseTimeMs = 4000
                  setTimeout(() => setSnackMessage(null), pauseTimeMs)
                }
              }}
              icon={placemarkHash ? <EditLocationAltOutlinedIcon className='icon-share'/> : <PlaceOutlinedIcon className='icon-share'/>}
            />
        }
        {!isComment && selected && existPlaceMarkInFeature && placemarkHash &&
          user && user.nickname === username &&
          <TooltipIconButton
            title='Remove Place Mark'
            size='small'
            placement='bottom'
            onClick={() => {
              deletePlacemark()
            }}
            icon={<WrongLocationOutlinedIcon className='icon-share'/>}
          />
        }
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: '4px',
        }}
      >
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
        {editMode &&
          <TooltipIconButton
            title='Save'
            placement='left'
            icon={<CheckIcon className='icon-share'/>}
            onClick={() => submitUpdate(repository, accessToken, id)}
          />
        }
        {numberOfComments > 0 && !editMode &&
        <>
          {!selected &&
            <TooltipIconButton
              title='Discussion'
              size='small'
              placement='bottom'
              onClick={selectCard}
              icon={<ForumOutlinedIcon className='icon-share'/>}
            />
          }
          <Box
            sx={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              margin: '0px 8px',
              backgroundColor: theme.palette.primary.main,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '.84em',
              color: theme.palette.primary.contrastText,
            }}
            role='button'
            tabIndex={0}
          >
            {numberOfComments}
          </Box>
        </>
        }
      </Box>
    </Box>
  )
}

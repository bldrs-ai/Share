import React, {useState, useEffect} from 'react'
import ReactMarkdown from 'react-markdown'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import CardActions from '@mui/material/CardActions'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Menu from '@mui/material/Menu'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {addHashParams, getHashParamsFromHashStr, removeHashParams} from '../../utils/location'
import {findUrls} from '../../utils/strings'
import {closeIssue, deleteComment} from '../../utils/GitHub'
import {TooltipIconButton} from '../Buttons'
import {
  CAMERA_PREFIX,
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from '../CameraControl'
import {useIsMobile} from '../Hooks'
import {usePlaceMark} from '../../hooks/usePlaceMark'
import {useExistInFeature} from '../../hooks/useExistInFeature'
import {NOTE_PREFIX} from './Notes'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import CameraIcon from '../../assets/icons/Camera.svg'
import ShareIcon from '../../assets/icons/Share.svg'
import DeleteIcon from '../../assets/icons/Delete.svg'
import SynchIcon from '../../assets/icons/Synch.svg'
import PlaceMarkIcon from '../../assets/icons/PlaceMark.svg'


/**
 * Note card
 *
 * @param {number} id note id
 * @param {number} index note index
 * @param {string} username username of the note author
 * @param {string} title note title
 * @param {string} avatarUrl user avatarUrl
 * @param {string} body note body
 * @param {string} date note date
 * @param {number} numberOfComments number of replies to the note - referred to as comments in GH
 * @param {boolean} expandedImage governs the size of the image, small proportions on mobile to start
 * @param {boolean} isComment Comments/replies are formatted differently
 * @return {object} React component
 */
export default function NoteCard({
  id = null,
  index = null,
  username = '',
  title = 'Title',
  noteNumber = '',
  avatarUrl = '',
  body = '',
  date = '',
  numberOfComments = null,
  expandedImage = true,
  isComment = false,
  synched = true,
}) {
  assertDefined(body, id, index)
  const [expandText, setExpandText] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)
  // eslint-disable-next-line no-unused-vars
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const cameraControls = useStore((state) => state.cameraControls)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const notes = useStore((state) => state.notes)
  const setNotes = useStore((state) => state.setNotes)
  const selected = selectedNoteId === id
  const bodyWidthChars = 80
  const textOverflow = body.length > bodyWidthChars
  const embeddedCameraParams = findUrls(body)
      .filter((url) => {
        if (url.indexOf('#') === -1) {
          return false
        }
        const encoded = getHashParamsFromHashStr(
            url.substring(url.indexOf('#') + 1),
            CAMERA_PREFIX)
        return encoded && parseHashParams(encoded)
      })
  const firstCamera = embeddedCameraParams[0] // Intentionally undefined if empty
  const isMobile = useIsMobile()
  const open = Boolean(anchorEl)


  useEffect(() => {
    if (isMobile) {
      setExpandImage(false)
    }
  }, [isMobile])


  useEffect(() => {
    if (selected && firstCamera) {
      setCameraFromParams(firstCamera, cameraControls)
    }
  }, [selected, firstCamera, cameraControls])


  /** Selecting a card move the notes to the replies/comments thread. */
  function selectCard() {
    setSelectedNoteIndex(index)
    setSelectedNoteId(id)
    if (embeddedCameraParams) {
      setCameraFromParams(firstCamera)
    }
    removeHashParams(window.location, NOTE_PREFIX)
    addHashParams(window.location, NOTE_PREFIX, {id: id})
  }


  /**
   * Moves the camera to the position specified in the url attached to
   * the issue/comment.
   */
  function showCameraView() {
    setCameraFromParams(firstCamera, cameraControls)
    addCameraUrlParams(cameraControls)
    if (!embeddedCameraParams) {
      removeCameraUrlParams()
    }
  }


  /**
   * Copies the issue url which contains the issue id, camera position
   * and selected element path.
   */
  function shareIssue() {
    navigator.clipboard.writeText(window.location)
    setSnackMessage('The url path is copied to the clipboard')
    const pauseTimeMs = 5000
    setTimeout(() => setSnackMessage(null), pauseTimeMs)
  }


  /**
   * deletes the note
   *
   * @param {string} repository
   * @param {string} accessToken
   * @param {number} noteNumber obtained from github issue
   * @return {object} return github return object
   */
  async function deleteNote(repository, accessToken, noteNumberToDelete) {
    const newNotes = notes.map((note) => ({
      ...note,
      synched: (note.number !== noteNumberToDelete) && note.synched,
    }))
    setNotes(newNotes)
    const closeResponse = await closeIssue(repository, noteNumberToDelete, accessToken)
    setSelectedNoteId(null)
    toggleSynchSidebar()
    return closeResponse
  }


  /**
   * Remove comment
   *
   * @param {string} repository
   * @param {string} accessToken
   * @param {number} commentId
   * @return {object} return github return object
   */
  async function removeComment(repository, accessToken, commentId) {
    const newComments = comments.map((comment) => ({
      ...comment,
      synched: (comment.id !== commentId) && comment.synched,
    }))
    setComments(newComments)
    await deleteComment(repository, commentId, accessToken)
    toggleSynchSidebar()
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const dateParts = date.split('T')
  const theme = useTheme()


  return (
    <Card
      elevation={1}
      variant='note'
    >
      {isComment &&
        <CardHeader
          avatar={<Avatar alt={username} src={avatarUrl}/>}
          subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
        />
      }
      {!isComment &&
        <CardHeader
          title={title}
          avatar={<Avatar alt={username} src={avatarUrl}/>}
          subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
          action={
            <>
              <TooltipIconButton
                title={'Menu'}
                placement='left'
                icon={<MoreVertIcon className='icon-share' color='secondary'/>}
                onClick={handleClick}
                // selected={anchorEl !== null}
              />
              <Menu
                elevation={1}
                id='basic-menu'
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                anchorOrigin={{vertical: 'top', horizontal: 'center'}}
                transformOrigin={{vertical: 'top', horizontal: 'center'}}
                PaperProps={{
                  style: {
                    left: '200px',
                    transform: 'translateX(-70px) translateY(0px)',
                  },
                  sx: {
                    'color': theme.palette.primary.contrastText,
                    '& .Mui-selected': {
                      color: theme.palette.secondary.main,
                      fontWeight: 800,
                    },
                  },
                }}
              >
                <MenuItem onClick={handleClose}>
                  <Typography variant='overline'>Edit</Typography>
                </MenuItem>
                <MenuItem onClick={handleClose}>
                  <Typography variant='overline'>Delete</Typography>
                </MenuItem>
              </Menu>
            </>
          }
          sx={{
            backgroundColor: theme.palette.scene.background,
          }}
        />
      }
      <CardActionArea
        sx={{cursor: 'pointer'}}
        onClick={() => selectCard()}
        onKeyPress={() => selectCard()}
        data-testid="selectionContainer"
      >
        <CardContent
          sx={{
            'padding': '0px 20px',
            '& img': {
              width: '100%',
            },
          }}
        >
          <ReactMarkdown>{body}</ReactMarkdown>
          {textOverflow &&
          <ShowMore
            expandText={expandText}
            onClick={(event) => {
              event.preventDefault()
              setExpandText(!expandText)
            }}
          />
          }
        </CardContent>
      </CardActionArea>
      {(embeddedCameraParams || numberOfComments > 0) &&
        <CardFooter
          id={id}
          noteNumber={noteNumber}
          username={username}
          selectCard={selectCard}
          numberOfComments={numberOfComments}
          embeddedCameras={embeddedCameraParams}
          selected={selected}
          onClickCamera={showCameraView}
          onClickShare={shareIssue}
          deleteNote={deleteNote}
          removeComment={removeComment}
          isComment={isComment}
          synched={synched}
        />
      }
    </Card>
  )
}


const ShowMore = ({onClick, expandText}) => {
  const theme = useTheme()


  return (
    <Box
      sx={{
        display: 'none',
        cursor: 'pointer',
        margin: '5px 5px 15px 10px',
        fontSize: '0.9em',
        color: theme.palette.primary.contrastText,
      }}
      onClick={onClick}
      role='button'
      tabIndex={0}
      onKeyPress={onClick}
    >
      {expandText ? 'show less' : 'show more'}
    </Box>
  )
}


const CardFooter = ({
  id,
  noteNumber,
  username,
  onClickCamera,
  onClickShare,
  numberOfComments,
  selectCard,
  embeddedCameras,
  selected,
  deleteNote,
  removeComment,
  isComment,
  synched,
}) => {
  const [shareIssue, setShareIssue] = useState(false)
  const viewer = useStore((state) => state.viewer)
  const repository = useStore((state) => state.repository)
  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)
  const accessToken = useStore((state) => state.accessToken)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const placeMarkActivated = useStore((state) => state.placeMarkActivated)
  const hasCameras = embeddedCameras.length > 0
  const theme = useTheme()
  const {user} = useAuth0()
  const {togglePlaceMarkActive} = usePlaceMark()
  const existPlaceMarkInFeature = useExistInFeature('placemark')
  const isScreenshotEnabled = useExistInFeature('screenshot')
  const [screenshotUri, setScreenshotUri] = useState(null)


  return (
    <CardActions disableSpacing>
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
        !isComment && selected && synched && existPlaceMarkInFeature &&
          user && user.nickname === username &&
          <Box sx={{
            '& svg': {
              fill: (placeMarkId === id && placeMarkActivated) ? 'red' : theme.palette.mode === 'light' ? 'black' : 'white',
            },
          }}
          >
            <TooltipIconButton
              title='Place Mark'
              size='small'
              placement='bottom'
              onClick={() => {
                togglePlaceMarkActive(id)
              }}
              icon={<PlaceMarkIcon className='icon-share'/>}
            />
          </Box>
      }
      {!isComment && synched && user && user.nickname === username &&
        <TooltipIconButton
          title='Delete note'
          size='small'
          placement='bottom'
          onClick={async () => {
            await deleteNote(repository, accessToken, noteNumber)
          }}
          icon={<DeleteIcon className='icon-share'/>}
        />
      }
      {isComment && synched && user && user.nickname === username &&
        <TooltipIconButton
          title='Delete comment'
          size='small'
          placement='bottom'
          onClick={async () => {
            await removeComment(repository, accessToken, id)
          }}
          icon={<DeleteIcon className='icon-share'/>}
        />
      }
      {!synched &&
        <TooltipIconButton
          title='Synch to GitHub'
          size='small'
          placement='bottom'
          onClick={() => toggleSynchSidebar()}
          icon={<SynchIcon className='icon-share'/>}
        />
      }
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
      {numberOfComments > 0 &&
      <Box
        sx={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          marginLeft: 'auto',
          backgroundColor: theme.palette.primary.main,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '12px',
          color: theme.palette.primary.contrastText,
          cursor: 'pointer',
        }}
        role='button'
        tabIndex={0}
        onClick={selectCard}
        onKeyPress={selectCard}
      >
        {numberOfComments}
      </Box>

      }
    </CardActions>
  )
}


import React, {useState, useEffect} from 'react'
import ReactMarkdown from 'react-markdown'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Menu from '@mui/material/Menu'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import Stack from '@mui/material/Stack'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {addHashParams, getHashParamsFromHashStr, removeHashParams} from '../../utils/location'
import {findUrls} from '../../utils/strings'
import {closeIssue, updateIssue, deleteComment} from '../../utils/GitHub'
import {TooltipIconButton} from '../Buttons'
import {
  CAMERA_PREFIX,
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from '../CameraControl'
import {usePlaceMark} from '../../hooks/usePlaceMark'
import {useExistInFeature} from '../../hooks/useExistInFeature'
import {NOTE_PREFIX} from './Notes'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import CheckIcon from '@mui/icons-material/Check'
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
  assertDefined(body, id, index)
  const [expandText, setExpandText] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editBody, setEditBody] = useState(body)
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
  const repository = useStore((state) => state.repository)
  const accessToken = useStore((state) => state.accessToken)
  const selected = selectedNoteId === id
  const bodyWidthChars = 80
  const dateParts = date.split('T')
  const textOverflow = body.length > bodyWidthChars
  const {user} = useAuth0()
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
  const open = Boolean(anchorEl)
  useEffect(() => {
    setEditBody(body)
  }, [selectedNoteId, body])
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
  async function deleteNote(noteNumberToDelete) {
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
  async function removeComment(commentId) {
    const newComments = comments.map((comment) => ({
      ...comment,
      synched: (comment.id !== commentId) && comment.synched,
    }))
    setComments(newComments)
    await deleteComment(repository, commentId, accessToken)

    toggleSynchSidebar()
  }

  /**
   * Triggerred when menu is closed
   */
  function handleMenuClose() {
    setAnchorEl(null)
  }

  /**
   * Triggerred when menu icon is activated
   */
  function handleMenuClick(event) {
    setAnchorEl(event.currentTarget)
  }

  /**
   * Activate note edit mode
   */
  function actviateEditMode() {
    handleMenuClose()
    setEditMode(true)
  }

  /**
   *Submit update
   */
  async function submitUpdate() {
    const res = await updateIssue(repository, noteNumber, editBody, title, accessToken)
    const editedNote = notes.find((note) => note.id === id)
    editedNote.body = res.data.body
    setNotes(notes)
    setEditMode(false)
  }
  /**
   * Update body
   */
  const handleTextUpdate = (event) => {
    setEditBody(event.target.value)
  }


  return (
    <Card
      elevation={1}
      variant='note'
    >
      {isComment ?
        <CardHeader
          avatar={<Avatar alt={username} src={avatarUrl}/>}
          subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
        /> :
        <CardHeader
          title={title}
          avatar={<Avatar alt={username} src={avatarUrl}/>}
          subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
          action={
            synched && user && user.nickname === username &&
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
                <MenuItem onClick={handleMenuClose}>
                  <DeleteOutlineOutlinedIcon/>
                  <Typography sx={{marginLeft: '10px'}} variant='overline'>Delete</Typography>
                </MenuItem>
              </Menu>
            </>
          }
        />
      }
      {!editMode && !isComment && !selected &&
        <CardActionArea
          onClick={() => selectCard()}
          onKeyPress={() => selectCard()}
          data-testid="selectionContainer"
          disableRipple
          disableTouchRipple
        >
          <CardContent
            sx={{
              'padding': '0px 20px',
              '& img': {
                width: '100%',
              },
            }}
          >
            <ReactMarkdown>
              {editBody}
            </ReactMarkdown>
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
        </CardActionArea> }
      {selected && !editMode &&
          <CardContent
            sx={{
              'padding': '0px 20px',
              '& img': {
                width: '100%',
              },
            }}
          >
            <ReactMarkdown>
              {editBody}
            </ReactMarkdown>
            {textOverflow &&
            <ShowMore
              expandText={expandText}
              onClick={(event) => {
                event.preventDefault()
                setExpandText(!expandText)
              }}
            />
            }
          </CardContent> }
      {isComment &&
          <CardContent
            sx={{
              'padding': '0px 20px',
              '& img': {
                width: '100%',
              },
            }}
          >
            <ReactMarkdown>
              {editBody}
            </ReactMarkdown>
            {textOverflow &&
            <ShowMore
              expandText={expandText}
              onClick={(event) => {
                event.preventDefault()
                setExpandText(!expandText)
              }}
            />
            }
          </CardContent> }
      {editMode &&
        <CardContent>
          <Stack
            spacing={1}
            direction="column"
            justifyContent="center"
            alignItems="flex-end"
          >
            <TextField
              fullWidth
              multiline
              id="outlined-error"
              label="Note content"
              value={editBody}
              onChange={handleTextUpdate}
            />
          </Stack>
        </CardContent>
      }
      {(embeddedCameraParams || numberOfComments > 0) &&
        <CardFooter
          editMode={editMode}
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
          submitUpdate={submitUpdate}
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
  editMode,
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
  submitUpdate,
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
        {editMode &&
          <TooltipIconButton
            title='Save'
            placement='left'
            icon={<CheckIcon className='icon-share'/>}
            onClick={() => submitUpdate(repository, accessToken, id)}
          />
        }

        {numberOfComments > 0 && !editMode &&
          <Box
            sx={{
              width: '20px',
              height: '20px',
              marginLeft: '8px',
              marginRight: '8px',
              borderRadius: '50%',
              backgroundColor: theme.palette.primary.main,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '12px',
              color: theme.palette.primary.contrastText,
              cursor: !selected && 'pointer',
            }}
            role='button'
            tabIndex={0}
            onClick={selectCard}
          >
            {numberOfComments}
          </Box>
        }
      </Box>
    </Box>
  )
}


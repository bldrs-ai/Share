import React, {useState, useEffect} from 'react'
import ReactMarkdown from 'react-markdown'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {addHashParams, getHashParamsFromHashStr, removeHashParams} from '../../utils/location'
import {findUrls} from '../../utils/strings'
import {TooltipIconButton} from '../Buttons'
import {
  CAMERA_PREFIX,
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from '../CameraControl'
import {useIsMobile} from '../Hooks'
import {NOTE_PREFIX} from './Notes'
import CameraIcon from '../../assets/2D_Icons/Camera.svg'
import ShareIcon from '../../assets/2D_Icons/Share.svg'


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
  avatarUrl = '',
  body = '',
  date = '',
  numberOfComments = null,
  expandedImage = true,
  isComment = false,
}) {
  assertDefined(body, id, index)
  const [expandText, setExpandText] = useState(false)
  // eslint-disable-next-line no-unused-vars
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const cameraControls = useStore((state) => state.cameraControls)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
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
  const firstCamera = embeddedCameraParams[0] // intentionally undefined if empty
  const isMobile = useIsMobile()


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
  const dateParts = date.split('T')
  const theme = useTheme()
  return (
    <Paper
      elevation={1}
      variant='note'
      square
      sx={{
        marginBottom: '1em',
        width: '100%',
      }}
    >
      <CardActionArea
        sx={{
          cursor: isComment ? null : 'pointer',
        }}
        onClick={() => isComment ? null : selectCard()}
        onKeyPress={() => isComment ? null : selectCard()}
        data-testid="selectionContainer"
      >
        <CardHeader
          title={isComment ? null : title}
          avatar={<Avatar alt={username} src={avatarUrl}/>}
          subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
          sx={{
            backgroundColor: isComment ? theme.palette.scene.background : theme.palette.primary.main,
          }}
        />
      </CardActionArea>
      <CardContent
        sx={{
          'padding': '0px 20px 0px 20px',
          'margin': '0px 0px 0px 0px',
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
      {embeddedCameraParams || numberOfComments > 0 ?
        <CardActions
          selectCard={selectCard}
          numberOfComments={numberOfComments}
          embeddedCameras={embeddedCameraParams}
          selected={selected}
          onClickCamera={showCameraView}
          onClickShare={shareIssue}
        /> : null
      }
    </Paper>
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


const CardActions = ({
  onClickCamera,
  onClickShare,
  numberOfComments,
  selectCard,
  embeddedCameras,
  selected}) => {
  const [shareIssue, setShareIssue] = useState(false)
  const hasCameras = embeddedCameras.length > 0
  const theme = useTheme()
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
            icon={<CameraIcon/>}
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
            icon={<ShareIcon/>}
          />
        }
      </Box>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: '4px',
      }}
      role='button'
      tabIndex={0}
      onClick={selectCard}
      onKeyPress={selectCard}
      >
        {numberOfComments > 0 &&
          <Box sx={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: theme.palette.primary.main,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            color: theme.palette.primary.contrastText,
            cursor: 'pointer',
          }}
          >
            {numberOfComments}
          </Box>
        }
      </Box>
    </Box>
  )
}

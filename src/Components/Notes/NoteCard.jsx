import React, {useState, useEffect, useContext} from 'react'
import ReactMarkdown from 'react-markdown'
import {ColorModeContext} from '../../Context/ColorMode'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {addHashParams, getHashParamsFromHashStr} from '../../utils/location'
import {isRunningLocally} from '../../utils/network'
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
import {Box, useTheme} from '@mui/material'


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
  const colorTheme = useContext(ColorModeContext)
  const embeddedCameraParams = findUrls(body).filter((url) => {
    if (url.indexOf('#') === -1) {
      return false
    }
    const encoded = getHashParamsFromHashStr(
        url.substring(url.indexOf('#') + 1),
        CAMERA_PREFIX,
    )
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


  const tempTheme = useTheme()
  console.log('tempTheme: ', tempTheme)

  return (
    <Box
      sx={(theme) => ({
        'marginBottom': '1em',
        'backgroundColor': colorTheme.isDay() ? 'white' : '#383838',
        'borderRadius': '5px',
        'width': '100%',
        '@media (max-width: 900px)': {
          width: '350px',
        },
      })}
    >
      <Box
        sx={(theme) => ({
          cursor: isComment ? null : 'pointer',
        })}
        role='button'
        tabIndex={0}
        onClick={() => (isComment ? null : selectCard())}
        onKeyPress={() => (isComment ? null : selectCard())}
        data-test-id='selectionContainer'
      >
        <CardTitle
          title={title}
          username={username}
          date={date}
          avatarUrl={avatarUrl}
          isComment={isComment}
          selected={selected}
          onClickSelect={selectCard}
        />
      </Box>
      <Box
        sx={(theme) => ({
          'height': 'auto',
          'margin': '5px',
          'paddingLeft': '5px',
          'fontSize': '1em',
          'lineHeight': '1.3em',
          // Restore link styling for notes and comments
          '& a': {
            color: colorTheme.isDay() ? 'black' : 'lightGrey',
            textDecoration: 'underline',
          },
          '& img': {
            width: '100%',
          },
        })}
      >
        <ReactMarkdown>{body}</ReactMarkdown>
      </Box>
      {textOverflow && (
        <ShowMore
          expandText={expandText}
          onClick={(event) => {
            event.preventDefault()
            setExpandText(!expandText)
          }}
        />
      )}
      {embeddedCameraParams || numberOfComments > 0 ? (
        <CardActions
          selectCard={selectCard}
          numberOfComments={numberOfComments}
          embeddedCameras={embeddedCameraParams}
          selected={selected}
          onClickCamera={showCameraView}
          onClickShare={shareIssue}
        />
      ) : null}
    </Box>
  )
}


const CardTitle = ({avatarUrl, title, username, isComment, date}) => {
  const dateParts = date.split('T')

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5em',
        background: isComment ? '#F0F0F0' : '#C8E8C7',
      })}
    >
      <Box sx={(theme) => ({color: 'black', width: '230px'})}>
        {isComment ? null : <Box>{title}</Box>}
      </Box>
      <Box
        sx={(theme) => ({
          width: '200px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginRight: '6px',
        })}
      >
        <Box
          sx={(theme) => ({
            marginRight: '12px',
            paddingRight: '10px',
            paddingLeft: '10px',
            borderRadius: '5px',
            opacity: 0.5,
          })}
          style={{marginRight: '10px'}}
        >
          <Box sx={(theme) => ({fontSize: '10px', color: 'black'})}>
            {username}
          </Box>
          <Box sx={(theme) => ({fontSize: '10px', color: 'black'})}>
            {dateParts[0]} {dateParts[1]}
          </Box>
        </Box>
        {!isRunningLocally() ? (
          <img
            alt={'avatarImage'}
            sx={(theme) => ({
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: 'lightGrey',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              fontWeight: 'bold',
              border: '1px solid lightGrey',
            })}
            src={avatarUrl}
          />
        ) : (
          <Box
            sx={(theme) => ({
              width: 24,
              height: 24,
              background: 'green',
              borderRadius: '50%',
            })}
          />
        )}
      </Box>
    </Box>
  )
}


const ShowMore = ({onClick, expandText}) => {
  return (
    <Box
      sx={(theme) => ({
        display: 'none',
        cursor: 'pointer',
        margin: '5px 5px 15px 10px',
        fontSize: '10px',
        color: theme.palette.highlight.main,
      })}
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
  selected,
}) => {
  const [shareIssue, setShareIssue] = useState(false)
  const hasCameras = embeddedCameras.length > 0

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px 5px 10px 5px',
        fontSize: '10px',
      })}
    >
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          fontSize: '10px',
        })}
      >
        {hasCameras && (
          <TooltipIconButton
            disabled={hasCameras}
            title='Show the camera view'
            size='small'
            placement='bottom'
            onClick={onClickCamera}
            icon={
              <Box
                sx={(theme) => ({
                  width: '20px',
                  height: '20px',
                  marginBottom: '2px',
                })}
              >
                <CameraIcon/>
              </Box>
            }
          />
        )}
        {selected && (
          <TooltipIconButton
            title='Share'
            size='small'
            placement='bottom'
            onClick={() => {
              onClickShare()
              setShareIssue(!shareIssue)
            }}
            icon={
              <Box
                sx={(theme) => ({
                  width: '20px',
                  height: '20px',
                  marginBottom: '2px',
                })}
              >
                <ShareIcon/>
              </Box>
            }
          />
        )}
      </Box>
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: '4px',
        })}
        role='button'
        tabIndex={0}
        onClick={selectCard}
        onKeyPress={selectCard}
      >
        {numberOfComments > 0 && (
          <Box
            sx={(theme) => ({
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: 'white',
              border: '1px solid lightGrey',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              fontWeight: 'bold',
              color: 'black',
              cursor: 'pointer',
            })}
          >
            {numberOfComments}
          </Box>
        )}
      </Box>
    </Box>
  )
}

import React, {useState, useEffect, useContext} from 'react'
import ReactMarkdown from 'react-markdown'
import {makeStyles} from '@mui/styles'
import {ColorModeContext} from '../Context/ColorMode'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {addHashParams, getHashParamsFromHashStr} from '../utils/location'
import {isRunningLocally} from '../utils/network'
import {findUrls} from '../utils/strings'
import {TooltipIconButton} from './Buttons'
import {ISSUE_PREFIX} from './IssuesControl'
import {
  CAMERA_PREFIX,
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from './CameraControl'
import {useIsMobile} from './Hooks'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'


/**
 * Issue card
 *
 * @param {number} id issue id
 * @param {number} index issue index
 * @param {string} username username of the issue author
 * @param {string} title issue title
 * @param {string} avatarUrl user avatarUrl
 * @param {string} body issue body
 * @param {string} date issue date
 * @param {number} numberOfComments number of replies to the issue - refered to as comments in GH
 * @param {boolean} expandedImage governs the size of the image, small proportions on mobile to start
 * @param {boolean} isComment Comments/replies are formated differently
 * @return {object} React component
 */
export default function IssueCard({
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
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const cameraControls = useStore((state) => state.cameraControls)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const selected = selectedIssueId === id
  const bodyWidthChars = 80
  const textOverflow = body.length > bodyWidthChars
  const theme = useContext(ColorModeContext)
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
    setSelectedIssueIndex(index)
    setSelectedIssueId(id)
    if (embeddedCameraParams) {
      setCameraFromParams(firstCamera)
    }
    addHashParams(window.location, ISSUE_PREFIX, {id: id})
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


  const classes = useStyles({
    isDay: theme.isDay(),
    expandText: expandText,
    select: selected,
    expandImage: expandImage,
    isComment: isComment,
  })


  return (
    <div className={classes.container}>
      <div
        className={classes.selectionContainer}
        role='button'
        tabIndex={0}
        onClick={() => isComment ? null : selectCard()}
        onKeyPress={() => isComment ? null : selectCard()}
        data-testid="selectionContainer"
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
      </div>
      <div className={classes.body}>
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
      {textOverflow &&
         <ShowMore
           expandText={expandText}
           onClick={(event) => {
             event.preventDefault()
             setExpandText(!expandText)
           }}
         />
      }
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
    </div>
  )
}


const CardTitle = ({avatarUrl, title, username, selected, isComment, date, onClickSelect}) => {
  const classes = useStyles({isComment: isComment})
  const dateParts = date.split('T')
  return (
    <div className={classes.titleContainer}>
      <div className={classes.title}>
        {
          isComment ? null : <div >{title}</div>
        }
      </div>
      <div className={classes.titleRightContainer}>
        <div className={classes.metaDataContainer} style={{marginRight: '10px'}}>
          <div className={classes.username}>{username}</div>
          <div className={classes.username}>{dateParts[0]} {dateParts[1]}</div>
        </div>
        {!isRunningLocally() ?
          <img alt={'avatarImage'}
            className={classes.avatarIcon}
            src={avatarUrl}
          /> :
          <div
            className={classes.avatarPlaceholder}
          />
        }
      </div>
    </div>
  )
}


const ShowMore = ({onClick, expandText}) => {
  const classes = useStyles()
  return (
    <div className={classes.showMore}
      onClick={onClick}
      role='button'
      tabIndex={0}
      onKeyPress={onClick}
    >
      {expandText ? 'show less' : 'show more'}
    </div>
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
  const classes = useStyles({embeddedCameras: hasCameras})
  return (
    <div className={classes.actions}>
      <div className={classes.actionsLeftGroup}>
        {hasCameras &&
         <TooltipIconButton
           disabled={hasCameras}
           title='Show the camera view'
           size='small'
           placement='bottom'
           onClick={onClickCamera}
           icon={<div className={classes.iconContainer}><CameraIcon/></div>}
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
           icon={<div className={classes.iconContainer}><ShareIcon/></div>}
         />
        }
      </div>
      <div className={classes.commentsIconContainer}
        role='button'
        tabIndex={0}
        onClick={selectCard}
        onKeyPress={selectCard}
      >
        {numberOfComments > 0 &&
          <div className={classes.commentsQuantity}>{numberOfComments}</div>
        }
      </div>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    'marginBottom': '1em',
    'backgroundColor': (props) => props.isDay ? 'white' : '#383838',
    'borderRadius': '5px',
    'width': '100%',
    '@media (max-width: 900px)': {
      width: '350px',
    },
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5em',
    background: (props) => props.isComment ? '#F0F0F0' : '#C8E8C7',
  },
  titleRightContainer: {
    width: '200px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginRight: '6px',
  },
  title: {
    color: 'black',
    width: '230px',
  },
  metaDataContainer: {
    marginRight: '12px',
    paddingRight: '10px',
    paddingLeft: '10px',
    borderRadius: '5px',
    opacity: .5,
  },
  selectionContainer: {
    cursor: (props) => props.isComment ? null : 'pointer',
  },
  body: {
    'height': 'auto',
    'margin': '5px',
    'paddingLeft': '5px',
    'fontSize': '1em',
    'lineHeight': '1.3em',
    // Restore link styling for issues and comments
    '& a': {
      color: (props) => props.isDay ? 'black' : 'lightGrey',
      textDecoration: 'underline',
    },
    '& img': {
      width: '100%',
    },
  },
  showMore: {
    display: 'none',
    cursor: 'pointer',
    margin: '5px 5px 15px 10px',
    fontSize: '10px',
    color: theme.palette.highlight.main,
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0px 5px 10px 5px',
    fontSize: '10px',
  },
  actionsLeftGroup: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    fontSize: '10px',
  },
  commentsIconContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: '4px',
  },
  avatarIcon: {
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
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    background: 'green',
    borderRadius: '50%',
  },
  commentsQuantity: {
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
  },
  select: {
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '2px',
  },
  username: {
    fontSize: '10px',
    color: 'black',
  },
  iconContainer: {
    width: '20px',
    height: '20px',
    marginBottom: '2px',
  },
}),
)

import React, {useState, useEffect} from 'react'
import ReactMarkdown from 'react-markdown'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
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
import SelectIcon from '../assets/2D_Icons/Select.svg'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'


/**
 * Issue card
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
 * @return {Object} React component
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
  const bodyUrls = findUrls(body) || []
  const embeddedCameraParams = bodyUrls
      .filter((url) => url.indexOf('#') !== -1)
      .filter((url) => {
        const hashStr = url.substring(url.indexOf('#') + 1)[1]
        const encoded = getHashParamsFromHashStr(hashStr, CAMERA_PREFIX)
        if (encoded && parseHashParams(encoded)) {
          return true
        }
        return false
      })
  const firstCamera = embeddedCameraParams[0] // intentionally undefined if empty
  const isMobile = useIsMobile()
  const classes = useStyles({expandText: expandText, select: selected, expandImage: expandImage, isComment: isComment})
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


  return (
    <Paper
      elevation={0}
      className={classes.container}
      style={{borderRadius: '5px'}}
    >
      <div
        className={classes.selectionContainer}
        role='button'
        tabIndex={0}
        onClick={() => isComment ? null : selectCard()}
        onKeyPress={() => isComment ? null : selectCard()}
        data-testid="selectionContainer"
      >
        {isComment ? null :
          <CardTitle
            title={title}
            userName={username}
            date={date}
            avatarUrl={avatarUrl}
            isComment={isComment}
            selected={selected}
            onClickSelect={selectCard}
          />
        }
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
          onClickNavigate={showCameraView}
          onClickShare={shareIssue}
        /> : null
      }
    </Paper>
  )
}


const CardTitle = ({avatarUrl, title, username, selected, isComment, date, onClickSelect}) => {
  const classes = useStyles()
  return (
    <div className={classes.titleContainer}>
      <div className={classes.title}>
        {
          isComment ? null : <div className={classes.titleString}>{title}</div>
        }
        <div className={classes.username}>{username}</div>
        <div className={classes.username}>{date.split('T')[0]}</div>
      </div>
      <div className={classes.titleRightContainer}>
        {!selected && !isComment &&
        <div className={classes.select}>
          <TooltipIconButton
            title={'Select Note'}
            size='small'
            placement='bottom'
            onClick={onClickSelect}
            icon={<SelectIcon/>}
          />
        </div>
        }
        {!isRunningLocally() &&
          <img alt={'avatarImage'} className={classes.avatarIcon} src={avatarUrl}/>
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
  onClickNavigate,
  onClickShare,
  numberOfComments,
  selectCard,
  embeddedCameras,
  selected}) => {
  const [shareIssue, setShareIssue] = useState(false)
  const classes = useStyles()
  return (
    <div className={classes.actions}>
      <div className={classes.rightGroup}>
        {embeddedCameras ?
         <TooltipIconButton
           disable={true}
           title='Show the camera view'
           size='small'
           placement='bottom'
           onClick={onClickNavigate}
           icon={
             <CameraIcon
               className={classes.buttonNavigate}
               style={{width: '24px', height: '24px'}}
             />}
         /> : null}
        {selected &&
         <TooltipIconButton
           disable={true}
           title='Share'
           size='small'
           placement='bottom'
           onClick={() => {
             onClickShare()
             setShareIssue(!shareIssue)
           }}
           icon={
             <ShareIcon
               className={classes.buttonShare} style={{width: '24px', height: '24px'}}
             />}
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
    padding: '4px',
    border: (props) => props.select ? '2px solid green' : '1px solid lightGrey',
    width: '270px',
    marginBottom: '20px',
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid lightGrey',
    margin: '5px',
    padding: '0px 0px 5px 5px',
    overflow: 'fix',
    fontSize: '1em',
    lineHeight: '1.1em',
    fontFamily: 'Helvetica',
  },
  titleRightContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginTop: '5px',
  },
  titleString: {
    width: '150px',
  },
  selectionContainer: {
    cursor: (props) => props.isComment ? null : 'pointer',
  },
  body: {
    'height': (props) => props.expandText ? 'auto' : '58px',
    'margin': '5px',
    'paddingLeft': '5px',
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'fontSize': '1em',
    'lineHeight': '1.3em',
    // Restore link styling for issues and comments
    '& a': {
      color: 'green',
      textDecoration: 'underline',
    },
  },
  showMore: {
    cursor: 'pointer',
    margin: '5px 5px 15px 10px',
    overflow: 'fix',
    fontSize: '10px',
    color: theme.palette.custom.highLight,
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid lightGrey',
    margin: '5px 5px 0px 5px',
    paddin: '5px 0px 0px 5px',
    overflow: 'fix',
    fontSize: '10px',
  },
  rightGroup: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    margin: '5px 5px 0px 5px',
    paddin: '5px 0px 0px 5px',
    overflow: 'fix',
    fontSize: '10px',
  },
  commentsIconContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '10px 6px 10px 0px',
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
  image: {
    width: '96%',
    borderRadius: '10px',
    border: '1px solid #DCDCDC',
  },
  imageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: '5px',
  },
  username: {
    fontSize: '10px',
  },
  button: {
    width: '24px',
    height: '24px',
    backgroundColor: theme.palette.custom.highLight,
  },
  buttonNavigate: {
    backgroundColor: (props) => props.embeddedUrl ?
      theme.palette.custom.highLight : theme.palette.custom.disable,
    color: 'black',
  },
  buttonShare: {
    backgroundColor: theme.palette.custom.highLight,
    color: 'black',
  },
}),
)

import React, {useState, useEffect} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {addHashParams} from '../utils/location'
import {TooltipIconButton} from './Buttons'
import {ISSUE_PREFIX} from './IssuesControl'
import {setCameraFromEncodedPosition, addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import {useIsMobile} from './Hooks'
import Select from '../assets/2D_Icons/Select.svg'
import Camera from '../assets/2D_Icons/Camera.svg'
import Share from '../assets/2D_Icons/Share.svg'


/**
 * Issue card
 * @param {number} id issue id
 * @param {number} index issue index
 * @param {string} username username of the issue author
 * @param {string} title issue title
 * @param {string} avatarUrl user avatarUrl
 * @param {string} body issue body
 * @param {string} imageUrl issue image
 * @param {string} date issue date
 * @param {string} embeddedUrl full url attached to GH issue with camera position
 * @param {number} numberOfComments number of replies to the issue - refered to as comments in GH
 * @param {boolean} expandedImage governs the size of the image, small proportions on mobile to start
 * @param {boolean} isReply Comments/replies are formated differently
 * @return {Object} React component
 */
export default function IssueCard({
  id = null,
  index = null,
  username = '',
  title = 'Title',
  avatarUrl = '',
  body = '',
  imageUrl = '',
  date = '',
  embeddedUrl = '',
  numberOfComments = null,
  expandedImage = true,
  isReply = false,
}) {
  assertDefined(id)
  assertDefined(index)
  const [expandText, setExpandText] = useState(false)
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const cameraControls = useStore((state) => state.cameraControls)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const selected = selectedIssueId === id
  const textOverflow = body.length > 80
  const isImage = imageUrl.length != 0
  const isMobile = useIsMobile()
  const classes = useStyles({expandText: expandText, select: selected, expandImage: expandImage})
  useEffect(() => {
    if (isMobile) {
      setExpandImage(false)
    }
  }, [isMobile])
  useEffect(() => {
    if (selected && embeddedUrl) {
      setCameraFromEncodedPosition(embeddedUrl, cameraControls)
    }
  }, [selected, embeddedUrl, cameraControls])


  /**
   * selecting a card move the notes to the replies/comments thread
   */
  function selectCard() {
    selected ? setSelectedIssueIndex(null) : setSelectedIssueIndex(index)
    selected ? setSelectedIssueId(null) : setSelectedIssueId(id)
    if (embeddedUrl) {
      setCameraFromEncodedPosition(embeddedUrl)
    }
    addHashParams(window.location, ISSUE_PREFIX, {id: id})
  }

  /**
   * moves the camera to the position specified in the url attached to the issue/comment
   */
  function showCameraView() {
    setCameraFromEncodedPosition(embeddedUrl, cameraControls)
    addCameraUrlParams(cameraControls)
    if (!embeddedUrl) {
      removeCameraUrlParams()
    }
  }

  /**
   * copies the issue url which contains the issue id, camera position and selected element path
   */
  function shareIssue() {
    navigator.clipboard.writeText(window.location)
    setSnackMessage('The url path is copied to the clipboard')
  }

  return (
    <Paper
      elevation = {0}
      className = {classes.container}
      style = {{borderRadius: '10px'}}
    >
      <CardTitle
        title = {title}
        userName = {username}
        date = {date}
        avatarUrl = {avatarUrl}
        isReply={isReply}
        selected = {selected}
        onClickSelect = {selectCard}
      />
      {isImage &&
        <CardImage
          expandImage={expandImage}
          imageUrl={imageUrl}
          onClickImage = {() => setExpandImage(!expandImage)}/>
      }
      <div className = {classes.body}>
        {body}
      </div>
      {textOverflow &&
        <ShowMore
          expandText = {expandText}
          onClick = {(event) => {
            event.preventDefault()
            expandText ? setExpandText(false) : setExpandText(true)
          }}/>
      }
      {embeddedUrl || numberOfComments > 0 ?
        <CardActions
          selectCard = {selectCard}
          numberOfComments = {numberOfComments}
          embeddedUrl = {embeddedUrl}
          selected = {selected}
          onClickNavigate = {showCameraView}
          onClickShare = {shareIssue}
        /> : null
      }
    </Paper>
  )
}

const CardTitle = ({avatarUrl, title, username, selected, isReply, date, onClickSelect}) => {
  const classes = useStyles()
  return (
    <div className = {classes.titleContainer}>
      <div className = {classes.title}>
        <div className = {classes.titleString}>{title}</div>
        <div className = {classes.username}>{username}</div>
        <div className = {classes.username}>{date.split('T')[0]}</div>
      </div>
      <div className = {classes.titleRightContainer}>
        {!selected && !isReply &&
        <div className = {classes.select}>
          <TooltipIconButton
            title={'Select Comment'}
            size = 'small'
            placement = 'bottom'
            onClick = {onClickSelect}
            icon={ <Select />} />
        </div>
        }
        <img alt = {'avatarImage'} className = {classes.avatarIcon} src = {avatarUrl}/>
      </div>
    </div>
  )
}

const CardImage = ({imageUrl, onClickImage, expandImage}) => {
  const classes = useStyles({expandImage: expandImage})
  return (
    <div className = {classes.imageContainer}
      onClick = {onClickImage}
      role = 'button'
      tabIndex={0}
      onKeyPress = {onClickImage}>
      <img
        className = {classes.image}
        alt = 'cardImage'
        src = {imageUrl}/>
    </div>
  )
}

const ShowMore = ({onClick, expandText}) => {
  const classes = useStyles()
  return (
    <>
      <div className = {classes.showMore}
        onClick = {onClick}
        role = 'button'
        tabIndex={0}
        onKeyPress = {onClick}
      >
        {expandText ? 'show less' : 'show more'}
      </div>
    </>
  )
}

const CardActions = ({onClickNavigate, onClickShare, numberOfComments, selectCard, embeddedUrl, selected}) => {
  const [shareIssue, setShareIssue] = useState(false)
  const classes = useStyles({embeddedUrl: embeddedUrl, shareIssue: shareIssue})
  return (
    <div className = {classes.actions}>
      <div className = {classes.rightGroup}>
        {embeddedUrl ?
        <TooltipIconButton
          disable = {true}
          title='Show the camera view'
          size = 'small'
          placement = 'bottom'
          onClick={onClickNavigate}
          icon={<Camera className = {classes.buttonNavigate} style = {{width: '24px', height: '24px'}} />}/> : null}
        {selected &&
          <TooltipIconButton
            disable = {true}
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={() => {
              onClickShare()
              setShareIssue(!shareIssue)
            }}
            icon={<Share className = {classes.buttonShare} style = {{width: '24px', height: '24px'}} />}/>
        }
      </div>
      <div className = {classes.commentsIconContainer}
        role = 'button'
        tabIndex={0}
        onClick = {selectCard}
        onKeyPress = {selectCard}
      >
        {numberOfComments > 0 &&
          <div className = {classes.commentsQuantity} > {numberOfComments} </div>
        }
      </div>
    </div>
  )
}

const useStyles = makeStyles((theme) => ({
  container: {
    padding: '4px',
    border: (props) => props.select ? '1px solid green' : '1px solid lightGrey',
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
  body: {
    height: (props) => props.expandText ? 'auto' : '62px',
    margin: '5px',
    paddingLeft: '5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '1em',
    lineHeight: '1.3em',
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
    width: (props) => props.expandImage ? '96%' : '100px',
    borderRadius: '10px',
    border: '1px solid #DCDCDC',
    cursor: 'pointer',
  },
  imageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: (props) => props.embeddedUrl ? theme.palette.custom.highLight : theme.palette.custom.disable,
    color: 'black',
  },
  buttonShare: {
    backgroundColor: theme.palette.custom.highLight,
    color: 'black',
  },
}),
)

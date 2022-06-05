import React, {useEffect} from 'react'
import debug from '../utils/debug'
import {
  getHashParams,
} from '../utils/location'
import {makeStyles, useTheme} from '@mui/styles'
import {getIssue, getComment} from '../utils/GitHub'
import Paper from '@mui/material/Paper'
import {getIssues, getComments} from '../utils/GitHub'
import IssueCard from './IssueCard'
import Next from '../assets/2D_Icons/NavNext.svg'
import Previous from '../assets/2D_Icons/NavPrev.svg'
import Back from '../assets/2D_Icons/Back.svg'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import useStore from '../utils/store'
import {TooltipIconButton} from './Buttons'
import {removeHashParams} from '../utils/location'
import {setCameraFromEncodedPosition, addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import {addHashParams} from '../utils/location'


/** The prefix to use for issue id in the URL hash. */
export const ISSUE_PREFIX = 'i'


// exported for testing only
const regex = new RegExp(`${ISSUE_PREFIX}:(\\d+)(?::(\\d+))?`)


/**
 * @return {Object} Issues NavBar
 */
export function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const setSelectedCommentIndex = useStore((state) => state.setSelectedCommentIndex)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const selectedCommentIndex = useStore((state) => state.selectedCommentIndex)
  const issues = useStore((state) => state.issues)
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)


  useEffect(()=>{
    if (!selectedIssueId) {
      removeCameraUrlParams()
    }
  }, [selectedIssueId])

  const selectIssue = (direction) => {
    let index
    direction === 'next' ? index = selectedCommentIndex + 1 : index = selectedCommentIndex - 1

    if (index >= 0 && index < issues.length) {
      const issue = issues.filter((issue)=>issue.index === index)[0]
      setSelectedIssueId(issue.id)
      setSelectedCommentIndex(issue.index)
      addHashParams(window.location, ISSUE_PREFIX, {id: issue.id})
      if (issue.url) {
        setCameraFromEncodedPosition(issue.url)
        addCameraUrlParams()
      } else {
        removeCameraUrlParams()
      }
    }
  }

  return (
    <div className = {classes.titleContainer}>
      <div className = {classes.leftGroup}>
        <div className = {classes.title}>
          {!selectedIssueId ? 'Notes': 'Note' }
        </div>
      </div>
      <div className = {classes.rightGroup}>
        <div className = {classes.controls} >
          {selectedIssueId &&
          <>
            <TooltipIconButton
              title='Back to the list'
              placement = 'bottom'
              size = 'small'
              onClick={()=>{
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<Back style = {{width: '30px', height: '30px'}}/>}/>
            <>
              <TooltipIconButton
                title='Previous Comment'
                placement = 'bottom'
                size = 'small'
                onClick={() => selectIssue('previous')}
                icon={<Previous style = {{width: '20px', height: '20px'}}/>}/>
              <TooltipIconButton
                title='Next Comment'
                size = 'small'
                placement = 'bottom'
                onClick={() => selectIssue('next')}
                icon={<Next style = {{width: '20px', height: '20px'}}/>}/>
            </>
          </>
          }
        </div>
        <TooltipIconButton
          title='Close Comments'
          placement = 'bottom'
          onClick={toggleIsCommentsOn}
          icon={<CloseIcon style = {{width: '24px', height: '24px'}}/>}/>
      </div>
    </div>
  )
}


/**
 * @return {Object} list of issues and comments
 */
export function Issues() {
  const classes = useStyles()
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const issuesStore = useStore((state) => state.issues)
  const setIssuesStore = useStore((state) => state.setIssues)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredIssue = selectedIssueId ? issuesStore.filter((issue) => issue.id ===selectedIssueId)[0] :null

  useEffect(()=>{
    const fetchIssues = async () => {
      const issues = await getIssues()
      const issuesArr = []
      let imageURL = ''
      let body = null

      issues.data.map((issue, index)=>{
        const lines = issue.body.split('\r\n')
        const url = lines.filter((line)=>line.includes('url'))[0]
        body = lines[0]

        if (issue.body.includes('img')) {
          const isolateImageSrc = issue.body.split('src')[1]
          const imageSrc = isolateImageSrc.match(/"([^"]*)"/)
          imageURL = imageSrc[1]
        } else {
          imageURL = ''
        }

        issuesArr.push(
            {
              url: url,
              index: index,
              id: issue.id,
              number: issue.number,
              title: issue.title,
              body: body,
              date: issue.created_at,
              username: issue.user.login,
              avatarURL: issue.user.avatar_url,
              numberOfComments: issue.comments,
              imageURL: imageURL,
            },
        )
      })
      setIssuesStore(issuesArr)
    }
    fetchIssues()
  }, [setIssuesStore])


  useEffect(()=>{
    const fetchComments = async (selectedIssue) => {
      console.log('comments - fetch loop', selectedIssueId)
      const comments = await getComments(selectedIssue.number)
      const commentsArr = []
      let commentImageURL

      comments.map((comment) => {
        const lines = comment.body.split('\r\n')
        const url = lines.filter((line)=>line.includes('url'))[0]
        commentImageURL = comment.body.split('ImageURL')[1]
        commentsArr.push(
            {
              url: url,
              id: comment.id,
              number: comment.number,
              title: comment.title,
              body: comment.body,
              date: comment.created_at,
              username: comment.user.login,
              avatarURL: comment.user.avatar_url,
              imageURL: commentImageURL,
            },
        )
      })
      setComments(commentsArr)
    }
    selectedIssueId !== null ?
    fetchComments(filteredIssue) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId, issuesStore])

  return (
    <Paper className = {classes.commentsContainer} elevation = {0}>
      <div>
      </div>
      <div className = {classes.cardsContainer}>
        {!selectedIssueId ?
          issuesStore.map((issue, index)=>{
            return (
              <IssueCard
                url = {issue.url}
                index = {issue.index}
                id = {issue.id}
                key = {index}
                title = {issue.title}
                date = {issue.date}
                body = {issue.body}
                username = {issue.username}
                numberOfComments = {issue.numberOfComments}
                avatarURL = {issue.avatarURL}
                imageURL = {issue.imageURL}/>
            )
          }):
        <>
          { filteredIssue ?
            <IssueCard
              url = {filteredIssue.url}
              index = {filteredIssue.index}
              id = {filteredIssue.id}
              key = {filteredIssue.id}
              title = {filteredIssue.title}
              date = {filteredIssue.date}
              body = {filteredIssue.body}
              username = {filteredIssue.username}
              numberOfComments = {filteredIssue.numberOfComments}
              avatarURL = {filteredIssue.avatarURL}
              imageURL = {filteredIssue.imageURL}/>:
              <div>loading</div>
          }
          { comments &&
              comments.map((comment, index)=>{
                return (
                  <IssueCard
                    url = {comment.url}
                    isReply = {true}
                    index = ''
                    id = {comment.id}
                    key = {comment.id}
                    title = {index + 1}
                    date = {comment.date}
                    body = {comment.body}
                    username = {comment.username}
                    numberOfReplies = ''
                    avatarURL = {comment.avatarURL}
                    imageURL = {comment.imageURL}/>
                )
              })
          }
        </>
        }
      </div>
    </Paper>
  )
}

/**
 * @param {Object} location
 * @return {Object|undefined}
 */
export function parseHashParams(location) {
  const encodedParams = getHashParams(location, ISSUE_PREFIX)
  if (encodedParams == undefined) {
    return
  }
  const match = encodedParams.match(regex)
  if (match) {
    if (match[1] && match[2]) {
      return {
        issueId: parseInt(match[1]),
        commentId: parseInt(match[2]),
      }
    } else if (match[1]) {
      return {
        issueId: parseInt(match[1]),
      }
    }
  }
  debug().log('IssuesControl#parseHashParams, could not parse hash: ', location.hash)
}


/**
 * Show the issue with the given id.
 * @param {Number} issueId
 * @param {function} setText React state setter for comment text
 * @param {function} setNext React state setter for next Link
 */
export async function showIssue(issueId, setText, setNext) {
  const issue = await getIssue(issueId)
  debug().log(`IssuesControl#showIssue: id:(${issueId}), getIssue result: `, issue)
  if (issue && issue.data && issue.data.body) {
    const title = issue.data.title
    const body = issue.data.body
    debug().log(`IssuesControl#onHash: got issue id:(${issueId})`, title, body)
    setPanelText(title, body, setText, setNext)
  } else {
    debug().warn(`IssuesControl#showIssue: no issue object to display`)
  }
}


/**
 * Fetch the issue with the given id from GitHub.
 * @param {Number} issueId
 * @param {Number} commentId
 * @param {function} setText React state setter for the CommentPanel
 * @param {function} setNext React state setter for next Link
 */
export async function showComment(issueId, commentId, setText, setNext) {
  const comment = await getComment(issueId, commentId)
  debug().log(`IssuesControl#showComment: id:(${commentId}), getComment result: `, comment)
  if (comment && comment.body) {
    setPanelText('', comment.body, setText, setNext)
  } else {
    debug().warn(`IssuesControl#showComment: no comment object to display`)
  }
}


/**
 * @param {string} title Comment title, may be empty
 * @param {string} body Comment body, may include code
 * @param {function} setText React state setter for comment text
 * @param {function} setNext React state setter for next Link
 */
export function setPanelText(title, body, setText, setNext) {
  const bodyParts = body.split('```')
  const text = bodyParts[0]
  setText(title + '::title::' + text)
  if (bodyParts.length > 0) {
    const code = bodyParts[1]
    const lines = code.split('\r\n')
    debug().log('IssuesControl#setPanelText, got code: ', lines)
    if (lines[1].startsWith('url=')) {
      const href = lines[1].split(/=(.+)/)[1]
      setNext(href)
    }
  }
}


const useStyles = makeStyles((theme) => ({
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '10px',
    borderRadius: '5px',
    background: theme.palette.custom.highLight,
  },
  title: {
    height: '30px',
    display: 'flex',
    fontSize: '18px',
    textDecoration: 'underline',
    fontWeight: 'bold',
    marginRight: '10px',
    paddingLeft: '2px',
    alignItems: 'center',
  },
  contentContainer: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    overflow: 'scroll',
    paddingBottom: '30px',
  },
  controls: {
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rightGroup: {
    width: '160px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  leftGroup: {
    width: '100px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  container: {
    background: '#7EC43B',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifications: {
    width: '19px',
    height: '20px',
    border: '1px solid lime',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '10px',
    color: 'black',
    borderRadius: '20px',
  },
  cardsContainer: {
    width: '100%',
    paddingBottom: '30px',
  },
}))

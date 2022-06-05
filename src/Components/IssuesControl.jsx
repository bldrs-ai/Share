import React, {useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router'
import Paper from '@mui/material/Paper'
import {ControlButton} from './Buttons'
import debug from '../utils/debug'
import {
  addHashParams,
  getHashParams,
  removeHashParams,
} from '../utils/location'
import {makeStyles} from '@mui/styles'
import {getIssue, getComment, getIssues, getComments} from '../utils/GitHub'
import CommentIcon from '../assets/2D_Icons/Comment.svg'
import IssueCard from './IssueCard'
import IssueCardReply from './IssueCardReply'
import useStore from '../utils/store'


/**
 * Displays the comment panel
 * @param {string} body The comment body
 * @param {string|null} title The comment title, optional
 * @param {string|null} next Full URL for next comment link href
 * @param {function|null} navigate React router navigate for back button
 * @return {Object} React component
 */
export function CommentPanelAll() {
  const classes = useStyles()
  const selectedCommentId = useStore((state) => state.selectedCommentId)
  const issuesStore = useStore((state) => state.issues)
  const setIssuesStore = useStore((state) => state.setIssues)
  const replies = useStore((state) => state.replies)
  const setReplies = useStore((state) => state.setReplies)
  const filteredComment = selectedCommentId ? issuesStore.filter((issue) => issue.id ===selectedCommentId)[0] :null

  useEffect(()=>{
    const fetchIssues = async () => {
      const issues = await getIssues()
      const issuesArr = []
      let imageURL = ''
      let cameraCoord = null
      let body = null
      issues.data.map((issue, index)=>{
        const lines = issue.body.split('\r\n')
        const camera = lines.filter((line)=>line.includes('camera'))
        body = lines[0]
        if (camera.length>0) {
          cameraCoord = camera[0].split('=')[1]
        } else {
          cameraCoord = null
        }
        if (issue.body.includes('img')) {
          const isolateImageSrc = issue.body.split('src')[1]
          const imageSrc = isolateImageSrc.match(/"([^"]*)"/)
          imageURL = imageSrc[1]
        } else {
          imageURL = ''
        }
        issuesArr.push(
            {
              cameraPosition: cameraCoord,
              index: index,
              id: issue.id,
              number: issue.number,
              title: issue.title,
              body: body,
              date: issue.created_at,
              username: issue.user.login,
              avatarURL: issue.user.avatar_url,
              numberOfReplies: issue.comments,
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
      const comments = await getComments(selectedIssue.number)
      const commentsArr = []
      let cameraCoord = null
      let commentImageURL

      comments.map((comment) => {
        const lines = comment.body.split('\r\n')
        const camera = lines.filter((line)=>line.includes('camera'))
        if (camera.length>0) {
          cameraCoord = camera[0].split('=')[1]
        } else {
          cameraCoord = null
        }
        commentImageURL = comment.body.split('ImageURL')[1]
        commentsArr.push(
            {
              cameraPosition: cameraCoord,
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
      setReplies(commentsArr)
    }
    const selectedIssue = issuesStore.filter((issue) => issue.id === selectedCommentId)[0]
    selectedCommentId !== null ?
    fetchComments(selectedIssue) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommentId])

  return (
    <Paper className = {classes.commentsContainer} elevation = {0}>
      <div>
      </div>
      <div className = {classes.cardsContainer}>
        {selectedCommentId ?
        <>
          <IssueCard
            cameraPosition = {filteredComment.cameraPosition}
            index = {filteredComment.index}
            id = {filteredComment.id}
            key = {filteredComment.id}
            title = {filteredComment.title}
            date = {filteredComment.date}
            body = {filteredComment.body}
            username = {filteredComment.username}
            numberOfReplies = {filteredComment.numberOfReplies}
            avatarURL = {filteredComment.avatarURL}
            imageURL = {filteredComment.imageURL}/>
          { replies &&
              replies.map((reply)=>{
                return (
                  <IssueCardReply
                    id = {reply.id}
                    key = {reply.id}
                    title = {filteredComment.title +':RE'}
                    body = {reply.body}
                    username = {reply.username}
                    numberOfReplies = {0}
                    avatarURL = {reply.avatarURL}
                    cameraPosition = {reply.cameraPosition}
                    imageURL = {reply.imageURL}/>
                )
              })
          }
        </> :
        issuesStore.map((issue, index)=>{
          return (
            <IssueCard
              cameraPosition = {issue.cameraPosition}
              index = {issue.index}
              id = {issue.id}
              key = {index}
              title = {issue.title}
              date = {issue.date}
              body = {issue.body}
              username = {issue.username}
              numberOfReplies = {issue.numberOfReplies}
              avatarURL = {issue.avatarURL}
              imageURL = {issue.imageURL}/>
          )
        })
        }
        {/* <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'title'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'title'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'title'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'title'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'title'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'three'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'two'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/>
        <IssueCard
          cameraPosition = {'eiuyoiu'}
          index = {0}
          id = {89}
          key = {67}
          title = {'last one'}
          date = {'2022-20-20T897'}
          body = {'body hello'}
          username = {'oleg'}
          numberOfReplies = {3}
          avatarURL = {''}
          imageURL = {''}/> */}
      </div>
    </Paper>
  )
}


/**
 * The IssuesControl is a button that toggles display of issues for
 * the currently selected element.  On load, this component also reads
 * the current URL hash and fetches a related issue from GitHub, as
 * well as adds a hash listener to do the same whenever the hash
 * changes.
 *
 * @param {Object} viewer The viewer object from IFCjs.
 * @return {Object} React component
 */
export default function IssuesControl() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isDialogDisplayed, setIsDialogDisplayed] =
        useState(parseHashParams(location) ? true : false)
  const [text, setText] = useState('')
  const [next, setNext] = useState(null)
  const [addComment, setAddComment] = useState(false)


  useEffect(() => {
    if (location) {
      const p = parseHashParams(location)
      if (p && p.issueId) {
        if (Number.isInteger(p.commentId)) {
          (async () => {
            await showComment(p.issueId, p.commentId, setText, setNext)
          })()
        } else {
          (async () => {
            await showIssue(p.issueId, setText, setNext)
          })()
        }
      }
    }
  }, [location])


  // TODO: do a fetch to validate content before displaying panel
  const showIssues = (doShow) => {
    if (doShow) {
      addHashParams(window.location, ISSUE_PREFIX, {id: 8})
      setIsDialogDisplayed(true)
    } else {
      removeHashParams(window.location, ISSUE_PREFIX)
      setText('')
      setIsDialogDisplayed(false)
    }
  }

  let title = null
  let body = text
  const titleSplitNdx = text.indexOf('::title::')
  if (titleSplitNdx >= 0) {
    title = text.substring(0, titleSplitNdx)
    body = text.substring(titleSplitNdx + 9)
  }
  return (
    <ControlButton
      title='Show issues'
      icon={<CommentIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={showIssues}
      dialog={
        <CommentPanelAll
          body={body}
          title={title}
          next={next}
          onClick = {showIssues}
          onAddComment = {()=>setAddComment(!addComment)}
          navigate={navigate}/>
      }/>)
}


/** The prefix to use for issue id in the URL hash. */
export const ISSUE_PREFIX = 'i'


// exported for testing only
const regex = new RegExp(`${ISSUE_PREFIX}:(\\d+)(?::(\\d+))?`)


/**
 * @param {Object} location
 * @return {Object|undefined}
 */
function parseHashParams(location) {
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
async function showIssue(issueId, setText, setNext) {
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
async function showComment(issueId, commentId, setText, setNext) {
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
function setPanelText(title, body, setText, setNext) {
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

const useStyles = makeStyles({
  commentsContainer: {
    minHeight: '330px',
    border: 'none',
  },
  addContainer: {
    'width': '290px',
    'height': 'auto',
    'position': 'absolute',
    'top': '20px',
    'right': '86px',
    '@media (max-width: 900px)': {
      width: '290px',
      height: 'auto',
      position: 'absolute',
      top: '240px',
      right: '80px',
    },
  },
  searchContainer: {
    height: '60px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '4px',
  },
  title: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '40px',
    width: '90%',
    margin: '12px 12px 0px 12px',
    paddingBottom: '10px',
  },
  cardsContainer: {
    'overflowY': 'scroll',
    'overflowX': 'hidden',
    'height': '78%',
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'center',
    'alignItems': 'center',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
    '@media (max-width: 900px)': {
      // height: '410px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center',
      // border: '1px solid lightGrey',
    },
  },
})

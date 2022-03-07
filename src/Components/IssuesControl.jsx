import React, {useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import {ControlButton} from './Buttons'
import debug from '../utils/debug'
import {
  addHashParams,
  getHashParams,
  removeHashParams,
} from '../utils/location'
import {getIssue, getComment} from '../utils/GitHub'
import CommentIcon from '../assets/2D_Icons/Comment.svg'
import NavPrevIcon from '../assets/2D_Icons/NavPrev.svg'
import NavNextIcon from '../assets/2D_Icons/NavNext.svg'


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
export default function IssuesControl({viewer}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isDialogDisplayed, setIsDialogDisplayed] =
        useState(parseHashParams(location) ? true : false)
  const [text, setText] = useState('')
  const [next, setNext] = useState(null)


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
        text ?
          <CommentPanel
            body={body}
            title={title}
            next={next}
            navigate={navigate}/> :
        <></>
      }/>)
}


/**
 * Displays the comment panel
 * @param {string} body The comment body
 * @param {string|null} title The comment title, optional
 * @param {string|null} next Full URL for next comment link href
 * @param {function|null} navigate React router navigate for back button
 * @return {Object} React component
 */
function CommentPanel({body, title, next, navigate}) {
  const [count, setCount] = useState(0)
  const classes = useStyles()
  return (
    <div className={classes.issueContainer}>
      <Paper
        onClick={(event) => event.stopPropagation()}
        elevation={3}>
        {title && <h1>{title}</h1>}
        <Typography paragraph={true}>{body}</Typography>
        <div>
          {count > 0 &&
           <NavPrevIcon
             onClick={() => {
               if (count > 0) {
                 setCount(count - 1)
                 navigate(-1)
               }
             }}/>}
          {next &&
           <NavNextIcon
             onClick={() => {
               setCount(count + 1)
               window.location = next
             }}/>}
        </div>
      </Paper>
    </div>
  )
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
  issueContainer: {
    'position': 'fixed',
    'top': '150px',
    'right': '30px',
    'fontFamily': 'Helvetica',
    'display': 'flex',
    'justifyContent': 'center',
    '& .MuiPaper-root': {
      width: '300px',
      padding: '1em',
    },
    '& h1, & p': {
      fontWeight: 300,
    },
    '& h1': {
      fontSize: '1.2em',
    },
    '& .MuiPaper-root > div': {
      display: 'flex',
      justifyContent: 'center',
    },
    '& svg': {
      width: '20px',
      height: '20px',
      border: 'solid 1px grey',
      margin: '1em 1em 0em 1em',
    },
  },
})

import React, {useEffect, useState} from 'react'
import {useLocation} from 'react-router'
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
  const [isDialogDisplayed, setIsDialogDisplayed] =
        useState(parseHashParams(location) ? true : false)
  // debug().log('IssuesControl: viewer: ', viewer)
  const location = useLocation()
  const [text, setText] = useState('')
  const [next, setNext] = useState('')
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
      setText(null)
      setIsDialogDisplayed(false)
    }
  }

  return (
    <ControlButton
      title='Show issues'
      toggleValue='issues'
      icon={<CommentIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={showIssues}
      dialog={
        text && <CommentPanel text={text} next={next}/>
      }/>)
}


/**
 * Displays the comment panel
 * @param {string} text The comment text
 * @param {string} next Full URL for next comment link href
 * @return {Object} React component
 */
function CommentPanel({text, next}) {
  const classes = useStyles()
  return (
    <div className={classes.container}>
      <Paper
        onClick={(event) => event.stopPropagation()}
        elevation={3}
        className={classes.issue}>
        <Typography
          className={classes.issueText}>
          {text}
        </Typography>
        {next && <a href={next}>Next</a>}
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
  setText(title + ' ' + text)
  if (bodyParts.length > 0) {
    const code = bodyParts[1]
    const lines = code.split('\r\n')
    debug().log('IssuesControl#setPanelText, got code: ', lines)
    if (lines[1].startsWith('url=')) {
      const href = lines[1].split(/=(.+)/)[1]
      debug().log('IssuesControl#setPanelText, href: ', href)
      setNext(href)
    }
  }
}


const useStyles = makeStyles({
  container: {
    position: 'absolute',
    top: '0px',
    right: '0px',
    width: '1px',
    height: '1px',
    display: 'flex',
    justifyContent: 'center',
  },
  icon: {
    width: '30px',
    height: '30px',
  },
  issue: {
    position: 'absolute',
    top: '100px',
    right: '200px',
    width: '200px',
    height: '200px',
    padding: '1em',
  },
  issueText: {
    cursor: 'text',
  },
})

import React, {useEffect, useState} from 'react'
import {useLocation} from 'react-router'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import {Octokit} from '@octokit/rest'
import debug from '../utils/debug'
import {addHashListener, addHashParams, getHashParams} from '../utils/location'
import PkgJson from '../../package.json'
import Comment from '../assets/2D_Icons/Comment.svg'


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
  // debug().log('IssuesControl: viewer: ', viewer)
  const location = useLocation()
  const [commentsIsOpen, setCommentsIsOpen] = useState(false)
  const [text, setText] = useState(null)
  const [next, setNext] = useState(null)
  const classes = useStyles()


  useEffect(() => {
    (async () => {
      await onLoad(location, setCommentsIsOpen, setText, setNext)
    })()
  }, [location])


  return (
    <div>
      <Tooltip title="Show issues" placement="left">
        <IconButton
          onClick={() => {
            if (commentsIsOpen) {
              setCommentsIsOpen(false)
            } else {
              setCommentsIsOpen(true)
              onClick(setText)
            }
          }}
          aria-label='Show issues'>
          <Comment className={classes.icon} />
        </IconButton>
      </Tooltip>
      {(commentsIsOpen && text) &&
       <CommentPanel
         text={text}
         next={next}
         classes={classes}/>
      }
    </div>)
}


/**
 * Displays an issue comment
 * @param {string} text The comment text
 * @param {string} next Full URL for next comment link href
 * @param {Object} classes styles
 * @return {Object} React component
 */
function CommentPanel({text, next, classes}) {
  return (
    <div className={classes.container}>
      <Paper
        elevation={3}
        className={classes.issue}>
        <Typography
          className={classes.issueText}>
          {text}
        </Typography>
        {
          next &&
            <a href={next}>Next</a>
        }
      </Paper>
    </div>
  )
}

/** The prefix to use for issue id in the URL hash. */
export const ISSUE_PREFIX = 'i'


/**
 * @param {Object} location Either window.location or react-router location
 * @param {function} setCommentsIsOpen React state toggle for showing comments
 * @param {function} setText React state setter for comment text
 * @param {function} setNext React state setter for next Link
 */
async function onLoad(location, setCommentsIsOpen, setText, setNext) {
  debug().log('IssuesControl#onLoad')
  onHash(location, setCommentsIsOpen, setText, setNext)
  addHashListener('issues', () => onHash(location, setCommentsIsOpen, setText, setNext))
}


// exported for testing only
/**
 * Sets the issue from the ID encoded in the URL hash if it is present
 * @param {Object} location window.location
 * @param {function} setCommentsIsOpen React state toggle for showing comments
 * @param {function} setText React state setter for comment text
 * @param {function} setNext React state setter for next Link
 */
export async function onHash(location, setCommentsIsOpen, setText, setNext) {
  const regex = new RegExp(`${ISSUE_PREFIX}:(\\d+)(?::(\\d+))?`)
  const params = getHashParams(location, ISSUE_PREFIX)
  if (params == undefined) {
    return
  }
  const match = params.match(regex)
  debug().log(`IssuesControl#onHash, (${match.length}) matches in: `, match, match[2])
  if (match) {
    let showComments = false
    if (match[1] && match[2]) {
      showComment(parseInt(match[1]), parseInt(match[2]), setText, setNext)
      showComments = true
    } else if (match[1]) {
      showIssue(parseInt(match[1]), setText, setNext)
      showComments = true
    } else {
      console.warn('Cannot parse hash: ', location.hash)
    }
    setCommentsIsOpen(showComments)
  } else {
    debug().log('IssuesControl#onHash, no issue present in hash: ', location.hash)
  }
}


/** On click handler. */
function onClick() {
  addHashParams(window.location, ISSUE_PREFIX, {id: 8})
}


const octokit = new Octokit({
  userAgent: `bldrs/${PkgJson.version}`,
})


/**
 * Show the issue with the given id.
 * @param {Number} issueId
 * @param {function} setText React state setter for comment text
 * @param {function} setNext React state setter for next Link
 */
async function showIssue(issueId, setText, setNext) {
  const issue = await getIssue(issueId)
  if (issue && issue.data && issue.data.body) {
    const title = issue.data.title
    const body = issue.data.body
    debug().log(`IssuesControl#onHash: got issue id:(${issueId})`, title, body)
    setPanelText(title, body, setText, setNext)
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
    debug().log('IssuesControl#onHash, got code: ', lines)
    if (lines[1].startsWith('url=')) {
      const href = lines[1].split(/=(.+)/)[1]
      debug().log('href: ', href)
      setNext(href)
    }
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
  debug().log(`COMMENT(${commentId}): `, comment)
  if (comment && comment.body) {
    setPanelText('', comment.body, setText, setNext)
  }
}


/**
 * Fetch the resource at the given path from GitHub, substituting in
 * the given args.
 * @param {Object} path The resource path with arg substitution markers
 * @param {Object} args The args to substitute
 * @return {Object} The object at the resource
 */
async function getGitHub(path, args) {
  const account = {
    owner: 'pablo-mayrgundter',
    repo: 'Share',
  }
  return await octokit.request(`GET /repos/{owner}/{repo}/${path}`, {
    ...account,
    ...args,
  })
}


/**
 * Fetch the issue with the given id from GitHub.
 * @param {Number} issueId
 * @return {Object} The issue object.
 */
async function getIssue(issueId) {
  return await getGitHub('issues/{issue_number}', {issue_number: issueId})
}


/**
 * @param {Number} issueId
 * @param {Number} commentId
 * @return {Object} The comment object.
 */
async function getComment(issueId, commentId) {
  const comments = await getGitHub(
      'issues/{issue_number}/comments',
      {
        issue_number: issueId,
      })
  debug().log('COMMENTS: ', comments)
  if (comments && comments.data && comments.data.length > 0) {
    if (commentId > comments.data.length) {
      console.error(`Given commentId(${commentId}) is out of range(${comments.data.length}): `)
      return
    }
    return comments.data[commentId]
  } else {
    console.warn('Empty comments!')
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

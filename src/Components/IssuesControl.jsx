import React, {useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import MuiDialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import Slide from '@mui/material/Slide'
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


const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})


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
  const [isOpen, setIsOpen] = useState(true)
  const [fullWidth] = useState(window.innerWidth <= 900)
  const classes = useStyles()
  console.log('FULL WIDTH: ', fullWidth)
  return (
    <MuiDialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      TransitionComponent={Transition}
      fullWidth={fullWidth}
      scroll='paper'
      BackdropProps={{style: {opacity: 0}}}
      PaperProps={{
        style: {
          padding: 0,
          margin: 0,
          minHeight: '220px',
          maxHeight: '300px',
          width: fullWidth ? '100%' : 'default'}}}
      className={classes.issueDialog}>
      {title &&
       <DialogTitle>
         <h1>{title}</h1>
       </DialogTitle>}
      <DialogContent>
        <Typography paragraph={true}>{body}</Typography>
      </DialogContent>
      <DialogActions sx={{justifyContent: 'center'}}>
        <div>
          {count > 0 &&
           <IconButton
             onClick={() => {
               if (count > 0) {
                 setCount(count - 1)
                 navigate(-1)
               }
             }}>
             <NavPrevIcon/>
           </IconButton>}
          {next &&
           <IconButton
             onClick={() => {
               setCount(count + 1)
               window.location = next
             }}>
             <NavNextIcon/>
           </IconButton>}
        </div>
      </DialogActions>
    </MuiDialog>
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
  issueDialog: {
    'fontFamily': 'Helvetica',
    '& > div': {
      'align-items': 'end',
    },
    '& .MuiPaper-root': {
      padding: '1em',
    },
    '& .MuiButtonBase-root': {
      padding: 0,
      margin: '0.5em',
      borderRadius: '50%',
      border: 'none',
    },
    '& svg': {
      padding: 0,
      margin: 0,
      width: '30px',
      height: '30px',
      border: 'solid 0.5px grey',
      fill: 'black',
      borderRadius: '50%',
    },
    '& h1, & p': {
      fontWeight: 300,
    },
    '& h1': {
      fontSize: '1.2em',
    },
  },
})

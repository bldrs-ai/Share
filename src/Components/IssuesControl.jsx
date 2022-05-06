import React, {useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router'
import Paper from '@mui/material/Paper'
import {ControlButton, TooltipIconButton} from './Buttons'
import debug from '../utils/debug'
import {
  addHashParams,
  getHashParams,
  removeHashParams,
} from '../utils/location'
import {makeStyles} from '@mui/styles'
import {getIssue, getComment} from '../utils/GitHub'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import CommentIcon from '../assets/2D_Icons/Comment.svg'
import IssueCard from './IssueCard'
// import IssueCard1 from './IssueCard1'
import IssueCardReply from './IssueCardReply'
import SearchBar from './SearchComments'


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
      console.log('parsed hash params', p)
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
            onClick = {showIssues}
            navigate={navigate}/> :
        <></>
      }/>)
}


const issues = [
  {
    title: 'Welcome to BLDRS',
    content: 'Welcome Welcome',
  },
  {
    title: 'Future',
    content: `The Architecture,
    Engineering and Construction industries are trying to
    face challenging problems of the future with tools anchored in the past.
    Meanwhile, a new dynamic has propelled the Tech industry: online, collaborative,
    open development. We can't imagine a future where building the rest of the world
    hasn't been transformed by these new ways of working. We are part of that transformation.`,
    media: true,
  },
  {
    title: 'Key Insight',
    content: `The key insights from Tech:
    Cross-functional online collaboration unlocks team flow, productivity and creativity.
    Your team extends outside of your organization and software developers are essential
    team members.An ecosystem of app Creators developing on a powerful operating system
    Platform is the most scalable architecture.Open workspaces, open standards and open
    source code the most powerful way to work. Cooperation is the unfair advantage.`,
  },
  {
    title: 'We are in the process',
    content: `Now we're building.
    We've met and dreamed and planned with a handful of visionaries around the world.
    We're ready to work together to make something big`,
  },
]


/**
 * Displays the comment panel
 * @param {string} body The comment body
 * @param {string|null} title The comment title, optional
 * @param {string|null} next Full URL for next comment link href
 * @param {function|null} navigate React router navigate for back button
 * @return {Object} React component
 */
export function CommentPanel({onClick}) {
  const [selected, setSelected] = useState(null)
  const classes = useStyles()
  console.log('selected', selected)
  return (
    <Paper className = {classes.commentsContainer}>
      <div className = {classes.titleContainer}>
        <div className = {classes.title}>
          <div>All Comments</div>
          <TooltipIconButton
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={()=>onClick()}
            icon={<CloseIcon/>}/>
        </div>
        <SearchBar onClickMenuCb = {()=>{}}/>
      </div>
      <div>
      </div>
      <div className = {classes.cardsContainer}>
        {selected === null?
          issues.map((issue, index)=>{
            <IssueCard
              key = {index}
              title = {issue.title}
              content = {issue.content}
              setSelected = {()=>setSelected(index)}/>
          }):
          <div>
            <IssueCard title = {issues[selected].title} content = {issues[selected].content} setSelected = {()=>setSelected(null)}/>
            <IssueCardReply/>
          </div>
        }
      </div>
    </Paper>
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
  commentsContainer: {
    'width': '290px',
    'height': '88%',
    'minHeight': '560px',
    'position': 'absolute',
    'top': '20px',
    'right': '86px',
    'border': '1px solid lightGrey',
    '@media (max-width: 900px)': {
      width: '290px',
      height: '330px',
      minHeight: '300px',
      position: 'absolute',
      top: '240px',
      right: '80px',
    },
  },
  titleContainer: {
    height: '100px',
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
    height: '20px',
    width: '90%',
    margin: '12px 12px 6px 12px',
    paddingBottom: '10px',
  },
  cardsContainer: {
    'overflow': 'scroll',
    'height': '78%',
    // 'display': 'flex',
    // 'flexDirection': 'column',
    // 'justifyContent': 'center',
    // 'alignItems': 'center',
    // 'border': '1px solid red',
    '@media (max-width: 900px)': {
      height: '210px',
    },
  },
})

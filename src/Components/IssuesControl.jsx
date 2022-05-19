import React, {useEffect, useState} from 'react'
import {useLocation, useNavigate, useParams} from 'react-router'
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
// import AddCommentIcon from '../assets/2D_Icons/AddComment.svg'
import CommentIcon from '../assets/2D_Icons/Comment.svg'
import Back from '../assets/2D_Icons/Back.svg'
import IssueCard from './IssueCard'
import IssueCardInput from './IssueCardInput'
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
        addComment ?
          <CommentPanelAdd
            body={body}
            title={title}
            next={next}
            onClick = {showIssues}
            onAddComment = {()=>setAddComment(!addComment)}
            navigate={navigate}/> :
          <CommentPanelAll
            body={body}
            title={title}
            next={next}
            onClick = {showIssues}
            onAddComment = {()=>setAddComment(!addComment)}
            navigate={navigate}/>
      }/>)
}


const issues = [
  {
    title: 'Welcome to BLDRS',
    content: 'Welcome to Comments',
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
    team members.An ecosystem of app Creators developing on a powerful operating system. /n
    Platform is the most scalable architecture.Open workspaces, open standards and open
    source code the most powerful way to work. Cooperation is the unfair advantage.`,
  },
]
const images = [
  `https://images.adsttc.com/media/images/5983/68cf/b22e/3899/4f00/0134/medium_jpg/rp-whitney1.jpg?1501784269`,
  // eslint-disable-next-line
  `https://cdn.wallpaper.com/main/styles/responsive_920w_scale/s3/legacy/gallery/17050184/testuser5_nov2007_02_99_0144_1_M_8Way0w_9faOgx.jpg`,
  // eslint-disable-next-line
  `https://cdn.wallpaper.com/main/styles/responsive_920w_scale/s3/legacy/gallery/17050184/testuser5_nov2007_07_338_0035_1_M_jXay0w_ggaOgx.jpg`,
  // eslint-disable-next-line
  `https://cdn.wallpaper.com/main/styles/responsive_920w_scale/s3/legacy/gallery/17050184/testuser5_nov2007_02_99_0144_1_M_8Way0w_9faOgx.jpg`,
  // eslint-disable-next-line
  `https://cdn.wallpaper.com/main/styles/responsive_920w_scale/s3/legacy/gallery/17050184/testuser5_nov2007_02_99_0144_1_M_8Way0w_9faOgx.jpg`,
]


/**
 * Displays the comment panel
 * @param {string} body The comment body
 * @param {string|null} title The comment title, optional
 * @param {string|null} next Full URL for next comment link href
 * @param {function|null} navigate React router navigate for back button
 * @return {Object} React component
 */
export function CommentPanelAll({onClick, onAddComment}) {
  const [selected, setSelected] = useState(null)
  const classes = useStyles()
  return (
    <Paper className = {classes.commentsContainer}>
      <div className = {classes.title}>
        {/* <div>{selected !== null ? issues[selected].title : 'Comments'}</div> */}
        {/* <div>
          {selected !== null?
            <TooltipIconButton
              title='Back'
              size = 'small'
              placement = 'bottom'
              onClick={()=>setSelected(null)}
              icon={<Back/>}/>:
            <TooltipIconButton
              title='Add'
              size = 'small'
              placement = 'bottom'
              onClick={()=>onAddComment()}
              icon={<AddCommentIcon/>}
            />

          }
          <TooltipIconButton
            title='Close'
            size = 'small'
            placement = 'bottom'
            onClick={()=>onClick()}
            icon={<CloseIcon/>}/>
        </div> */}
      </div>
      <div className = {classes.searchContainer}>
        <SearchBar onClickMenuCb = {()=>{}}/>
      </div>
      <div>
      </div>
      <div className = {classes.cardsContainer}>
        {selected === null?
          issues.map((issue, index)=>{
            return (
              <IssueCard
                key = {index}
                expandedImage = {index === 0 || index === 2?true:false}
                title = {issue.title}
                content = {issue.content}
                imageSrc = {images[index]}
                setSelected = {()=>{
                  setSelected(index)
                }}/>
            )
          }):
          <div>
            <IssueCard
              title = {issues[selected].title}
              imageSrc = {images[selected]}
              content = {'Welcome to Comments'}
              setSelected = {()=>setSelected(null)}
              selected = {true}
            />
            <div style = {{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'flex-end'}}>
              <IssueCardReply
                title = {'RE: First Reply'}
                content = {issues[2].content}
                setSelected = {()=>setSelected(null)}
              />
              <IssueCardReply
                title = {'RE: Second Reply'}
                content = {issues[2].content}
                setSelected = {()=>setSelected(null)}
                imageSrc = {images[2]}
              />
            </div>
          </div>
        }
      </div>
    </Paper>
  )
}


/**
 * Displays the comment panel
 * @param {string} body The comment body
 * @param {string|null} title The comment title, optional
 * @param {string|null} next Full URL for next comment link href
 * @param {function|null} navigate React router navigate for back button
 * @return {Object} React component
 */
export function CommentPanelAdd({onClick, onAddComment}) {
  const classes = useStyles()
  const params = useParams()
  const isElementSelected = params['*'].includes('.ifc/')
  return (
    <Paper className = {classes.addContainer}>
      <div className = {classes.title}>
        <div>Add a Comment</div>
        <div>
          <TooltipIconButton
            title='Back'
            size = 'small'
            placement = 'bottom'
            onClick={()=>onAddComment()}
            icon={<Back/>}/>
          <TooltipIconButton
            title='Close'
            size = 'small'
            placement = 'bottom'
            onClick={()=>onClick()}
            icon={<CloseIcon/>}/>
        </div>
      </div>
      <div className = {classes.cardsContainerAdd}>
        {
          isElementSelected ?
          null :
          <div className = {classes.selectMessage}>
            Please select an element to attach a comment.
          </div>
        }
        <IssueCardInput onSubmit={()=>onAddComment()}/>
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
    'minHeight': '330px',
    // 'position': 'absolute',
    // 'top': '20px',
    // 'right': '86px',
    '@media (max-width: 900px)': {
      width: '290px',
      height: '330px',
      minHeight: '300px',
      position: 'absolute',
      top: '240px',
      right: '80px',
    },
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
    '&::-webkit-scrollbar': {
      display: 'none',
    },
    '@media (max-width: 900px)': {
      height: '210px',
    },
  },
  cardsContainerAdd: {
    'overflowY': 'scroll',
    'overflowX': 'hidden',
    'height': '78%',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
    '@media (max-width: 900px)': {
      height: 'auto',
    },
  },
  selectMessage: {
    fontSize: '14px',
    width: '100%',
    paddingLeft: '15px',
    paddingRight: '15px',
    display: 'flex',
    justifyContent: 'center',
    color: 'red',
  },
})

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
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import {removeHashParams} from '../utils/location'
import {setCameraFromEncodedPosition, addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import {addHashParams} from '../utils/location'


/** The prefix to use for issue id in the Url hash. */
export const ISSUE_PREFIX = 'i'
const regex = new RegExp(`${ISSUE_PREFIX}:(\\d+)(?::(\\d+))?`)


/**
 * @return {Object} Issues NavBar
 */
export function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const selectedIssueIndex = useStore((state) => state.selectedIssueIndex)
  const issues = useStore((state) => state.issues)
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)


  useEffect(() => {
    if (!selectedIssueId) {
      removeCameraUrlParams()
    }
  }, [selectedIssueId])

  const selectIssue = (direction) => {
    let index
    direction === 'next' ? index = selectedIssueIndex + 1 : index = selectedIssueIndex - 1

    if (index >= 0 && index < issues.length) {
      const issue = issues.filter((issue) => issue.index === index)[0]
      setSelectedIssueId(issue.id)
      setSelectedIssueIndex(issue.index)
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
    <div className={classes.titleContainer}>
      <div className={classes.leftGroup}>
        <div className={classes.title}>
          {!selectedIssueId ? 'Notes' : 'Note' }
        </div>
      </div>
      <div className={classes.rightGroup}>
        <div className={classes.controls} >
          {selectedIssueId &&
          <>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              size='small'
              onClick={() => {
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<Back style={{width: '30px', height: '30px'}}/>}/>
            <>
              <TooltipIconButton
                title='Previous Comment'
                placement='bottom'
                size='small'
                onClick={() => selectIssue('previous')}
                icon={<Previous style={{width: '20px', height: '20px'}}/>}/>
              <TooltipIconButton
                title='Next Comment'
                size='small'
                placement='bottom'
                onClick={() => selectIssue('next')}
                icon={<Next style={{width: '20px', height: '20px'}}/>}/>
            </>
          </>
          }
        </div>
        <TooltipIconButton
          title='Close Comments'
          placement='bottom'
          onClick={toggleIsCommentsOn}
          icon={<CloseIcon style={{width: '24px', height: '24px'}}/>}/>
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
  const issues = useStore((state) => state.issues)
  const setIssues = useStore((state) => state.setIssues)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredIssue = selectedIssueId ? issues.filter((issue) => issue.id === selectedIssueId)[0] : null

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const issues = await getIssues()
        const issuesArr = []

        issues.data.map((issue, index) => {
          const lines = issue.body.split('\r\n')
          const embeddedUrl = lines.filter((line) => line.includes('url'))[0]
          const body = lines[0]
          let imageUrl = ''

          if (issue.body.includes('img')) {
            const isolateImageSrc = issue.body.split('src')[1].split('imageURL')[0]

            // Match either single or double quote-wrapped attribute
            //   <img src = "..." /> OR <img src = '...' />
            const imageSrc = isolateImageSrc.match(/"([^"]*)"|'([^']*)'/)

            // Then filter out the non-matched capture group (as that value will be undefined)
            imageUrl = imageSrc.slice(1).filter((u) => u !== undefined)[0]
          }

          const constructedIssueObj = {
            embeddedUrl: embeddedUrl,
            index: index,
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: body,
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
            imageUrl: imageUrl,
          }
          issuesArr.push(
              constructedIssueObj,
          )
        })
        setIssues(issuesArr)
      } catch {
        debug().log('failed to fetch issues')
      }
    }
    fetchIssues()
  }, [setIssues])


  useEffect(() => {
    const fetchComments = async (selectedIssue) => {
      try {
        const comments = await getComments(selectedIssue.number)
        const commentsArr = []
        let commentImageUrl

        comments.map((comment) => {
          const lines = comment.body.split('\r\n')
          const embeddedUrl = lines.filter((line) => line.includes('url'))[0]
          commentImageUrl = comment.body.split('ImageUrl')[1]
          const body = lines[0]
          commentsArr.push(
              {
                embeddedUrl: embeddedUrl,
                id: comment.id,
                number: comment.number,
                title: comment.title,
                body: body,
                date: comment.created_at,
                username: comment.user.login,
                avatarUrl: comment.user.avatar_url,
                imageUrl: commentImageUrl,
              },
          )
        })
        setComments(commentsArr)
      } catch {
        debug().log('failed to fetch comments')
      }
    }
    selectedIssueId !== null ?
    fetchComments(filteredIssue) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId, issues])

  return (
    <Paper className={classes.commentsContainer} elevation={0}>
      <div className={classes.cardsContainer}>
        {!selectedIssueId ?
          issues.map((issue, index) => {
            return (
              <IssueCard
                embeddedUrl={issue.embeddedUrl}
                index={issue.index}
                id={issue.id}
                key={index}
                title={issue.title}
                date={issue.date}
                body={issue.body}
                username={issue.username}
                numberOfComments={issue.numberOfComments}
                avatarUrl={issue.avatarUrl}
                imageUrl={issue.imageUrl}/>
            )
          }) :
        <>
          { filteredIssue ?
            <IssueCard
              embeddedUrl={filteredIssue.embeddedUrl}
              index={filteredIssue.index}
              id={filteredIssue.id}
              key={filteredIssue.id}
              title={filteredIssue.title}
              date={filteredIssue.date}
              body={filteredIssue.body}
              username={filteredIssue.username}
              numberOfComments={filteredIssue.numberOfComments}
              avatarUrl={filteredIssue.avatarUrl}
              imageUrl={filteredIssue.imageUrl}/> :
              <div>loading</div>
          }
          { comments &&
              comments.map((comment, index) => {
                return (
                  <IssueCard
                    embeddedUrl={comment.embeddedUrl}
                    isReply={true}
                    index=''
                    id={comment.id}
                    key={comment.id}
                    title={index + 1}
                    date={comment.date}
                    body={comment.body}
                    username={comment.username}
                    numberOfReplies=''
                    avatarUrl={comment.avatarUrl}
                    imageUrl={comment.imageUrl}/>
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
    borderRadius: '2px',
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
    'width': '100%',
    'paddingTop': '10px',
    'paddingBottom': '30px',
    '@media (max-width: 900px)': {
      paddingTop: '0px',
    },
  },
}))

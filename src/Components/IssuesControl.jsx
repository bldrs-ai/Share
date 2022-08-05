import React, {useEffect} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import Paper from '@mui/material/Paper'
import useStore from '../store/useStore'
import {getIssues, getComments} from '../utils/GitHub'
import debug from '../utils/debug'
import {addHashParams, removeHashParams} from '../utils/location'
import IssueCard from './IssueCard'
import {TooltipIconButton} from './Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import BackIcon from '../assets/2D_Icons/Back.svg'
import NextIcon from '../assets/2D_Icons/NavNext.svg'
import PreviousIcon from '../assets/2D_Icons/NavPrev.svg'


/** The prefix to use for issue id in the Url hash. */
export const ISSUE_PREFIX = 'i'


/** @return {Object} React component. */
export function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const issues = useStore((state) => state.issues)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const selectedIssueIndex = useStore((state) => state.selectedIssueIndex)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)


  useEffect(() => {
    if (!selectedIssueId) {
      removeCameraUrlParams()
    }
  }, [selectedIssueId])


  const selectIssue = (direction) => {
    const index = direction === 'next' ? selectedIssueIndex + 1 : selectedIssueIndex - 1
    if (index >= 0 && index < issues.length) {
      const issue = issues.filter((i) => i.index === index)[0]
      setSelectedIssueId(issue.id)
      setSelectedIssueIndex(issue.index)
      addHashParams(window.location, ISSUE_PREFIX, {id: issue.id})
      if (issue.url) {
        setCameraFromParams(issue.url)
        addCameraUrlParams()
      } else {
        removeCameraUrlParams()
      }
    }
  }


  return (
    <div className={classes.titleContainer}>
      <div className={classes.leftGroup}>
        {selectedIssueId ? null : 'Notes' }
        {selectedIssueId ?
          <div style={{marginLeft: '-12px'}}>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              size='small'
              onClick={() => {
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<BackIcon style={{width: '30px', height: '30px'}}/>}
            />
          </div> : null
        }
      </div>

      <div className={classes.middleGroup} >
        {selectedIssueId && issues.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              placement='bottom'
              size='small'
              onClick={() => selectIssue('previous')}
              icon={<PreviousIcon style={{width: '20px', height: '20px'}}/>}
            />
            <TooltipIconButton
              title='Next Note'
              size='small'
              placement='bottom'
              onClick={() => selectIssue('next')}
              icon={<NextIcon style={{width: '20px', height: '20px'}}/>}
            />
          </>
        }
      </div>

      <div className={classes.rightGroup}>
        <div className={classes.controls}>
        </div>
        <TooltipIconButton
          title='Close Comments'
          placement='bottom'
          onClick={turnCommentsOff}
          icon={<CloseIcon style={{width: '24px', height: '24px'}}/>}
        />
      </div>
    </div>
  )
}


/** @return {Object} List of issues and comments as react component. */
export function Issues() {
  const classes = useStyles()
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const issues = useStore((state) => state.issues)
  const setIssues = useStore((state) => state.setIssues)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredIssue = selectedIssueId ?
        issues.filter((issue) => issue.id === selectedIssueId)[0] : null
  const repository = useStore((state) => state.repository)


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Issues: 1, no repo defined')
      return
    }
    const fetchIssues = async () => {
      try {
        const issuesArr = []
        const issuesData = await getIssues(repository)
        issuesData.data.slice(0).reverse().map((issue, index) => {
          if (issue.body === null) {
            debug().warn(`issue ${index} has no body: `, issue)
            return null
          }
          issuesArr.push({
            index: index,
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
          })
        })
        if (issuesArr.length > 0) {
          setIssues(issuesArr)
        }
      } catch (e) {
        debug().warn('failed to fetch issues', e)
      }
    }
    fetchIssues()
  }, [setIssues, repository])

  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Issues: 2, no repo defined')
      return
    }
    const fetchComments = async (selectedIssue) => {
      try {
        const commentsArr = []
        const commentsData = await getComments(repository, selectedIssue.number)
        if (commentsData) {
          commentsData.map((comment) => {
            commentsArr.push({
              id: comment.id,
              number: comment.number,
              title: comment.title,
              body: comment.body,
              date: comment.created_at,
              username: comment.user.login,
              avatarUrl: comment.user.avatar_url,
            })
          })
        }
        setComments(commentsArr)
      } catch {
        debug().log('failed to fetch comments')
      }
    }
    if (selectedIssueId !== null) {
      fetchComments(filteredIssue)
    }
    // this useEffect runs everytime issues are fetched to enable fetching the comments when the platform is open
    // using the link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId, issues, repository])


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
                imageUrl={issue.imageUrl}
              />
            )
          }) :
        <>
          {filteredIssue ?
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
             imageUrl={filteredIssue.imageUrl}
           /> :
           <div>loading</div>
          }
          {comments &&
           comments.map((comment, index) => {
             return (
               <IssueCard
                 embeddedUrl={comment.embeddedUrl}
                 isComment={true}
                 index=''
                 id={comment.id}
                 key={comment.id}
                 title={index + 1}
                 date={comment.date}
                 body={comment.body}
                 username={comment.username}
                 avatarUrl={comment.avatarUrl}
                 imageUrl={comment.imageUrl}
               />
             )
           })
          }
        </>
        }
      </div>
    </Paper>
  )
}


const useStyles = makeStyles((theme) => ({
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: '2px',
  },
  title: {
    height: '30px',
    display: 'flex',
    fontSize: '18px',
    textDecoration: 'underline',
    fontWeight: 'bold',
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
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'flex-end',
    'alignItems': 'center',
    'paddingRight': '5px',
    '@media (max-width: 900px)': {
      paddingRight: '0px',
    },
  },
  middleGroup: {
    width: '400px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftGroup: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'center',
    'alignItems': 'center',
    'height': '30px',
    'fontSize': '18px',
    'textDecoration': 'underline',
    'fontWeight': 'bold',
    'paddingLeft': '16px',
    '@media (max-width: 900px)': {
      paddingLeft: '6px',
    },
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

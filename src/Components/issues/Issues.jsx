import React, {useEffect} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import useTheme from '../../Theme'
import {getIssues, getComments} from '../../utils/GitHub'
import Loader from '../Loader'
import NoContent from '../NoContent'
import IssueCard from './IssueCard'
import IssueCardInput from './IssueCardInput'
import {TooltipIconButton} from '../Buttons'
import {
  setCameraFromParams,
  addCameraUrlParams,
  removeCameraUrlParams} from '../CameraControl'
import {addHashParams, removeHashParams} from '../../utils/location.js'
import AddNote from '../../assets/2D_Icons/AddNote.svg'
import BackIcon from '../../assets/2D_Icons/Back.svg'
import CloseIcon from '../../assets/2D_Icons/Close.svg'
import NextIcon from '../../assets/2D_Icons/NavNext.svg'
import PreviousIcon from '../../assets/2D_Icons/NavPrev.svg'

/** The prefix to use for issue id in the Url hash. */
export const ISSUE_PREFIX = 'i'


/** @return {object} React component. */
export function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const issues = useStore((state) => state.issues)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const selectedIssueIndex = useStore((state) => state.selectedIssueIndex)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)
  const isAddNote = useStore((state) => state.isAddNote)
  const toggleIsAddNote = useStore((state) => state.toggleIsAddNote)
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
        <Typography variant='h2'>
          {!selectedIssueId && 'Notes' }
        </Typography>

        {selectedIssueId ?
          <Box>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              onClick={() => {
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<BackIcon/>}
            />
          </Box> : null
        }
      </div>

      <div className={classes.middleGroup} >
        {(issues && selectedIssueId) && issues.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              placement='bottom'
              size='small'
              onClick={() => selectIssue('previous')}
              icon={<PreviousIcon/>}
            />
            <TooltipIconButton
              title='Next Note'
              size='small'
              placement='bottom'
              onClick={() => selectIssue('next')}
              icon={<NextIcon/>}
            />
          </>
        }
      </div>

      <div className={classes.rightGroup}>
        {isAddNote ?
        <TooltipIconButton
          title='Back to the list'
          placement='bottom'
          onClick={toggleIsAddNote}
          icon={<BackIcon/>}
        /> :
        <TooltipIconButton
          title='Add new note'
          placement='bottom'
          onClick={toggleIsAddNote}
          icon={<AddNote/>}
        />
        }
        <TooltipIconButton
          title='Close Comments'
          placement='bottom'
          onClick={turnCommentsOff}
          icon={<div className={classes.iconContainerClose}><CloseIcon/></div>}
        />
      </div>
    </div>
  )
}


/** @return {object} List of issues and comments as react component. */
export default function Issues() {
  const classes = useStyles()
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const issues = useStore((state) => state.issues)
  const setIssues = useStore((state) => state.setIssues)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const isAddNote = useStore((state) => state.isAddNote)
  const filteredIssue = (issues && selectedIssueId) ?
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
        } else {
          setIssues([])
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
    // This address bug #314 by clearing selected issue when new model is loaded
    if (!filteredIssue) {
      setSelectedIssueId(null)
    }
    // this useEffect runs everytime issues are fetched to enable fetching the comments when the platform is open
    // using the link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIssue, repository, setComments])

  return (
    <Paper className={classes.commentsContainer} elevation={0}>
      {isAddNote ?
      <Box sx={{paddingTop: '10px'}}>
        <IssueCardInput/>
      </Box> :
          <div className={classes.cardsContainer}>
            {issues === null && <Loader type={'linear'}/> }
            {issues && issues.length === 0 && <NoContent/> }
            {issues && !selectedIssueId ?
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
               /> : null
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
      }
    </Paper>
  )
}


const useStyles = makeStyles((theme) => ({
  commentsContainer: {
    width: '100%',
  },
  cardsContainer: {
    'display': 'flex',
    'flexDirection': 'column',
    'alignItems': 'center',
    'resizeMode': 'contain',
    'width': '100%',
    'paddingTop': '10px',
    'paddingBottom': '30px',
    '@media (max-width: 900px)': {
      paddingTop: '0px',
    },
  },
}))

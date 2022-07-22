import React, {useEffect} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import Paper from '@mui/material/Paper'
import {getIssues, getComments} from '../utils/GitHub'
import debug from '../utils/debug'
import {addHashParams, removeHashParams} from '../utils/location'
import useStore from '../store/useStore'
import IssueCard from './IssueCard'
import {TooltipIconButton} from './Buttons'
import {setCameraFromEncodedPosition, addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import Back from '../assets/2D_Icons/Back.svg'
import Next from '../assets/2D_Icons/NavNext.svg'
import Previous from '../assets/2D_Icons/NavPrev.svg'


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
          {selectedIssueId ? 'Note' : 'Notes' }
        </div>
      </div>
      <div className={classes.rightGroup}>
        <div className={classes.controls}>
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
               icon={<Back style={{width: '30px', height: '30px'}}/>}
             />
             <>
               <TooltipIconButton
                 title='Previous Comment'
                 placement='bottom'
                 size='small'
                 onClick={() => selectIssue('previous')}
                 icon={<Previous style={{width: '20px', height: '20px'}}/>}
               />
               <TooltipIconButton
                 title='Next Comment'
                 size='small'
                 placement='bottom'
                 onClick={() => selectIssue('next')}
                 icon={<Next style={{width: '20px', height: '20px'}}/>}
               />
             </>
           </>
          }
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

/**
 * Extracts the image URL from the issue body, if present
 * @param {Object} issue
 * @return {string} Issue image URL
 */
export const extractImageFromIssue = (issue) => {
  if (issue === null || issue.body === null || !issue.body.includes('img')) {
    return ''
  }

  const isolateImageSrc = issue.body.split('src')[1].split('imageURL')[0]

  // Match either single or double quote-wrapped attribute
  //   <img src = "..." /> OR <img src = '...' />
  const imageSrc = isolateImageSrc.match(/"([^"]*)"|'([^']*)'/)

  // Then filter out the non-matched capture group (as that value will be undefined)
  return imageSrc.slice(1).filter((u) => u !== undefined)[0]
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
          const lines = issue.body.split('\r\n')
          const embeddedUrl = lines.filter((line) => line.includes('url'))[0]
          const body = lines[0]
          const imageUrl = extractImageFromIssue(issue)
          issuesArr.push({
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
            const lines = comment.body.split('\r\n')
            const embeddedUrl = lines.filter((line) => line.includes('url'))[0]
            const commentImageUrl = comment.body.split('imageURL')[1]
            const body = lines[0]
            commentsArr.push({
              embeddedUrl: embeddedUrl,
              id: comment.id,
              number: comment.number,
              title: comment.title,
              body: body,
              date: comment.created_at,
              username: comment.user.login,
              avatarUrl: comment.user.avatar_url,
              imageUrl: commentImageUrl,
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

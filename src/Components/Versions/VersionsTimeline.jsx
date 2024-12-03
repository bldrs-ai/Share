import React, {ReactElement, useState, useEffect} from 'react'
import Timeline from '@mui/lab/Timeline'
import TimelineConnector from '@mui/lab/TimelineConnector'
import TimelineContent from '@mui/lab/TimelineContent'
import TimelineDot from '@mui/lab/TimelineDot'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {useTheme} from '@mui/material/styles'
import {styled} from '@mui/system'
import Loader from '../Loader'
import NoContent from '../NoContent'
import CommitIcon from '@mui/icons-material/Commit'


/**
 * VersionsTimeline displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided branch and displays it.
 *
 * @property {Array<object>} commits An array of commits
 * @property {string} currentRef To indicate as active in the UI
 * @property {Function} commitNavigateCb A callback function to navigate to a specific commit
 * @return {ReactElement}
 */
export default function VersionsTimeline({commits, currentRef, commitNavigateCb}) {
  const [showLoginMessage, setShowLoginMessage] = useState(false)

  const timeoutMillis = 4000
  useEffect(() => {
    // Set a timeout to display the login message after 4 seconds if commits is still empty
    const timer = setTimeout(() => {
      if (commits.length === 0) {
        setShowLoginMessage(true)
      }
    }, timeoutMillis)
    // Clear the timeout if commits is populated or the component unmounts
    return () => clearTimeout(timer)
  }, [commits])

  const shaLength = 40
  const refIsSha = currentRef.length === shaLength
  return (
    <Timeline data-testid='timeline-list'>
      {commits.length === 0 && !showLoginMessage && <Loader/>}
      {showLoginMessage && (
        <NoContent message='Please log into GitHub to use the project timeline'/>)}
      {commits.map((commit, i) => (
        <CustomTimelineItem key={i} onClick={() => commitNavigateCb(i)}>
          <TimelineInfo
            commit={commit}
            active={
              (refIsSha && commit.sha === currentRef) ?
                true :
                (!refIsSha && i === 0)
            }
          />
        </CustomTimelineItem>
      ))}
    </Timeline>
  )
}


/**
 * TimelineInfo displays detailed information related to a version on the timeline.
 *
 * @property {object} version The version data to be displayed
 * @property {boolean} active Indicates if the current item is active
 * @return {ReactElement}
 */
function TimelineInfo({commit, active}) {
  const theme = useTheme()
  const dotColor = active ?
      theme.palette.secondary.active :
      theme.palette.secondary.main
  return (
    <>
      <TimelineSeparator>
        <TimelineConnector/>
        <TimelineDot sx={{bgcolor: dotColor}} data-testid='commit'>
          <CommitIcon sx={{transform: active ? 'none' : 'rotate(90deg)'}}/>
        </TimelineDot>
        <TimelineConnector/>
      </TimelineSeparator>
      <TimelineOppositeContent
        sx={{padding: '10px 0px 10px 10px'}}
        color={active ? 'text.secondary' : 'inherit'}
      >
        <Paper
          elevation={active ? 4 : 1}
          sx={{
            overflow: 'hidden',
            width: '174px',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          <Stack
            direction='column'
            justifyContent='flex-start'
            alignItems='flex-start'
            sx={{padding: '6px 10px'}}
          >
            <Stack
              direction='column'
              justifyContent='flex-start'
              alignItems='flex-start'
              sx={{
                marginBottom: '10px',
                width: '100%',
              }}
            >
              <Typography variant='caption'>
                {commit.authorName}
              </Typography>
              <Typography variant='caption'>
                {commit.commitDate}
              </Typography>
            </Stack>
            <Typography variant='caption'
              sx={{
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
              }}
            >
              {commit.commitMessage}
            </Typography>
          </Stack>
        </Paper>
      </TimelineOppositeContent>
      <TimelineContent sx={{width: '40px', py: '12px', px: 2, lineHeight: '1em'}}/>
    </>
  )
}


/**
 * CustomTimelineItem is a styled version of MUI's TimelineItem component
 * with specific styles applied when the MuiTimelineItem-missingOppositeContent
 * class is present.
 */
const CustomTimelineItem = styled(TimelineItem)(({theme}) => ({
  '&.MuiTimelineItem-missingOppositeContent': {
    '&::before': {
      padding: 0,
    },
    '& .MuiTimelineOppositeContent-root': {
      textAlign: 'left',
    },
  },
}))

/* eslint-disable no-magic-numbers */
import React, {useState, useEffect} from 'react'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Timeline from '@mui/lab/Timeline'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import TimelineConnector from '@mui/lab/TimelineConnector'
import TimelineContent from '@mui/lab/TimelineContent'
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent'
import TimelineDot from '@mui/lab/TimelineDot'
import Typography from '@mui/material/Typography'
import CommitIcon from '@mui/icons-material/Commit'
import ControlPointIcon from '@mui/icons-material/ControlPoint'
import Loader from './Loader'
import {styled} from '@mui/system'


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


/**
 * TimelineInfo displays detailed information related to a version on the timeline.
 *
 * @param {object} version - The version data to be displayed.
 * @param {boolean} active - Indicates if the current item is active.
 * @return {object} A component that displays version details.
 */
function TimelineInfo({commit, active}) {
  return (
    <>
      <TimelineSeparator>
        <TimelineConnector/>
        <TimelineDot color={active ? 'primary' : 'inherit'} data-testid='commit'>
          {(commit.commitMessage.includes('Create') || commit.commitMessage.includes('Add')) ?
            <ControlPointIcon/> :
            <CommitIcon sx={{transform: 'rotate(90deg)'}}/>
          }
        </TimelineDot>
        <TimelineConnector/>
      </TimelineSeparator>
      <TimelineOppositeContent
        sx={{padding: '10px 0px 10px 10px'}}
        color={active ? 'text.primary' : 'text.secondary'}
      >
        <Paper
          elevation={active ? 4 : 1}
          sx={{
            overflow: 'hidden',
            width: '174px',
            borderRadius: '10px',
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
 * VersionsTimeline displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided branch and displays it.
 *
 * @param {Array} versionHistory - An array containing the version history data.
 * @param {string} branch - The git branch for which commits are fetched.
 * @return {object} A timeline of versions.
 */
export default function CustomTimeline({commitData}) {
  const [active] = useState(0)
  const [showLoginMessage, setShowLoginMessage] = useState(false)

  useEffect(() => {
    // Set a timeout to display the login message after 7 seconds if commitData is still empty
    const timer = setTimeout(() => {
      if (commitData.length === 0) {
        setShowLoginMessage(true)
      }
    }, 7000)

    // Clear the timeout if commitData is populated or the component unmounts
    return () => clearTimeout(timer)
  }, [commitData])

  return (
    <Timeline>
      {commitData.length === 0 && !showLoginMessage && <Loader/>}
      {showLoginMessage && (
        <p>Please log in using your GitHub account to get access to the project timeline.</p>
      )}
      {commitData.map((commit, i) => (
        <CustomTimelineItem key={i}>
          <TimelineInfo commit={commit} active={active === i}/>
        </CustomTimelineItem>
      ))}
    </Timeline>
  )
}

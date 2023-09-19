/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import Timeline from '@mui/lab/Timeline'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import TimelineConnector from '@mui/lab/TimelineConnector'
import TimelineContent from '@mui/lab/TimelineContent'
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent'
import TimelineDot from '@mui/lab/TimelineDot'
import Typography from '@mui/material/Typography'
import ArchitectureIcon from '@mui/icons-material/Architecture'
import EngineeringIcon from '@mui/icons-material/Engineering'


/**
 * Verison history timeline component
 *
 * @property {Array<object>} versionHistory object containing versions information
 * @return {React.Component}
 */
export default function VersionsTimeline({versionHistory}) {
  const [active, setActive] = useState(0)
  return (
    <Paper sx={{overflow: 'scroll'}}>
      <Timeline>
        {versionHistory.map((version, i) => {
          return (
            <TimelineItem key={i} onClick={() => setActive(i)} sx={{cursor: 'pointer'}}>
              <TimelineOppositeContent
                sx={{m: 'auto 0'}}
                align="center"
                color={active === i ? 'text.primary' : 'text.secondary'}
              >
                <Typography variant="body2" >
                  {version.name}
                </Typography>
                <Typography variant="caption" >
                  {version.date}
                </Typography>
              </TimelineOppositeContent>
              <TimelineSeparator>
                <TimelineConnector/>
                <TimelineDot
                  color={active === i ? 'primary' : 'secondary'}
                >
                  {version.icon === 'architecture' ?
                    <ArchitectureIcon data-testid="architecture-icon"/> :
                    <EngineeringIcon data-testid="engineering-icon"/>
                  }
                </TimelineDot>
                <TimelineConnector/>
              </TimelineSeparator>
              <TimelineContent sx={{py: '12px', px: 2, lineHeight: '1em'}} >
                <Paper
                  variant='background'
                  elevation={active === i ? 4 : 1}
                  sx={{padding: '8px'}}
                >
                  <Typography
                    variant="caption"
                    sx={{wordBreak: 'normal'}}
                  >
                    {version.description}
                  </Typography>
                </Paper>
              </TimelineContent>
            </TimelineItem>
          )
        })
        }
      </Timeline>
    </Paper>
  )
}

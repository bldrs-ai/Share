import React, {ReactElement, useState} from 'react'
import {Box, Collapse, IconButton, Paper, Stack, Typography} from '@mui/material'
import {
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import useStore from '../store/useStore'


const MONO_SX = {
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  whiteSpace: 'pre',
}


/**
 * Status-bar load progress expando (conway #301 follow-up): collapsed, a
 * one-liner of the current stage's animated line ("Geometry [0%....56%]
 * 41.0s, +388 MB heap"); expanded, the accumulated report lines above it —
 * the exact text the JS console shows (design/new/load-log-format.md).
 * Renders nothing when no load is in flight (the post-load report lives in
 * LoadReportControl's dialog instead).
 *
 * @return {ReactElement|null}
 */
export default function LoadStatusSlot() {
  const currentLoadLine = useStore((state) => state.currentLoadLine)
  const loadReportLines = useStore((state) => state.loadReportLines)
  const [isExpanded, setIsExpanded] = useState(false)

  if (currentLoadLine === null) {
    return null
  }

  return (
    <Paper
      variant='control'
      data-testid='LoadStatusSlot'
      sx={{px: 1, py: 0.25, maxWidth: '60vw', overflow: 'hidden'}}
    >
      <Collapse in={isExpanded}>
        <Box sx={{...MONO_SX, opacity: 0.8, overflowX: 'auto'}} data-testid='LoadStatusHistory'>
          {loadReportLines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </Box>
      </Collapse>
      <Stack direction='row' alignItems='center' spacing={0.5}>
        <IconButton
          size='small'
          aria-label={isExpanded ? 'Collapse load log' : 'Expand load log'}
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid='LoadStatusExpandToggle'
        >
          {isExpanded ? <ExpandMoreIcon fontSize='inherit'/> : <ExpandLessIcon fontSize='inherit'/>}
        </IconButton>
        <Typography component='span' sx={MONO_SX} data-testid='LoadStatusLine'>
          {currentLoadLine}
        </Typography>
      </Stack>
    </Paper>
  )
}

import React from 'react'
import {Box, Stack, Typography} from '@mui/material'
import {
  Description as DocIcon,
  InsertDriveFile as FileIcon,
  Slideshow as SlidesIcon,
  TableChart as SheetsIcon,
} from '@mui/icons-material'


const MS_PER_MINUTE = 60000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_BEFORE_DATE_DISPLAY = 5


/**
 * Maps a MIME type to a colored icon element.
 *
 * @param {object} props
 * @param {string} [props.mimeType]
 * @return {React.ReactElement}
 */
function FileTypeIcon({mimeType}) {
  if (mimeType === 'application/vnd.google-apps.document') {
    return <DocIcon sx={{color: '#4285F4'}} fontSize='small'/>
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return <SheetsIcon sx={{color: '#0F9D58'}} fontSize='small'/>
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return <SlidesIcon sx={{color: '#F4B400'}} fontSize='small'/>
  }
  return <FileIcon sx={{color: 'text.secondary'}} fontSize='small'/>
}


/**
 * Formats a UTC timestamp (ms) as a relative or absolute date string.
 *
 * @param {number|null|undefined} utcMs
 * @return {string|null}
 */
function formatRelativeTime(utcMs) {
  if (!utcMs) {
    return null
  }
  const diffMs = Date.now() - utcMs
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE)
  if (diffMins < MINUTES_PER_HOUR) {
    return `${diffMins}m ago`
  }
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR)
  if (diffHours < HOURS_PER_DAY) {
    return `${diffHours}h ago`
  }
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY)
  if (diffDays === 1) {
    return 'Yesterday'
  }
  if (diffDays <= DAYS_BEFORE_DATE_DISPLAY) {
    return `${diffDays}d ago`
  }
  return new Date(utcMs).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
}


/**
 * Renders a recent files list with a two-column grid (name + last modified).
 * Returns null when there are no files to show.
 *
 * @param {object} props
 * @param {Array<object>} props.files
 * @param {Function} props.onOpen Called with (entry) when a row is clicked
 * @return {React.ReactElement|null}
 */
export default function RecentFilesList({files, onOpen}) {
  if (!files || files.length === 0) {
    return null
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        columnGap: 1,
        alignItems: 'center',
      }}
    >
      <Typography variant='caption' color='text.secondary' fontWeight={600} sx={{pb: 0.5, textAlign: 'left'}}>
        Recent models
      </Typography>
      <Typography variant='caption' color='text.secondary' fontWeight={600} sx={{pb: 0.5, textAlign: 'left'}}>
        Last modified
      </Typography>

      {files.map((file) => (
        <Box key={file.id} sx={{display: 'contents'}}>
          <Stack
            direction='row'
            alignItems='center'
            spacing={0.5}
            onClick={() => onOpen(file)}
            sx={{
              'py': '5px',
              'minWidth': 0,
              'cursor': 'pointer',
              'borderRadius': 1,
              '&:hover': {bgcolor: 'action.hover'},
            }}
          >
            <FileTypeIcon mimeType={file.mimeType}/>
            <Typography
              variant='body2'
              noWrap
              title={file.name}
              sx={{minWidth: 0, textDecoration: 'underline'}}
              data-testid={`link-open-recent-${file.id}`}
            >
              {file.modelTitle || file.name}
            </Typography>
          </Stack>
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{whiteSpace: 'nowrap', textAlign: 'left', py: '5px'}}
          >
            {formatRelativeTime(file.lastModifiedUtc)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

import React, {useState} from 'react'
import {Box, Button, Divider, Stack, Typography} from '@mui/material'
import {
  Description as DocIcon,
  InsertDriveFile as FileIcon,
  Search as SearchIcon,
  Slideshow as SlidesIcon,
  TableChart as SheetsIcon,
} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {loadRecentFiles} from '../../connections/persistence'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
// Side-effect: registers google-drive provider in the registry
import '../../connections/google-drive/index'


const MS_PER_MINUTE = 60000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_BEFORE_DATE_DISPLAY = 5


/**
 * Maps Google Drive mimeType to a colored icon element.
 *
 * @param {object} props
 * @param {string} props.mimeType
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
 * Formats a UTC timestamp (ms) as a relative time string.
 *
 * @param {number|null} utcMs
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
 * Google Drive tab content for the Open Model dialog.
 *
 * @property {Function} onPickerReady Called with (token, connection) when ready to show picker
 * @property {Function} onOpenById Called with (connection, fileId, fileName) to open a file directly
 * @return {React.ReactElement}
 */
export default function SourcesTab({onPickerReady, onOpenById}) {
  const connections = useStore((state) => state.connections)

  const [browseError, setBrowseError] = useState(null)
  const [recentFiles] = useState(() => loadRecentFiles())

  const handleBrowse = async (connection) => {
    const provider = getProvider(connection.providerId)
    if (!provider) {
      return
    }
    setBrowseError(null)
    try {
      const token = await provider.getAccessToken(connection)
      onPickerReady(token, connection)
    } catch (err) {
      setBrowseError(err.message || 'Failed to open file picker')
    }
  }

  const handleOpenRecent = (connection, fileId, fileName) => {
    onOpenById(connection, fileId, fileName)
  }

  if (connections.length === 0) {
    return (
      <Stack
        spacing={2}
        sx={{width: '100%', alignItems: 'center', py: 2}}
        data-testid='sources-tab-empty'
      >
        <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
          Connect your Google Drive to browse and open models
        </Typography>
        <ConnectProviderButton
          providerId='google-drive'
          label='Connect Google Drive'
        />
      </Stack>
    )
  }

  return (
    <Stack
      spacing={2}
      sx={{width: '100%', maxWidth: '400px', alignSelf: 'stretch'}}
      data-testid='sources-tab'
    >
      {connections.map((connection) => {
        const connectionRecents = recentFiles.filter((f) => f.connectionId === connection.id)
        return (
          <Stack key={connection.id} spacing={1} sx={{width: '100%'}}>
            {/* Account header */}
            <ConnectionCard connection={connection}/>

            {/* Recent files */}
            {connectionRecents.length > 0 && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  columnGap: 1,
                  alignItems: 'center',
                }}
              >
                {/* Header row */}
                <Typography variant='caption' color='text.secondary' fontWeight={600} sx={{pb: 0.5, textAlign: 'left'}}>
                  Recent models
                </Typography>
                <Typography variant='caption' color='text.secondary' fontWeight={600} sx={{pb: 0.5, textAlign: 'left'}}>
                  Last modified
                </Typography>

                {/* Data rows */}
                {connectionRecents.map((file) => (
                  <Box key={file.fileId} sx={{display: 'contents'}}>
                    <Stack
                      direction='row'
                      alignItems='center'
                      spacing={0.5}
                      onClick={() => handleOpenRecent(connection, file.fileId, file.name)}
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
                        data-testid={`link-open-recent-${file.fileId}`}
                      >
                        {file.modelTitle || file.name}
                      </Typography>
                    </Stack>
                    <Typography variant='caption' color='text.secondary' sx={{whiteSpace: 'nowrap', textAlign: 'left', py: '5px'}}>
                      {formatRelativeTime(file.lastModifiedUtc)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Browse button */}
            <Box sx={{display: 'flex', justifyContent: 'flex-end'}}>
              <Button
                variant='contained'
                startIcon={<SearchIcon/>}
                onClick={() => handleBrowse(connection)}
                sx={{textTransform: 'none'}}
                data-testid={`button-browse-drive-${connection.id}`}
              >
                Browse
              </Button>
            </Box>

            {browseError && (
              <Typography variant='caption' color='error'>
                {browseError}
              </Typography>
            )}
          </Stack>
        )
      })}

      {/* Account management */}
      <Divider/>
      <ConnectProviderButton
        providerId='google-drive'
        label='Add another Google account'
      />
    </Stack>
  )
}

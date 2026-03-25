import React, {useState} from 'react'
import {Box, Divider, Stack, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {loadAllRecentFiles} from '../../connections/persistence'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
import RecentFilesBrowseSection from './RecentFilesBrowseSection'
// Side-effect: registers google-drive provider in the registry
import '../../connections/google-drive/index'


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
  const [recentFiles] = useState(() => loadAllRecentFiles())

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
            {connectionRecents.length === 0 && (
              <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
                Browse your Google Drive for models.
              </Typography>
            )}

            <RecentFilesBrowseSection
              files={connectionRecents}
              onOpen={(file) => onOpenById(connection, file.id, file.name)}
              onBrowse={() => handleBrowse(connection)}
              browseButtonTestId={`button-browse-drive-${connection.id}`}
            />

            {browseError && (
              <Typography variant='caption' color='error'>
                {browseError}
              </Typography>
            )}

            <Box sx={{mt: 4, opacity: 0.7}}>
              <Divider/>
              <ConnectionCard connection={connection} subtle/>
            </Box>
          </Stack>
        )
      })}

      <Divider/>
      <ConnectProviderButton
        providerId='google-drive'
        label='Add another Google account'
      />
    </Stack>
  )
}

import React, {useState} from 'react'
import {Button, Divider, Stack, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
// Side-effect: registers google-drive provider in the registry
import '../../connections/google-drive/index'


/**
 * Sources tab content for the Open Model dialog.
 *
 * States:
 * 1. No connections → show connect buttons
 * 2. Has connections → show connection cards with Open File button
 * 3. Opening a file → Google Picker shown
 *
 * @property {Function} onPickerReady Called with (token, connection) when ready to show picker
 * @return {React.ReactElement}
 */
export default function SourcesTab({onPickerReady}) {
  const connections = useStore((state) => state.connections)

  const [error, setError] = useState(null)

  const handleOpenFile = async (connection) => {
    const provider = getProvider(connection.providerId)
    if (!provider) {
      return
    }

    setError(null)

    try {
      const token = await provider.getAccessToken(connection)
      onPickerReady(token, connection)
    } catch (err) {
      setError(err.message || 'Failed to open file picker')
    }
  }

  if (connections.length === 0) {
    return (
      <Stack
        spacing={2}
        sx={{
          width: '100%',
          alignItems: 'center',
          py: 2,
        }}
        data-testid='sources-tab-empty'
      >
        <Typography variant='body2' color='text.secondary'>
          Connect a cloud storage service to browse and open models
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
      spacing={1}
      sx={{width: '100%', maxWidth: '300px'}}
      data-testid='sources-tab'
    >
      {connections.map((connection) => (
        <Stack key={connection.id} spacing={0.5}>
          <ConnectionCard connection={connection}/>
          <Button
            size='small'
            onClick={() => handleOpenFile(connection)}
            sx={{textTransform: 'none', alignSelf: 'flex-start', ml: 1}}
            data-testid={`button-open-file-${connection.id}`}
          >
            Open File
          </Button>
          <Divider sx={{mt: 1}}/>
        </Stack>
      ))}

      {error && (
        <Typography variant='caption' color='error'>
          {error}
        </Typography>
      )}

      <Stack spacing={1} sx={{pt: 1}}>
        <ConnectProviderButton
          providerId='google-drive'
          label='Connect another Google account'
        />
      </Stack>

    </Stack>
  )
}

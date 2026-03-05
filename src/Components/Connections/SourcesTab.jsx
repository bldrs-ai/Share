import React, {useState} from 'react'
import {Button, Divider, Stack, Typography} from '@mui/material'
import {Add as AddIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {saveSources} from '../../connections/persistence'
import {getProvider} from '../../connections/registry'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
import SourceCard from './SourceCard'
import SourceFileBrowser from './SourceFileBrowser'
import GoogleDrivePickerDialog from './GoogleDrivePickerDialog'
// Side-effect: registers google-drive provider in the registry
import '../../connections/google-drive/index'


/**
 * Sources tab content for the Open Model dialog.
 *
 * States:
 * 1. No connections → show connect buttons
 * 2. Has connections → show connection cards with sources
 * 3. Browsing a source → show SourceFileBrowser
 * 4. Adding a source → show Google Picker
 *
 * @property {Function} navigate Router navigate function
 * @property {Function} setIsDialogDisplayed Callback to close dialog
 * @return {React.ReactElement}
 */
export default function SourcesTab({navigate, setIsDialogDisplayed}) {
  const connections = useStore((state) => state.connections)
  const sources = useStore((state) => state.sources)
  const addSource = useStore((state) => state.addSource)

  const [browsingSource, setBrowsingSource] = useState(null)
  const [browsingConnection, setBrowsingConnection] = useState(null)
  const [addingSourceForConnection, setAddingSourceForConnection] = useState(null)
  const [pickerToken, setPickerToken] = useState(null)

  const handleBrowseSource = (source) => {
    const connection = connections.find((c) => c.id === source.connectionId)
    if (connection) {
      setBrowsingConnection(connection)
      setBrowsingSource(source)
    }
  }

  const handleAddSource = async (connection) => {
    // Get a fresh access token for the Picker
    const provider = getProvider(connection.providerId)
    if (!provider) {
      return
    }

    try {
      const token = await provider.getAccessToken(connection)
      setPickerToken(token)
      setAddingSourceForConnection(connection)
    } catch (err) {
      // Token expired; user may need to re-connect
      console.error('Failed to get token for picker:', err)
    }
  }

  const handlePickerSelect = (docs) => {
    if (!addingSourceForConnection || !docs || docs.length === 0) {
      return
    }

    const doc = docs[0]
    const newSource = {
      id: `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      connectionId: addingSourceForConnection.id,
      providerId: addingSourceForConnection.providerId,
      label: doc.name || 'Google Drive Folder',
      location: {
        type: 'google-drive',
        folderId: doc.id,
        folderName: doc.name || 'Folder',
      },
      createdAt: new Date().toISOString(),
    }

    addSource(newSource)
    saveSources([...sources, newSource])
    setAddingSourceForConnection(null)
    setPickerToken(null)
  }

  const handlePickerCancel = () => {
    setAddingSourceForConnection(null)
    setPickerToken(null)
  }

  // If browsing a source, show the file browser
  if (browsingSource && browsingConnection) {
    return (
      <SourceFileBrowser
        connection={browsingConnection}
        source={browsingSource}
        navigate={navigate}
        setIsDialogDisplayed={setIsDialogDisplayed}
        onBack={() => {
          setBrowsingSource(null)
          setBrowsingConnection(null)
        }}
      />
    )
  }

  // No connections yet — show connect buttons
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

  // Has connections — show them with their sources
  return (
    <Stack
      spacing={1}
      sx={{width: '100%', maxWidth: '300px'}}
      data-testid='sources-tab'
    >
      {connections.map((connection) => {
        const connectionSources = sources.filter(
          (s) => s.connectionId === connection.id,
        )

        return (
          <Stack key={connection.id} spacing={0.5}>
            <ConnectionCard connection={connection}/>

            {connectionSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onBrowse={handleBrowseSource}
              />
            ))}

            <Button
              size='small'
              startIcon={<AddIcon/>}
              onClick={() => handleAddSource(connection)}
              sx={{textTransform: 'none', alignSelf: 'flex-start', ml: 1}}
              data-testid={`button-add-source-${connection.id}`}
            >
              Add Source
            </Button>

            <Divider sx={{mt: 1}}/>
          </Stack>
        )
      })}

      {/* Connect another service */}
      <Stack spacing={1} sx={{pt: 1}}>
        <ConnectProviderButton
          providerId='google-drive'
          label='Connect another Google account'
        />
      </Stack>

      {/* Google Drive Picker for adding a source */}
      <GoogleDrivePickerDialog
        accessToken={pickerToken}
        isOpen={addingSourceForConnection !== null}
        mode='folder'
        onSelect={handlePickerSelect}
        onCancel={handlePickerCancel}
      />
    </Stack>
  )
}

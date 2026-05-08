import React, {useEffect, useState} from 'react'
import {Divider, Stack, Typography} from '@mui/material'
import {Google as GoogleIcon, Refresh as RefreshIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {loadAllRecentFiles} from '../../connections/persistence'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
import RecentFilesBrowseSection from './RecentFilesBrowseSection'
// Side-effect: registers google-drive provider in the registry
import '../../connections/google-drive/index'
// Side-effect: registers github provider in the registry. The "Connect
// GitHub" surface lands behind the githubAsSource feature flag in PR2;
// the registration ships unconditionally so consumers can detect
// availability through the registry.
import '../../connections/github/index'


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
  // Per-connection liveness, keyed by connection.id. 'expired' flips the
  // Browse button to "Reconnect" so the user gets a clear cue before hitting
  // the picker with a doomed token.
  const [statuses, setStatuses] = useState({})

  // Validate each persisted connection in parallel when the tab mounts (and
  // whenever the connections list changes). This is a pure HTTP ping —
  // no GIS popup, no user interaction. Refresh of an expired token still
  // happens lazily on Browse via getAccessToken().
  useEffect(() => {
    if (connections.length === 0) {
      return undefined
    }
    let cancelled = false
    /** Fire checkStatus for every connection and merge results into state. */
    async function validateAll() {
      const results = await Promise.all(connections.map(async (c) => {
        const provider = getProvider(c.providerId)
        if (!provider) {
          return [c.id, 'error']
        }
        try {
          const status = await provider.checkStatus(c)
          return [c.id, status]
        } catch {
          return [c.id, 'error']
        }
      }))
      if (cancelled) {
        return
      }
      setStatuses((prev) => {
        const next = {...prev}
        for (const [id, status] of results) {
          next[id] = status
        }
        return next
      })
    }
    validateAll()
    return () => {
      cancelled = true
    }
  }, [connections])

  const handleBrowse = async (connection) => {
    const provider = getProvider(connection.providerId)
    if (!provider) {
      return
    }
    setBrowseError(null)
    try {
      const token = await provider.getAccessToken(connection)
      // Successful token acquisition implies the connection is healthy now,
      // even if it was 'expired' before — clear the stale marker.
      setStatuses((prev) => ({...prev, [connection.id]: 'connected'}))
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
          icon={<GoogleIcon/>}
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
        const isStale = statuses[connection.id] === 'expired'
        return (
          <Stack key={connection.id} spacing={1} sx={{width: '100%'}}>
            {connectionRecents.length === 0 && !isStale && (
              <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
                Browse your Google Drive for models.
              </Typography>
            )}
            {isStale && (
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{textAlign: 'center'}}
                data-testid={`stale-hint-${connection.id}`}
              >
                Your session expired. Reconnect to continue.
              </Typography>
            )}

            <RecentFilesBrowseSection
              files={connectionRecents}
              onOpen={(file) => onOpenById(connection, file.id, file.name)}
              onBrowse={() => handleBrowse(connection)}
              browseButtonLabel={isStale ? 'Reconnect' : 'Browse'}
              browseButtonIcon={isStale ? <RefreshIcon/> : undefined}
              browseButtonTestId={`button-browse-drive-${connection.id}`}
            />

            {browseError && (
              <Typography variant='caption' color='error'>
                {browseError}
              </Typography>
            )}

            <ConnectionCard connection={connection}/>
          </Stack>
        )
      })}

      <Divider/>
      <ConnectProviderButton
        providerId='google-drive'
        label='Add another Google account'
        color='primary'
      />
    </Stack>
  )
}

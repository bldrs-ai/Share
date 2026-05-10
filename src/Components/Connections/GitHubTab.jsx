import React, {useEffect, useMemo, useState} from 'react'
import {Divider, Stack, Typography} from '@mui/material'
import {GitHub as GitHubIcon, Refresh as RefreshIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {loadAllRecentFiles} from '../../connections/persistence'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
import RecentFilesBrowseSection from './RecentFilesBrowseSection'
// Side-effect: registers github provider + browser in the registry.
// Symmetric with GoogleDriveTab's google-drive registration.
import '../../connections/github/index'


const GITHUB_PROVIDER_ID = 'github'


/**
 * GitHub tab content for the Open Model dialog when the
 * `githubAsSource` feature flag is on. Lists per-account GitHub
 * connections (one card per OAuth grant) and offers Browse / Connect /
 * Add affordances. Mirrors GoogleDriveTab so the two provider tabs feel
 * symmetric.
 *
 * Browse flow:
 *   1. User clicks Browse on a connection.
 *   2. We call provider.getAccessToken(connection) to obtain a fresh GH
 *      token (refresh-on-401 happens inside the provider).
 *   3. On success, bubble (token, connection) to the parent dialog via
 *      onPickerReady — the parent renders the GitHubPickerDialog.
 *   4. On failure (NeedsReconnectError or generic), surface the message
 *      under the connection card.
 *
 * Recents are filtered to entries with this connection's id and
 * source==='github'. Until B3's recents migration writes connectionId on
 * github entries, only freshly-saved files appear here.
 *
 * @property {Function} onPickerReady Called with (token, connection) when picker is ready
 * @property {Function} onOpenById Called with (connection, fileId, fileName) to open a recent
 * @return {React.ReactElement}
 */
export default function GitHubTab({onPickerReady, onOpenById}) {
  const allConnections = useStore((state) => state.connections)
  // useMemo so the filtered array's reference is stable across renders;
  // see GoogleDriveTab for the rationale (avoid infinite checkStatus loop).
  const connections = useMemo(
    () => allConnections.filter((c) => c.providerId === GITHUB_PROVIDER_ID),
    [allConnections],
  )

  const [browseError, setBrowseError] = useState(null)
  const [recentFiles] = useState(() => loadAllRecentFiles())
  // Per-connection liveness, keyed by connection.id. Same shape as
  // GoogleDriveTab so the two tabs can converge into a generic component
  // later if duplication becomes painful.
  const [statuses, setStatuses] = useState({})

  useEffect(() => {
    if (connections.length === 0) {
      return undefined
    }
    let cancelled = false
    /** Fire checkStatus for every github connection. */
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
  // statuses is intentionally read-only here — we're computing it.
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
      setBrowseError(err.message || 'Failed to open GitHub picker')
    }
  }

  if (connections.length === 0) {
    return (
      <Stack
        spacing={2}
        sx={{width: '100%', alignItems: 'center', py: 2}}
        data-testid='github-tab-empty'
      >
        <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
          Connect your GitHub to browse and open models
        </Typography>
        <ConnectProviderButton
          providerId='github'
          label='Connect GitHub'
          icon={<GitHubIcon/>}
        />
      </Stack>
    )
  }

  return (
    <Stack
      spacing={2}
      sx={{width: '100%', maxWidth: '400px', alignSelf: 'stretch'}}
      data-testid='github-tab'
    >
      {connections.map((connection) => {
        // Match on connection.id AND source so legacy github recents from the
        // pre-PR2 federated path (no connectionId) don't bleed into a
        // specific connection card.
        const connectionRecents = recentFiles.filter(
          (f) => f.source === 'github' && f.connectionId === connection.id,
        )
        const isStale = statuses[connection.id] === 'expired'
        return (
          <Stack key={connection.id} spacing={1} sx={{width: '100%'}}>
            {connectionRecents.length === 0 && !isStale && (
              <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
                Browse your GitHub repos for models.
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
              browseButtonTestId={`button-browse-github-${connection.id}`}
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
        providerId='github'
        label='Add a GitHub account'
        icon={<GitHubIcon/>}
        color='primary'
      />
    </Stack>
  )
}

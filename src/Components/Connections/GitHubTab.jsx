import React, {useEffect, useMemo, useState} from 'react'
import {Divider, Stack, Typography} from '@mui/material'
import {GitHub as GitHubIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import ConnectProviderButton from './ConnectProviderButton'
import ConnectionCard from './ConnectionCard'
// Side-effect: registers github provider in the registry. Symmetric with
// GoogleDriveTab's google-drive registration. The Browse-via-connection
// wiring (and recents migration) ships in PR2; this tab lists existing
// GitHub Sources connections and offers connect/add affordances.
import '../../connections/github/index'


const GITHUB_PROVIDER_ID = 'github'


/**
 * GitHub tab content for the Open Model dialog when the
 * `githubAsSource` feature flag is on. Lists per-account GitHub
 * connections (one card per OAuth grant) and offers Connect / Add
 * affordances. Mirrors the visual shape of GoogleDriveTab so the two
 * provider tabs feel symmetric.
 *
 * Browse-via-connection (analogous to Drive's picker flow) is PR2 work;
 * for now this component just surfaces the connection state. Users on
 * the legacy Auth0-federated path see the existing GitHubFileBrowser
 * UI (rendered by OpenModelDialog when the flag is off).
 *
 * @return {React.ReactElement}
 */
export default function GitHubTab() {
  const allConnections = useStore((state) => state.connections)
  // useMemo so the filtered array's reference is stable across renders;
  // see GoogleDriveTab for the rationale (avoid infinite checkStatus loop).
  const connections = useMemo(
    () => allConnections.filter((c) => c.providerId === GITHUB_PROVIDER_ID),
    [allConnections],
  )

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
        const isStale = statuses[connection.id] === 'expired'
        return (
          <Stack key={connection.id} spacing={1} sx={{width: '100%'}}>
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

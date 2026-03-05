import React from 'react'
import {Box, Chip, IconButton, Stack, Typography} from '@mui/material'
import {LinkOff as DisconnectIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {saveConnections, saveSources} from '../../connections/persistence'


/**
 * Displays a single Connection with status and disconnect action.
 *
 * @property {object} connection The Connection object
 * @return {React.ReactElement}
 */
export default function ConnectionCard({connection}) {
  const removeConnection = useStore((state) => state.removeConnection)
  const connections = useStore((state) => state.connections)
  const sources = useStore((state) => state.sources)

  const statusColor = {
    connected: 'success',
    disconnected: 'default',
    expired: 'warning',
    error: 'error',
  }

  const handleDisconnect = async () => {
    const provider = getProvider(connection.providerId)
    if (provider) {
      try {
        await provider.disconnect(connection.id)
      } catch {
        // Non-critical; remove from store regardless
      }
    }
    removeConnection(connection.id)
    // Persist: filter out this connection and its sources
    const remainingConnections = connections.filter((c) => c.id !== connection.id)
    const remainingSources = sources.filter((s) => s.connectionId !== connection.id)
    saveConnections(remainingConnections)
    saveSources(remainingSources)
  }

  return (
    <Stack
      direction='row'
      alignItems='center'
      spacing={1}
      sx={{width: '100%', py: 0.5}}
      data-testid={`connection-card-${connection.id}`}
    >
      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography variant='body2' noWrap>
          {connection.label}
        </Typography>
      </Box>
      <Chip
        label={connection.status}
        color={statusColor[connection.status] || 'default'}
        size='small'
        variant='outlined'
      />
      <IconButton
        size='small'
        onClick={handleDisconnect}
        title='Disconnect'
        data-testid={`button-disconnect-${connection.id}`}
      >
        <DisconnectIcon fontSize='small'/>
      </IconButton>
    </Stack>
  )
}

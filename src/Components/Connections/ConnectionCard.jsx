import React from 'react'
import {Box, Divider} from '@mui/material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {saveConnections, saveSources} from '../../connections/persistence'
import AccountFooter from './AccountFooter'


/**
 * Displays a connection's account footer with a Remove action.
 *
 * @property {object} connection The Connection object
 * @return {React.ReactElement}
 */
export default function ConnectionCard({connection}) {
  const removeConnection = useStore((state) => state.removeConnection)
  const connections = useStore((state) => state.connections)
  const sources = useStore((state) => state.sources)

  const handleRemove = async () => {
    const provider = getProvider(connection.providerId)
    if (provider) {
      try {
        await provider.disconnect(connection.id)
      } catch {
        // Non-critical; remove from store regardless
      }
    }
    removeConnection(connection.id)
    const remainingConnections = connections.filter((c) => c.id !== connection.id)
    const remainingSources = sources.filter((s) => s.connectionId !== connection.id)
    saveConnections(remainingConnections)
    saveSources(remainingSources)
  }

  return (
    <Box sx={{mt: 4, opacity: 0.7}}>
      <Divider/>
      <AccountFooter
        label={connection.label}
        testId={`connection-card-${connection.id}`}
        settingsButtonTestId={`button-settings-${connection.id}`}
        menuItems={[{label: 'Remove', onClick: handleRemove, testId: `menu-item-remove-${connection.id}`}]}
      />
    </Box>
  )
}

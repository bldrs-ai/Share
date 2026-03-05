import React, {useState} from 'react'
import {Button, CircularProgress} from '@mui/material'
import {CloudQueue as CloudIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {saveConnections} from '../../connections/persistence'


/**
 * Button to initiate a Connection to an external service.
 * Triggers the provider's OAuth flow and stores the resulting Connection.
 *
 * @property {string} providerId Provider identifier (e.g. 'google-drive')
 * @property {string} label Button label (e.g. 'Connect Google Drive')
 * @return {React.ReactElement}
 */
export default function ConnectProviderButton({providerId, label}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)
  const addConnection = useStore((state) => state.addConnection)
  const connections = useStore((state) => state.connections)

  const handleConnect = async () => {
    const provider = getProvider(providerId)
    if (!provider) {
      setError(`Unknown provider: ${providerId}`)
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const connection = await provider.connect()
      addConnection(connection)
      // Persist updated connections list
      saveConnections([...connections, connection])
    } catch (err) {
      setError(err.message || 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <>
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        variant='outlined'
        startIcon={isConnecting ? <CircularProgress size={16}/> : <CloudIcon/>}
        data-testid={`button-connect-${providerId}`}
        sx={{textTransform: 'none'}}
      >
        {isConnecting ? 'Connecting...' : label}
      </Button>
      {error && (
        <span style={{color: 'red', fontSize: '0.75rem', marginTop: '4px'}}>
          {error}
        </span>
      )}
    </>
  )
}

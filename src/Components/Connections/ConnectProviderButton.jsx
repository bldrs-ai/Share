import React, {useState} from 'react'
import {Button, CircularProgress, Tooltip} from '@mui/material'
import {CloudQueue as CloudIcon} from '@mui/icons-material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {saveConnections} from '../../connections/persistence'


/**
 * Button to initiate a Connection to an external service.
 * Triggers the provider's OAuth flow and stores the resulting Connection.
 *
 * Gated on Auth0 primary auth: if the user is not signed in, the button is
 * disabled and a tooltip prompts sign-in. This keeps the Auth0 `sub` as the
 * quota / abuse anchor for the gh-oauth Netlify Functions and reflects the
 * user mental model that primary identity exists separately from connected
 * sources. Auth0 Database (email/password) is the OAuth-free escape hatch
 * for users who don't want Google/GitHub federation as primary.
 *
 * @property {string} providerId Provider identifier (e.g. 'google-drive')
 * @property {string} label Button label (e.g. 'Connect Google Drive')
 * @property {React.ReactElement} [icon] Icon to show; defaults to CloudIcon
 * @return {React.ReactElement}
 */
export default function ConnectProviderButton({providerId, label, icon, color = 'accent'}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)
  const addConnection = useStore((state) => state.addConnection)
  const connections = useStore((state) => state.connections)
  const {user, isAuthenticated, isLoading: isAuthLoading} = useAuth0()

  const handleConnect = async () => {
    const provider = getProvider(providerId)
    if (!provider) {
      setError(`Unknown provider: ${providerId}`)
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const connection = await provider.connect(user?.email)
      addConnection(connection)
      // Persist updated connections list
      saveConnections([...connections, connection])
    } catch (err) {
      setError(err.message || 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  // Disable while connecting, while Auth0 SDK is still hydrating, or when no
  // primary identity is signed in. The tooltip exists only for the auth-gated
  // case so users know why the button is unavailable.
  const isAuthGated = !isAuthLoading && !isAuthenticated
  const isDisabled = isConnecting || isAuthLoading || isAuthGated

  const button = (
    <Button
      onClick={handleConnect}
      disabled={isDisabled}
      variant='contained'
      color={color}
      startIcon={isConnecting ? <CircularProgress size={16}/> : (icon || <CloudIcon/>)}
      data-testid={`button-connect-${providerId}`}
      sx={{textTransform: 'none'}}
    >
      {isConnecting ? 'Connecting...' : label}
    </Button>
  )

  return (
    <>
      {isAuthGated ? (
        // MUI disables pointer events on disabled buttons, which suppresses
        // hover; wrap in a span so the Tooltip still receives the event.
        <Tooltip title='Sign in to connect' placement='top'>
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
      {error && (
        <span style={{color: 'red', fontSize: '0.75rem', marginTop: '4px'}}>
          {error}
        </span>
      )}
    </>
  )
}

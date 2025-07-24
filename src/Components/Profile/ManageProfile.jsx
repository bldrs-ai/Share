// ManageProfile.jsx – now calls a Netlify Function to **unlink** accounts
import React, {useEffect, useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Avatar,
  Box,
  Typography,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Button,
  Chip,
  Divider,
  Stack,
} from '@mui/material'
import GitHubIcon from '@mui/icons-material/GitHub'
import GoogleIcon from '@mui/icons-material/Google'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID
const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'

const CUSTOM_CLAIM = 'https://bldrs.ai/identities'

const providerMeta = {
  'google-oauth2': {name: 'Google', icon: <GoogleIcon/>, color: 'primary'},
  'github': {name: 'GitHub', icon: <GitHubIcon/>, color: 'default'},
}

// Consistent button styling with the login dialog
const buttonSx = {
  'borderColor': 'rgba(255,255,255,0.23)',
  'color': 'rgba(255,255,255,0.87)',
  '&:hover': {borderColor: 'rgba(255,255,255,0.87)'},
}

// Netlify Function endpoint that performs Auth0 unlink server‑side
const NETLIFY_UNLINK_ENDPOINT = '/.netlify/functions/unlink-identity'

/**
 *
 */
export default function ManageProfile({open, onClose}) {
  const {user, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const [linkedIdentities, setLinkedIdentities] = useState([])
  const [loading, setLoading] = useState(true)

  // e.g. "google-oauth2|abc123" → "google-oauth2"
  const primaryProviderId = user?.sub?.split('|')[0]
  const primaryProvider = primaryProviderId ? providerMeta[primaryProviderId] : undefined

  // ---------------------------------------------------------------------------
  // EFFECT: load identities from ID‑token custom claim
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
return
}
    const identitiesClaim = user?.[CUSTOM_CLAIM] || user?.identities || []
    setLinkedIdentities(identitiesClaim)
    setLoading(false)
  }, [isAuthenticated, user])

  // ---------------------------------------------------------------------------
  // EFFECT: Storage listener for background link/unlink completions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    /**
     *
     */
    async function handleStorageEvent(event) {
      if ((event.key === 'linkStatus' && event.newValue === 'linked') ||
          (event.key === 'unlinkStatus' && event.newValue === 'unlinked')) {
        localStorage.removeItem(event.key)
        await refreshUser()
      }
    }
    window.addEventListener('storage', handleStorageEvent)
    return () => window.removeEventListener('storage', handleStorageEvent)
  }, [])

  // ---------------------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------------------
  const refreshUser = async () => {
    try {
      await getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
        cacheMode: 'off',
        useRefreshTokens: true,
      })
    } catch (err) {
      console.error('Error refreshing user after link/unlink', err)
    }
  }

  const handleLink = async (connection) => {
    if (useMock) {
      setLinkedIdentities((prev) => [...prev, {provider: connection, user_id: `mock-${connection}`}])
      return
    }

    try {
      const primaryToken = await getAccessTokenSilently({
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access',
        cacheMode: 'off',
        useRefreshTokens: true,
      })
      localStorage.setItem('linkStatus', 'inProgress')
      window.open(`/popup-auth?connection=${connection}&linkToken=${encodeURIComponent(primaryToken)}`, 'authPopup', 'width=600,height=600')
    } catch (err) {
      console.error('Linking failed', err)
    }
  }

  /**
   * Unlink a secondary provider via Netlify Function.
   * Serverless fn owns Auth0 Mgmt creds; client just sends its own access‑token.
   */
const handleUnlink = async (connection) => {
  if (useMock) {
    setLinkedIdentities((prev) => prev.filter((id) => id.provider !== connection))
    return
  }

  try {
    // 1) Get a fresh *user* access‑token (NOT Mgmt token)
    const primaryAccessToken = await getAccessTokenSilently({
      // no audience needed; any valid user token works for /userinfo
      scope: 'openid profile email',
      cacheMode: 'off',
      useRefreshTokens: true,
    })

    // 2) Look up the provider’s user_id in the identities array
    const secondaryUserId =
      linkedIdentities.find((i) => i.provider === connection)?.user_id

    if (!secondaryUserId) {
      throw new Error(`Could not resolve secondary user_id for ${connection}`)
    }

    // 3) Call the Netlify function
    const response = await fetch(NETLIFY_UNLINK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${primaryAccessToken}`, // <-- REQUIRED
      },
      body: JSON.stringify({
        secondaryProvider: connection,
        secondaryUserId, // <-- REQUIRED
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Unlink failed: status ${response.status}`)
    }

    // 4) Trigger the storage listener so the UI refreshes
    localStorage.setItem('unlinkStatus', 'unlinked')
  } catch (err) {
    console.error('Unlink failed', err)
  }
}


  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  const providers = [
    {id: 'google-oauth2', ...providerMeta['google-oauth2']},
    {id: 'github', ...providerMeta.github},
  ]

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{textAlign: 'center', fontWeight: 600, fontSize: '1.35rem'}}>
        Account Settings
      </DialogTitle>
      <DialogContent dividers>
        {/* Profile section */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center">
            <Avatar src={user?.picture} alt={user?.name} sx={{width: 64, height: 64, mr: 2}}/>
            <Box>
              <Typography variant="h6">{user?.name || user?.email}</Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
          </Box>
          {primaryProvider && (
            <Chip label={primaryProvider.name} size="small" color={primaryProvider.color}/>
          )}
        </Box>

        <Divider sx={{mb: 2}}/>

        {/* Additional Provider Connections */}
        <Typography variant="subtitle1" gutterBottom>
          Additional Provider Connections
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={28}/>
          </Box>
        ) : (
          <List disablePadding>
            {providers.map((provider) => {
              // skip primary provider in additional list
              if (provider.id === primaryProviderId) {
return null
}

              const identity = linkedIdentities.find((id) => id.provider === provider.id)
              const isConnected = Boolean(identity)
              const connectedEmail = identity?.profileData?.email

              return (
                <ListItem key={provider.id} divider>
                  <ListItemAvatar>
                    <Avatar>{provider.icon}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={provider.name}
                    secondary={
                      isConnected ?
                        connectedEmail ?
                          `Connected as ${connectedEmail}` :
                          'Connected' :
                        'Not connected'
                    }
                    secondaryTypographyProps={{color: 'text.secondary'}}
                  />
                  <ListItemSecondaryAction>
                    {isConnected ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label="Connected" color="success" size="small"/>
                        <Button
                          variant="outlined"
                          size="small"
                          sx={buttonSx}
                          onClick={() => handleUnlink(provider.id)}
                          data-testid={`unlink-${provider.id}`}
                        >
                          Unlink
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        variant="outlined"
                        size="small"
                        sx={buttonSx}
                        onClick={() => handleLink(provider.id)}
                        data-testid={`authorize-${provider.id}`}
                      >
                        Authorize
                      </Button>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              )
            })}
          </List>
        )}

        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button onClick={onClose}>Close</Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

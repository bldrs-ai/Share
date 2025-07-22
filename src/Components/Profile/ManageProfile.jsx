// import {jwtDecode} from 'jwt-decode'
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
} from '@mui/material'
import GitHubIcon from '@mui/icons-material/GitHub'
import GoogleIcon from '@mui/icons-material/Google'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID
const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'

/**
 * ManageProfile.jsx
 * -----------------------------------------------------
 * A modal that shows basic profile information and lets
 * users link additional social providers.
 *
 * Identities Strategy (no dedicated backend):
 * -------------------------------------------------
 * 1.  In an Auth0 **Post‑Login Action** attach the user's `identities` array
 *     as a custom claim in the ID Token / Access Token:
 *
 *         exports.onExecutePostLogin = async (event, api) => {
 *           api.idToken.setCustomClaim(
 *             "https://your‑app.example.com/identities",
 *             event.user.identities
 *           );
 *         };
 *
 * 2.  In the SPA we read that claim from `user` provided by `@auth0/auth0-react`.
 *
 * 3.  Linking / Unlinking still requires Auth0 Management API calls.
 *     Grant the app the following scopes and call the endpoints directly:
 *       • read:current_user
 *       • update:current_user_identities
 */

const CUSTOM_CLAIM = 'https://bldrs.ai/identities'

const ManageProfile = ({open, onClose}) => {
  const {user, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const [linkedIdentities, setLinkedIdentities] = useState([])
  const [loading, setLoading] = useState(true)
  // const accessToken = useStore((state) => state.accessToken)
  // const setAccessToken = useStore((state) => state.setAccessToken)
  // eslint-disable-next-line no-unused-vars
  let recentConnection = null

  /**
   * Parse the identities array directly from the ID token custom claim.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const identitiesClaim = user?.[CUSTOM_CLAIM] || user?.identities || []
    setLinkedIdentities(identitiesClaim)
    setLoading(false)
  }, [isAuthenticated, user])

  useEffect(() => {
      /**
       * Listen for changes in localStorage
       */
      async function handleStorageEvent(event) {
        if (event.key === 'linkStatus' && event.newValue === 'linked') {
          // 4. Clear the localStorage items
          localStorage.removeItem('linkStatus')

          await getAccessTokenSilently({
            authorizationParams: {
              audience: 'https://api.github.com/',
              scope: 'openid profile email offline_access',
            },
            cacheMode: 'off',
            useRefreshTokens: true,
          })
        }
      }
      window.addEventListener('storage', handleStorageEvent)
      return () => window.removeEventListener('storage', handleStorageEvent)
    })

  /** Link a new provider via Auth0 popup then POST to Management API */
  const handleLink = async (connection) => {
    if (useMock) {
      // Simulate linking in mock environment
      setLinkedIdentities((prev) => [
        ...prev,
        {provider: connection, user_id: `mock-${connection}-123`},
      ])

      return
    }
    try {
      recentConnection = connection
      const primaryToken = await getAccessTokenSilently({
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access', // no audience ⇒ /userinfo
        cacheMode: 'off', // force fresh
        useRefreshTokens: true,
      })

      localStorage.setItem('linkStatus', 'inProgress')

      // 2️⃣  Stash it so the storage handler can use it later
      window.open(`/popup-auth?connection=${connection}&linkToken=${encodeURIComponent(primaryToken)}`, 'authPopup', 'width=600,height=600')
    } catch (err) {
      console.error('Linking failed', err)
    }
  }

  /** Providers supported */
  const providers = [
    {id: 'google-oauth2', name: 'Google', icon: <GoogleIcon/>},
    {id: 'github', name: 'GitHub', icon: <GitHubIcon/>},
  ]

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>Account Settings</DialogTitle>
      <DialogContent dividers>
        {/* Profile panel */}
        <Box display="flex" alignItems="center" mb={3}>
          <Avatar src={user?.picture} alt={user?.name} sx={{width: 64, height: 64, mr: 2}}/>
          <Box>
            <Typography variant="h6">{user?.name || user?.email}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{mb: 2}}/>

        {/* Provider connections */}
        <Typography variant="subtitle1" gutterBottom>
          Provider Connections
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={28}/>
          </Box>
        ) : (
          <List disablePadding>
            {providers.map((provider) => {
              const identity = linkedIdentities.find((id) => id.provider === provider.id)
              const isConnected = Boolean(identity)
              return (
                <ListItem key={provider.id} divider>
                  <ListItemAvatar>
                    <Avatar>{provider.icon}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={provider.name}
                    secondary={isConnected ? 'Connected' : 'Not connected'}
                    secondaryTypographyProps={{
                      color: isConnected ? 'success.main' : 'text.secondary',
                    }}
                  />
                  <ListItemSecondaryAction>
                    {isConnected ? (
                      <Chip label="Connected" color="success" size="small"/>
                    ) : (
                      <Button variant="outlined" size="small"
                      data-testid={`authorize-${provider.id}`}
                      onClick={() => handleLink(provider.id)}
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

export default ManageProfile

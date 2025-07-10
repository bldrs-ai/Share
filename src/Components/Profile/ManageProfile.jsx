// import {jwtDecode} from 'jwt-decode'
import React, {useEffect, useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
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

/**
 * ManageProfile.jsx
 * -----------------------------------------------------
 * A sleek MUI-based account settings modal that shows basic profile
 * information and lets users link / unlink additional social providers.
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
 * 3.  Linking / Unlinking still requires Auth0 Management API calls.  If you’re
 *     comfortable exposing short‑lived tokens client‑side, grant the app the
 *     following scopes and call the endpoints directly:
 *       • read:current_user
 *       • update:current_user_identities
 *     Otherwise keep the server endpoints and proxy the calls.
 */

const CUSTOM_CLAIM = 'https://bldrs.ai/identities'

const ManageProfile = ({open, onClose}) => {
  // eslint-disable-next-line no-unused-vars
  const {user, isAuthenticated, getAccessTokenSilently, getIdTokenClaims} = useAuth0()
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
          // 1. Pull the secondary ID token that the popup stored
          const secondaryIdToken = localStorage.getItem('secondaryIdToken')
          if (!secondaryIdToken) {
            console.error('No secondaryIdToken found')
            return
          }

          const primaryToken = localStorage.getItem('primaryUserToken')

          if (!primaryToken) {
            console.error('No primaryToken found')
            return
          }

          // console.log(`Linking accounts: primary token ${primaryToken} with secondary token ${secondaryIdToken}`)

          // 3. Call the Netlify function
          await fetch('/.netlify/functions/link-accounts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
             'Authorization': `Bearer ${primaryToken}`, // <-- the JWT above
            },
           body: JSON.stringify({secondaryIdToken}), // <-- what backend expects
          })


          // const linkData = await linkResp.text()
          // console.log('Link response:', linkData)


          // 3. Call the Netlify function
         /* await fetch('/.netlify/functions/link-accounts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
             'Authorization': `Bearer ${primaryToken}`, // <-- the JWT above
            },
           body: JSON.stringify({secondaryIdToken}), // <-- what backend expects
          })*/

          // 4. Clear the localStorage items
          localStorage.removeItem('linkStatus')
          localStorage.removeItem('secondaryIdToken')
          localStorage.removeItem('primaryUserToken')
        }
      }
      window.addEventListener('storage', handleStorageEvent)
      return () => window.removeEventListener('storage', handleStorageEvent)
    })

  /** Link a new provider via Auth0 popup then POST to Management API */
  const handleLink = async (connection) => {
    try {
      localStorage.setItem('linkStatus', 'inProgress')
      recentConnection = connection
      const primaryToken = await getAccessTokenSilently({
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access', // no audience ⇒ /userinfo
        cacheMode: 'off', // force fresh
        useRefreshTokens: true,
      })

      // 2️⃣  Stash it so the storage handler can use it later
      localStorage.setItem('primaryUserToken', primaryToken)
      window.open(`/popup-auth?connection=${connection}`, 'authPopup', 'width=600,height=600')
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
                      <Button variant="outlined" size="small" onClick={() => handleLink(provider.id)}>
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

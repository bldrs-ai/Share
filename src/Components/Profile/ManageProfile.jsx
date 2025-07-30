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
  Button,
  Chip,
  Divider,
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

const NETLIFY_UNLINK_ENDPOINT = '/.netlify/functions/unlink-identity'

/**
 *
 */
export default function ManageProfile({open, onClose}) {
  const {user, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const [linkedIdentities, setLinkedIdentities] = useState([])
  const [loading, setLoading] = useState(true)

  const primaryProviderId = user?.sub?.split('|')[0]
  const primaryProvider = primaryProviderId ? providerMeta[primaryProviderId] : undefined

  useEffect(() => {
    if (!isAuthenticated) {
return
}
    const identitiesClaim = user?.[CUSTOM_CLAIM] || user?.identities || []
    setLinkedIdentities(identitiesClaim)
    setLoading(false)
  }, [isAuthenticated, user])

  useEffect(() => {
    const handleStorageEvent = async (event) => {
      if (event.key === 'linkStatus' && event.newValue === 'linked') {
        localStorage.removeItem(event.key)
        await refreshUser()
      }
    }
    window.addEventListener('storage', handleStorageEvent)
    return () => window.removeEventListener('storage', handleStorageEvent)
  }, [])

  const refreshUser = async () => {
    try {
      await getAccessTokenSilently({authorizationParams:
        {audience: 'https://api.github.com/', scope:
          'openid profile email offline_access'},
          cacheMode: 'off', useRefreshTokens: true})
    } catch (err) {
 console.error('Error refreshing user after link/unlink', err)
}
  }

  const handleLink = async (connection) => {
    if (useMock) {
 setLinkedIdentities((p) => [...p, {provider: connection, user_id: `mock-${connection}`}]); return
}
    try {
      const primaryToken = await getAccessTokenSilently({audience:
        'https://api.github.com/', scope:
        'openid profile email offline_access',
        cacheMode: 'off', useRefreshTokens: true})
      localStorage.setItem('linkStatus', 'inProgress')
      window.open(`/popup-auth?connection=${connection}&linkToken=${encodeURIComponent(primaryToken)}`,
       'authPopup', 'width=600,height=600')
    } catch (err) {
 console.error('Linking failed', err)
}
  }

  const handleUnlink = async (connection) => {
    if (useMock) {
 setLinkedIdentities((p) => p.filter((id) => id.provider !== connection)); return
}
    try {
      const primaryAccessToken = await getAccessTokenSilently({scope: 'openid profile email', cacheMode: 'off', useRefreshTokens: true})
      const secondaryUserId = linkedIdentities.find((i) => i.provider === connection)?.user_id
      if (!secondaryUserId) {
        throw new Error(`Could not resolve secondary user_id for ${connection}`)
      }
      const res = await fetch(NETLIFY_UNLINK_ENDPOINT,
        {method: 'POST', headers: {'Content-Type':
          'application/json', 'Authorization':
          `Bearer ${primaryAccessToken}`},
          body: JSON.stringify({secondaryProvider: connection, secondaryUserId})})
      if (!res.ok) {
        throw new Error(await res.text())
      }
      await refreshUser()
    } catch (err) {
 console.error('Unlink failed', err)
}
  }

  const buttonSx = {'mr': -3,
    'ml': 'auto',
    'alignSelf': 'center',
     'borderColor': 'divider',
      'color': 'text.primary',
       '&:hover': {borderColor: 'text.primary'}}
  const listAvatarSx = {minWidth: 56, mr: 1.5} // 40px avatar + 16px gap

  const providers = [
    {id: 'google-oauth2', ...providerMeta['google-oauth2']},
    {id: 'github', ...providerMeta.github},
  ]

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{textAlign: 'center', fontWeight: 600, fontSize: '1.35rem'}}>Account Settings</DialogTitle>
      <DialogContent dividers>
          <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          px={3}
          mb={3}
          mt={1}
          />
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center">
            <Avatar src={user?.picture} alt={user?.name} sx={{width: 56, height: 56, mr: 2}}/>
            <Box>
              <Typography variant="h3" sx={{lineHeight: 1.2, pl: 4, ml: -2}}>{user?.name || user?.email}</Typography>
              <Typography variant="h3" color="text.secondary" sx={{lineHeight: 1.2, pr: -4, ml: -4}}>{user?.email}</Typography>
            </Box>
          </Box>
          {primaryProvider && <Chip label={primaryProvider.name} size="small" color={primaryProvider.color}/>}
        </Box>

        <Divider sx={{mb: 2}}/>

        <Typography variant="subtitle1" gutterBottom>Additional Provider Connections</Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}><CircularProgress size={28}/></Box>
        ) : (
          <List disablePadding>
            {providers.map((provider) => {
              if (provider.id === primaryProviderId) {
return null
}
              const identity = linkedIdentities.find((id) => id.provider === provider.id)
              const isConnected = Boolean(identity)
              const connectedEmail = identity?.profileData?.email
              return (
                <ListItem key={provider.id} divider disableGutters sx={{px: 3}}>
                  <Box display="flex" alignItems="center" width="100%">
                    <ListItemAvatar sx={listAvatarSx}><Avatar>{provider.icon}</Avatar></ListItemAvatar>
                    <ListItemText sx={{mr: 1}}
                      primary={provider.name}
                      secondary={isConnected ? (connectedEmail ? `Connected as ${connectedEmail}` : 'Connected') : 'Not connected'}
                      secondaryTypographyProps={{color: 'text.secondary'}}
                    />
                    {isConnected ? (
                      <Button variant="outlined"
                      size="small"
                      sx={buttonSx}
                      onClick={() => handleUnlink(provider.id)} data-testid={`unlink-${provider.id}`}
                      >Unlink
                      </Button>
                    ) : (
                      <Button variant="outlined"
                       size="small"
                       sx={buttonSx}
                       onClick={() => handleLink(provider.id)} data-testid={`authorize-${provider.id}`}
                      >Authorize
                      </Button>
                    )}
                  </Box>
                </ListItem>
              )
            })}
          </List>
        )}

        <Box display="flex" justifyContent="flex-end" mt={3}><Button onClick={onClose}>Close</Button></Box>
      </DialogContent>
    </Dialog>
  )
}

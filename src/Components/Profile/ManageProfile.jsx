import React, {ReactElement, useCallback, useEffect, useState} from 'react'
import {
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
import {useAuth0} from '../../Auth0/Auth0Proxy'
import Dialog from '../Dialog'
import {useMock} from './ProfileControl'
import {
  AccountBoxOutlined as AccountBoxOutlinedIcon,
} from '@mui/icons-material'
import GitHubIcon from '@mui/icons-material/GitHub'
import GoogleIcon from '@mui/icons-material/Google'


/**
 * ManageProfile component for managing user profile and linked provider identities
 *
 * @property {boolean} isDialogDisplayed Whether the dialog is open
 * @property {Function} setIsDialogDisplayed Callback function to close the dialog
 * @return {ReactElement}
 */
export default function ManageProfile({isDialogDisplayed, setIsDialogDisplayed}) {
  const {user, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const [linkedIdentities, setLinkedIdentities] = useState([])
  const [loading, setLoading] = useState(true)

  const primaryProviderId = user?.sub?.split('|')[0]
  const primaryProvider = primaryProviderId ? providerMeta[primaryProviderId] : undefined

  const refreshUser = useCallback(async () => {
    try {
      await getAccessTokenSilently({authorizationParams:
                                    {audience: 'https://api.github.com/', scope:
                                     'openid profile email offline_access'},
                                    cacheMode: 'off', useRefreshTokens: true})
    } catch (err) {
      console.error('Error refreshing user after link/unlink', err)
    }
  }, [getAccessTokenSilently])

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
  }, [refreshUser])

  const onLinkClick = async (connection) => {
    if (useMock) {
      setLinkedIdentities((p) => [...p, {provider: connection, user_id: `mock-${connection}`}]); return
    }
    try {
      const primaryToken = await getAccessTokenSilently(
        {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
          cacheMode: 'off',
          useRefreshTokens: true,
        })
      localStorage.setItem('linkStatus', 'inProgress')
      window.open(`/popup-auth?connection=${connection}&linkToken=${encodeURIComponent(primaryToken)}`,
                  'authPopup', 'width=600,height=600')
    } catch (err) {
      console.error('Linking failed', err)
    }
  }

  const onUnlinkClick = async (connection) => {
    if (useMock) {
      setLinkedIdentities((p) => p.filter((id) => id.provider !== connection)); return
    }
    try {
      const primaryAccessToken = await getAccessTokenSilently({
        scope: 'openid profile email',
        cacheMode: 'off',
        useRefreshTokens: true,
      })
      const secondaryUserId = linkedIdentities.find((i) => i.provider === connection)?.user_id
      if (!secondaryUserId) {
        throw new Error(`Could not resolve secondary user_id for ${connection}`)
      }
      const res = await fetch(
        NETLIFY_UNLINK_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${primaryAccessToken}`,
          },
          body: JSON.stringify({secondaryProvider: connection, secondaryUserId}),
        })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      await refreshUser()
    } catch (err) {
      console.error('Unlink failed', err)
    }
  }

  const buttonSx = {
    'borderColor': 'divider',
    'color': 'text.primary',
    '&:hover': {borderColor: 'text.primary'},
  }

  const providers = [
    {id: 'google-oauth2', ...providerMeta['google-oauth2']},
    {id: 'github', ...providerMeta.github},
  ]

  return (
    <Dialog
      headerText='Manage Profile'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      headerIcon={<AccountBoxOutlinedIcon className='icon-share'/>}
    >
      <List disablePadding sx={{width: '100%'}}>
        <ListItem key='main' disableGutters sx={{width: '100%'}}>
          <ListItemAvatar><Avatar src={user?.picture} alt={user?.name}/></ListItemAvatar>
          <ListItemText
            primary={user?.name || user?.email}
            secondary={user?.email}
            secondaryTypographyProps={{color: 'text.secondary'}}
          />
          {primaryProvider && <Chip label={primaryProvider.name} size='small' color={primaryProvider.color}/>}
        </ListItem>
        <Divider sx={{mb: 2}}/>
        <Typography variant='subtitle1' gutterBottom>Additional Provider Connections</Typography>
        {loading ? (
            <ListItem>
              <Box display='flex' justifyContent='center' sx={{width: '100%', py: 3}}>
                <CircularProgress size={28}/>
              </Box>
            </ListItem>
          ) : (
            providers.map((provider) => {
              if (provider.id === primaryProviderId) {
                return null
              }
              const identity = linkedIdentities.find((id) => id.provider === provider.id)
              const isConnected = Boolean(identity)
              const connectedEmail = identity?.profileData?.email
              return (
                <ListItem key={provider.id} divider disableGutters sx={{width: '100%'}}>
                  <Box display='flex' alignItems='center' width='100%'>
                    <ListItemAvatar><Avatar>{provider.icon}</Avatar></ListItemAvatar>
                    <ListItemText
                      primary={provider.name}
                      secondary={isConnected ? (connectedEmail ? `Connected as ${connectedEmail}` : 'Connected') : 'Not connected'}
                      secondaryTypographyProps={{color: 'text.secondary'}}
                    />
                    {isConnected ? (
                      <Button variant='outlined'
                        size='small'
                        sx={buttonSx}
                        onClick={() => onUnlinkClick(provider.id)} data-testid={`unlink-${provider.id}`}
                      >Unlink
                      </Button>
                    ) : (
                      <Button variant='outlined'
                        size='small'
                        sx={buttonSx}
                        onClick={() => onLinkClick(provider.id)} data-testid={`authorize-${provider.id}`}
                      >Authorize
                      </Button>
                    )}
                  </Box>
                </ListItem>
              )
            })
          )
        }
      </List>
    </Dialog>
  )
}


const CUSTOM_CLAIM = 'https://bldrs.ai/identities'

const providerMeta = {
  'google-oauth2': {name: 'Google', icon: <GoogleIcon/>, color: 'primary'},
  'github': {name: 'GitHub', icon: <GitHubIcon/>, color: 'default'},
}

const NETLIFY_UNLINK_ENDPOINT = '/.netlify/functions/unlink-identity'

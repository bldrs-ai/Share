import React, {ReactElement} from 'react'
import {Box, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {BarChart3, FileSearch, Ruler} from 'lucide-react'
import HelpControl from '../Components/Help/HelpControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import AppsRegistry from '../Components/Apps/AppsRegistry.json'
import useStore from '../store/useStore'


const appIcons = {
  'Dashboard App': BarChart3,
  'IFC Inspector': FileSearch,
  'IFC Quantities': Ruler,
}


export default function TopBar() {
  const theme = useTheme()
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)

  const openApp = (app) => {
    setSelectedApp(app)
    setIsAppsVisible(true)
  }

  return (
    <Stack
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        zIndex: 10,
        pointerEvents: 'none',
        padding: '0 8px 0 50px',
        backgroundColor: theme.palette.secondary.backgroundColor,
        backdropFilter: theme.palette.secondary.backdropFilter,
        borderBottom: `1px solid ${theme.palette.secondary.dark}`,
      }}
      data-testid='TopBar'
    >
      {/* Left: build version */}
      <Typography sx={{
        fontSize: '11px',
        fontFamily: 'monospace',
        opacity: 0.4,
        pointerEvents: 'none',
      }}>
        build 059
      </Typography>

      {/* Center: app icons + light toggle */}
      {viewer && isModelReady && (
        <Stack direction='row' alignItems='center' sx={{pointerEvents: 'auto'}} spacing={0.5}>
          {isAppsEnabled && AppsRegistry.map((app) => {
            const LucideIcon = appIcons[app.appName]
            return (
              <Tooltip key={app.appName} title={app.appName} placement='bottom'>
                <IconButton
                  size='small'
                  onClick={() => openApp(app)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '6px',
                    color: theme.palette.primary.contrastText,
                    opacity: 0.7,
                    '&:hover': {opacity: 1},
                  }}
                >
                  {LucideIcon ?
                    <LucideIcon size={16} strokeWidth={1.75}/> :
                    <Box component='img' src={app.icon} alt={app.appName} sx={{width: 16, height: 16}}/>
                  }
                </IconButton>
              </Tooltip>
            )
          })}
        </Stack>
      )}

      {/* Right: profile + help */}
      <Stack
        direction='row'
        alignItems='center'
        sx={{pointerEvents: 'auto'}}
      >
        {isLoginEnabled && <ProfileControl/>}
        <HelpControl/>
      </Stack>
    </Stack>
  )
}

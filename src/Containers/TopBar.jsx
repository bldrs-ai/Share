import React, {ReactElement} from 'react'
import {Box, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {BarChart3, FileSearch, Ruler, Settings} from 'lucide-react'
import {useIsMobile} from '../Components/Hooks'
import HelpControl from '../Components/Help/HelpControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import FloorPlanControl from '../Components/FloorPlan/FloorPlanControl'
import ProjectSelector from '../Components/ProjectAdmin/ProjectSelector'
import ProjectAdminDialog from '../Components/ProjectAdmin/ProjectAdminDialog'
import AppsRegistry from '../Components/Apps/AppsRegistry.json'
import useStore from '../store/useStore'


const appIcons = {
  'Dashboard App': BarChart3,
  'IFC Inspector': FileSearch,
  'IFC Quantities': Ruler,
}


export default function TopBar() {
  const theme = useTheme()
  const isMobile = useIsMobile()
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const selectedApp = useStore((state) => state.selectedApp)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)

  const toggleApp = (app) => {
    if (isAppsVisible && selectedApp?.appName === app.appName) {
      setIsAppsVisible(false)
    } else {
      setSelectedApp(app)
      setIsAppsVisible(true)
      useStore.getState().setIsSvgFloorPlanVisible(false)
    }
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
        padding: isMobile ? '0 8px' : '0 8px 0 50px',
        backgroundColor: theme.palette.secondary.backgroundColor,
        backdropFilter: theme.palette.secondary.backdropFilter,
        borderBottom: `1px solid ${theme.palette.secondary.dark}`,
      }}
      data-testid='TopBar'
    >
      {/* Left: build version + project selector */}
      <Stack direction='row' alignItems='center' spacing={1} sx={{pointerEvents: 'auto'}}>
        {!isMobile && (
          <Typography sx={{
            fontSize: '11px',
            fontFamily: 'monospace',
            opacity: 0.4,
            pointerEvents: 'none',
          }}>
            build 060
          </Typography>
        )}
        <ProjectSelector/>
      </Stack>

      {/* Center: app icons + light toggle */}
      {viewer && isModelReady && (
        <Stack direction='row' alignItems='center' sx={{pointerEvents: 'auto'}} spacing={0.5}>
          {isAppsEnabled && AppsRegistry.map((app) => {
            const LucideIcon = appIcons[app.appName]
            const isSelected = isAppsVisible && selectedApp?.appName === app.appName
            return (
              <Tooltip key={app.appName} title={app.appName} placement='bottom'>
                <IconButton
                  size='small'
                  onClick={() => toggleApp(app)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '6px',
                    color: isSelected ? '#00ff00' : theme.palette.primary.contrastText,
                    opacity: isSelected ? 1 : 0.7,
                    '&:hover': {opacity: 1},
                  }}
                >
                  {LucideIcon ?
                    <LucideIcon size={16} strokeWidth={1.75}/> :
                    <Box component='img' src={`${window.__ASSET_BASE__ || ''}${app.icon}`} alt={app.appName} sx={{width: 16, height: 16}}/>
                  }
                </IconButton>
              </Tooltip>
            )
          })}
          <Box sx={{width: '1px', height: 20, bgcolor: theme.palette.secondary.dark, mx: 0.5}}/>
          <FloorPlanControl/>
        </Stack>
      )}

      {/* Right: manage (localhost only) + profile + help */}
      <Stack
        direction='row'
        alignItems='center'
        sx={{pointerEvents: 'auto'}}
      >
        {isLocalhost && (
          <Tooltip title='Project Management' placement='bottom'>
            <IconButton
              size='small'
              onClick={() => useStore.getState().setIsProjectAdminVisible(true)}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '6px',
                color: theme.palette.primary.contrastText,
                opacity: 0.7,
                '&:hover': {opacity: 1},
              }}
            >
              <Settings size={16} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
        )}
        {isLoginEnabled && <ProfileControl/>}
        <HelpControl/>
      </Stack>
      {isLocalhost && <ProjectAdminDialog/>}
    </Stack>
  )
}

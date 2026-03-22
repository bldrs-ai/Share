import React, {ReactElement, useState} from 'react'
import {Box, Divider, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {BarChart3, FileSearch, PanelLeft, Ruler} from 'lucide-react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import CameraControl from '../Components/Camera/CameraControl'
import CutPlaneMenu from '../Components/CutPlane/CutPlaneMenu'
import FloorPlanControl from '../Components/FloorPlan/FloorPlanControl'
import ImagineControl from '../Components/Imagine/ImagineControl'
import NavTreeControl from '../Components/NavTree/NavTreeControl'
import NotesControl from '../Components/Notes/NotesControl'
import OpenModelControl from '../Components/Open/OpenModelControl'
import PropertiesControl from '../Components/Properties/PropertiesControl'
import SaveModelControl from '../Components/Open/SaveModelControl'
import SearchControl from '../Components/Search/SearchControl'
import SearchBar from '../Components/Search/SearchBar'
import ShareControl from '../Components/Share/ShareControl'
import VersionsControl from '../Components/Versions/VersionsControl'
import AppsRegistry from '../Components/Apps/AppsRegistry.json'
import useStore from '../store/useStore'


export default function LeftToolbar() {
  const theme = useTheme()
  const {isAuthenticated} = useAuth0()
  const [expanded, setExpanded] = useState(false)

  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)
  const selectedElement = useStore((state) => state.selectedElement)
  const isAnElementSelected = selectedElement !== null
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)

  const appIcons = {
    'Dashboard App': BarChart3,
    'IFC Inspector': FileSearch,
    'IFC Quantities': Ruler,
  }

  const openApp = (app) => {
    setSelectedApp(app)
    setIsAppsVisible(true)
  }

  const Item = ({children, label}) => (
    <Box sx={{display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'}}>
      {children}
      <Typography
        variant='caption'
        sx={{ml: '-4px', mr: '8px', fontSize: '12px', opacity: expanded ? 0.8 : 0}}
      >
        {label}
      </Typography>
    </Box>
  )

  return (
    <Stack
      sx={{
        position: 'absolute',
        top: '40px',
        left: 0,
        bottom: 0,
        width: expanded ? '160px' : '40px',
        height: 'calc(100vh - 40px)',
        zIndex: 1,
        pointerEvents: 'auto',
        backgroundColor: theme.palette.secondary.backgroundColor,
        backdropFilter: theme.palette.secondary.backdropFilter,
        borderRight: `1px solid ${theme.palette.secondary.dark}`,
        padding: '4px',
        justifyContent: 'space-between',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
      data-testid='LeftToolbar'
    >
      <Stack>
        {/* Expand/collapse */}
        <Box sx={{display: 'flex', alignItems: 'center', justifyContent: expanded ? 'space-between' : 'center', px: '2px'}}>
          <Typography sx={{fontSize: '13px', fontWeight: 600, pl: '4px', whiteSpace: 'nowrap', overflow: 'hidden', opacity: expanded ? 1 : 0}}>
            bldrs
          </Typography>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'} placement='right'>
            <IconButton
              size='small'
              onClick={() => setExpanded(!expanded)}
              sx={{
                width: '2em',
                height: '2em',
                borderRadius: '6px',
                color: theme.palette.primary.contrastText,
                flexShrink: 0,
              }}
            >
              <PanelLeft size={16} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
        </Box>

        {/* Model tools */}
        {isOpenEnabled && <Item label='Open'><OpenModelControl/></Item>}
        {isOpenEnabled && isAuthenticated && <Item label='Save'><SaveModelControl/></Item>}
        {isSearchEnabled && <Item label='Search'><SearchControl/></Item>}
        {isNavTreeEnabled && <Item label='Nav Tree'><NavTreeControl/></Item>}
        {isVersionsEnabled && <Item label='Versions'><VersionsControl/></Item>}
        <Item label='Section'><CutPlaneMenu/></Item>
        {isModelReady && <Item label='Floor Plans'><FloorPlanControl/></Item>}
        {isNotesEnabled && <Item label='Notes'><NotesControl/></Item>}
        {isPropertiesEnabled && isAnElementSelected && <Item label='Properties'><PropertiesControl/></Item>}
        {isImagineEnabled && <Item label='Imagine'><ImagineControl/></Item>}
        {isShareEnabled && <Item label='Share'><ShareControl/></Item>}

        {/* Apps — individual icons with separator */}
        {isAppsEnabled && isModelReady && (
          <>
            <Divider sx={{my: '6px', opacity: 0.3}}/>
            {AppsRegistry.map((app) => {
              const LucideIcon = appIcons[app.appName]
              return (
                <Tooltip key={app.appName} title={app.appName} placement='right'>
                  <Box sx={{display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'}}>
                    <IconButton
                      size='small'
                      onClick={() => openApp(app)}
                      sx={{
                        width: '2em',
                        height: '2em',
                        borderRadius: '6px',
                        margin: '2px',
                        padding: '3px',
                        color: theme.palette.primary.contrastText,
                      }}
                    >
                      {LucideIcon ?
                        <LucideIcon size={16} strokeWidth={1.75}/> :
                        <Box
                          component='img'
                          src={app.icon}
                          alt={app.appName}
                          sx={{width: 16, height: 16}}
                        />
                      }
                    </IconButton>
                    <Typography
                      variant='caption'
                      sx={{ml: '2px', mr: '8px', fontSize: '12px', opacity: expanded ? 0.8 : 0, cursor: 'pointer', whiteSpace: 'nowrap'}}
                      onClick={() => openApp(app)}
                    >
                      {app.appName}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            })}
          </>
        )}

        <CameraControl/>

        {isSearchEnabled && isSearchBarVisible &&
          <SearchBar onSuccess={() => setIsSearchBarVisible(false)}/>}
      </Stack>

      {/* Bottom: Bldrs logo */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '6px 4px',
        opacity: 0.3,
      }}>
        <Box
          component='img'
          src='/icons/LogoB.svg'
          alt='bldrs'
          sx={{width: 16, height: 16}}
        />
      </Box>
    </Stack>
  )
}

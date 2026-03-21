import React, {ReactElement, useState} from 'react'
import {Box, IconButton, Stack, SvgIcon, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {
  ChevronRight as ExpandIcon,
  ChevronLeft as CollapseIcon,
} from '@mui/icons-material'
import {useAuth0} from '../Auth0/Auth0Proxy'
import AppsControl from '../Components/Apps/AppsControl'
import CameraControl from '../Components/Camera/CameraControl'
import CutPlaneMenu from '../Components/CutPlane/CutPlaneMenu'
import HelpControl from '../Components/Help/HelpControl'
import ImagineControl from '../Components/Imagine/ImagineControl'
import NavTreeControl from '../Components/NavTree/NavTreeControl'
import NotesControl from '../Components/Notes/NotesControl'
import OpenModelControl from '../Components/Open/OpenModelControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import PropertiesControl from '../Components/Properties/PropertiesControl'
import SaveModelControl from '../Components/Open/SaveModelControl'
import SearchControl from '../Components/Search/SearchControl'
import SearchBar from '../Components/Search/SearchBar'
import ShareControl from '../Components/Share/ShareControl'
import VersionsControl from '../Components/Versions/VersionsControl'
import LogoB from '../assets/icons/Bldrs.svg'
import useStore from '../store/useStore'


export default function LeftToolbar() {
  const theme = useTheme()
  const {isAuthenticated} = useAuth0()
  const [expanded, setExpanded] = useState(false)

  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  const selectedElement = useStore((state) => state.selectedElement)
  const isAnElementSelected = selectedElement !== null
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const model = useStore((state) => state.model)

  const Item = ({children, label}) => (
    <Box sx={{display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'}}>
      {children}
      {expanded && (
        <Typography
          variant='caption'
          sx={{ml: '-4px', mr: '8px', fontSize: '12px', opacity: 0.8}}
        >
          {label}
        </Typography>
      )}
    </Box>
  )

  return (
    <Stack
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 1,
        pointerEvents: 'auto',
        backgroundColor: theme.palette.secondary.backgroundColor,
        backdropFilter: theme.palette.secondary.backdropFilter,
        borderRight: `1px solid ${theme.palette.secondary.dark}`,
        padding: '4px',
        justifyContent: 'space-between',
      }}
      data-testid='LeftToolbar'
    >
      {/* Top: toggle + tools */}
      <Stack>
        <Box sx={{display: 'flex', justifyContent: expanded ? 'flex-end' : 'center'}}>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'} placement='right'>
            <IconButton
              size='small'
              onClick={() => setExpanded(!expanded)}
              sx={{
                width: '2.25em',
                height: '2.25em',
                borderRadius: '8px',
                color: theme.palette.primary.contrastText,
              }}
            >
              {expanded ? <CollapseIcon/> : <ExpandIcon/>}
            </IconButton>
          </Tooltip>
        </Box>

        {isOpenEnabled && <Item label='Open'><OpenModelControl/></Item>}
        {isOpenEnabled && isAuthenticated && <Item label='Save'><SaveModelControl/></Item>}
        {isSearchEnabled && <Item label='Search'><SearchControl/></Item>}
        {isNavTreeEnabled && <Item label='Nav Tree'><NavTreeControl/></Item>}
        {isVersionsEnabled && <Item label='Versions'><VersionsControl/></Item>}
        <Item label='Section'><CutPlaneMenu/></Item>
        {isNotesEnabled && <Item label='Notes'><NotesControl/></Item>}
        {isPropertiesEnabled && isAnElementSelected && <Item label='Properties'><PropertiesControl/></Item>}
        {isImagineEnabled && <Item label='Imagine'><ImagineControl/></Item>}
        {isLoginEnabled && <Item label='Profile'><ProfileControl/></Item>}
        {isAppsEnabled && <Item label='Apps'><AppsControl/></Item>}
        {isShareEnabled && <Item label='Share'><ShareControl/></Item>}
        <Item label='Help'><HelpControl/></Item>

        <CameraControl/>

        {isSearchEnabled && isSearchBarVisible &&
          <SearchBar onSuccess={() => setIsSearchBarVisible(false)}/>}
      </Stack>

      {/* Bottom: Bldrs logo */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8px 4px',
        opacity: 0.4,
      }}>
        <SvgIcon sx={{width: 24, height: 24}}>
          <LogoB/>
        </SvgIcon>
        {expanded && (
          <Typography sx={{ml: '4px', fontSize: '11px', fontWeight: 600, opacity: 0.8}}>
            bldrs.ai
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

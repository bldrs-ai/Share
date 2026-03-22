import React, {ReactElement, useState} from 'react'
import {Box, Stack, Typography} from '@mui/material'
import {TooltipIconButton} from '../Components/Buttons'
import {useTheme} from '@mui/material/styles'
import {PanelLeft} from 'lucide-react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import CameraControl from '../Components/Camera/CameraControl'

// FloorPlanControl moved to TopBar
import TerrainControl from '../Components/Terrain/TerrainControl'
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
import useStore from '../store/useStore'


export default function LeftToolbar() {
  const theme = useTheme()
  const {isAuthenticated} = useAuth0()
  const [expanded, setExpanded] = useState(false)

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
  const selectedElement = useStore((state) => state.selectedElement)
  const isAnElementSelected = selectedElement !== null
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)

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
        backgroundColor: 'var(--color-toolbar-bg)',
        backdropFilter: 'blur(8px)',
        borderRight: '1px solid var(--color-toolbar-border)',
        color: 'var(--color-text)',
        padding: '4px',
        justifyContent: 'space-between',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
      data-testid='LeftToolbar'
    >
      <Stack>
        {/* Expand/collapse */}
        <Item label='Menu'>
          <TooltipIconButton
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={() => setExpanded(!expanded)}
            icon={<PanelLeft size={18} strokeWidth={1.75}/>}
            placement='right'
          />
        </Item>

        <Box sx={{height: '8px'}}/>

        {/* Model tools */}
        {isOpenEnabled && <Item label='Open'><OpenModelControl/></Item>}
        {isOpenEnabled && isAuthenticated && <Item label='Save'><SaveModelControl/></Item>}
        {isSearchEnabled && <Item label='Search'><SearchControl/></Item>}
        {isNavTreeEnabled && <Item label='Nav Tree'><NavTreeControl/></Item>}
        {isVersionsEnabled && <Item label='Versions'><VersionsControl/></Item>}
        {/* Floor Plans moved to TopBar */}
        {isModelReady && <Item label='Terrain'><TerrainControl/></Item>}
        {isNotesEnabled && <Item label='Notes'><NotesControl/></Item>}
        {isPropertiesEnabled && isAnElementSelected && <Item label='Properties'><PropertiesControl/></Item>}
        {isImagineEnabled && <Item label='Imagine'><ImagineControl/></Item>}
        {isShareEnabled && <Item label='Share'><ShareControl/></Item>}


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
          src={`${window.__ASSET_BASE__ || ''}/icons/LogoB.svg`}
          alt='bldrs'
          sx={{width: 16, height: 16}}
        />
      </Box>
    </Stack>
  )
}

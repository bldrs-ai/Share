import React, {ReactElement, useRef, useState, useCallback} from 'react'
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
  const toolbarRef = useRef(null)
  const expandedRef = useRef(false)

  const toggleExpanded = useCallback(() => {
    // Toggle via DOM manipulation — avoids React re-render of all children
    const el = toolbarRef.current
    if (!el) return
    expandedRef.current = !expandedRef.current
    if (expandedRef.current) {
      el.style.width = '160px'
      el.querySelectorAll('.nav-label').forEach((lbl) => { lbl.style.opacity = '0.8' })
    } else {
      el.style.width = '40px'
      el.querySelectorAll('.nav-label').forEach((lbl) => { lbl.style.opacity = '0' })
    }
  }, [])

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

  // Item wrapper — label visibility controlled via DOM class, not React state
  const Item = ({children, label}) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        borderRadius: '6px',
        cursor: 'pointer',
        '&:hover': {backgroundColor: 'var(--color-surface-hover)'},
        '&:hover .nav-icon': {transform: 'scale(1.12)'},
      }}
    >
      <Box className='nav-icon' sx={{
        display: 'flex',
        transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        {children}
      </Box>
      <Typography
        className='nav-label'
        variant='caption'
        sx={{ml: '4px', mr: '8px', fontSize: '13px', opacity: 0, transition: 'opacity 0.1s'}}
      >
        {label}
      </Typography>
    </Box>
  )

  return (
    <Stack
      ref={toolbarRef}
      sx={{
        position: 'absolute',
        top: '40px',
        left: 0,
        bottom: 0,
        width: '40px',
        height: 'calc(100vh - 40px)',
        zIndex: 1,
        pointerEvents: 'auto',
        backgroundColor: 'var(--color-toolbar-bg)',
        borderRight: '1px solid var(--color-toolbar-border)',
        color: 'var(--color-text)',
        padding: '4px',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
      data-testid='LeftToolbar'
    >
      <Stack>
        {/* Expand/collapse */}
        <Item label='Menu'>
          <TooltipIconButton
            title='Menu'
            onClick={toggleExpanded}
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
        {isModelReady && <Item label='Terrain'><TerrainControl/></Item>}
        {isNotesEnabled && <Item label='Notes'><NotesControl/></Item>}
        {isPropertiesEnabled && isAnElementSelected && <Item label='Properties'><PropertiesControl/></Item>}
        {isImagineEnabled && <Item label='Imagine'><ImagineControl/></Item>}
        {isShareEnabled && <Item label='Share'><ShareControl/></Item>}


        <CameraControl/>

        {isSearchEnabled && isSearchBarVisible &&
          <SearchBar onSuccess={() => setIsSearchBarVisible(false)}/>}
      </Stack>

    </Stack>
  )
}

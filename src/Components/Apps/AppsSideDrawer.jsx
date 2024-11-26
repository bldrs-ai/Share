import React, {Component, useRef} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import HorizonResizerButton from '../SideDrawer/HorizonResizerButton'
import VerticalResizerButton from '../SideDrawer/VerticalResizerButton'
import AppsPanel, {AppPreviewPanel} from './AppsPanel'


/**
 * @return {Component}
 */
export default function AppsSideDrawer() {
  const isAppsOpen = useStore((state) => state.isAppsOpen)
  const sidebarWidth = useStore((state) => state.appsSidebarWidth)
  const setAppsSidebarWidth = useStore((state) => state.setAppsSidebarWidth)
  const sidebarHeight = useStore((state) => state.appsSidebarHeight)
  const setAppsSidebarHeight = useStore((state) => state.setAppsSidebarHeight)
  const isMobile = useIsMobile()
  const sidebarRef = useRef(null)
  const theme = useTheme()
  const thickness = 10
  const selectedApp = useStore((state) => state.selectedApp)

  return (
    <Box
      sx={Object.assign({
        display: isAppsOpen ? 'flex' : 'none',
        flexDirection: 'row',
      }, isMobile ? {
        width: '100%',
        height: sidebarHeight,
      } : {
        top: 0,
        right: 0,
        width: sidebarWidth,
        height: '100vh',
        minWidth: '8px',
        maxWidth: '100vw',
      })}
    >
      <Paper
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderRadius: 0,
          background: theme.palette.primary.background,
        }}
        ref={sidebarRef}
        onMouseDown={(e) => e.preventDefault()}
      >
        {!isMobile &&
          <HorizonResizerButton
            sidebarRef={sidebarRef}
            thickness={thickness}
            isOnLeft={true}
            sidebarWidth={sidebarWidth}
            setSidebarWidth={setAppsSidebarWidth}
          />
        }
        {isMobile &&
          <VerticalResizerButton
            sidebarRef={sidebarRef}
            thickness={thickness}
            isOnTop={true}
            sidebarHeight={sidebarHeight}
            setSidebarHeight={setAppsSidebarHeight}
          />
        }
        {/* Content */}
        <Box
          sx={{
            width: '100%',
            margin: '1em',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: isAppsOpen ? 'block' : 'none',
              height: '100%',
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
          >
            {!selectedApp ?
            <AppsPanel/> :
            <AppPreviewPanel item={selectedApp}/>
            }
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

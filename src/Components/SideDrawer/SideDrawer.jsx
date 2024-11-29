import React, {ReactElement, useRef} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import HorizonResizerButton from './HorizonResizerButton'
import VerticalResizerButton from './VerticalResizerButton'


/**
 * Container for Notes and Properties
 *
 * @property {boolean} isDrawerOpen State toggle for drawer state
 * @property {Array<ReactElement>} children Drawer content
 * @return {ReactElement}
 */
export default function SideDrawer({isDrawerOpen, children}) {
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const isMobile = useIsMobile()
  const theme = useTheme()
  const sidebarRef = useRef(null)
  const resizeButtonThickness = 10
  return (
    <Box
      sx={Object.assign({
        display: isDrawerOpen ? 'flex' : 'none',
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
          background: theme.palette.secondary.main,
        }}
        ref={sidebarRef}
      >
        {!isMobile && <HorizonResizerButton sidebarRef={sidebarRef} thickness={resizeButtonThickness} isOnLeft={true}/>}
        {isMobile && <VerticalResizerButton sidebarRef={sidebarRef} thickness={resizeButtonThickness} isOnTop={true}/>}
        <Box
          sx={{
            width: '100%',
            margin: '0 0 0 1em',
            overflow: 'hidden',
          }}
          data-test-id='SideDrawer-OverflowHidden'
        >
          {children}
        </Box>
      </Paper>
    </Box>
  )
}

import React, {ReactElement, useRef} from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import NotesPanel from '../Notes/NotesPanel'
import PropertiesPanel from '../Properties/PropertiesPanel'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import HorizonResizerButton from './HorizonResizerButton'
import VerticalResizerButton from './VerticalResizerButton'


/**
 * Container for Notes and Properties
 *
 * @return {ReactElement}
 */
export default function SideDrawer() {
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const sidebarWidth = useStore((state) => state.sidebarWidth)

  const isMobile = useIsMobile()
  const theme = useTheme()

  const sidebarRef = useRef(null)

  const thickness = 10
  const isDrawerOpen = isNotesVisible === true || isPropertiesVisible === true
  const isDividerVisible = isNotesVisible && isPropertiesVisible
  const borderOpacity = 0.5
  const borderColor = hexToRgba(theme.palette.secondary.contrastText, borderOpacity)

  // TODO(pablo): removed what looked to be notes useEffect here.
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
        {!isMobile && <HorizonResizerButton sidebarRef={sidebarRef} thickness={thickness} isOnLeft={true}/>}
        {isMobile && <VerticalResizerButton sidebarRef={sidebarRef} thickness={thickness} isOnTop={true}/>}
        {/* Content */}
        <Box
          sx={{
            width: '100%',
            margin: '0 1em',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: isNotesVisible ? 'block' : 'none',
              height: isPropertiesVisible ? `50%` : '100%',
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
          >
            {isNotesVisible && <NotesPanel/>}
          </Box>
          {isDividerVisible && <Divider sx={{borderColor: borderColor}}/>}
          <Box
            sx={{
              display: isPropertiesVisible ? 'block' : 'none',
              height: isNotesVisible ? `50%` : '100%',
              marginTop: isDividerVisible ? '1em' : '0',
            }}
          >
            {isPropertiesVisible && <PropertiesPanel/>}
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

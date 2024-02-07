import React, {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import {getHashParams} from '../../utils/location'
import HorizonResizerButton from './HorizonResizerButton'
import VerticalResizerButton from './VerticalResizerButton'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'


/**
 * Container for Notes and Properties
 *
 * @return {React.ReactElement}
 */
export default function SideDrawer() {
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const setSidebarHeight = useStore((state) => state.setSidebarHeight)
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const location = useLocation()
  const isMobile = useIsMobile()
  const sidebarRef = useRef(null)
  const theme = useTheme()
  const thickness = 10
  const isDrawerOpen = isNotesVisible === true || isPropertiesVisible === true
  const isDividerOn = isNotesVisible && isPropertiesVisible
  const borderOpacity = 0.5
  const borderColor = hexToRgba(theme.palette.primary.contrastText, borderOpacity)


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      setIsNotesVisible(true)
    }
    setSelectedNoteId(null)
  }, [location, setIsNotesVisible, setSelectedNoteId])


  const drawerWidth = '400px'
  return (
    <Drawer
      open={isDrawerOpen}
      onClose={() => {
        setIsPropertiesVisible(false)
        setIsNotesVisible(false)
      }}
      anchor='right'
      variant='temporary'
      elevation={0}
      hideBackdrop
      disableScrollLock
      ModalProps={{
        slots: {backdrop: 'div'},
        slotprops: {
          root: { // override the fixed position + the size of backdrop
            style: {
              position: 'absolute',
              top: 'unset',
              bottom: 'unset',
              left: 'unset',
              right: 'unset',
            },
          },
        },
      }}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          // backgroundColor: (theme) => theme.palette.primary.main,
          boxSizing: 'border-box',
          overflow: 'hidden',
        },
      }}
    >
      <Paper
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderRadius: 0,
          background: theme.palette.secondary.dark,
        }}
        ref={sidebarRef}
      >
        {!isMobile &&
          <HorizonResizerButton
            sidebarRef={sidebarRef}
            thickness={thickness}
            isOnLeft={true}
            sidebarWidth={sidebarWidth}
            setSidebarWidth={setSidebarWidth}
          />
        }
        {isMobile &&
          <VerticalResizerButton
            sidebarRef={sidebarRef}
            thickness={thickness}
            isOnTop={true}
            sidebarHeight={sidebarHeight}
            setSidebarHeight={setSidebarHeight}
          />
        }
        {/* Content */}
        <Box
          sx={{
            width: '100%',
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
          {isDividerOn && <Divider sx={{borderColor: borderColor}}/>}
          <Box
            sx={{
              display: isPropertiesVisible ? 'block' : 'none',
              height: isNotesVisible ? `50%` : '100%',
              marginTop: isDividerOn ? '1em' : '0',
            }}
          >
            {isPropertiesVisible && <PropertiesPanel includeGutter={!isDividerOn}/>}
          </Box>
        </Box>
      </Paper>
    </Drawer>
  )
}

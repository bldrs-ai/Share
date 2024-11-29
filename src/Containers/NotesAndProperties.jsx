import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import useTheme from '@mui/material/styles/useTheme'
import useStore from '../store/useStore'
import NotesPanel from '../Components/Notes/NotesPanel'
import PropertiesPanel from '../Components/Properties/PropertiesPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import {hexToRgba} from '../utils/color'


/**
 * Container for Notes and Properties
 *
 * @return {ReactElement}
 */
export default function NotesAndProperties() {
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const isDrawerOpen = isNotesVisible === true || isPropertiesVisible === true
  const isDividerVisible = isNotesVisible && isPropertiesVisible
  const theme = useTheme()
  const borderOpacity = 0.5
  const borderColor = hexToRgba(theme.palette.secondary.contrastText, borderOpacity)
  return (
    <SideDrawer isDrawerOpen={isDrawerOpen}>
      <Box
        sx={{
          display: isNotesVisible ? 'block' : 'none',
          height: isPropertiesVisible ? `50%` : '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
        data-test-id='NotesAndProperties'
      >
        {isNotesVisible && <NotesPanel/>}
      </Box>
      {isDividerVisible && <Divider sx={{borderColor: borderColor}}/>}
      <Box
        sx={{
          display: isPropertiesVisible ? 'block' : 'none',
          height: isNotesVisible ? `50%` : '100%',
        }}
      >
        {isPropertiesVisible && <PropertiesPanel/>}
      </Box>
    </SideDrawer>
  )
}

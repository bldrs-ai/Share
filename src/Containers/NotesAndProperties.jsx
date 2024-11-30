import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../store/useStore'
import NotesPanel from '../Components/Notes/NotesPanel'
import PropertiesPanel from '../Components/Properties/PropertiesPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'


/**
 * Container for Notes and Properties
 *
 * @return {ReactElement}
 */
export default function NotesAndProperties() {
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const isDrawerVisible = isNotesVisible === true || isPropertiesVisible === true

  const rightDrawerWidth = useStore((state) => state.rightDrawerWidth)
  const rightDrawerWidthInitial = useStore((state) => state.rightDrawerWidthInitial)
  const setRightDrawerWidth = useStore((state) => state.setRightDrawerWidth)

  return (
    <SideDrawer
      isDrawerVisible={isDrawerVisible}
      drawerWidth={rightDrawerWidth}
      drawerWidthInitial={rightDrawerWidthInitial}
      setDrawerWidth={setRightDrawerWidth}
      dataTestId='RightDrawer'
    >
      <Box
        sx={{
          display: isNotesVisible ? 'block' : 'none',
          height: isPropertiesVisible ? `50%` : '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
        data-testid='NotesAndProperties'
      >
        {isNotesEnabled &&
         isNotesVisible &&
         <NotesPanel/>}
      </Box>
      <Box
        sx={{
          display: isPropertiesVisible ? 'block' : 'none',
          height: isNotesVisible ? `50%` : '100%',
        }}
      >
        {isPropertiesEnabled &&
         isPropertiesVisible &&
         <PropertiesPanel/>}
      </Box>
    </SideDrawer>
  )
}

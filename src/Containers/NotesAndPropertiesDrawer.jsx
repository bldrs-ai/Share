import React, {ReactElement} from 'react'
import {Box} from '@mui/material'
import useStore from '../store/useStore'
import useExistInFeature from '../hooks/useExistInFeature'
import BotChat from '../Components/Bot/BotChat'
import NotesPanel from '../Components/Notes/NotesPanel'
import PropertiesPanel from '../Components/Properties/PropertiesPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'


/**
 * Drawer for Notes and Properties
 *
 * @return {ReactElement}
 */
export default function NotesAndPropertiesDrawer({setDrawerWidth}) {
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const isBotVisible = useStore((state) => state.isBotVisible)
  const rightDrawerWidth = useStore((state) => state.rightDrawerWidth)
  const rightDrawerWidthInitial = useStore((state) => state.rightDrawerWidthInitial)

  const isBotEnabled = useExistInFeature('bot')

  const isDrawerVisible = isNotesVisible || isPropertiesVisible || (isBotEnabled && isBotVisible)

  return (
    <SideDrawer
      isDrawerVisible={isDrawerVisible}
      drawerWidth={rightDrawerWidth}
      drawerWidthInitial={rightDrawerWidthInitial}
      setDrawerWidth={setDrawerWidth}
      dataTestId='NotesAndPropertiesDrawer'
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          gap: '0.75em',
        }}
      >
        {isNotesEnabled && isNotesVisible && (
          <Box sx={{flex: 1, minHeight: 0, overflow: 'hidden'}} data-testid='NotesPanelContainer'>
            <NotesPanel/>
          </Box>
        )}
        {isPropertiesEnabled && isPropertiesVisible && (
          <Box sx={{flex: 1, minHeight: 0, overflow: 'hidden'}} data-testid='PropertiesPanelContainer'>
            <PropertiesPanel/>
          </Box>
        )}
        {isBotEnabled && isBotVisible && (
          <Box sx={{flex: 1, minHeight: 0, overflow: 'hidden'}} data-testid='BotPanelContainer'>
            <BotChat/>
          </Box>
        )}
      </Box>
    </SideDrawer>
  )
}

import React, {ReactElement} from 'react'
import {Box, Paper} from '@mui/material'
import useExistInFeature from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {useIsMobile} from '../Hooks'
import Panel from '../SideDrawer/Panel'
import NewItemButton from '../Workspace/NewItemButton'
import SectionLabel from '../Workspace/SectionLabel'
import Notes from './Notes'
import NotesNavBar from './NotesNavBar'
import {removeHashParams} from './hashState'
import {TITLE_NOTE, TITLE_NOTES, TITLE_NOTE_ADD} from './component'


/** @return {ReactElement} */
export default function NotesPanel() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const toggleIsCreateNoteVisible = useStore((state) => state.toggleIsCreateNoteVisible)
  const isWorkspaceEnabled = useExistInFeature('workspace')
  const isMobile = useIsMobile()


  /** Hide panel and remove hash state */
  function onClose() {
    setIsNotesVisible(false)
    removeHashParams()
  }


  // Workspace shell, desktop (#1992): the drawer opens beneath the TopBar,
  // which is its header, so there is no title bar. The list leads the way
  // the ProjectsDrawer's does — New note, then a NOTES label — and a
  // selected note or the create form keeps NotesNavBar's back / prev /
  // next as a compact row. The panel closes from the Notes control.
  if (isWorkspaceEnabled && !isMobile) {
    const isListView = !selectedNoteId && !isCreateNoteVisible
    return (
      <Box
        sx={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}
        data-testid='NotesPanel'
      >
        {isListView ?
          <>
            <NewItemButton
              label='New note'
              onClick={toggleIsCreateNoteVisible}
              dataTestId='notes-new-button'
            />
            <SectionLabel text='Notes' dataTestId='notes-section-label'/>
          </> :
          <Box sx={{flexShrink: 0}} data-testid='notes-nav-row'>
            <NotesNavBar/>
          </Box>}
        {/* Notes stay raised paper — a note is a sheet — unlike the
            ProjectsDrawer's flat list. */}
        <Paper
          elevation={1}
          sx={{flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '0.5em'}}
          data-testid='SideDrawerPanel-Paper-Notes'
        >
          <Notes/>
        </Paper>
      </Box>
    )
  }


  let title = selectedNoteId ? TITLE_NOTE : TITLE_NOTES
  if (isCreateNoteVisible) {
    title = TITLE_NOTE_ADD
  }


  return (
    <Panel title={title} actions={<NotesNavBar/>} onClose={onClose} data-testid='NotesPanel'>
      <Notes/>
    </Panel>
  )
}

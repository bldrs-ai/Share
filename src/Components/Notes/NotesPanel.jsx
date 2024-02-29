import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import Notes from './Notes'
import NotesNavBar from './NotesNavBar'


/** @return {ReactElement} */
export default function NotesPanel() {
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const selectedNoteId = useStore((state) => state.selectedNoteId)

  let title = selectedNoteId ? 'NOTE' : 'NOTES'
  if (isCreateNoteActive) {
    title = 'ADD A NOTE'
  }

  return (
    <PanelWithTitle title={title} controlsGroup={<NotesNavBar/>} includeGutter={true}>
      <Notes/>
    </PanelWithTitle>
  )
}

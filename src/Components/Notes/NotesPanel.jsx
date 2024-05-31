import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import Notes from './Notes'
import NotesNavBar from './NotesNavBar'


/** @return {ReactElement} */
export default function NotesPanel() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  let title = selectedNoteId ? 'NOTE' : 'NOTES'
  if (isCreateNoteVisible) {
    title = 'ADD A NOTE'
  }

  return (
    <PanelWithTitle title={title} controlsGroup={<NotesNavBar/>} includeGutter={true}>
      <Notes/>
    </PanelWithTitle>
  )
}

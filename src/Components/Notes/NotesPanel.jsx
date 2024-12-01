import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import Panel from '../SideDrawer/Panel'
import Notes from './Notes'
import NotesNavBar from './NotesNavBar'
import {removeHashParams} from './hashState'


/** @return {ReactElement} */
export default function NotesPanel() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const selectedNoteId = useStore((state) => state.selectedNoteId)


  /** Hide panel and remove hash state */
  function onClose() {
    setIsNotesVisible(false)
    removeHashParams()
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


export const TITLE_NOTE = 'Note'
export const TITLE_NOTES = 'Notes'
export const TITLE_NOTE_ADD = 'Add a note'

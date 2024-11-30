import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {removeParams} from '../../utils/location'
import Panel from '../SideDrawer/Panel'
import Notes from './Notes'
import NotesNavBar from './NotesNavBar'
import {HASH_PREFIX_NOTES} from './hashState'


/** @return {ReactElement} */
export default function NotesPanel() {
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const selectedNoteId = useStore((state) => state.selectedNoteId)


  /** Hide panel and remove hash state */
  function onClose() {
    setIsNotesVisible(false)
    removeParams(HASH_PREFIX_NOTES)
  }


  let title = selectedNoteId ? 'Note' : 'Notes'
  if (isCreateNoteVisible) {
    title = 'Add a note'
  }


  return (
    <Panel title={title} actions={<NotesNavBar/>} onClose={onClose} data-testid='NotesPanel'>
      <Notes/>
    </Panel>
  )
}

import React, {useEffect} from 'react'
import useStore from '../../store/useStore'
import {getIssues} from '../../utils/GitHub'
import debug from '../../utils/debug'
import {ControlButtonWithHashState} from '../Buttons'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'


/**
 * Toggles the visibility of Notes and sets/removes its URL state token
 *
 * @return {React.ReactElement}
 */
export default function NotesControl() {
  const accessToken = useStore((state) => state.accessToken)

  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)

  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)

  const model = useStore((state) => state.model)
  const repository = useStore((state) => state.repository)
  const setNotes = useStore((state) => state.setNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const toggleIsLoadingNotes = useStore((state) => state.toggleIsLoadingNotes)

  // Fetch issues/notes
  useEffect(() => {
    (async () => {
      toggleIsLoadingNotes()
      try {
        setSelectedNoteId(null)
        const newNotes = []
        let issueIndex = 0
        const issueArr = await getIssues(repository, accessToken)
        debug().log('Notes#useEffect: issueArr: ', issueArr)

        issueArr.reverse().map((issue, index) => {
          newNotes.push({
            index: issueIndex++,
            id: issue.id,
            number: issue.number,
            title: issue.title || '',
            body: issue.body || '',
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
            synched: true,
          })
        })
        setNotes(newNotes)
        toggleIsLoadingNotes()
      } catch (e) {
        debug().warn('failed to fetch notes: ', e)
      }
    })()
    // TODO(pablo):
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, isCreateNoteVisible])


  return (
    <ControlButtonWithHashState
      title='Notes'
      icon={<ChatOutlinedIcon className='icon-share'/>}
      isDialogDisplayed={isNotesVisible}
      setIsDialogDisplayed={setIsNotesVisible}
      hashPrefix={NOTES_PREFIX}
      placement='left'
    />
  )
}


/** The prefix to use for the note state tokens */
export const NOTES_PREFIX = 'i'

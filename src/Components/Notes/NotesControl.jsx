import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {getIssues} from '../../utils/GitHub'
import debug from '../../utils/debug'
import {addHashParams, getHashParams, removeHashParams} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'


/**
 * Toggles the visibility of Notes and sets/removes its URL state token
 *
 * @return {React.ReactElement}
 */
export default function NotesControl() {
  const accessToken = useStore((state) => state.accessToken)
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const model = useStore((state) => state.model)
  const repository = useStore((state) => state.repository)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const setNotes = useStore((state) => state.setNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const toggleIsLoadingNotes = useStore((state) => state.toggleIsLoadingNotes)

  const location = useLocation()
  useEffect(() => {
    setIsNotesVisible(getHashParams(location, NOTES_PREFIX) !== undefined)
  }, [location, setIsNotesVisible])


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


  /** Toggle Notes visibility and set url state token */
  function onNotesClick() {
    // TODO(pablo): useNavigate
    if (isNotesVisible) {
      removeHashParams(window.location, NOTES_PREFIX)
    } else {
      addHashParams(window.location, NOTES_PREFIX)
    }
  }


  return (
    <TooltipIconButton
      title='Notes'
      icon={<ChatOutlinedIcon className='icon-share'/>}
      onClick={onNotesClick}
      selected={isNotesVisible}
    />
  )
}


/** The prefix to use for the note state tokens */
export const NOTES_PREFIX = 'i'

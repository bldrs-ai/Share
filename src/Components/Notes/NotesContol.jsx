import React, {useEffect} from 'react'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import {getIssues} from '../../utils/GitHub'
import debug from '../../utils/debug'


/**
 * Toggle button that controls the visibility of notes Panel
 *
 * @return {React.Component}
 */
export default function NotesControl() {
  const accessToken = useStore((state) => state.accessToken)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const model = useStore((state) => state.model)
  const repository = useStore((state) => state.repository)
  const setIsSideDrawerVisible = useStore((state) => state.setIsSideDrawerVisible)
  const setNotes = useStore((state) => state.setNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const toggleIsLoadingNotes = useStore((state) => state.toggleIsLoadingNotes)
  const toggleIsNotesVisible = useStore((state) => state.toggleIsNotesVisible)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, isCreateNoteActive])


  const toggle = () => {
    setIsSideDrawerVisible(true)
    toggleIsNotesVisible()
  }

  return (
    <TooltipIconButton
      title='Notes'
      icon={<ChatOutlinedIcon className='icon-share'/>}
      selected={isNotesVisible}
      onClick={toggle}
    />
  )
}

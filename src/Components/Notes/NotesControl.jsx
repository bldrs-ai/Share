import React, {ReactElement, useEffect} from 'react'
import {getIssues} from '../../net/github/Issues'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {getHashParams} from '../../utils/location'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_NOTES} from './hashState'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'


/**
 * Toggles the visibility of Notes and sets/removes its URL state token
 *
 * @return {ReactElement}
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
  const setSelectedCommentId = useStore((state) => state.setSelectedCommentId)

  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const HASH_PREFIX_COMMENT = 'gc'

  // Fetch issues/notes
  useEffect(() => {
    if (isNotesVisible) {
      // TODO(pablo): NotesControl loads onViewer, bc viewer for non-logged in
      // session is valid.  But!  When the model is private, there's a delayed
      // load until after auth succeeds.  If we don't check model here, then Notes
      // initially fails during an unauthenticated load via oauthproxy, which gets
      // a 302 DIY, and somehow seems to keep that state in Octokit.
      //
      // We detect we're in a delayed load state here by checking model first,
      // which then doesn't touch octokit until later when auth is available.
      if (!model) {
        return
      }
      (async () => {
        toggleIsLoadingNotes()
        try {
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
              locked: issue.locked,
              synched: true,
            })
          })
          setNotes(newNotes)
          toggleIsLoadingNotes()
        } catch (e) {
          setSnackMessage({text: 'Notes: Cannot fetch from GitHub', autoDismiss: true})
        }
      })()
    }
    // TODO(pablo):
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotesVisible, model, isCreateNoteVisible])


  // TODO(pablo): hack, move into helper
  // nickcastel50: this wasn't running if the hash changed - cleaned it up
  useEffect(() => {
    const updateIdsFromHash = () => {
      // Retrieve the note ID from the URL hash
      const noteHash = getHashParams(window.location, HASH_PREFIX_NOTES)
      let noteId = null
      if (noteHash) {
        const noteParts = noteHash.split(':')
        if (noteParts[0] === 'i' && noteParts[1]) {
          noteId = parseInt(noteParts[1], 10)
        }
      }

      // Retrieve the comment ID from the URL hash
      const commentHash = getHashParams(window.location, HASH_PREFIX_COMMENT) // Assuming HASH_PREFIX_COMMENTS is defined
      let commentId = null
      if (commentHash) {
        const commentParts = commentHash.split(':')
        if (commentParts[0] === 'gc' && commentParts[1]) {
          commentId = parseInt(commentParts[1], 10)
        }
      }

      // Set selected note ID if a valid one is found
      if (noteId) {
        setSelectedNoteId(noteId)
      }

      // Set selected comment ID if a valid one is found
      if (commentId) {
        setSelectedCommentId(commentId)
      }
    }

    // Run on initial mount
    updateIdsFromHash()

    // Listen for hash changes
    window.addEventListener('hashchange', updateIdsFromHash)

    // Cleanup listener on unmount
    return () => window.removeEventListener('hashchange', updateIdsFromHash)
  }, [setSelectedNoteId, setSelectedCommentId])


  useEffect(() => {
    if (isNotesVisible === false) {
      setSelectedNoteId(null)
    }
  }, [isNotesVisible, setSelectedNoteId])

  return (
    <ControlButtonWithHashState
      title='Notes'
      icon={<ChatOutlinedIcon className='icon-share'/>}
      isDialogDisplayed={isNotesVisible}
      setIsDialogDisplayed={setIsNotesVisible}
      hashPrefix={HASH_PREFIX_NOTES}
      placement='left'
    />
  )
}

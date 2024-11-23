import React, {ReactElement, useEffect, useRef} from 'react'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import {getIssues} from '../../net/github/Issues'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {getHashParams, getObjectParams} from '../../utils/location'
import {ControlButtonWithHashState} from '../Buttons'
import {parsePlacemarkFromIssue, getActivePlaceMarkHash, parsePlacemarkFromURL} from '../Markers/MarkerControl'
import {HASH_PREFIX_NOTES, HASH_PREFIX_COMMENT} from './hashState'


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
  const selectedNoteId = useStore((state) => state.selectedNoteId)

  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const writeMarkers = useStore((state) => state.writeMarkers)
  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)
  const markers = useStore((state) => state.markers)
  let activePlaceMarkHash = getActivePlaceMarkHash()
  const inactiveColor = 0xA9A9A9
  const activeColor = 0xff0000


  // Fetch issues/notes
  useEffect(() => {
    if (isNotesVisible) {
      if (!model) {
        return
      }

      // only want to get issues again if we are not in an issue thread.
      if (selectedNoteId !== null && markers.length > 0) {
        return
      }

       // Clear markers each time useEffect is called
      // writeMarkers(null)

      (async () => {
        toggleIsLoadingNotes()
        try {
          const newNotes = []
          let issueIndex = 0
          const issueArr = await getIssues(repository, accessToken)
          debug().log('Notes#useEffect: issueArr: ', issueArr)

          // Accumulate markers from all issues
          const allMarkers = issueArr.reverse().flatMap((issue, index) => {
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

            return parseMarker(issue) // Collect markers from this issue
          })
          const tempMarker = parseTempMarker(allMarkers)
          setNotes(newNotes)
          toggleSynchSidebar()
          writeMarkers(tempMarker ? [tempMarker, ...allMarkers] : allMarkers)
          toggleIsLoadingNotes()
        } catch (e) {
          setSnackMessage({text: 'Notes: Cannot fetch from GitHub', autoDismiss: true})
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotesVisible, model, isCreateNoteVisible, selectedNoteId])

  /**
   * Parses a temporary marker if no markers are active
   *
   * @return {object[]} An array of marker objects with coordinates and other properties.
   */
  function parseTempMarker(markers_) {
    const hasActiveMarker = markers_.some((marker) => marker.isActive)

    if (!hasActiveMarker && activePlaceMarkHash) {
      const markArr = Object.values(getObjectParams(activePlaceMarkHash))
      const lastElement = markArr[5].split(';')[0]

      if (markArr.length === 6) {
        const coordinates = [
          parseFloat(markArr[0]),
          parseFloat(markArr[1]),
          parseFloat(markArr[2]),
          parseFloat(markArr[3]),
          parseFloat(markArr[4]),
          parseFloat(lastElement),
        ]

        return {
          id: 'temporary',
          commentId: null,
          coordinates: coordinates,
          isActive: true,
          activeColor: activeColor,
          inactiveColor: inactiveColor,
        }
      }
    }

    return null
  }

  /**
   * Parses marker from issue
   *
   * @return {object[]} An array of marker objects with coordinates and other properties.
   */
  function parseMarker(issue) {
    const issuePlacemarkUrls = parsePlacemarkFromIssue(issue.body)

    // Accumulate markers for the current issue
    const markers_ = issuePlacemarkUrls.map((url) => {
      const hash = parsePlacemarkFromURL(url)
      const newHash = `${hash};${HASH_PREFIX_NOTES}:${issue.id}`
      let isActive = false

      const markArr = Object.values(getObjectParams(hash))
      const lastElement = markArr[5].split(';')[0]

      if (markArr.length === 6) {
        const coordinates = [
          parseFloat(markArr[0]),
          parseFloat(markArr[1]),
          parseFloat(markArr[2]),
          parseFloat(markArr[3]),
          parseFloat(markArr[4]),
          parseFloat(lastElement),
        ]

        if (activePlaceMarkHash && hash.startsWith(activePlaceMarkHash)) {
          activePlaceMarkHash = newHash
          isActive = true
        }

        return {
          id: issue.id,
          commentId: null,
          coordinates: coordinates,
          isActive: isActive,
          activeColor: activeColor,
          inactiveColor: inactiveColor,
        }
      }
      return null
    }).filter(Boolean) // Filter out any null values

    return markers_ // Return accumulated markers for the issue
  }


  const selectedCommentId = useStore((state) => state.selectedCommentId)
  const lastScrolledCommentId = useRef(null)
  // Reference to the NoteCard element for scrolling
  const activeNoteCardId = useStore((state) => state.activeNoteCardId)


  /**
   * Scrolls to a specific comment within the NoteCard component.
   *
   * @param {number} commentId - The ID of the comment to scroll to.
   */
  function scrollToComment(commentId) {
      const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`)
      if (commentElement) {
          commentElement.scrollIntoView({behavior: 'smooth', block: 'center'})
          // Uncomment the following if camera position setting is required
          // setCameraFromParams(firstCamera, cameraControls);
      }
  }

  /**
   * Scrolls to a specific Note within the NoteCard component.
   *
   * @param {number} noteId - The ID of the comment to scroll to.
   */
  function scrollToNote(noteId = -1) {
    const noteElement = document.querySelector(`[data-note-id="${noteId === -1 ? selectedNoteId : noteId}"]`)
    if (noteElement) {
      noteElement.scrollIntoView({behavior: 'smooth', block: 'start'})
      // setCameraFromParams(firstCamera, cameraControls); // Set camera position if required
    }
  }

  useEffect(() => {
   // Only proceed if `noteCardRef` is set and `selectedCommentId` has changed
   if (selectedCommentId) {
     if (selectedCommentId === -1) {
       scrollToNote()
     } else if (selectedCommentId) {
       scrollToComment(selectedCommentId)
     }
     // Store the last scrolled-to comment ID
     lastScrolledCommentId.current = selectedCommentId
   }
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [selectedCommentId, activeNoteCardId])

 useEffect(() => {
  // When the selected note ID is set, scroll to that specific note
  if (selectedNoteId) {
    scrollToNote(selectedNoteId)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedNoteId])

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
      const commentHash = getHashParams(window.location, HASH_PREFIX_COMMENT)
      let commentId = null
      if (commentHash) {
        const commentParts = commentHash.split(':')
        if (commentParts[0] === HASH_PREFIX_COMMENT && commentParts[1]) {
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
      } else {
        setSelectedCommentId(-1)
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

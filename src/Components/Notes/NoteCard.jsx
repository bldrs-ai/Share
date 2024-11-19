import React, {ReactElement, useState, useEffect, useRef} from 'react'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import NoteBodyEdit from './NoteBodyEdit'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {
  closeIssue,
  updateIssue,
  // TODO(pablo): deleteComment as deleteCommentGitHub,
} from '../../net/github/Issues'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {getHashParamsFromHashStr, setHashParams} from '../../utils/location'
import {findUrls} from '../../utils/strings'
import {
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from '../Camera/CameraControl'
import {HASH_PREFIX_CAMERA} from '../Camera/hashState'
import NoteBody from './NoteBody'
import NoteContent from './NoteContent'
import {HASH_PREFIX_NOTES, HASH_PREFIX_COMMENT} from './hashState'
import NoteFooter from './NoteFooter'
import NoteMenu from './NoteMenu'


/**
 * Note card
 *
 * @property {number} id note Issue id on GH
 * @property {number} index Within GH response
 * @property {string} date Date, in GH time
 * @property {string} [avatarUrl] User avatar/icon
 * @property {string} [body] Body in markdown
 * @property {number} numberOfComments Notes only
 * @property {string} [title] Notes only
 * @property {string} [username] Author
 * @property {boolean} [isNote] Is note, or if not is comment. Default: true
 * @return {ReactElement}
 */
export default function NoteCard({
  id = null,
  index = null,
  avatarUrl = '',
  body = '',
  date = '',
  noteNumber = '',
  numberOfComments = null,
  synched = true,
  title = '',
  username = '',
  isNote = true,
  locked = false,
}) {
  assertDefined(...arguments)
  const accessToken = useStore((state) => state.accessToken)
  const cameraControls = useStore((state) => state.cameraControls)
  const notes = useStore((state) => state.notes)
  const repository = useStore((state) => state.repository)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  // TODO(pablo)
  // const comments = useStore((state) => state.comments)
  // const setComments = useStore((state) => state.setComments)
  const setNotes = useStore((state) => state.setNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const setSelectedNoteIndex = useStore((state) => state.setSelectedNoteIndex)
  const setSelectedNote = useStore((state) => state.setSelectedNote)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const [showCreateComment, setShowCreateComment] = useState(false)


  const setEditModeGlobal = useStore((state) => state.setEditMode)
  const editModes = useStore((state) => state.editModes)
  const setEditBodyGlobal = useStore((state) => state.setEditBody)
  const editBodies = useStore((state) => state.editBodies)

  const [editMode, setEditMode] = useState(false)
  const [editBody, setEditBody] = useState(body)


  const handleEditBodyChange = (newBody) => {
    setEditBody(newBody) // Update local editBody state
    setEditBodyGlobal(id, newBody) // Update global editBody state
  }


  const {user} = useAuth0()

   // Reference to the NoteCard element for scrolling
   const noteCardRef = useRef(null)
   const setActiveNoteCardId = useStore((state) => state.setActiveNoteCardId)

   useEffect(() => {
    setActiveNoteCardId(id)
    return () => setActiveNoteCardId(null) // Reset when component unmounts
  }, [id, setActiveNoteCardId])

    // Sync local editMode with global editModes[id]
    useEffect(() => {
      if (editModes[id] !== undefined && editModes[id] !== editMode) {
        setEditMode(editModes[id])
      }
    }, [editModes, id, editMode])

      // Sync local editBody with global editBodies[id]
  useEffect(() => {
    if (editBodies[id] !== undefined && editBodies[id] !== editBody) {
      setEditBody(editBodies[id])
    }
  }, [editBodies, id, editBody])

  const embeddedCameraParams = findUrls(body)
      .filter((url) => {
        if (url.indexOf('#') === -1) {
          return false
        }
        const encoded = getHashParamsFromHashStr(
            url.substring(url.indexOf('#') + 1),
            HASH_PREFIX_CAMERA)
        return encoded && parseHashParams(encoded)
      })

  const firstCamera = embeddedCameraParams[0] // Intentionally undefined if empty
  const dateParts = date.split('T')
  const selected = selectedNoteId === id

  useEffect(() => {
    setEditBody(body)
  }, [selectedNoteId, body])


  useEffect(() => {
    if (selected && firstCamera) {
      setCameraFromParams(firstCamera, cameraControls)
    }
  }, [selected, firstCamera, cameraControls])


  /** Selecting a card move the notes to the replies/comments thread. */
  function selectCard() {
    let selectedNote = null
    if (notes) {
      selectedNote = notes.filter((issue) => issue.id === id)
    }
    setSelectedNote(selectedNote)
    setSelectedNoteIndex(index)
    setSelectedNoteId(id)
    if (embeddedCameraParams) {
      setCameraFromParams(firstCamera)
    }
    setHashParams(window.location, HASH_PREFIX_NOTES, {id: id})
  }


  /** Moves the camera to the position specified in the url attached to the issue/comment */
  function showCameraView() {
    setCameraFromParams(firstCamera, cameraControls)
    addCameraUrlParams(cameraControls)
    if (!embeddedCameraParams) {
      removeCameraUrlParams()
    }
  }

  /** Copies location which contains the issue id, camera position and selected element path */
  function shareIssue() {
    navigator.clipboard.writeText(window.location.href)
    setSnackMessage({text: 'The url path is copied to the clipboard', autoDismiss: true})
  }

    /** Copies location which contains the issue id, comment ID, camera position, and selected element path */
    function shareComment(issueID, commentID, clearHash = true) {
      // Get the current URL
      const href = new URL(window.location.href)

      // Initialize the hash components based on the clearHash flag
      let updatedHash
      if (clearHash) {
        // Only include `i` and `gc` if clearHash is true
        updatedHash = `${HASH_PREFIX_NOTES}:${issueID}`
        if (commentID) {
          updatedHash += `;${HASH_PREFIX_COMMENT}:${commentID}`
        }
      } else {
        // Start with the existing hash (without the leading `#`)
        const currentHash = href.hash.slice(1)

        // Split the existing hash into parts based on `;`
        const hashParts = currentHash ? currentHash.split(';') : []
        const hashMap = {}

        // Populate hashMap with existing values
        hashParts.forEach((part) => {
          const [key, value] = part.split(':')
          if (key && value) {
            hashMap[key] = value
          }
        })

        // Set or update `i` and `gc` values in the hashMap
        hashMap[HASH_PREFIX_NOTES] = issueID // Always set the issueID
        if (commentID) {
          hashMap[HASH_PREFIX_COMMENT] = commentID // Set commentID if it’s provided
        }

        // Reconstruct the hash string from hashMap
        updatedHash = Object.entries(hashMap)
          .map(([key, value]) => `${key}:${value}`)
          .join(';')
      }

      // Update the URL hash with the newly constructed value
      href.hash = updatedHash

      // Copy the updated URL to the clipboard
      navigator.clipboard.writeText(href.toString())
        .then(() => {
          setSnackMessage({text: 'The URL path is copied to the clipboard', autoDismiss: true})
        })
        .catch((err) => {
          setSnackMessage({text: 'Failed to copy URL', autoDismiss: true})
        })
    }


  /**
   * Closes the issue.  TODO(pablo): this isn't a delete
   *
   * @param {number} noteNumber obtained from github issue
   */
  async function onDeleteClick(noteNumberToDelete) {
    // TODO(pablo): handle response
    const res = await closeIssue(repository, noteNumberToDelete, accessToken)
    const updatedNotes = notes.filter((note) => note.number !== noteNumberToDelete)
    setNotes(updatedNotes)
    setSelectedNoteId(null)
    return res
  }


  /**
   * Delete comment from repo and remove from UI
   *
   * @param {string} repository
   * @param {string} accessToken
   * @param {number} commentId
   */
  // TODO(pablo)
  /* async function deleteComment(commentId) {
    // TODO(pablo): handle response
    await deleteCommentGitHub(repository, commentId, accessToken)
    const newComments = comments.map((comment) => ({
      ...comment,
      synched: (comment.id !== commentId) && comment.synched,
    }))
    setComments(newComments)
  } */


  /** Update issue on GH, set read-only */
  async function submitUpdate() {
    const res = await updateIssue(repository, noteNumber, title, editBody, accessToken)
    const editedNote = notes.find((note) => note.id === id)
    editedNote.body = res.data.body
    setNotes(notes)
    setEditMode(false)
    setEditModeGlobal(id, false)
  }


  return (
    <Card elevation={1} data-testid='note-card' ref={noteCardRef}>
      {isNote ?
       <CardHeader
         title={title}
         avatar={<Avatar alt={username} src={avatarUrl}/>}
         subheader={`${username} at ${dateParts[0]} ${dateParts[1]}`}
         action={
           synched && user && user.nickname === username &&
             <NoteMenu
               onEditClick={() => {
                setEditMode(true)
                setEditModeGlobal(id, true)
              }}
               onDeleteClick={() => onDeleteClick(noteNumber)}
               noteNumber={noteNumber}
             />
         }
       /> :
       <CardHeader
         avatar={<Avatar alt={username} src={avatarUrl}/>}
         subheader={`${username} at ${dateParts[0]} ${dateParts[1]}`}
       />}
      {isNote && !editMode && !selected &&
       <NoteBody selectCard={selectCard} markdownContent={editBody}/>}
      {selected && !editMode && <NoteContent markdownContent={editBody}/>}
      {!isNote && <NoteContent markdownContent={editBody}/>}
      {editMode &&
       <NoteBodyEdit
         handleTextUpdate={(event) => handleEditBodyChange(event.target.value)}
         value={editBody}
         isNote={isNote}
         setShowCreateComment={setShowCreateComment}
         showCreateComment={showCreateComment}
         locked={locked}
       />
      }
      <NoteFooter
        accessToken={accessToken}
        editMode={editMode}
        embeddedCameras={embeddedCameraParams}
        id={id}
        isNote={isNote}
        noteNumber={noteNumber}
        numberOfComments={numberOfComments}
        onClickCamera={showCameraView}
        onClickShare={isNote ? shareIssue : shareComment}
        selectCard={selectCard}
        selected={selected}
        submitUpdate={submitUpdate}
        synched={synched}
        username={username}
      />
    </Card>
  )
}

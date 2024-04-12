import React, {ReactElement, useState, useEffect} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import NoteBodyEdit from './NoteBodyEdit'
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
  CAMERA_PREFIX,
  addCameraUrlParams,
  setCameraFromParams,
  parseHashParams,
  removeCameraUrlParams,
} from '../CameraControl'
import NoteBody from './NoteBody'
import NoteContent from './NoteContent'
import {NOTES_PREFIX} from './NotesControl'
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
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  const [editMode, setEditMode] = useState(false)
  const [editBody, setEditBody] = useState(body)

  const {user} = useAuth0()

  const embeddedCameraParams = findUrls(body)
      .filter((url) => {
        if (url.indexOf('#') === -1) {
          return false
        }
        const encoded = getHashParamsFromHashStr(
            url.substring(url.indexOf('#') + 1),
            CAMERA_PREFIX)
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
    setSelectedNoteIndex(index)
    setSelectedNoteId(id)
    if (embeddedCameraParams) {
      setCameraFromParams(firstCamera)
    }
    setHashParams(window.location, NOTES_PREFIX, {id: id})
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
  }


  return (
    <Card elevation={1}>
      {isNote ?
       <CardHeader
         title={title}
         avatar={<Avatar alt={username} src={avatarUrl}/>}
         subheader={`${username} at ${dateParts[0]} ${dateParts[1]}`}
         action={
           synched && user && user.nickname === username &&
             <NoteMenu
               onEditClick={() => setEditMode(true)}
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
         handleTextUpdate={(event) => setEditBody(event.target.value)}
         value={editBody}
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
        onClickShare={shareIssue}
        selectCard={selectCard}
        selected={selected}
        submitUpdate={submitUpdate}
        synched={synched}
        username={username}
      />
    </Card>
  )
}

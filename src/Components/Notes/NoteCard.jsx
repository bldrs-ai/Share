/* eslint-disable no-console */
import React, {ReactElement, useState, useEffect} from 'react'
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
import {updateComment} from '../../net/github/Comments'
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
import {HASH_PREFIX_NOTES} from './hashState'
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
  async function updateIssueGithub() {
    const res = await updateIssue(repository, noteNumber, title, editBody, accessToken)
    const editedNote = notes.find((note) => note.id === id)
    editedNote.body = res.data.body
    setNotes(notes)
    setEditMode(false)
  }

  /**
   * Delete comment from repo and remove from UI
   *
   * @param {string} repository
   * @param {string} accessToken
   * @param {number} commentId
   */
    async function updateCommentGithub(commentId) {
      const updatedComment = await updateComment(repository, commentId, editBody, accessToken)
      console.log('updated comment', updatedComment)
      setEditMode(false)
    }


  return (
    <Card elevation={1} data-testid='note-card'>
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
      {!isNote && !editMode && <NoteContent markdownContent={editBody}/>}
      {editMode &&
       <NoteBodyEdit
         handleTextUpdate={(event) => setEditBody(event.target.value)}
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
        onClickShare={shareIssue}
        selectCard={selectCard}
        selected={selected}
        setEditMode={setEditMode}
        submitNoteUpdate={updateIssueGithub}
        submitCommentUpdate={updateCommentGithub}
        username={username}
      />
    </Card>
  )
}

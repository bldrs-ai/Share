// noteUtils.js
import useStore from '../../store/useStore'
import {closeIssue} from '../../utils/GitHub'
import {deleteComment} from '../../utils/GitHub'
import {updateIssue} from '../../utils/GitHub'


export const deleteNote = async (noteNumberToDelete) => {
  const {notes, setNotes, setSelectedNoteId, repository, accessToken} = useStore.getState()

  const closeResponse = await closeIssue(repository, noteNumberToDelete, accessToken)
  const updatedNotes = notes.filter((note) => note.number !== noteNumberToDelete)

  setNotes(updatedNotes)
  setSelectedNoteId(null)

  return closeResponse
}

export const removeComment = async (commentId) => {
  const {comments, setComments, repository, accessToken} = useStore.getState()

  await deleteComment(repository, commentId, accessToken)

  const updatedComments = comments.filter((comment) => comment.id !== commentId)
  setComments(updatedComments)
}

export const submitUpdate = async (noteId, noteNumber, title, newBody) => {
  const {notes, setNotes, repository, accessToken} = useStore.getState()

  const response = await updateIssue(repository, noteNumber, title, newBody, accessToken)
  const updatedBody = response.data.body

  const updatedNotes = notes.map((note) => {
    if (note.id === noteId) {
      return {...note, body: updatedBody}
    }
    return note
  })

  setNotes(updatedNotes)
}

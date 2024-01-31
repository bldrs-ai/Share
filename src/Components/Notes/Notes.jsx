import React, {useEffect, useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import List from '@mui/material/List'
import * as Sentry from '@sentry/react'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {useIsMobile} from '../Hooks'
import {getIssueComments} from '../../utils/GitHub'
import Loader from '../Loader'
import NoContent from '../NoContent'
import NoteCard from './NoteCard'
import NoteCardCreate from './NoteCardCreate'
import ApplicationError from '../ApplicationError'

/** The prefix to use for the note ID within the URL hash. */
export const NOTE_PREFIX = 'i'

/**
 * List of Notes
 *
 * @return {object} List of notes and comments as react component.
 */
export default function Notes() {
  const [hasError, setHasError] = useState(false)
  const {user} = useAuth0()
  const isMobile = useIsMobile()
  const accessToken = useStore((state) => state.accessToken)
  const comments = useStore((state) => state.comments)
  const drawer = useStore((state) => state.drawer)
  const notes = useStore((state) => state.notes)
  const repository = useStore((state) => state.repository)
  const isLoadingNotes = useStore((state) => state.isLoadingNotes)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setComments = useStore((state) => state.setComments)
  const selectedNote = (notes && selectedNoteId) ? notes.filter((issue) => issue.id === selectedNoteId)[0] : null


  const handleError = (err) => {
    if (!err) {
      return
    }
    Sentry.captureException(err)
    setHasError(true)
  }

  // Fetch comments based on selected note id
  useEffect(() => {
    (async () => {
      try {
        if (!repository) {
          debug().warn('IssuesControl#Notes: 1, no repo defined')
          return
        }
        if (!selectedNoteId || !selectedNote) {
          return
        }
        const newComments = []
        const commentArr = await getIssueComments(repository, selectedNote.number, accessToken)
        debug().log('Notes#useEffect: commentArr: ', commentArr)

        if (commentArr) {
          commentArr.map((comment) => {
            newComments.push({
              id: comment.id,
              body: comment.body,
              date: comment.created_at,
              username: comment.user.login,
              avatarUrl: comment.user.avatar_url,
              synched: true,
            })
          })
        }
        setComments(newComments)
      } catch (e) {
        debug().warn('failed to fetch comments: ', e)
        handleError(e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote])

  // On any change in side drawer always scroll up to the start of the notes list
  useEffect(() => {
    if (drawer) {
      drawer.scrollTop = 0
    }
  }, [drawer, selectedNoteId])


  return hasError ?
  <ApplicationError/> : (
  <List
    spacing={1}
    sx={isMobile ? {paddingBottom: '100px'} : {}}
  >
    {isLoadingNotes && <Loader type={'linear'}/>}
    {notes && notes.length === 0 && !isCreateNoteActive && !isLoadingNotes && <NoContent/>}
    {!user && isCreateNoteActive && <NoContent message={'Please login to create notes.'}/>}
    {user && isCreateNoteActive && <NoteCardCreate/>}
    {!selectedNoteId && !isCreateNoteActive && notes && !isLoadingNotes &&
        notes.map((note, index) => {
          return (
            <NoteCard
              key={index}
              index={note.index}
              id={note.id}
              noteNumber={note.number}
              title={note.title}
              date={note.date}
              body={note.body}
              username={note.username}
              numberOfComments={note.numberOfComments}
              avatarUrl={note.avatarUrl}
              synched={note.synched}
            />
          )
        })
    }
    {selectedNote &&
      <NoteCard
        index={selectedNote.index}
        id={selectedNote.id}
        noteNumber={selectedNote.number}
        title={selectedNote.title}
        date={selectedNote.date}
        body={selectedNote.body}
        username={selectedNote.username}
        numberOfComments={selectedNote.numberOfComments}
        avatarUrl={selectedNote.avatarUrl}
        synched={selectedNote.synched}
      />
    }
    {comments && selectedNote &&
      comments.map((comment, index) => {
        return (
          <NoteCard
            key={index}
            isComment={true}
            id={comment.id}
            index=''
            body={comment.body}
            date={comment.date}
            username={comment.username}
            avatarUrl={comment.avatarUrl}
            synched={comment.synched}
          />
        )
      })
    }
  </List>
  )
}

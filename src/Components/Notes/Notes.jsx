import React, {useEffect, useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import List from '@mui/material/List'
import * as Sentry from '@sentry/react'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {useIsMobile} from '../Hooks'
import {getIssues, getIssueComments} from '../../utils/GitHub'
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
  const model = useStore((state) => state.model)
  const notes = useStore((state) => state.notes)
  const repository = useStore((state) => state.repository)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setComments = useStore((state) => state.setComments)
  const setNotes = useStore((state) => state.setNotes)
  const selectedNote = (notes && selectedNoteId) ? notes.filter((issue) => issue.id === selectedNoteId)[0] : null


  const handleError = (err) => {
    if (!err) {
      return
    }
    Sentry.captureException(err)
    setHasError(true)
  }
  // Fetch issues/notes
  useEffect(() => {
    (async () => {
      try {
        if (!repository) {
          debug().warn('IssuesControl#Notes: 1, no repo defined')
          return
        }

        const newNotes = []
        let issueIndex = 0
        const issueArr = await getIssues(repository, accessToken)
        debug().log('Notes#useEffect: issueArr: ', issueArr)

        issueArr.reverse().map((issue, index) => {
          if (issue.body === null) {
            debug().warn(`issue ${index} has no body: `, issue)
            return
          }

          newNotes.push({
            index: issueIndex++,
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
            synched: true,
          })
        })

        setNotes(newNotes)
      } catch (e) {
        debug().warn('failed to fetch notes: ', e)
        handleError(e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, isCreateNoteActive])

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
  }, [repository, selectedNoteId, selectedNote])

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
    {notes && notes.length === 0 && !isCreateNoteActive && <NoContent/>}
    {!user && isCreateNoteActive && <NoContent message={'Please login to create notes.'}/>}
    {notes === null && <Loader type={'linear'}/>}
    {user && isCreateNoteActive && <NoteCardCreate/>}
    {!selectedNoteId && !isCreateNoteActive && notes &&
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

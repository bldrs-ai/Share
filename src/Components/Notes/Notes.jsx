import React, {useEffect} from 'react'
import Paper from '@mui/material/Paper'
import {useAuth0} from '@auth0/auth0-react'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {getIssues, getIssueComments} from '../../utils/GitHub'
import Loader from '../Loader'
import NoContent from '../NoContent'
import NoteCard from './NoteCard'
import NoteCardCreate from './NoteCardCreate'


/** The prefix to use for the note ID within the URL hash. */
export const NOTE_PREFIX = 'i'


/** @return {object} List of notes and comments as react component. */
export default function Notes() {
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const {user} = useAuth0()
  const notes = useStore((state) => state.notes)
  const synchSidebar = useStore((state) => state.synchSidebar)
  const setNotes = useStore((state) => state.setNotes)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredNote = (notes && selectedNoteId) ? notes.filter((issue) => issue.id === selectedNoteId)[0] : null
  const repository = useStore((state) => state.repository)
  const drawer = useStore((state) => state.drawer)
  const accessToken = useStore((state) => state.accessToken)


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
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, synchSidebar])


  useEffect(() => {
    (async () => {
      try {
        if (!repository) {
          debug().warn('IssuesControl#Notes: 1, no repo defined')
          return
        }
        if (!selectedNoteId || !filteredNote) {
          return
        }
        const newComments = []
        const commentArr = await getIssueComments(repository, filteredNote.number, accessToken)
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
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, selectedNoteId, synchSidebar, filteredNote])


  useEffect(() => {
    if (drawer) {
      drawer.scrollTop = 0
    }
  }, [drawer, selectedNoteId])


  return (
    <Paper
      elevation={0}
      square
      sx={{
        width: '100%',
        display: 'block',
        overflow: 'auto',
      }}
    >
      {isCreateNoteActive && user && <NoteCardCreate/>}
      {isCreateNoteActive && !user && <NoContent message={'Please login to create notes.'}/>}
      {notes === null && <Loader type={'linear'}/>}
      {notes && notes.length === 0 && !isCreateNoteActive && <NoContent/>}
      {notes && !selectedNoteId && !isCreateNoteActive ?
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
        }) :
        <>
          {(filteredNote && !isCreateNoteActive) ?
            <NoteCard
              index={filteredNote.index}
              id={filteredNote.id}
              noteNumber={filteredNote.number}
              title={filteredNote.title}
              date={filteredNote.date}
              body={filteredNote.body}
              username={filteredNote.username}
              numberOfComments={filteredNote.numberOfComments}
              avatarUrl={filteredNote.avatarUrl}
              synched={filteredNote.synched}
            /> : null
          }
          {comments && !isCreateNoteActive &&
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
        </>
      }
    </Paper>
  )
}

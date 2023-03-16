import React, {useEffect} from 'react'
import Paper from '@mui/material/Paper'
import {useAuth0} from '@auth0/auth0-react'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {getIssues, getIssueComments, getComments} from '../../utils/GitHub'
import Loader from '../Loader'
import NoContent from '../NoContent'
import NoteCard from './NoteCard'
import NoteCardCreate from './NoteCardCreate'
import {findMarkdownUrls} from '../../utils/strings'
import {PLACE_MARK_PREFIX} from '../../utils/constants'


/** The prefix to use for the note ID within the URL hash. */
export const NOTE_PREFIX = 'i'


/** @return {object} List of notes and comments as react component. */
export default function Notes() {
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const {user} = useAuth0()
  const notes = useStore((state) => state.notes)
  const synchNotes = useStore((state) => state.synchNotes)
  const setNotes = useStore((state) => state.setNotes)
  const createdNotes = useStore((state) => state.createdNotes)
  const setCreatedNotes = useStore((state) => state.setCreatedNotes)
  const deletedNotes = useStore((state) => state.deletedNotes)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredNote = (notes && selectedNoteId) ? notes.filter((issue) => issue.id === selectedNoteId)[0] : null
  const repository = useStore((state) => state.repository)
  const drawer = useStore((state) => state.drawer)


  useEffect(() => {
    debug().log('Notes#useEffect#fetchNotes')

    if (!repository) {
      debug().warn('IssuesControl#Notes: 1, no repo defined')
      return
    }

    const fetchNotes = async () => {
      try {
        const fetchedNotes = []
        const issueArr = await getIssues(repository)
        let issueIndex = 0

        issueArr.map((issue, index) => {
          if (issue.body === null) {
            debug().warn(`issue ${index} has no body: `, issue)
            return null
          }

          fetchedNotes.push({
            index: issueIndex++,
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
            synchedNote: true,
          })
        })

        let synchedCreatedNotes = []

        if (createdNotes !== null) {
          synchedCreatedNotes = createdNotes.filter(
              (createdNote) => !fetchedNotes.some(
                  (fetchedNote) =>
                    createdNote.title === fetchedNote.title &&
                createdNote.body === fetchedNote.body),
          )
          // update the list of created notes
          setCreatedNotes(synchedCreatedNotes)
        }

        const combinedSynchedNotes = [
          ...synchedCreatedNotes,
          ...fetchedNotes,
        ]

        let newNotes = []

        if (deletedNotes !== null) {
          const filteredDeleted = combinedSynchedNotes.filter(
              (synchedNote) => !deletedNotes.includes(synchedNote.number),
          )
          newNotes = filteredDeleted
        } else {
          newNotes = combinedSynchedNotes
        }

        setNotes(newNotes)

        const allComments = await getComments(repository)
        let placeMarkUrls = []
        allComments.forEach((comment) => {
          if (comment.body) {
            const newPlaceMarkUrls = findMarkdownUrls(comment.body, PLACE_MARK_PREFIX)
            placeMarkUrls = placeMarkUrls.concat(newPlaceMarkUrls)
          }
        })
        debug().log('Notes#useEffect#fetchNotes: placeMarkUrls: ', placeMarkUrls)
      } catch (e) {
        debug().warn('failed to fetch notes', e)
      }
    }

    fetchNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, setNotes, isCreateNoteActive, deletedNotes, synchNotes])


  useEffect(() => {
    debug().log('Notes#useEffect#fetchComments')

    if (!repository) {
      debug().warn('IssuesControl#Notes: 2, no repo defined')
      return
    }

    if (selectedNoteId !== null) {
      const fetchComments = async (selectedNote) => {
        try {
          const commentsArr = []
          const commentsData = await getIssueComments(repository, selectedNote.number)
          debug().log('Notes#useEffect#fetchComments: commentsData: ', commentsData)

          if (commentsData) {
            commentsData.map((comment) => {
              commentsArr.push({
                id: comment.id,
                body: comment.body,
                date: comment.created_at,
                username: comment.user.login,
                avatarUrl: comment.user.avatar_url,
              })
            })
          }

          setComments(commentsArr)
        } catch {
          debug().log('failed to fetch comments')
        }
      }

      fetchComments(filteredNote)
    }

    // this useEffect runs every time notes are fetched to enable fetching the comments when the platform is open using the link
  }, [filteredNote, repository, setComments, selectedNoteId, synchNotes])


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
              index={note.index}
              id={note.id}
              key={index}
              noteNumber={note.number}
              title={note.title}
              date={note.date}
              body={note.body}
              username={note.username}
              numberOfComments={note.numberOfComments}
              avatarUrl={note.avatarUrl}
              synchedNote={note.synchedNote}
            />
          )
        }) :
        <>
          {(filteredNote && !isCreateNoteActive) ?
            <NoteCard
              index={filteredNote.index}
              id={filteredNote.id}
              key={filteredNote.id}
              noteNumber={filteredNote.number}
              title={filteredNote.title}
              date={filteredNote.date}
              body={filteredNote.body}
              username={filteredNote.username}
              numberOfComments={filteredNote.numberOfComments}
              avatarUrl={filteredNote.avatarUrl}
            /> : null
          }
          {comments && !isCreateNoteActive &&
            comments.map((comment) => {
              return (
                <NoteCard
                  key={comment.id}
                  isComment={true}
                  id={comment.id}
                  index=''
                  body={comment.body}
                  date={comment.date}
                  username={comment.username}
                  avatarUrl={comment.avatarUrl}
                  synchedNote={true}
                />
              )
            })
          }
        </>
      }
    </Paper>
  )
}

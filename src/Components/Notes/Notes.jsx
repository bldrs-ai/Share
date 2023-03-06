import React, {useEffect} from 'react'
import Paper from '@mui/material/Paper'
import {useAuth0} from '@auth0/auth0-react'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {getIssues, getComments} from '../../utils/GitHub'
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
  const synchNotes = useStore((state) => state.synchNotes)
  const setNotes = useStore((state) => state.setNotes)
  const createdNotes = useStore((state) => state.createdNotes)
  const setCreatedNotes = useStore((state) => state.setCreatedNotes)
  const deletedNotes = useStore((state) => state.deletedNotes)
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredNote = (notes && selectedNoteId) ?
    notes.filter((issue) => issue.id === selectedNoteId)[0] : null
  const repository = useStore((state) => state.repository)
  const accessToken = useStore((state) => state.accessToken)
  const drawer = useStore((state) => state.drawer)


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Notes: 1, no repo defined')
      return
    }

    const fetchNotes = async () => {
      try {
        const fetchedNotes = []
        const issuesData = await getIssues(repository, accessToken)
        let issueIndex = 0
        issuesData.data.slice(0).map((issue, index) => {
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
          synchedCreatedNotes =
          createdNotes.filter(
              (createdNote) => !fetchedNotes.some(
                  (fetchedNote) =>
                    createdNote.title === fetchedNote.title &&
                    createdNote.body === fetchedNote.body ),
          )
          // update the list of created notes
          setCreatedNotes(synchedCreatedNotes)
        }

        const combinedSynchedNotes = [
          ...synchedCreatedNotes,
          ...fetchedNotes,
        ]

        if (deletedNotes !== null) {
          const filteredDeleted =
          combinedSynchedNotes.filter(
              (synchedNote) => !deletedNotes.includes(synchedNote.number),
          )
          setNotes(filteredDeleted)
        } else {
          setNotes(combinedSynchedNotes)
        }
      } catch (e) {
        debug().warn('failed to fetch notes', e)
      }
    }
    fetchNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNotes, repository, accessToken, isCreateNoteActive, deletedNotes, synchNotes])


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Notes: 2, no repo defined')
      return
    }

    const fetchComments = async (selectedNote) => {
      try {
        const commentsArr = []

        const commentsData = await getComments(repository, selectedNote.number, accessToken)
        if (commentsData) {
          commentsData.map((comment) => {
            commentsArr.push({
              id: comment.id,
              number: comment.number,
              title: comment.title,
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

    if (selectedNoteId !== null) {
      fetchComments(filteredNote)
    }

    // this useEffect runs every time notes are fetched to enable fetching the comments when the platform is open
    // using the link
  }, [filteredNote, repository, setComments, accessToken, selectedNoteId])


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
      {notes === null && <Loader type={'linear'}/> }
      {notes && notes.length === 0 && !isCreateNoteActive && <NoContent/> }
      {notes && !selectedNoteId && !isCreateNoteActive ?
       notes.map((note, index) => {
         return (
           <NoteCard
             embeddedUrl={note.embeddedUrl}
             index={note.index}
             id={note.id}
             key={index}
             issueNumber={note.number}
             title={note.title}
             date={note.date}
             body={note.body}
             username={note.username}
             numberOfComments={note.numberOfComments}
             avatarUrl={note.avatarUrl}
             imageUrl={note.imageUrl}
             synchedNote={note.synchedNote}
           />
         )
       }) :
       <>
         {(filteredNote && !isCreateNoteActive) ?
          <NoteCard
            embeddedUrl={filteredNote.embeddedUrl}
            index={filteredNote.index}
            id={filteredNote.id}
            key={filteredNote.id}
            title={filteredNote.title}
            date={filteredNote.date}
            body={filteredNote.body}
            username={filteredNote.username}
            numberOfComments={filteredNote.numberOfComments}
            avatarUrl={filteredNote.avatarUrl}
            imageUrl={filteredNote.imageUrl}
          /> : null
         }
         {comments && !isCreateNoteActive &&
          comments.map((comment, index) => {
            return (
              <NoteCard
                embeddedUrl={comment.embeddedUrl}
                isComment={true}
                index=''
                id={comment.id}
                key={comment.id}
                title={index + 1}
                date={comment.date}
                body={comment.body}
                username={comment.username}
                avatarUrl={comment.avatarUrl}
                imageUrl={comment.imageUrl}
              />
            )
          })
         }
       </>
      }
    </Paper>
  )
}


import React, {useEffect} from 'react'
import {Box, Paper} from '@mui/material'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {getIssues, getComments} from '../../utils/GitHub'
import Loader from '../Loader'
import NoContent from '../NoContent'
import NoteCard from './NoteCard'


/** The prefix to use for the note ID within the URL hash. */
export const NOTE_PREFIX = 'i'


/** @return {object} List of notes and comments as react component. */
export default function Notes() {
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const notes = useStore((state) => state.notes)
  const setNotes = useStore((state) => state.setNotes)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const filteredNote = (notes && selectedNoteId) ?
        notes.filter((issue) => issue.id === selectedNoteId)[0] : null
  const repository = useStore((state) => state.repository)


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Notes: 1, no repo defined')
      return
    }

    const fetchNotes = async () => {
      try {
        const fetchedNotes = []
        const issuesData = await getIssues(repository)
        issuesData.data.slice(0).reverse().map((issue, index) => {
          if (issue.body === null) {
            debug().warn(`issue ${index} has no body: `, issue)
            return null
          }
          fetchedNotes.push({
            index: index,
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            date: issue.created_at,
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
            numberOfComments: issue.comments,
          })
        })
        if (fetchedNotes.length > 0) {
          setNotes(fetchedNotes)
        } else {
          setNotes([])
        }
      } catch (e) {
        debug().warn('failed to fetch notes', e)
      }
    }

    fetchNotes()
  }, [setNotes, repository])


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Notes: 2, no repo defined')
      return
    }

    const fetchComments = async (selectedNote) => {
      try {
        const commentsArr = []

        const commentsData = await getComments(repository, selectedNote.number)
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

    // This address bug #314 by clearing selected issue when new model is loaded
    if (!filteredNote) {
      setSelectedNoteId(null)
    }
    // this useEffect runs everytime notes are fetched to enable fetching the comments when the platform is open
    // using the link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNote, repository, setComments])

  return (
    <Paper sx={{width: '100%'}} elevation={0}>
      <Box sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'alignItems': 'center',
        'resizeMode': 'contain',
        'width': '100%',
        'paddingTop': '10px',
        'paddingBottom': '30px',
        '@media (max-width: 900px)': {
          paddingTop: '0px',
        },
      }}
      >
        {notes === null && <Loader type={'linear'}/> }
        {notes && notes.length === 0 && <NoContent/> }
        {notes && !selectedNoteId ?
          notes.map((issue, index) => {
            return (
              <NoteCard
                embeddedUrl={issue.embeddedUrl}
                index={issue.index}
                id={issue.id}
                key={index}
                title={issue.title}
                date={issue.date}
                body={issue.body}
                username={issue.username}
                numberOfComments={issue.numberOfComments}
                avatarUrl={issue.avatarUrl}
                imageUrl={issue.imageUrl}
              />
            )
          }) :
        <>
          {filteredNote ?
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
          {comments &&
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
      </Box>
    </Paper>
  )
}

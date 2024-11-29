import React, {ReactElement, useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import * as Sentry from '@sentry/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import debug from '../../utils/debug'
import {getIssueComments} from '../../net/github/Issues'
import {getObjectParams} from '../../utils/location'
import useStore from '../../store/useStore'
import ApplicationError from '../ApplicationError'
import Loader from '../Loader'
import NoContent from '../NoContent'
import {parsePlacemarkFromIssue, getActivePlaceMarkHash, parsePlacemarkFromURL} from '../Markers/MarkerControl'
import {HASH_PREFIX_NOTES, HASH_PREFIX_COMMENT} from './hashState'
import NoteCard from './NoteCard'
import NoteCardCreate from './NoteCardCreate'


/**
 * List of Notes
 *
 * @return {ReactElement}
 */
export default function Notes() {
  const accessToken = useStore((state) => state.accessToken)
  const comments = useStore((state) => state.comments)
  const isCreateNoteVisible = useStore((state) => state.isCreateNoteVisible)
  const isLoadingNotes = useStore((state) => state.isLoadingNotes)
  const notes = useStore((state) => state.notes)
  const repository = useStore((state) => state.repository)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const setComments = useStore((state) => state.setComments)
  // Access markers and the necessary store functions
  const markers = useStore((state) => state.markers)
  const writeMarkers = useStore((state) => state.writeMarkers)

  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)

  const [hasError, setHasError] = useState(false)

  const {user} = useAuth0()

  const selectedNote =
        (notes && selectedNoteId) ?
        notes.filter((issue) => issue.id === selectedNoteId)[0] :
        null

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
      const commentMarkers = [] // Array to store markers parsed from comments
      const commentArr = await getIssueComments(repository, selectedNote.number, accessToken)
      debug().log('Notes#useEffect: commentArr: ', commentArr)

      // Get the main issue marker
      const issueMarker = getMarkerById(selectedNoteId)

      // Process each comment
      if (commentArr) {
        commentArr.forEach((comment) => {
          newComments.push({
            id: comment.id,
            body: comment.body,
            date: comment.created_at,
            username: comment.user.login,
            avatarUrl: comment.user.avatar_url,
            synched: true,
          })

          // Parse marker data from the comment
          const commentMarker = parseComment(comment)
          // Check if commentMarker is an array and has coordinates
          if (Array.isArray(commentMarker) && commentMarker.length > 0) {
            commentMarkers.push(...commentMarker) // Spread the array elements into commentMarkers
          }
        })
      }

      // Combine the issue marker and comment markers
      const hasActiveMarker = commentMarkers.some((marker) => marker.isActive)

      if (issueMarker) {
        issueMarker.isActive = !(hasActiveMarker)
      }
      const allMarkers = issueMarker ? [issueMarker, ...commentMarkers] : commentMarkers

      // Update state with new comments and markers
      setComments(newComments)
      toggleSynchSidebar()
      writeMarkers(allMarkers) // Assuming `setMarkers` is a function in your store or component state to update markers
    } catch (e) {
      debug().warn('failed to fetch comments: ', e)
      handleError(e)
    }
  })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedNote])


/**
 * Parses a comment to extract placemark markers.
 *
 * This function processes the body of a comment to extract placemark URLs,
 * generates marker data, and determines their active/inactive state.
 *
 * @param {object} comment The comment object containing the body and metadata.
 * @param {string} comment.body The text of the comment to parse for placemark URLs.
 * @param {number} comment.id The unique identifier for the comment.
 * @return {object[]} An array of marker objects with coordinates and other properties.
 */
function parseComment(comment) {
  const inactiveColor = 0xA9A9A9
  const activeColor = 0xff0000
  const issuePlacemarkUrls = parsePlacemarkFromIssue(comment.body)
  let activePlaceMarkHash = getActivePlaceMarkHash()

  // Accumulate markers for the current issue
  const markers_ = issuePlacemarkUrls.map((url) => {
    const hash = parsePlacemarkFromURL(url)
    const newHash = `${hash};${HASH_PREFIX_NOTES}:${selectedNoteId};${HASH_PREFIX_COMMENT}:${comment.id}`
    let isActive = false

    const markArr = Object.values(getObjectParams(hash))
    const lastElement = markArr[5].split(';')[0]

    if (markArr.length === 6) {
      const coordinates = [
        parseFloat(markArr[0]),
        parseFloat(markArr[1]),
        parseFloat(markArr[2]),
        parseFloat(markArr[3]),
        parseFloat(markArr[4]),
        parseFloat(lastElement),
      ]

      if (activePlaceMarkHash && hash.startsWith(activePlaceMarkHash)) {
        activePlaceMarkHash = newHash
        isActive = true
      }

      return {
        id: selectedNoteId,
        commentId: comment.id,
        coordinates: coordinates,
        isActive: isActive,
        activeColor: activeColor,
        inactiveColor: inactiveColor,
      }
    }
    return null
  }).filter(Boolean) // Filter out any null values

  return markers_ // Return accumulated markers for the issue
}

  /**
   * Gets a marker given a marker ID
   *
   * @return {object[]} An array of marker objects with coordinates and other properties.
   */
  function getMarkerById(id) {
    return markers.find((marker) => marker.id === id)
  }


  const liSx = {paddingTop: '0px', paddingLeft: '0px', paddingRight: '0px'}
  return hasError ?
    <ApplicationError/> : (
    <List
      spacing={3}
      sx={{padding: '0px'}}
      data-test-id='list-notes'
    >
      {isLoadingNotes && !isCreateNoteVisible && <Loader type={'linear'}/>}
      {notes && notes.length === 0 && !isCreateNoteVisible && !isLoadingNotes && <NoContent/>}
      {!user && isCreateNoteVisible && <NoContent message={'Please login to create notes.'}/>}
      {user && isCreateNoteVisible && <NoteCardCreate/>}
      {!selectedNoteId && !isCreateNoteVisible && notes && !isLoadingNotes &&
       notes.map((note, index) => {
         return (
           <ListItem key={index} sx={liSx} data-note-id={note.id}>
             <NoteCard
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
           </ListItem>
         )
       })
      }
      {selectedNote && (
      <ListItem sx={liSx} data-note-id={selectedNote.id}>
        <NoteCard
          avatarUrl={selectedNote.avatarUrl}
          body={selectedNote.body}
          date={selectedNote.date}
          id={selectedNote.id}
          index={selectedNote.index}
          noteNumber={selectedNote.number}
          numberOfComments={selectedNote.numberOfComments}
          synched={selectedNote.synched}
          title={selectedNote.title}
          username={selectedNote.username}
        />
      </ListItem>
    )}
      <ListItem sx={liSx} key={'commentCreate'}>
        {user && selectedNote && !selectedNote.locked && <NoteCardCreate isNote={false} noteNumber={selectedNote.number}/>}
      </ListItem>
      {selectedNote && !user &&
        <Box sx={{paddingBottom: '1em'}}>
          <NoContent message={'Please login to leave comments.'}/>
        </Box>
      }
      {selectedNote && user && selectedNote.locked &&
        <Box sx={{paddingBottom: '1em'}}><NoContent message={'The note is locked.'}/></Box>
      }
      {comments && selectedNote &&
       comments.map((comment, index) => {
         return (
           <ListItem sx={liSx} key={index} data-comment-id={comment.id}>
             <NoteCard
               isNote={false}
               id={comment.id}
               index=''
               body={comment.body}
               date={comment.date}
               username={comment.username}
               avatarUrl={comment.avatarUrl}
               synched={comment.synched}
             />
           </ListItem>
         )
       })
      }
    </List>
  )
}

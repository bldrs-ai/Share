import React, {useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import InputBase from '@mui/material/InputBase'
import Stack from '@mui/material/Stack'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {createIssue, getIssueComments} from '../../net/github/Issues'
import {createComment} from '../../net/github/Comments'
import {assertStringNotEmpty} from '../../utils/assert'
import CheckIcon from '@mui/icons-material/Check'


/**
 * Note card create
 *
 * @param {string} username
 * @param {string} avatarUrl
 * @return {React.Component} React component
 */
export default function NoteCardCreate({
  username = '',
  avatarUrl = '',
  isNote = true,
  noteNumber = '',
}) {
  const {user, isAuthenticated} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const comments = useStore((state) => state.comments)
  const setComments = useStore((state) => state.setComments)
  const notes = useStore((state) => state.notes)
  const setNotes = useStore((state) => state.setNotes)
  const selectedNoteId = useStore((state) => state.selectedNoteId)
  const toggleIsCreateNoteVisible = useStore((state) => state.toggleIsCreateNoteVisible)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(null)


  /**
   * create issue takes in the title and body of the note from the state
   *
   * @return {void}
   */
  async function createNote() {
    assertStringNotEmpty(title)
    const issuePayload = {
      title,
      body: body || '',
    }
    await createIssue(repository, issuePayload, accessToken)
    toggleIsCreateNoteVisible()
  }

  const fetchComments = async () => {
    const newComments = []
    const commentArr = await getIssueComments(repository, noteNumber, accessToken)

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
  }

  /** create new comment based on the selected note Id*/
  async function createNewComment() {
    assertStringNotEmpty(body)
    const commentPayload = {
      body: body || '',
    }
    const res = await createComment(repository, noteNumber, commentPayload, accessToken)
    setBody('')
    incrementCommentNumber()
    fetchComments()
    const createdComment = res.data
    const processedComment =
    {
      id: createdComment.id,
      body: createdComment.body,
      date: createdComment.created_at,
      username: createdComment.user.login,
      avatarUrl: createdComment.user.avatar_url,
      synched: true,
    }
    const newCommentList = [...comments, processedComment]
    setComments(newCommentList)
    return res
  }

  /** change comment number in store */
  const incrementCommentNumber = () => {
    const updatedNotes = notes.map((note) => {
      if (note.id === selectedNoteId) {
        return {...note, numberOfComments: note.numberOfComments + 1}
      }
      return note
    })
    setNotes(updatedNotes)
  }

  const submitEnabled = (title !== null && title !== '') || (!isNote && body !== null && body !== '')
  return (
    <Card
      elevation={1}
    >
      {isNote &&
        <CardHeader
          title={
            <InputBase
              value={title || ''}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
              multiline
              placeholder={'Note Title'}
              inputProps={{maxLength: 256}}
            />}
          avatar={
          isAuthenticated ?
            <Avatar
              alt={user.name}
              src={user.picture}
            /> :
            <Avatar alt={username} src={avatarUrl}/>
          }
        />
      }
      <CardContent>
        <Box
          sx={{
            margin: '1em 0px 0px 0px',
          }}
        >
          <InputBase
            value={body || ''}
            onChange={(event) => setBody(event.target.value)}
            fullWidth
            multiline
            placeholder={isNote ? 'Note Body' : 'Leave a comment ...' }
            inputProps={{maxLength: 256}}
            data-testid={isNote ? 'CreateNote' : 'CreateComment' }
          />
        </Box>
      </CardContent>
      <CardActions>
        <Stack
          justifyContent='flex-end'
          alignContent='flex-end'
          direction='row'
          sx={{width: '100%'}}
        >
          {isNote ?
          <TooltipIconButton
            title='Submit'
            onClick={createNote}
            icon={<CheckIcon/>}
            enabled={submitEnabled}
            size='small'
            placement='bottom'
          /> :
          <TooltipIconButton
            title='Submit'
            onClick={createNewComment}
            icon={<CheckIcon/>}
            enabled={submitEnabled}
            size='small'
            placement='bottom'
          />
          }
        </Stack>
      </CardActions>
    </Card>
  )
}

import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import InputBase from '@mui/material/InputBase'
import Stack from '@mui/material/Stack'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {createComment, getIssueComments} from '../../utils/GitHub'
import {assertStringNotEmpty} from '../../utils/assert'
import CheckIcon from '@mui/icons-material/Check'


/**
 * Note card create
 *
 * @param {string} username
 * @param {string} avatarUrl
 * @return {React.Component} React component
 */
export default function CommentCardCreate({
  noteNumber = null,
}) {
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const setComments = useStore((state) => state.setComments)
  const [body, setBody] = useState(null)


  /**
   * create a comment based on noteNumber
   *
   * @param {string} commentBody
   * @param {number} noteNumber
   * @return {void}
   */
  async function createNewComment() {
    assertStringNotEmpty(body)
    const commentPayload = {
      body: body || '',
    }
    setBody('')
    await createComment(repository, noteNumber, commentPayload, accessToken)
    fetchComments()
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

  const commentSubmitEnabled = body !== null && body !== ''
  return (
    <Card
      elevation={1}
      variant='note'
    >
      <CardContent>
        <Box
          sx={{
            margin: '10px 0px',
          }}
        >
          <InputBase
            value={body || ''}
            onChange={(event) => setBody(event.target.value)}
            fullWidth
            multiline
            placeholder={'Comment body'}
            inputProps={{maxLength: 256}}
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
          <TooltipIconButton
            title='Submit'
            onClick={async () => {
              await createNewComment()
            }}
            icon={<CheckIcon/>}
            enabled={commentSubmitEnabled}
            size='small'
            placement='bottom'
          />
        </Stack>
      </CardActions>
    </Card>
  )
}

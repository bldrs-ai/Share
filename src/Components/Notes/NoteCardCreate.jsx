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
import {createIssue} from '../../utils/GitHub'
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
}) {
  const {user, isAuthenticated} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const toggleIsCreateNoteActive = useStore((state) => state.toggleIsCreateNoteActive)
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
    toggleIsCreateNoteActive()
  }

  const submitEnabled = title !== null && title !== ''
  return (
    <Card
      elevation={1}
      variant='note'
    >
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
            placeholder={'Note Body'}
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
              await createNote()
            }}
            icon={<CheckIcon/>}
            enabled={submitEnabled}
            size='small'
            placement='bottom'
          />
        </Stack>
      </CardActions>
    </Card>
  )
}

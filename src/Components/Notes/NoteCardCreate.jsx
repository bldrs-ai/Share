import React, {useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import InputBase from '@mui/material/InputBase'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {createIssue} from '../../utils/GitHub'
import Submit from '../../assets/icons/Submit.svg'


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
  const repository = useStore((state) => state.repository)
  const toggleIsCreateNoteActive = useStore((state) => state.toggleIsCreateNoteActive)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const {user, isAuthenticated} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)


  /**
   * create issue takes in the title and body of the note from the state
   *
   * @return {void}
   */
  async function createNote() {
    const issuePayload = {
      title,
      body,
    }
    await createIssue(repository, issuePayload, accessToken)
    toggleIsCreateNoteActive()
    toggleSynchSidebar()
  }

  return (
    <Card
      elevation={1}
      variant='note'
    >
      <CardHeader
        title={
          <InputField
            placeholder={'Note Title'}
            inputText={title}
            setInputText={setTitle}
            multiline={false}
            maxLength={256}
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
          <InputField
            placeholder={'Note Body'}
            inputText={body}
            setInputText={setBody}
            multiline={true}
            maxLength={65000}
          />
        </Box>
      </CardContent>
      <CardActions>
        <TooltipIconButton
          title='Submit'
          size='small'
          placement='bottom'
          onClick={async () => {
            await createNote()
          }}
          icon={<Submit style={{width: '15px', height: '15px'}}/>}
        />
      </CardActions>
    </Card>
  )
}


/**
 * Input
 *
 * @property {string} placeholder input placeholder
 * @property {string} inputText tring to display as input
 * @property {string} setInputText function to save the current input string
 * @property {boolean} multiline is multiline input allowed
 * @property {number} maxLength maximum length of the input string
 * @return {React.Component} React component
 */
function InputField({placeholder, inputText, setInputText, multiline, maxLength}) {
  return (
    <InputBase
      value={inputText}
      onChange={(event) => setInputText(event.target.value)}
      error={true}
      placeholder={placeholder}
      fullWidth
      multiline={multiline}
      inputProps={{maxLength: maxLength}}
      sx={{
        '& input::placeholder': {
          opacity: .3,
        },
      }}
    />
  )
}

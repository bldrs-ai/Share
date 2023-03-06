import React, {useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {postIssue} from '../../utils/GitHub'
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
  const createdNotes = useStore((state) => state.createdNotes)
  const setCreatedNotes = useStore((state) => state.setCreatedNotes)
  const theme = useTheme()


  /**
   * create issue takes in the title and body of the note from the state
   *
   * @return {void}
   */
  function createNote() {
    // TODO(Oleg) noteIndex is used for note number :: need to introduce internal index system
    let noteIndex
    if (createdNotes) {
      noteIndex = Object.keys(createdNotes).length
    } else {
      noteIndex = 1
    }
    const issuePayload = {
      title,
      body,
    }
    postIssue(repository, issuePayload, accessToken)
    toggleIsCreateNoteActive()
    const localNote = {
      index: noteIndex,
      id: noteIndex,
      number: noteIndex,
      title: title,
      body: body,
      date: new Date().toISOString(),
      username: user ? user.name : 'username',
      avatarUrl: user ? user.picture : '',
      numberOfComments: '',
      synchedNote: false,
    }
    if (createdNotes === null) {
      setCreatedNotes([localNote])
    } else {
      setCreatedNotes([localNote, ...createdNotes])
    }
  }

  return (
    <Paper
      elevation={1}
      variant='note'
      square
      sx={{
        width: '100%',

      }}
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
        } sx={{
          backgroundColor: theme.palette.primary.main,
        }}
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
          onClick={createNote}
          icon={<Submit style={{width: '15px', height: '15px'}}/>}
        />
      </CardActions>
    </Paper>
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

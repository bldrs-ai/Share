import React, {useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
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
 * Note card
 *
 * @param {number} id note id
 * @param {number} index note index
 * @param {string} username username of the note author
 * @param {string} title note title
 * @param {string} avatarUrl user avatarUrl
 * @param {string} body note body
 * @param {string} date note date
 * @param {number} numberOfComments number of replies to the note - referred to as comments in GH
 * @param {boolean} expandedImage governs the size of the image, small proportions on mobile to start
 * @param {boolean} isComment Comments/replies are formatted differently
 * @return {object} React component
 */
export default function NoteCardCreate({
  username = '',
  avatarUrl = '',
}) {
  const repository = useStore((state) => state.repository)
  const createNoteOff = useStore((state) => state.createNoteOff)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const {user, isAuthenticated} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  const createdNotes = useStore((state) => state.createdNotes)
  const setCreatedNotes = useStore((state) => state.setCreatedNotes)
  const theme = useTheme()


  /**
   * create issue takes in the title and body of the note
   *
   */
  function createNote() {
    // TODO:Oleg noteIndex is used for note number :: need to introduce internal index system
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
    createNoteOff()
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
          />}
        avatar={
          isAuthenticated ?
          <Avatar
            alt={user.name}
            src={user.picture}
            sx={{width: 22, height: 22}}
          /> :
          <Avatar alt={username} src={avatarUrl}/>
        } sx={{
          backgroundColor: theme.palette.primary.main,
        }}
      />
      <CardContent
        sx={{
          'padding': '0px 20px 0px 20px',
          'margin': '0px 0px 0px 0px',
          'minHeight': '100px',
          '& img': {
            width: '100%',
          },
        }}
      >
        <Box
          sx={{
            margin: '10px 0px',
          }}
        >
          <InputField
            placeholder={'Note Body'}
            inputText={body}
            setInputText={setBody}
          />
        </Box>
      </CardContent>
      <CardActions createNote={createNote}/>
    </Paper>
  )
}


const CardActions = ({createNote}) => {
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0px 14px 0px 14px',
        height: '50px',
        backgroundColor: theme.palette.primary.main,
      }}
    >
      <TooltipIconButton
        title='Submit'
        size='small'
        placement='bottom'
        onClick={createNote}
        icon={<Submit style={{width: '15px', height: '15px'}}/>}
      />
    </Box>
  )
}


/**
 * Input
 *
 * @param {string} placeholder input placeholder
 * @param {string} inputText tring to display as input
 * @param {string} setInputText function to save the current input string
 * @return {object} React component
 */
function InputField({placeholder, inputText, setInputText}) {
  return (
    <InputBase
      value={inputText}
      onChange={(event) => setInputText(event.target.value)}
      error={true}
      placeholder={placeholder}
      fullWidth
      multiline
      sx={{
        '& input::placeholder': {
          opacity: .3,
        },
      }}
    />
  )
}

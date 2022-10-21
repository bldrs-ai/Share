import React from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import useTheme from '../Theme'
import {TooltipIconButton} from './Buttons'


/**
 * Issue card
 *
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {object} React component
 */
export default function IssueCardInput({onSubmit = () => console.log('in the on submit')}) {
  const theme = useTheme().theme
  return (
    <Paper elevation={0}
      sx={{
        height: 'auto',
        width: 'auto',
        marginBottom: '20px',
      }}
    >
      <Box
        sx={{
          height: '40px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          border: '1px solid lightGrey',
          backgroundColor: '#C8E8C7',
        }}
      >
        <InputBase
          sx={{
            width: '100%',
            paddingLeft: '4px',
            color: 'black',
          }}
          id="outlined-basic"
          label="Title"
          type="text"
          placeholder='Title'
          size="small"
        />
      </Box>
      <Box
        sx={{
          height: '100px',
          marginTop: '10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          border: '1px solid lightGrey',
        }}
      >
        <InputBase
          sx={{
            width: '100%',
            paddingLeft: '4px',
          }}
          id="outlined-basic"
          label="fkj "
          type="text"
          placeholder='Comment body'
          multiline
          rows={3}
          size="small"
        />
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: '6px',
          width: '100%',
        }}
      >
        <TooltipIconButton
          title='Include Camera View'
          size='small'
          placement='bottom'
          onClick={() => console.log('hello')}
          icon={
            <Box
              sx={{
                width: '20px',
                height: '20px',
                marginBottom: '2px',
              }}
            >
              <CameraIcon/>
            </Box>}
        />
        <Box
          sx={{
            width: '300px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'space-between',
          }}
        >
          {/* <Chip
            label="Camera position is included"
          /> */}
          <Chip
            sx={{
              backgroundColor: theme.palette.highlight.main,
            }}
            label="Create a note"
            clickable
            onClick={() => console.log('create a note')}
          />
        </Box>
      </Box>
    </Paper>
  )
}

import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import useTheme from '../Theme'
import {ColorModeContext} from '../Context/ColorMode'
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
  const themeColor = useContext(ColorModeContext)
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
          backgroundColor: '#C8E8C7',
        }}
      >
        <InputBase
          sx={{
            width: '100%',
            paddingLeft: '8px',
            color: 'black',
            paddingTop: '4px',
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
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          borderBottom: `1px solid ${theme.palette.highlight.heavy}`,
          backgroundColor: themeColor.isDay() ? 'white' : '#383838',
        }}
      >
        <InputBase
          sx={{
            width: '100%',
            paddingLeft: '8px',
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
          borderRadius: '0px 0px 5px 5px',
          backgroundColor: themeColor.isDay() ? 'white' : '#383838',
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
            marginRight: '8px',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'space-between',
          }}
        >
          <Chip
            sx={{
              backgroundColor: theme.palette.highlight.main,
            }}
            label="Create a note"
            clickable
            size='small'
            onClick={() => console.log('create a note')}
          />
        </Box>
      </Box>
    </Paper>
  )
}

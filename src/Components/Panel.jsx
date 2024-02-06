import React from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import CloseIcon from '@mui/icons-material/Close'


/**
 * A panel component with a sticky header containing a title and close button.
 *
 * @param {string} title The title to display in the panel header.
 * @param {Function} onClose A callback to be executed when the close button is clicked.
 * @param {React.ReactNode} content The content to be displayed in the panel.
 * @return {React.ReactElement} A rendered Panel component.
 */
export default function Panel({title, onClose, content, testId = '', action = null}) {
  const theme = useTheme()
  return (
    <Paper
      data-testid={testId}
      sx={{
        'overflowY': 'scroll',
        'maxHeight': '490px',
        'width': '100%',
        'opacity': .96,
        'position': 'relative',
        'borderRadius': '5px',
        'backgroundColor': theme.palette.scene.main,
        '@media (max-width: 800px)': {
          maxHeight: '400px',
        },
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        sx={{
          position: 'sticky',
          height: '40px',
          top: 0,
          zIndex: 1,
        }}
      >
        <Typography variant='body1' sx={{marginLeft: '.9em', textTransform: 'uppercase'}}>{title}</Typography>
        <Stack
          direction='row'
          justifyContent={'center'}
          alignItems={'center'}
          sx={{marginRight: '.3em'}}
        >
          <Box>
            {action}
          </Box>
          <IconButton aria-label='close' size='small' onClick={onClose} sx={{borderRadius: '5px'}}>
            <CloseIcon className='icon-share icon-small'/>
          </IconButton>
        </Stack>
      </Stack>
      <Box sx={{padding: '1px 0px'}}>
        {content}
      </Box>
    </Paper>
  )
}

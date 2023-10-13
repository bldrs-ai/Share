import React from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'


/**
 * A panel component with a sticky header containing a title and close button.
 *
 * @param {string} title The title to display in the panel header.
 * @param {Function} onClose A callback to be executed when the close button is clicked.
 * @param {React.ReactNode} content The content to be displayed in the panel.
 * @return {React.ReactElement} A rendered Panel component.
 */
export default function Panel({title, onClose, content}) {
  return (
    <Paper
      variant='control'
      sx={{
        overflowY: 'scroll',
        maxHeight: '300px',
        marginTop: '14px',
        width: '100%',
        opacity: .9,
        position: 'relative',
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        sx={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'background.paper',
          zIndex: 1,
        }}
      >
        <Typography variant='overline' sx={{marginLeft: '1em'}}>{title}</Typography>
        <Box sx={{marginRight: '.4em'}}>
          <IconButton aria-label="close" size="small" onClick={onClose}>
            <CloseIcon fontSize="inherit"/>
          </IconButton>
        </Box>
      </Stack>
      {content}
    </Paper>
  )
}

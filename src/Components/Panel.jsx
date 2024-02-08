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
 * @param {string|React.ReactElement} title The title to display in the panel header
 * @param {Function} onClose A callback to be executed when the close button is clicked
 * @param {React.ReactElement} children Enclosed elements
 * @return {React.ReactElement}
 */
export default function Panel({title, onClose, children, testId = '', action = null}) {
  const theme = useTheme()
  return (
    <Paper
      sx={{
        'overflowY': 'scroll',
        'maxHeight': '490px',
        'width': '100%',
        'opacity': .96,
        'position': 'relative',
        'borderRadius': '5px',
        'backgroundColor': theme.palette.secondary.dark,
        '@media (max-width: 800px)': {
          maxHeight: '400px',
        },
      }}
      data-testid={testId}
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
        {typeof(title) === 'string' ?
        <Typography
          variant='body1'
          sx={{
            marginLeft: '.9em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Typography> :
         <>{title}</>
        }
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
        {children}
      </Box>
    </Paper>
  )
}

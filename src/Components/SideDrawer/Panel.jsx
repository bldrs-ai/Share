import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {assertDefined} from '../../utils/assert'
import {CloseButton} from '../Buttons'


/**
 * A panel component with a sticky header containing a title and close button
 *
 * @param {string|ReactElement} title The title to display in the panel header
 * @param {Function} onCloseClick A callback to be executed when the close button is clicked
 * @param {ReactElement} children Enclosed elements
 * @param {ReactElement} [action] Action component, for the top bar
 * @param {string} testId Set on the root Paper element
 * @return {ReactElement}
 */
export default function Panel({title, onCloseClick, children, action = null, testId = ''}) {
  assertDefined(title, onCloseClick, children, testId)
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
        <Stack direction='row' justifyContent='center' alignItems='center'>
          <Box>{action}</Box>
          <CloseButton onCloseClick={onCloseClick}/>
        </Stack>
      </Stack>
      {children}
    </Paper>
  )
}

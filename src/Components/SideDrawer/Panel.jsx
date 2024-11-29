import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/material/styles/useTheme'
import {assertDefined} from '../../utils/assert'
import {CloseButton} from '../Buttons'
import {useIsMobile} from '../Hooks'


/**
 * A panel component with a sticky header containing a title and close button
 *
 * @property {string|ReactElement} title The title to display in the panel header
 * @property {Function} onCloseClick A callback to be executed when the close button is clicked
 * @property {ReactElement} children Enclosed elements
 * @property {ReactElement} [action] Action component, for the top bar
 * @property {object} [sx] Passed to root Paper elt
 * @property {string} [paperTestId] Set on the root Paper element
 * @return {ReactElement}
 */
export default function Panel({title, onCloseClick, children, action = null, sx = {}, paperTestId = ''}) {
  assertDefined(title, onCloseClick, children, paperTestId)
  const theme = useTheme()
  const isMobile = useIsMobile()
  return (
    <Paper
      sx={{
        'overflowY': 'scroll',
        'maxHeight': '490px',
        'width': '100%',
        'opacity': .96,
        'position': 'relative',
        'borderRadius': '5px',
        'backgroundColor': theme.palette.secondary.main,
        '@media (max-width: 800px)': {
          maxHeight: '400px',
        },
        ...sx,
      }}
      data-testid={paperTestId}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          backgroundColor: theme.palette.secondary.dark,
        }}
      >
        {
          typeof(title) === 'string' ?
            <Typography
              variant='body1'
              sx={{
                margin: '0.5em',
                textTransform: 'uppercase',
              }}
            >
              {title}
            </Typography> :
            <>{title}</>
        }
        <Stack direction='row' justifyContent='center' alignItems='center'>
          <Box>{action}</Box>
          {/* TODO(pablo): maybe a better place for this */}
          {!isMobile && <CloseButton onCloseClick={onCloseClick}/>}
        </Stack>
      </Stack>
      {children}
    </Paper>
  )
}

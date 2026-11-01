import React, {ReactElement} from 'react'
import {Box, Button, Stack} from '@mui/material'
import {NEW_BUTTON_HEIGHT, NEW_BUTTON_INSET, ROW_PITCH} from '../../Containers/layoutConstants'


/**
 * The full-width "New …" button that heads a workspace drawer's list —
 * New project in the ProjectsDrawer, New note in the Notes drawer (design
 * system: ProjectsDrawer anatomy). One control row tall, the button inset
 * so its edges meet the list rows' icons.
 *
 * @property {string} label Button text
 * @property {Function} onClick Called when the button is pressed
 * @property {string} dataTestId data-testid for the button
 * @return {ReactElement}
 */
export default function NewItemButton({label, onClick, dataTestId}) {
  return (
    <Stack
      justifyContent='center'
      sx={{height: ROW_PITCH, flexShrink: 0, px: `${NEW_BUTTON_INSET}px`, minWidth: 0}}
    >
      {/* Accent: the DS spends its one saturated blue on primary actions,
          as the Open dialog's own CTAs do. */}
      <Button
        variant='contained'
        color='accent'
        fullWidth
        onClick={onClick}
        sx={{height: NEW_BUTTON_HEIGHT, borderRadius: '10px', minWidth: 0}}
        data-testid={dataTestId}
      >
        {/* One line, ellipsized: a drawer resizes down to where the inset
            leaves the label too little room, and a wrapped label
            overflows the fixed height. Ellipsis needs a block box, not
            the Button's inline-flex, hence the span. */}
        <Box
          component='span'
          sx={{minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
        >
          {label}
        </Box>
      </Button>
    </Stack>
  )
}

import React, {ReactElement} from 'react'
import {Stack, Typography} from '@mui/material'
import {ROW_PITCH} from '../../Containers/layoutConstants'


/**
 * A workspace drawer's section heading (PROJECTS, UNGROUPED, NOTES): MUI
 * overline in text.secondary on one control row, so the drawer's rows
 * stay on the control grid (design system: SectionLabel).
 *
 * @property {string} text Label, in normal case (overline upper-cases it)
 * @property {string} dataTestId data-testid for the label row
 * @return {ReactElement}
 */
export default function SectionLabel({text, dataTestId}) {
  return (
    <Stack
      justifyContent='center'
      sx={{height: ROW_PITCH, flexShrink: 0, px: 2}}
      data-testid={dataTestId}
    >
      <Typography variant='overline' color='text.secondary'>
        {text}
      </Typography>
    </Stack>
  )
}

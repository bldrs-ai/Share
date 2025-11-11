import React from 'react'
import {Box} from '@mui/material'
import {ThemeCtx} from '../theme/Theme.fixture'
import TableRow from './TableRow'


export default (
  <ThemeCtx>
    <Box sx={{width: '400px'}}>
      <TableRow heading='hello' subtext='hello' inputType='select' options={['Option1', 'Option2', 'Option3']}/>
    </Box>
  </ThemeCtx>
)

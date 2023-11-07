import React from 'react'
import Box from '@mui/material/Box'
import FixtureContext from '../FixtureContext'
import TableRow from './TableRow'


export default (
  <FixtureContext>
    <Box sx={{width: '400px'}}>
      <TableRow heading='hello' subtext='hello' inputType='select' options={['Option1', 'Option2', 'Option3']}/>
    </Box>
  </FixtureContext>
)

import React from 'react'
import TableRow from './TableRow'
import {ThemeCtx} from '../theme/Theme.fixture'


export default (
  <ThemeCtx>
    <TableRow heading='hello' subtext='hello' inputType='select' options={['Option1', 'Option2', 'Option3']}/>
  </ThemeCtx>
)

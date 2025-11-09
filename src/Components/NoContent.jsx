import React from 'react'
import {Paper, Typography} from '@mui/material'
import AttentionIcon from '../assets/icons/Attention.svg'


/**
 * Loader contains the ItemPanel and allows for show/hide from the
 * right of the screen.
 *
 * @return {React.Component}
 */
export default function NoContent({message = 'no content'}) {
  return (
    <Paper sx={{textAlign: 'center', padding: '20px', borderRadius: '10px'}}>
      <AttentionIcon className='icon-share'/>
      <Typography sx={{marginTop: '1em'}}>{message}</Typography>
    </Paper>
  )
}

import React from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import AttentionIcon from '../assets/icons/Attention.svg'


/**
 * Loader contains the ItemPanel and allows for show/hide from the
 * right of the screen.
 *
 * @return {React.Component}
 */
export default function NoContent({message = 'no content'}) {
  return (
    <Paper variant='control' sx={{textAlign: 'center', padding: '20px 5px', borderRadius: '4px'}}>
      <AttentionIcon className='icon-share'/>
      <Typography sx={{marginTop: '1em'}}>{message}</Typography>
    </Paper>
  )
}

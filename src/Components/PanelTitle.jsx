import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'


/**
 * Panel Title
 *
 * @param {string} title Panel title
 * @param {object} [controlsGroup] Controls Group is placed on the right of the title
 * @return {React.Component} Properties Panel react component
 */
export default function PanelTitle({title, controlsGroup}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '5px',
        height: '3em',
      }}
    >
      <Typography variant='h2'>
        {title}
      </Typography>
      {controlsGroup}
    </Box>
  )
}

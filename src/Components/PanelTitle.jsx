import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'


/**
 * Panel Title
 *
 * @param {string} title Panel title
 * @param {object} [controlsGroup] Controls Group is placed on the right of the title
 * @param {string} iconSrc url to an image to be used to prepend and icon to the title
 * @return {React.Component} Properties Panel react component
 */
export default function PanelTitle({title, controlsGroup, iconSrc}) {
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
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
      >
        {iconSrc ?
          <img style={{
            width: '32px',
            height: '32px',
            margin: '0.5em',
          }} src={iconSrc} alt={title}
          /> : <></>
        }
        <Typography variant='h2'>
          {title}
        </Typography>
      </Box>
      {controlsGroup}
    </Box>
  )
}

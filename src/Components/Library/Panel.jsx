import React from 'react'
import Box from '@mui/material/Box'

/**
 * Styled Tabs component.
 *
 * @property {React.Component} content component that is injected into a panel
 * @return {React.Component}
 */
export default function Panel({content}) {
  return (
    <Box sx={{
      width: '100%',
      margin: '1em 0em 0em 0em',
      borderRadius: '.3em',
    }}
    >
      {content}
    </Box>
  )
}

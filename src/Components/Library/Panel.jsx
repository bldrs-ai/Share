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
      borderRadius: '.3em',
    }}
    >
      {content}
    </Box>
  )
}

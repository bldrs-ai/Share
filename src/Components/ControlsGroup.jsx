import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import OpenModelControl from './OpenModelControl'
import AboutControl from './About/AboutControl'

/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({fileOpen}) {
  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{borderRadius: '4px'}}
      spacing="0.5rem"
    >
      <AboutControl/>
      <OpenModelControl fileOpen={fileOpen}/>
    </ButtonGroup>
  )
}

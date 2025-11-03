import React, {ReactElement} from 'react'
import Stack from '@mui/material/Stack'
import AboutControl from '../Components/About/AboutControl'
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'


/**
 * BottomBar contains AboutControl, ElementsControl and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  return (
    <Stack
      spacing={2}
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      data-testid='BottomBar'
      sx={{position: 'relative'}}
    >
      <AboutControl/>
      <Stack direction='row' alignItems='center'>
        <ElementsControl deselectItems={deselectItems}/>
      </Stack>
      <HelpControl/>
    </Stack>
  )
}

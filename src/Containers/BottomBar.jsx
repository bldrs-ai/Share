import React, {ReactElement} from 'react'
import Stack from '@mui/material/Stack'
import AboutControl from '../Components/About/AboutControl'
import FloatingChat from '../Components/Chat/FloatingChat' // Adjust path if needed
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * BottomBar contains AboutControl, ElementsControl and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  const isFloatingChatEnabled = useExistInFeature('assistant')
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
      <ElementsControl deselectItems={deselectItems}/>
      {isFloatingChatEnabled ? <FloatingChat/> : <HelpControl/>}
    </Stack>
  )
}

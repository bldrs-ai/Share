import React, {ReactElement} from 'react'
import Stack from '@mui/material/Stack'
import AboutControl from '../Components/About/AboutControl'
import AssistantChat from '../Components/Assistant/AssistantChat'
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * BottomBar contains AboutControl, ElementsControl, AssistantChat and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  const isAssistantEnabled = useExistInFeature('assistant')
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
      {isAssistantEnabled ? <AssistantChat/> : <HelpControl/>}
    </Stack>
  )
}

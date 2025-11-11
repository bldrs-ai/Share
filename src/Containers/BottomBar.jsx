import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import AboutControl from '../Components/About/AboutControl'
import BotChat from '../Components/Bot/BotChat'
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * BottomBar contains AboutControl, ElementsControl, BotChat and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  const isBotEnabled = useExistInFeature('bot')
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
      {isBotEnabled ? <BotChat/> : <HelpControl/>}
    </Stack>
  )
}

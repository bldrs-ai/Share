import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import AboutControl from '../Components/About/AboutControl'
import BotControl from '../Components/Bot/BotControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * Bottom bar — About logo and bot.
 *
 * @return {ReactElement}
 */
export default function BottomBar() {
  const isBotEnabled = useExistInFeature('bot')
  return (
    <Stack
      direction='row'
      justifyContent='flex-start'
      alignItems='center'
      data-testid='BottomBar'
      sx={{position: 'relative'}}
    >
      <AboutControl/>
      {isBotEnabled && <BotControl/>}
    </Stack>
  )
}

import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import BotControl from '../Components/Bot/BotControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * Bottom bar — bot only (logo is in left nav).
 *
 * @return {ReactElement}
 */
export default function BottomBar() {
  const isBotEnabled = useExistInFeature('bot')
  if (!isBotEnabled) return null
  return (
    <Stack
      direction='row'
      justifyContent='flex-start'
      alignItems='center'
      data-testid='BottomBar'
      sx={{position: 'relative'}}
    >
      <BotControl/>
    </Stack>
  )
}

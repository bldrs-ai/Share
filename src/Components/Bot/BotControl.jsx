import React, {ReactElement} from 'react'
import {Chat as ChatIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'


/** @return {ReactElement} */
export default function BotControl() {
  const isBotVisible = useStore((state) => state.isBotVisible)
  const toggleIsBotVisible = useStore((state) => state.toggleIsBotVisible)

  return (
    <TooltipIconButton
      title='Bot'
      onClick={toggleIsBotVisible}
      icon={<ChatIcon className='icon-share'/>}
      selected={isBotVisible}
      variant='control'
      color='success'
      size='small'
      placement='top'
      dataTestId='control-button-bot'
    />
  )
}


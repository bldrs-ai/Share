import React, {ReactElement} from 'react'
import {Box} from '@mui/material'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_BOT} from './hashState'
import {AutoAwesome as BotIcon} from '@mui/icons-material'


/**
 * Control button for the bot.
 *
 * @return {ReactElement} The bot control button
 */
export default function BotControl() {
  const isBotVisible = useStore((state) => state.isBotVisible)
  const toggleIsBotVisible = useStore((state) => state.toggleIsBotVisible)
  return (
    <Box
      sx={{
        '& [data-testid="control-button-ai_assistant"]': {
          margin: 0,
        },
      }}
    >
      <ControlButtonWithHashState
        title='AI Assistant'
        icon={<BotIcon className='icon-share'/>}
        isDialogDisplayed={isBotVisible}
        setIsDialogDisplayed={toggleIsBotVisible}
        hashPrefix={HASH_PREFIX_BOT}
        placement='right'
      />
    </Box>
  )
}

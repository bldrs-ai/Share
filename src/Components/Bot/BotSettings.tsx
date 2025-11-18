import React, {ChangeEvent, ReactElement, useEffect, useState} from 'react'
import {
  Box, Button, InputBase, Typography,
} from '@mui/material'


/**
 * Settings panel for the bot.
 *
 * @param apiKey - The API key to display and save.
 * @param onApiKeyChange - Callback to save the API key.
 * @param onClose - Callback to close the settings panel.
 * @return The settings panel
 */
export default function BotSettings({apiKey, onApiKeyChange, onClose}: BotSettingsProps): ReactElement {
  const [localApiKey, setLocalApiKey] = useState<string>(apiKey)
  const [isEditing, setIsEditing] = useState<boolean>(false)

  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

  const handleSave = () => {
    onApiKeyChange(localApiKey.trim())
    onClose()
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '1.5em',
        justifyContent: 'space-between',
      }}
      data-testid='BotSettings'
    >
      <Box sx={{display: 'flex', flexDirection: 'column', gap: '0.75em'}}>
        <Typography variant='subtitle2' component='label' htmlFor='bot-openrouter-api-key' sx={{fontWeight: 600}}>
          Open Router API Key
        </Typography>
        <InputBase
          fullWidth
          type={isEditing ? 'text' : 'password'}
          value={localApiKey}
          placeholder='Paste your OpenRouter API Key…'
          onChange={(event: ChangeEvent<HTMLInputElement>) => setLocalApiKey(event.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          sx={{
            fontSize: 14,
            backgroundColor: (theme) => theme.palette.mode === 'dark' ?
              'rgba(255,255,255,0.08)' :
              'rgba(0,0,0,0.04)',
            borderRadius: 2,
            px: 2,
            py: 1,
          }}
          inputProps={{'data-testid': 'BotSettings-ApiKeyInput', 'id': 'bot-openrouter-api-key'}}
        />
      </Box>
      <Box sx={{display: 'flex', justifyContent: 'flex-end', gap: '0.5em'}}>
        <Button
          variant='contained'
          onClick={handleSave}
          data-testid='BotSettings-OkButton'
          disabled={!localApiKey.trim()}
        >
          OK
        </Button>
      </Box>
    </Box>
  )
}


type BotSettingsProps = {
  apiKey: string
  onApiKeyChange: (value: string) => void
  onClose: () => void
}

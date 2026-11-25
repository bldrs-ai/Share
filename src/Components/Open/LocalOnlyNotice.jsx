import React, {ReactElement} from 'react'
import {Button, Stack, Typography} from '@mui/material'
import {LOCAL_ONLY_MODE_NAME} from '../../app/localOnlyMode'
import useStore from '../../store/useStore'


/**
 * What a remote source's tab (GitHub, Google Drive; Open and Save dialogs)
 * shows in local-only mode instead of its controls
 * (app/localOnlyMode.js). The button opens the privacy settings, which
 * live in the About dialog; About stacks over this dialog, and raising the
 * level there brings the tab's own controls back at once (the store's
 * `privacyLevel` drives it).
 *
 * @property {string} source The source as named in the text, e.g. 'GitHub'
 * @property {string} [action] What it would do, e.g. 'open models from'
 * @return {ReactElement}
 */
export default function LocalOnlyNotice({source, action = 'open models from'}) {
  const setIsAboutVisible = useStore((state) => state.setIsAboutVisible)
  return (
    <Stack
      spacing={2}
      sx={{width: '100%', maxWidth: '400px', alignItems: 'center', py: 2}}
      data-testid='local-only-notice'
    >
      <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
        In {LOCAL_ONLY_MODE_NAME}, Bldrs Share opens files from your computer and the sample models.
        To {action} {source}, allow analytics in the privacy settings.
      </Typography>
      <Button
        variant='contained'
        color='accent'
        onClick={() => setIsAboutVisible(true)}
        sx={{textTransform: 'none'}}
        data-testid='local-only-notice-privacy-settings'
      >
        Privacy settings
      </Button>
    </Stack>
  )
}

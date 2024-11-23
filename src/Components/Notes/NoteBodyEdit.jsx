import React, {ReactElement} from 'react'
import CardContent from '@mui/material/CardContent'
import InputBase from '@mui/material/InputBase'
import Stack from '@mui/material/Stack'


/**
 * A card with a TextEditor and submit button for editing notes.
 *
 * @property {Function} handleTextUpdate Called when content changes
 * @property {string} [value] The content of the note.  Default: empty string.
 * @return {ReactElement}
 */
export default function EditCardBody({handleTextUpdate, value = ''}) {
  return (
    <CardContent>
      <Stack
        spacing={1}
        direction="column"
        justifyContent="center"
        alignItems="flex-end"
      >
        <InputBase
          value={value}
          onChange={handleTextUpdate}
          fullWidth
          multiline
          placeholder={'Note body'}
        />
      </Stack>
    </CardContent>
  )
}

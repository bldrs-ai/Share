import React, {useState} from 'react'
import {Button, Stack, TextField} from '@mui/material'


/**
 * Inline form for renaming a model.
 */
export default function ModelNameForm({model, onSave, onCancel}) {
  const [name, setName] = useState(model?.name || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({name: name.trim()})
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack direction='row' spacing={1} sx={{py: 0.5}} alignItems='center'>
        <TextField
          size='small'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          sx={{flexGrow: 1}}
          inputProps={{style: {fontSize: '13px', padding: '4px 8px'}}}
        />
        <Button size='small' onClick={onCancel}>Cancel</Button>
        <Button size='small' variant='contained' type='submit' disabled={!name.trim()}>Save</Button>
      </Stack>
    </form>
  )
}

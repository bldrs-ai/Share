import React, {useState} from 'react'
import {Button, Stack, TextField} from '@mui/material'


/**
 * Inline form for creating/editing a company.
 *
 * @property {object|null} company Existing company to edit, or null for create
 * @property {Function} onSave Called with {name, description}
 * @property {Function} onCancel Called to dismiss
 */
export default function CompanyForm({company, onSave, onCancel}) {
  const [name, setName] = useState(company?.name || '')
  const [description, setDescription] = useState(company?.description || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({name: name.trim(), description: description.trim()})
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={1.5} sx={{py: 1}}>
        <TextField
          size='small'
          label='Company name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          inputProps={{'data-testid': 'company-name-input'}}
        />
        <TextField
          size='small'
          label='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={2}
          inputProps={{'data-testid': 'company-desc-input'}}
        />
        <Stack direction='row' spacing={1} justifyContent='flex-end'>
          <Button size='small' onClick={onCancel}>Cancel</Button>
          <Button size='small' variant='contained' type='submit' disabled={!name.trim()}>
            {company ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </Stack>
    </form>
  )
}

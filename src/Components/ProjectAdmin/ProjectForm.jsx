import React, {useState} from 'react'
import {Button, MenuItem, Stack, TextField} from '@mui/material'


/**
 * Inline form for creating/editing a project.
 *
 * @property {object|null} project Existing project to edit, or null for create
 * @property {Function} onSave Called with {name, description, status}
 * @property {Function} onCancel Called to dismiss
 */
export default function ProjectForm({project, onSave, onCancel}) {
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [status, setStatus] = useState(project?.status || 'active')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({name: name.trim(), description: description.trim(), status})
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={1.5} sx={{py: 1}}>
        <TextField
          size='small'
          label='Project name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          inputProps={{'data-testid': 'project-name-input'}}
        />
        <TextField
          size='small'
          label='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={2}
          inputProps={{'data-testid': 'project-desc-input'}}
        />
        {project && (
          <TextField
            size='small'
            label='Status'
            select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value='active'>Active</MenuItem>
            <MenuItem value='archived'>Archived</MenuItem>
          </TextField>
        )}
        <Stack direction='row' spacing={1} justifyContent='flex-end'>
          <Button size='small' onClick={onCancel}>Cancel</Button>
          <Button size='small' variant='contained' type='submit' disabled={!name.trim()}>
            {project ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </Stack>
    </form>
  )
}

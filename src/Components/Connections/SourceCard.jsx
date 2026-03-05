import React from 'react'
import {Box, IconButton, Stack, Typography} from '@mui/material'
import {
  Folder as FolderIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {saveSources} from '../../connections/persistence'


/**
 * Displays a single Source with browse and remove actions.
 *
 * @property {object} source The Source object
 * @property {Function} onBrowse Called when user wants to browse this source
 * @return {React.ReactElement}
 */
export default function SourceCard({source, onBrowse}) {
  const removeSource = useStore((state) => state.removeSource)
  const sources = useStore((state) => state.sources)

  const handleRemove = () => {
    removeSource(source.id)
    const remaining = sources.filter((s) => s.id !== source.id)
    saveSources(remaining)
  }

  return (
    <Stack
      direction='row'
      alignItems='center'
      spacing={1}
      sx={{
        width: '100%',
        py: 0.5,
        px: 1,
        cursor: 'pointer',
        borderRadius: 1,
        '&:hover': {backgroundColor: 'action.hover'},
      }}
      data-testid={`source-card-${source.id}`}
    >
      <FolderIcon fontSize='small' color='action'/>
      <Box
        sx={{flex: 1, minWidth: 0}}
        onClick={() => onBrowse(source)}
      >
        <Typography variant='body2' noWrap>
          {source.label}
        </Typography>
      </Box>
      <IconButton
        size='small'
        onClick={handleRemove}
        title='Remove source'
        data-testid={`button-remove-source-${source.id}`}
      >
        <DeleteIcon fontSize='small'/>
      </IconButton>
    </Stack>
  )
}

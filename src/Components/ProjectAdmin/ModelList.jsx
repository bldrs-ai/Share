import React, {useState, useCallback, useRef} from 'react'
import {Box, ButtonBase, Chip, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {FileText, ChevronDown, ChevronUp, Pencil, Trash2, Plus} from 'lucide-react'
import useStore from '../../store/useStore'
import ModelNameForm from './ModelNameForm'
import ModelVersionList from './ModelVersionList'


/**
 * List of models for the active project with expand/collapse for versions.
 */
export default function ModelList() {
  const theme = useTheme()
  const modelRefs = useStore((state) => state.modelRefs)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const projects = useStore((state) => state.projects)
  const companies = useStore((state) => state.companies)
  const activeCompanyId = useStore((state) => state.activeCompanyId)
  const addModelToProject = useStore((state) => state.addModelToProject)
  const deleteModelFromProject = useStore((state) => state.deleteModelFromProject)
  const setActiveProject = useStore((state) => state.setActiveProject)
  const repo = useStore((state) => state.projectRepository)

  const [expandedModelId, setExpandedModelId] = useState(null)
  const [editingModelId, setEditingModelId] = useState(null)
  const fileInputRef = useRef(null)

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const model = await addModelToProject(file)
    if (model) setExpandedModelId(model.id)
    e.target.value = ''
  }, [addModelToProject])

  const handleRename = useCallback(async (model, {name}) => {
    const updated = {...model, name}
    await repo.saveModel(updated)
    // Refresh model list by re-selecting the active project
    await setActiveProject(activeProjectId)
    setEditingModelId(null)
  }, [repo, setActiveProject, activeProjectId])

  const toggleExpand = useCallback((modelId) => {
    setExpandedModelId((prev) => prev === modelId ? null : modelId)
  }, [])

  const activeCompany = companies.find((c) => c.id === activeCompanyId)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  if (!activeProjectId) {
    return (
      <Stack spacing={1} sx={{py: 3, textAlign: 'center'}}>
        <Typography variant='body2' sx={{opacity: 0.5, fontSize: '13px'}}>
          Select a company and project first
        </Typography>
        <Typography variant='caption' sx={{opacity: 0.3, fontSize: '11px'}}>
          Use the Companies and Projects tabs to create one
        </Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={0.5}>
      <Typography variant='caption' sx={{opacity: 0.4, fontSize: '10px', textTransform: 'uppercase', px: '10px', pb: 0.5}}>
        {activeCompany?.name} / {activeProject?.name}
      </Typography>
      {modelRefs.map((model) => (
        <Box key={model.id}>
          {editingModelId === model.id ? (
            <ModelNameForm
              model={model}
              onSave={(data) => handleRename(model, data)}
              onCancel={() => setEditingModelId(null)}
            />
          ) : (
            <ButtonBase
              onClick={() => toggleExpand(model.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '6px 10px',
                borderRadius: '4px',
                textAlign: 'left',
                '&:hover': {background: theme.palette.action.hover},
              }}
            >
              <FileText size={14} strokeWidth={1.5} style={{opacity: 0.5, flexShrink: 0}}/>
              <Typography variant='body2' sx={{fontSize: '13px', flexGrow: 1}}>{model.name}</Typography>
              {model.currentVersionId && (
                <Chip label={`v${modelRefs.length > 0 ? '' : '1'}`} size='small' sx={{height: 18, fontSize: '10px'}}/>
              )}
              <IconButton size='small' sx={{opacity: 0.4}}>
                {expandedModelId === model.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </IconButton>
              <Tooltip title='Rename'>
                <IconButton
                  size='small'
                  onClick={(e) => { e.stopPropagation(); setEditingModelId(model.id) }}
                  sx={{opacity: 0.3, '&:hover': {opacity: 1}}}
                >
                  <Pencil size={12}/>
                </IconButton>
              </Tooltip>
              <Tooltip title='Delete model'>
                <IconButton
                  size='small'
                  onClick={(e) => { e.stopPropagation(); deleteModelFromProject(model.id) }}
                  sx={{opacity: 0.3, '&:hover': {opacity: 1, color: '#f44336'}}}
                >
                  <Trash2 size={12}/>
                </IconButton>
              </Tooltip>
            </ButtonBase>
          )}

          {expandedModelId === model.id && (
            <ModelVersionList modelId={model.id} currentVersionId={model.currentVersionId}/>
          )}
        </Box>
      ))}

      <input
        ref={fileInputRef}
        type='file'
        accept='.ifc,.step,.stp,.glb,.gltf,.obj,.stl'
        style={{display: 'none'}}
        onChange={handleFileSelected}
      />
      <ButtonBase
        onClick={handleAddClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '6px 10px',
          borderRadius: '4px',
          opacity: 0.6,
          '&:hover': {opacity: 1, background: theme.palette.action.hover},
        }}
      >
        <Plus size={14} strokeWidth={1.5}/>
        <Typography variant='body2' sx={{fontSize: '13px'}}>Add Model</Typography>
      </ButtonBase>
    </Stack>
  )
}

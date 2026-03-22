import React, {useState, useCallback} from 'react'
import {Box, ButtonBase, Chip, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {FolderOpen, Pencil, Trash2, Plus} from 'lucide-react'
import useStore from '../../store/useStore'
import ProjectForm from './ProjectForm'


/**
 * List of projects for the active company, with add/edit/delete.
 */
export default function ProjectList() {
  const theme = useTheme()
  const projects = useStore((state) => state.projects)
  const activeCompanyId = useStore((state) => state.activeCompanyId)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const setActiveProject = useStore((state) => state.setActiveProject)
  const setActiveCompany = useStore((state) => state.setActiveCompany)
  const repo = useStore((state) => state.projectRepository)

  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

  const handleCreate = useCallback(async ({name, description}) => {
    if (!activeCompanyId) return
    const project = {
      id: crypto.randomUUID(),
      companyId: activeCompanyId,
      name,
      description,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await repo.saveProject(project)
    // Refresh project list
    await setActiveCompany(activeCompanyId)
    setShowForm(false)
    setActiveProject(project.id)
  }, [activeCompanyId, repo, setActiveCompany, setActiveProject])

  const handleEdit = useCallback(async ({name, description, status}) => {
    if (!editingProject) return
    const updated = {
      ...editingProject,
      name,
      description,
      status,
      updatedAt: new Date().toISOString(),
    }
    await repo.saveProject(updated)
    await setActiveCompany(activeCompanyId)
    setEditingProject(null)
  }, [editingProject, repo, activeCompanyId, setActiveCompany])

  const handleDelete = useCallback(async (project) => {
    await repo.deleteProject(project.id)
    if (activeProjectId === project.id) {
      setActiveProject(null)
    }
    await setActiveCompany(activeCompanyId)
  }, [repo, activeProjectId, activeCompanyId, setActiveProject, setActiveCompany])

  if (!activeCompanyId) {
    return (
      <Typography variant='body2' sx={{opacity: 0.5, textAlign: 'center', py: 3, fontSize: '13px'}}>
        Select a company first
      </Typography>
    )
  }

  return (
    <Stack spacing={0.5}>
      {projects.map((project) => (
        editingProject?.id === project.id ? (
          <ProjectForm
            key={project.id}
            project={project}
            onSave={handleEdit}
            onCancel={() => setEditingProject(null)}
          />
        ) : (
          <ButtonBase
            key={project.id}
            onClick={() => setActiveProject(project.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '4px',
              textAlign: 'left',
              backgroundColor: activeProjectId === project.id
                ? theme.palette.action.selected
                : 'transparent',
              '&:hover': {background: theme.palette.action.hover},
            }}
          >
            <FolderOpen size={14} strokeWidth={1.5} style={{opacity: 0.5, flexShrink: 0}}/>
            <Box sx={{flexGrow: 1, minWidth: 0}}>
              <Typography variant='body2' sx={{fontSize: '13px'}}>{project.name}</Typography>
              {project.description && (
                <Typography variant='caption' sx={{fontSize: '11px', opacity: 0.5, display: 'block'}}>
                  {project.description}
                </Typography>
              )}
            </Box>
            {project.status === 'archived' && (
              <Chip label='archived' size='small' sx={{height: 16, fontSize: '11px'}}/>
            )}
            <Tooltip title='Edit'>
              <IconButton
                size='small'
                onClick={(e) => { e.stopPropagation(); setEditingProject(project) }}
                sx={{opacity: 0.4, '&:hover': {opacity: 1}}}
              >
                <Pencil size={12}/>
              </IconButton>
            </Tooltip>
            <Tooltip title='Delete'>
              <IconButton
                size='small'
                onClick={(e) => { e.stopPropagation(); handleDelete(project) }}
                sx={{opacity: 0.4, '&:hover': {opacity: 1, color: '#f44336'}}}
              >
                <Trash2 size={12}/>
              </IconButton>
            </Tooltip>
          </ButtonBase>
        )
      ))}

      {showForm ? (
        <ProjectForm project={null} onSave={handleCreate} onCancel={() => setShowForm(false)}/>
      ) : (
        <ButtonBase
          onClick={() => setShowForm(true)}
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
          <Typography variant='body2' sx={{fontSize: '13px'}}>Add Project</Typography>
        </ButtonBase>
      )}
    </Stack>
  )
}

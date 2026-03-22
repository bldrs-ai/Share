import React, {useState, useCallback} from 'react'
import {Box, ButtonBase, Divider, IconButton, Menu, MenuItem, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useNavigate} from 'react-router-dom'
import {ChevronDown, Building2, FolderOpen, RefreshCw, Save} from 'lucide-react'
import {readProjectFile} from '../../Infrastructure/ProjectData/ProjectFileStore'
import {saveDnDFileToOpfs} from '../../OPFS/utils'
import {navigateToModel} from '../../utils/navigate'
import useStore from '../../store/useStore'


/**
 * Compact company > project > model selector for the TopBar with reload button.
 */
export default function ProjectSelector() {
  const theme = useTheme()
  const navigate = useNavigate()
  const companies = useStore((state) => state.companies)
  const projects = useStore((state) => state.projects)
  const modelRefs = useStore((state) => state.modelRefs)
  const activeCompanyId = useStore((state) => state.activeCompanyId)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const setActiveCompany = useStore((state) => state.setActiveCompany)
  const setActiveProject = useStore((state) => state.setActiveProject)
  const appPrefix = useStore((state) => state.appPrefix)
  const repo = useStore((state) => state.projectRepository)
  const [anchorEl, setAnchorEl] = useState(null)

  const activeCompany = companies.find((c) => c.id === activeCompanyId)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Find the most recently opened model
  const currentModel = modelRefs.length > 0
    ? [...modelRefs].sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())[0]
    : null

  // Build breadcrumb label
  const parts = []
  if (activeCompany) parts.push(activeCompany.name)
  if (activeProject) parts.push(activeProject.name)
  if (currentModel) parts.push(currentModel.name)
  const label = parts.length > 0 ? parts.join(' / ') : 'No project'

  const handleCompanySelect = async (companyId) => {
    await setActiveCompany(companyId)
  }

  const handleProjectSelect = (projectId) => {
    setActiveProject(projectId)
    setAnchorEl(null)
  }

  const viewer = useStore((state) => state.viewer)
  const saveModelViewState = useStore((state) => state.saveModelViewState)
  const [saved, setSaved] = useState(false)

  const handleLoadModel = useCallback(async () => {
    if (!currentModel?.currentVersionId) return
    console.log('[ProjectSelector] Loading model:', currentModel.name, 'viewState:', currentModel.viewState)
    try {
      const version = await repo.getVersion(currentModel.currentVersionId)
      if (!version) return
      const file = await readProjectFile(version.opfsPath)
      const ext = version.originalFileName.split('.').pop() || 'ifc'
      // Store pending view state before navigating — CadView will restore it
      if (currentModel.viewState) {
        console.log('[ProjectSelector] Setting pendingViewState:', currentModel.viewState)
        useStore.setState({pendingViewState: currentModel.viewState})
      } else {
        console.log('[ProjectSelector] No viewState on model')
      }
      saveDnDFileToOpfs(file, ext, (fileName) => {
        console.log('[ProjectSelector] Navigating, pendingViewState in store:', useStore.getState().pendingViewState)
        navigateToModel(`${appPrefix}/v/new/${fileName}`, navigate)
      })
    } catch (err) {
      console.warn('[ProjectSelector] Failed to load model:', err)
    }
  }, [currentModel, repo, appPrefix, navigate])

  const handleSaveView = useCallback(() => {
    if (!viewer?.context) return
    try {
      const cc = viewer.IFC.context.ifcCamera.cameraControls
      const pos = cc.getPosition()
      const tgt = cc.getTarget()
      const viewState = {
        camera: {
          position: [pos.x, pos.y, pos.z],
          target: [tgt.x, tgt.y, tgt.z],
        },
      }
      saveModelViewState(viewState)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.warn('[ProjectSelector] Failed to save view:', err)
    }
  }, [viewer, saveModelViewState])

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          opacity: 0.6,
          '&:hover': {opacity: 1, background: theme.palette.action.hover},
        }}
      >
        <FolderOpen size={12} strokeWidth={1.5}/>
        <Typography sx={{fontSize: '11px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
          {label}
        </Typography>
        <ChevronDown size={10}/>
      </ButtonBase>

      {currentModel?.currentVersionId && (
        <>
          <Tooltip title='Load project model' placement='bottom'>
            <IconButton
              size='small'
              onClick={handleLoadModel}
              sx={{
                width: 24,
                height: 24,
                opacity: 0.5,
                '&:hover': {opacity: 1, color: '#00ff00'},
              }}
            >
              <RefreshCw size={13} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
          <Tooltip title={saved ? 'View saved' : 'Save current view'} placement='bottom'>
            <IconButton
              size='small'
              onClick={handleSaveView}
              sx={{
                width: 24,
                height: 24,
                opacity: saved ? 1 : 0.5,
                color: saved ? '#4caf50' : undefined,
                '&:hover': {opacity: 1},
              }}
            >
              <Save size={13} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
        </>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{paper: {sx: {minWidth: 220, maxHeight: 400}}}}
      >
        {/* Companies */}
        <Box sx={{px: 2, py: 0.5}}>
          <Typography variant='caption' sx={{opacity: 0.5, textTransform: 'uppercase', fontSize: '10px'}}>
            Companies
          </Typography>
        </Box>
        {companies.map((company) => (
          <MenuItem
            key={company.id}
            onClick={() => handleCompanySelect(company.id)}
            selected={company.id === activeCompanyId}
            sx={{fontSize: '13px', gap: '8px'}}
          >
            <Building2 size={13} strokeWidth={1.5} style={{opacity: 0.5}}/>
            {company.name}
          </MenuItem>
        ))}
        {companies.length === 0 && (
          <MenuItem disabled sx={{fontSize: '12px', opacity: 0.4}}>No companies yet</MenuItem>
        )}

        {/* Projects for active company */}
        {activeCompanyId && projects.length > 0 && [
          <Divider key='projects-divider' sx={{my: 0.5}}/>,
          <Box key='projects-header' sx={{px: 2, py: 0.5}}>
            <Typography variant='caption' sx={{opacity: 0.5, textTransform: 'uppercase', fontSize: '10px'}}>
              Projects
            </Typography>
          </Box>,
          ...projects.map((project) => (
            <MenuItem
              key={project.id}
              onClick={() => handleProjectSelect(project.id)}
              selected={project.id === activeProjectId}
              sx={{fontSize: '13px', gap: '8px'}}
            >
              <FolderOpen size={13} strokeWidth={1.5} style={{opacity: 0.5}}/>
              {project.name}
            </MenuItem>
          )),
        ]}
      </Menu>
    </>
  )
}

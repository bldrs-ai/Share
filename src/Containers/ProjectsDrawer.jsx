import React, {ReactElement, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {loadAllRecentFiles} from '../connections/persistence'
import useStore from '../store/useStore'
import LogoMenu from '../Components/Workspace/LogoMenu'
import {
  Add as AddIcon,
  Apartment as ApartmentIcon,
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  InsertDriveFileOutlined as InsertDriveFileOutlinedIcon,
} from '@mui/icons-material'


// Model routes all live under the viewer path segment, e.g.
// /share/v/new/file.ifc, /share/v/gh/org/repo/branch/file.ifc.
const MODEL_ROUTE_RE = /\/v\//


/**
 * Display label for a model route. A local upload routes by its OPFS
 * storage id (`/v/new/<blob-uuid>.ifc`) rather than the name the user
 * picked, so the raw path segment would list as a UUID. Recents already
 * carry that split — `id` is the storage id, `name` the original
 * filename (see the #1682 fix) — so prefer the recorded display name and
 * fall back to the path segment for anything not in recents.
 *
 * @param {string} pathname
 * @return {string}
 */
function labelForModelPath(pathname) {
  const segment = decodeURIComponent(pathname.split('/').filter(Boolean).pop())
  try {
    const entry = loadAllRecentFiles().find(
      (f) => f.sharePath === pathname || f.id === segment)
    return entry?.modelTitle || entry?.name || segment
  } catch {
    return segment
  }
}

const DRAWER_WIDTH = '240px'


/**
 * Workspace-shell projects drawer (`?feature=workspace` — epic assist-300,
 * #1657; design/new/conversational-cad.md §2.1): leftmost container in
 * RootLandscape, "further left" than NavTreeAndVersionsDrawer. Projects
 * expand to their model list; "Add model" routes through the existing
 * tabbed Open dialog and records the resulting navigation into the
 * project (the capture effects below). Footer carries the LogoMenu
 * marketing popup.
 *
 * @return {ReactElement}
 */
export default function ProjectsDrawer() {
  const workspaceProjects = useStore((state) => state.workspaceProjects)
  const createWorkspaceProject = useStore((state) => state.createWorkspaceProject)
  const removeWorkspaceProject = useStore((state) => state.removeWorkspaceProject)
  const addWorkspaceModel = useStore((state) => state.addWorkspaceModel)
  const removeWorkspaceModel = useStore((state) => state.removeWorkspaceModel)
  const workspaceCapture = useStore((state) => state.workspaceCapture)
  const armWorkspaceCapture = useStore((state) => state.armWorkspaceCapture)
  const disarmWorkspaceCapture = useStore((state) => state.disarmWorkspaceCapture)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)

  const [expandedProjectIds, setExpandedProjectIds] = useState([])
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()

  // Capture effect 1: an armed capture + a navigation onto a model route
  // records the opened model into the arming project. Runs only on real
  // navigation — the arm-time pathname is excluded.
  useEffect(() => {
    if (workspaceCapture === null) {
      return
    }
    const {projectId, armedPathname} = workspaceCapture
    if (location.pathname !== armedPathname && MODEL_ROUTE_RE.test(location.pathname)) {
      addWorkspaceModel(projectId, {
        label: labelForModelPath(location.pathname),
        path: location.pathname,
      })
      disarmWorkspaceCapture()
    }
  }, [location.pathname, workspaceCapture, addWorkspaceModel, disarmWorkspaceCapture])

  // NB: there is deliberately no "dialog closed => disarm" effect. The
  // Open dialog closes *before* the model is chosen — `openFile` calls
  // setIsDialogDisplayed(false) synchronously while the file picker is
  // still open, and `navigateToModel` reloads the document rather than
  // returning — so treating close as abandonment disarmed every capture
  // before it could fire. Abandoned arms are cleaned up by the capture
  // TTL (workspace/persistence.ts) and by re-arming instead.

  const toggleExpanded = (projectId) => {
    setExpandedProjectIds((ids) =>
      ids.includes(projectId) ? ids.filter((id) => id !== projectId) : [...ids, projectId])
  }

  const onAddModel = (projectId) => {
    armWorkspaceCapture(projectId, location.pathname)
    setIsOpenModelVisible(true)
  }

  const onCreateProject = () => {
    const name = newProjectName.trim()
    if (name !== '') {
      createWorkspaceProject(name)
    }
    setNewProjectName('')
    setIsNewProjectOpen(false)
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: DRAWER_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        backgroundColor: theme.palette.secondary.workspaceBackground,
        borderRight: `1px solid ${theme.palette.primary.sceneHighlight}20`,
      }}
      data-testid='ProjectsDrawer'
    >
      <Box sx={{padding: '1em'}}>
        <Button
          variant='contained'
          fullWidth
          onClick={() => setIsNewProjectOpen(true)}
          data-testid='projects-new-button'
        >
          New project
        </Button>
      </Box>
      <Typography variant='overline' color='text.secondary' sx={{px: 2}}>
        Projects
      </Typography>
      <List dense sx={{flexGrow: 1, overflowY: 'auto'}} data-testid='projects-list'>
        {workspaceProjects.map((project) => {
          const isExpanded = expandedProjectIds.includes(project.id)
          return (
            <React.Fragment key={project.id}>
              <ListItemButton
                onClick={() => toggleExpanded(project.id)}
                data-testid={`project-${project.id}`}
              >
                <ListItemIcon sx={{minWidth: '2em'}}><ApartmentIcon fontSize='small'/></ListItemIcon>
                <ListItemText primary={project.name} primaryTypographyProps={{noWrap: true}}/>
                <IconButton
                  size='small'
                  aria-label={`Delete project ${project.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeWorkspaceProject(project.id)
                  }}
                >
                  <CloseIcon fontSize='inherit'/>
                </IconButton>
                {isExpanded ? <ExpandLessIcon fontSize='small'/> : <ExpandMoreIcon fontSize='small'/>}
              </ListItemButton>
              {isExpanded && (
                <>
                  {project.models.map((model) => (
                    <ListItemButton
                      key={model.id}
                      sx={{pl: 4}}
                      selected={location.pathname === model.path}
                      // Disarm first: opening a model that is already
                      // listed must not be adopted by a still-armed
                      // capture from some other project.
                      onClick={() => {
                        disarmWorkspaceCapture()
                        navigate(model.path)
                      }}
                      data-testid={`project-model-${model.id}`}
                    >
                      <ListItemIcon sx={{minWidth: '2em'}}>
                        <InsertDriveFileOutlinedIcon fontSize='small'/>
                      </ListItemIcon>
                      <ListItemText
                        primary={model.label}
                        primaryTypographyProps={{noWrap: true, fontFamily: 'monospace', fontSize: '.9em'}}
                      />
                      <IconButton
                        size='small'
                        aria-label={`Remove model ${model.label}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeWorkspaceModel(project.id, model.id)
                        }}
                      >
                        <CloseIcon fontSize='inherit'/>
                      </IconButton>
                    </ListItemButton>
                  ))}
                  <ListItemButton
                    sx={{pl: 4}}
                    onClick={() => onAddModel(project.id)}
                    data-testid={`project-add-model-${project.id}`}
                  >
                    <ListItemIcon sx={{minWidth: '2em'}}><AddIcon fontSize='small'/></ListItemIcon>
                    <ListItemText primary='Add model' primaryTypographyProps={{color: 'text.secondary'}}/>
                  </ListItemButton>
                </>
              )}
            </React.Fragment>
          )
        })}
      </List>
      <Divider/>
      <Stack direction='row' sx={{padding: '.5em'}}>
        <LogoMenu/>
      </Stack>
      <Dialog open={isNewProjectOpen} onClose={() => setIsNewProjectOpen(false)}>
        <DialogTitle>New project</DialogTitle>
        <DialogContent>
          <TextField
            label='Project name'
            variant='outlined'
            margin='dense'
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onCreateProject()
              }
            }}
            inputProps={{'data-testid': 'projects-new-name'}}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsNewProjectOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={onCreateProject} data-testid='projects-new-create'>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

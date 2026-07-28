import React, {ReactElement, useCallback, useEffect, useRef, useState} from 'react'
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
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {loadAllRecentFiles} from '../connections/persistence'
import useStore from '../store/useStore'
import {WORKSPACE_DRAWER_WIDTH_INITIAL} from '../store/WorkspaceSlice'
import {CONTROL_MARGIN, CONTROL_SIZE, ROW_PITCH, TOP_BAR_HEIGHT} from './layoutConstants'
import {recentDisplayName} from '../utils/modelDisplayName'
import {navigateToModel} from '../utils/navigate'
import {TooltipIconButton} from '../Components/Buttons'
import HorizonResizerButton from '../Components/SideDrawer/HorizonResizerButton'
import LogoMenu from '../Components/Workspace/LogoMenu'
import {
  Add as AddIcon,
  Apartment as ApartmentIcon,
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  InsertDriveFileOutlined as InsertDriveFileOutlinedIcon,
  MoreVert as MoreVertIcon,
  VerticalSplit as VerticalSplitIcon,
  VerticalSplitOutlined as VerticalSplitOutlinedIcon,
} from '@mui/icons-material'


// Model routes all live under the viewer path segment, e.g.
// /share/v/new/file.ifc, /share/v/gh/org/repo/branch/file.ifc.
const MODEL_ROUTE_RE = /\/v\//

// Narrower than this on drag-release and the drawer collapses to its rail
// instead of becoming an unusable sliver.
const COLLAPSE_AT_WIDTH = 120
const RESIZER_THICKNESS = 10
// One control cell wide, so the rail's icons sit on the same grid as the
// control groups across the canvas.
const COLLAPSED_RAIL_WIDTH = `${ROW_PITCH}px`

// Every row in the drawer is one control row: same square as the icons
// in the adjacent NavTree/Versions group, same margins, same corner.
const rowSx = {
  height: `${CONTROL_SIZE}px`,
  margin: `${CONTROL_MARGIN}px`,
  borderRadius: '10px',
}


/**
 * The recents entry for a model route, if we have one. A local upload
 * routes by its OPFS storage id (`/v/new/<blob-uuid>.ifc`), so the path
 * segment alone would display as a UUID; recents holds the id -> name
 * mapping (see #1682).
 *
 * @param {string} pathname
 * @return {object|undefined} RecentFileEntry
 */
function recentEntryForPath(pathname) {
  const segment = decodeURIComponent(pathname.split('/').filter(Boolean).pop())
  try {
    return loadAllRecentFiles().find((f) => f.sharePath === pathname || f.id === segment)
  } catch {
    return undefined
  }
}


/**
 * Label for a model route: the model's own name where known, else the
 * path segment.
 *
 * @param {string} pathname
 * @return {string}
 */
function labelForModelPath(pathname) {
  return recentDisplayName(recentEntryForPath(pathname)) ||
    decodeURIComponent(pathname.split('/').filter(Boolean).pop())
}


/**
 * Two-letter abbreviation for a project name: initials of the first two
 * words, or the first two characters of a single word. Undefined when
 * the name has no letters or digits to work with (emoji-only, say), in
 * which case the caller falls back to the generic project icon.
 *
 * @param {string} name
 * @return {string|undefined}
 */
function projectInitials(name) {
  const words = (name || '').trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length === 0) {
    return undefined
  }
  const twoLetters = 2
  const initials = words.length >= twoLetters ?
    `${words[0][0]}${words[1][0]}` :
    words[0].slice(0, twoLetters)
  return initials.length === twoLetters ? initials.toUpperCase() : undefined
}


/**
 * Workspace-shell projects drawer (`?feature=workspace` — epic assist-300,
 * #1657; design/new/conversational-cad.md §2.1): leftmost container in
 * RootLandscape, "further left" than NavTreeAndVersionsDrawer. Projects
 * expand to their model list; "Add model" routes through the existing
 * tabbed Open dialog and records the resulting navigation into the
 * project (the capture effect below). Collapses to an icon rail, and
 * resizes with the same grip the other drawers use. Footer carries the
 * LogoMenu.
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
  const expandedProjectIds = useStore((state) => state.expandedProjectIds)
  const toggleWorkspaceProjectExpanded = useStore((state) => state.toggleWorkspaceProjectExpanded)
  const isCollapsed = useStore((state) => state.isWorkspaceDrawerCollapsed)
  const setIsCollapsed = useStore((state) => state.setIsWorkspaceDrawerCollapsed)
  const ungroupedModels = useStore((state) => state.ungroupedModels)
  const addUngroupedModel = useStore((state) => state.addUngroupedModel)
  const removeUngroupedModel = useStore((state) => state.removeUngroupedModel)
  const moveUngroupedModelToProject = useStore((state) => state.moveUngroupedModelToProject)
  const drawerWidth = useStore((state) => state.workspaceDrawerWidth)
  const setDrawerWidth = useStore((state) => state.setWorkspaceDrawerWidth)

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  // Row menu for an ungrouped model: anchor plus which row opened it.
  const [rowMenu, setRowMenu] = useState(null)
  const [isAddToProjectOpen, setIsAddToProjectOpen] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const drawerRef = useRef(null)
  const nameFieldRef = useRef(null)

  // An armed capture + a navigation onto a model route records the opened
  // model into the arming project. Opening a model is a full page load,
  // so this usually fires on mount of the *next* page — the capture is
  // persisted for exactly that reason.
  useEffect(() => {
    if (!MODEL_ROUTE_RE.test(location.pathname)) {
      return
    }
    const model = {
      label: labelForModelPath(location.pathname),
      path: location.pathname,
    }
    if (workspaceCapture === null) {
      // No pending "Add model": the user got here some other way — a
      // shared permalink, a recent, the home model — so the model is
      // listed under Ungrouped rather than dropped, and can be filed
      // into a project from there.
      addUngroupedModel(model)
      return
    }
    if (location.pathname !== workspaceCapture.armedPathname) {
      addWorkspaceModel(workspaceCapture.projectId, model)
      disarmWorkspaceCapture()
    }
  }, [
    location.pathname,
    workspaceCapture,
    addWorkspaceModel,
    addUngroupedModel,
    disarmWorkspaceCapture,
  ])

  // NB: there is deliberately no "dialog closed => disarm" effect. The
  // Open dialog closes *before* the model is chosen — `openFile` calls
  // setIsDialogDisplayed(false) synchronously while the file picker is
  // still open, and `navigateToModel` reloads the document rather than
  // returning — so treating close as abandonment disarmed every capture
  // before it could fire. Abandoned arms are cleaned up by the capture
  // TTL (workspace/persistence.ts) and by re-arming instead.

  const onCollapse = useCallback(() => setIsCollapsed(true), [setIsCollapsed])

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

  // Header row: same height as the top bar over the canvas, so the two
  // align across the drawer edge. Wordmark on the left (drawer-open
  // only), collapse toggle on the right — the toggle is always present
  // so a collapsed drawer can be brought back. The logo *mark* and its
  // menu stay in the footer, bottom-left, in both states.
  const header = (
    <Stack
      direction='row'
      alignItems='center'
      justifyContent={isCollapsed ? 'center' : 'space-between'}
      sx={{height: TOP_BAR_HEIGHT, flexShrink: 0, px: isCollapsed ? 0 : 1, minWidth: 0}}
      data-testid='projects-header'
    >
      {!isCollapsed &&
       <Typography variant='body1' sx={{fontWeight: 'bold', pl: 1}} noWrap>
         bldrs.ai
       </Typography>}
      <TooltipIconButton
        title={isCollapsed ? 'Show projects' : 'Hide projects'}
        placement='right'
        icon={isCollapsed ?
          <VerticalSplitOutlinedIcon className='icon-share'/> :
          <VerticalSplitIcon className='icon-share'/>}
        onClick={() => setIsCollapsed(!isCollapsed)}
        dataTestId='projects-collapse-toggle'
      />
    </Stack>
  )

  // Section headings occupy one control row, like every other row here.
  const sectionLabel = (text, testId) => (
    <Stack
      justifyContent='center'
      sx={{height: ROW_PITCH, flexShrink: 0, px: 2}}
      data-testid={testId}
    >
      <Typography variant='overline' color='text.secondary'>
        {text}
      </Typography>
    </Stack>
  )

  const footer = (
    <Stack
      direction='row'
      justifyContent={isCollapsed ? 'center' : 'flex-start'}
      sx={{padding: '.5em', flexShrink: 0}}
    >
      <LogoMenu/>
    </Stack>
  )

  if (isCollapsed) {
    return (
      <Paper
        elevation={0}
        sx={{
          width: COLLAPSED_RAIL_WIDTH,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          // Same tint as the expanded drawer at half opacity: the rail
          // still reads as one column from the toggle down to the logo,
          // without competing with the canvas for attention.
          backgroundColor: `${theme.palette.secondary.workspaceBackground}80`,
          borderRight: `1px solid ${theme.palette.primary.sceneHighlight}20`,
        }}
        data-testid='ProjectsDrawer'
      >
        {header}
        {/* One cell per project, on the control grid. Clicking reopens
            the drawer with that project expanded; the per-project quick
            access menu that will live here is the follow-up (wireframe
            screen 2). */}
        <Stack alignItems='center' sx={{overflowY: 'auto'}}>
          {workspaceProjects.map((project) => (
            <TooltipIconButton
              key={project.id}
              title={project.name}
              placement='right'
              icon={projectInitials(project.name) ?
                <Typography variant='body2' sx={{fontWeight: 'bold'}}>
                  {projectInitials(project.name)}
                </Typography> :
                <ApartmentIcon className='icon-share'/>}
              onClick={() => {
                if (!expandedProjectIds.includes(project.id)) {
                  toggleWorkspaceProjectExpanded(project.id)
                }
                setIsCollapsed(false)
              }}
              dataTestId={`project-rail-${project.id}`}
            />
          ))}
        </Stack>
        <Box sx={{flexGrow: 1}}/>
        {footer}
      </Paper>
    )
  }

  return (
    <Paper
      elevation={0}
      ref={drawerRef}
      sx={{
        position: 'relative',
        width: drawerWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        backgroundColor: theme.palette.secondary.workspaceBackground,
        borderRight: `1px solid ${theme.palette.primary.sceneHighlight}20`,
      }}
      data-testid='ProjectsDrawer'
    >
      {/* Same grip the NavTree/Notes drawers use; dragging past
          COLLAPSE_AT_WIDTH collapses instead of bottoming out, and
          double-tapping it toggles full-window width. */}
      <HorizonResizerButton
        drawerRef={drawerRef}
        thickness={RESIZER_THICKNESS}
        isOnLeft={false}
        drawerWidth={drawerWidth}
        drawerWidthInitial={WORKSPACE_DRAWER_WIDTH_INITIAL}
        setDrawerWidth={setDrawerWidth}
        minWidth={COLLAPSE_AT_WIDTH}
        onCollapse={onCollapse}
      />
      {header}
      {/* Every row below the header is one control row tall, so this
          column stays in step with the control groups across the canvas:
          New project lands on the NavTree row and PROJECTS on the
          Versions row. */}
      <Box sx={{height: ROW_PITCH, flexShrink: 0, px: `${CONTROL_MARGIN}px`, minWidth: 0}}>
        <Button
          variant='contained'
          fullWidth
          onClick={() => setIsNewProjectOpen(true)}
          sx={{...rowSx, marginLeft: 0, marginRight: 0, minWidth: 0}}
          data-testid='projects-new-button'
        >
          New project
        </Button>
      </Box>
      {sectionLabel('Projects', 'projects-section-label')}
      <List dense sx={{flexGrow: 1, overflowY: 'auto', paddingTop: 0}} data-testid='projects-list'>
        {workspaceProjects.map((project) => {
          const isExpanded = expandedProjectIds.includes(project.id)
          return (
            <React.Fragment key={project.id}>
              <ListItemButton
                sx={rowSx}
                onClick={() => toggleWorkspaceProjectExpanded(project.id)}
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
                  {project.models.map((model) => {
                    // Resolved at render, not read from the stored label:
                    // a model's name can arrive after it was recorded
                    // (the loader back-fills modelTitle into recents), and
                    // entries captured before that resolution existed
                    // would otherwise stay stuck showing a storage id.
                    const label = labelForModelPath(model.path) || model.label
                    return (
                      <ListItemButton
                        key={model.id}
                        sx={{...rowSx, pl: 3, marginLeft: `${CONTROL_SIZE / 2}px`}}
                        selected={location.pathname === model.path}
                        // Disarm first: opening a model that is already
                        // listed must not be adopted by a still-armed
                        // capture from some other project.
                        onClick={() => {
                          disarmWorkspaceCapture()
                          navigateToModel(model.path, navigate)
                        }}
                        data-testid={`project-model-${model.id}`}
                      >
                        <ListItemIcon sx={{minWidth: '2em'}}>
                          <InsertDriveFileOutlinedIcon fontSize='small'/>
                        </ListItemIcon>
                        <ListItemText
                          primary={label}
                          primaryTypographyProps={{noWrap: true, fontSize: '.9em'}}
                        />
                        <IconButton
                          size='small'
                          aria-label={`Remove model ${label}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            removeWorkspaceModel(project.id, model.id)
                          }}
                        >
                          <CloseIcon fontSize='inherit'/>
                        </IconButton>
                      </ListItemButton>
                    )
                  })}
                  <ListItemButton
                    sx={{...rowSx, pl: 3, marginLeft: `${CONTROL_SIZE / 2}px`}}
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
      {ungroupedModels.length > 0 &&
       <Box sx={{flexShrink: 0}} data-testid='ungrouped-section'>
         <Divider/>
         {sectionLabel('Ungrouped', 'ungrouped-section-label')}
         <List dense sx={{paddingTop: 0}}>
           {ungroupedModels.map((model) => {
             const label = labelForModelPath(model.path) || model.label
             return (
               <ListItemButton
                 key={model.id}
                 sx={rowSx}
                 selected={location.pathname === model.path}
                 onClick={() => navigateToModel(model.path, navigate)}
                 data-testid={`ungrouped-model-${model.id}`}
               >
                 <ListItemIcon sx={{minWidth: '2em'}}>
                   <InsertDriveFileOutlinedIcon fontSize='small'/>
                 </ListItemIcon>
                 <ListItemText
                   primary={label}
                   primaryTypographyProps={{noWrap: true, fontSize: '.9em'}}
                 />
                 <IconButton
                   size='small'
                   aria-label={`Actions for ${label}`}
                   onClick={(event) => {
                     event.stopPropagation()
                     setIsAddToProjectOpen(false)
                     setRowMenu({anchorEl: event.currentTarget, modelId: model.id})
                   }}
                   data-testid={`ungrouped-menu-${model.id}`}
                 >
                   <MoreVertIcon fontSize='inherit'/>
                 </IconButton>
               </ListItemButton>
             )
           })}
         </List>
       </Box>}
      {footer}
      <Menu
        anchorEl={rowMenu?.anchorEl ?? null}
        open={rowMenu !== null}
        onClose={() => setRowMenu(null)}
        data-testid='ungrouped-row-menu'
      >
        <MenuItem
          onClick={() => setIsAddToProjectOpen(!isAddToProjectOpen)}
          data-testid='ungrouped-add-to-project'
        >
          <ListItemText primary='Add to project'/>
          {isAddToProjectOpen ? <ExpandLessIcon fontSize='small'/> : <ExpandMoreIcon fontSize='small'/>}
        </MenuItem>
        {isAddToProjectOpen && workspaceProjects.length === 0 &&
         <MenuItem disabled sx={{pl: 4}}>No projects yet</MenuItem>}
        {isAddToProjectOpen && workspaceProjects.map((project) => (
          <MenuItem
            key={project.id}
            sx={{pl: 4}}
            onClick={() => {
              moveUngroupedModelToProject(rowMenu.modelId, project.id)
              setRowMenu(null)
              setIsAddToProjectOpen(false)
            }}
            data-testid={`ungrouped-add-to-${project.id}`}
          >
            {project.name}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            removeUngroupedModel(rowMenu.modelId)
            setRowMenu(null)
          }}
          data-testid='ungrouped-remove'
        >
          Remove
        </MenuItem>
      </Menu>
      {/* Focus on entry rather than autoFocus, which jsx-a11y rejects. */}
      <Dialog
        open={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        TransitionProps={{onEntered: () => nameFieldRef.current?.focus()}}
      >
        <DialogTitle>New project</DialogTitle>
        <DialogContent>
          <TextField
            inputRef={nameFieldRef}
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

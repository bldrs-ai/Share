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
import {useIsMobile} from '../Components/Hooks'
import useStore from '../store/useStore'
import {WORKSPACE_DRAWER_WIDTH_INITIAL} from '../store/WorkspaceSlice'
import {CONTROL_MARGIN, CONTROL_SIZE, ROW_PITCH, TOP_BAR_HEIGHT} from './layoutConstants'
import {hasStoredWorkspaceUiState} from '../workspace/persistence'
import {modelPathFromPathname} from '../workspace/modelPath'
import {labelForModelPath} from '../utils/modelDisplayName'
import {navigateToModel} from '../utils/navigate'
import {TooltipIconButton} from '../Components/Buttons'
import HorizonResizerButton from '../Components/SideDrawer/HorizonResizerButton'
import LogoMenu from '../Components/Workspace/LogoMenu'
import {LogoB} from '../Components/Logo/Logo'
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

  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const drawerRef = useRef(null)
  const nameFieldRef = useRef(null)

  // The model's own route — element selections append numeric segments
  // to the pathname, and treating those as identity minted a phantom
  // "model" per selected element (named by its expressID) in Ungrouped.
  const currentModelPath = MODEL_ROUTE_RE.test(location.pathname) ?
    modelPathFromPathname(location.pathname) :
    null

  // An armed capture + a navigation onto a model route records the opened
  // model into the arming project. Opening a model is a full page load,
  // so this usually fires on mount of the *next* page — the capture is
  // persisted for exactly that reason.
  useEffect(() => {
    if (currentModelPath === null) {
      return
    }
    const model = {
      label: labelForModelPath(currentModelPath),
      path: currentModelPath,
    }
    if (workspaceCapture === null) {
      // No pending "Add model": the user got here some other way — a
      // shared permalink, a recent, the home model — so the model is
      // listed under Ungrouped rather than dropped, and can be filed
      // into a project from there.
      addUngroupedModel(model)
      return
    }
    // Both sides normalized: arming while an element was selected must
    // still recognize "same model" on the other side of the reload.
    if (currentModelPath !== modelPathFromPathname(workspaceCapture.armedPathname)) {
      addWorkspaceModel(workspaceCapture.projectId, model)
      disarmWorkspaceCapture()
    }
  }, [
    currentModelPath,
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

  // A full-width drawer covering the model is the wrong thing to greet a
  // phone with, so mobile starts collapsed — but only when the user has
  // never said otherwise, since the preference is shared with desktop.
  useEffect(() => {
    if (isMobile && !hasStoredWorkspaceUiState()) {
      setIsCollapsed(true)
    }
  }, [isMobile, setIsCollapsed])

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

  // Bottom-left logo. While the drawer is closed it is the reopen
  // affordance — the only one on mobile, and the one users reach for on
  // desktop even though the rail header also has a toggle. The marketing
  // menu hangs off it only when the drawer is open; a closed drawer's
  // logo that popped a menu instead of opening read as broken.
  const footerLogo = isCollapsed ?
    <TooltipIconButton
      title='Show projects'
      placement='right'
      icon={<LogoB/>}
      onClick={() => setIsCollapsed(false)}
      dataTestId='projects-logo-open'
    /> :
    <LogoMenu/>

  const footer = (
    <Stack
      direction='row'
      justifyContent={isCollapsed ? 'center' : 'flex-start'}
      sx={{padding: '.5em', flexShrink: 0}}
    >
      {footerLogo}
    </Stack>
  )

  if (isCollapsed && isMobile) {
    // No rail on a phone — a whole column of chrome for one toggle isn't
    // worth the width. The logo alone is the affordance.
    return (
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          padding: '.5em',
          // BottomBar's Stack is position:relative and later in the DOM,
          // so it paints over this corner and swallows the click even
          // though its left slot is an empty Box under this flag.
          zIndex: 1,
        }}
        data-testid='ProjectsDrawer'
      >
        {footerLogo}
      </Box>
    )
  }

  if (isCollapsed) {
    return (
      <Paper
        elevation={0}
        sx={{
          // Positioned on purpose: #viewer-container is absolutely
          // positioned and precedes RootLandscape in the DOM, so a
          // static rail paints *under* the canvas — its background
          // vanished while its buttons (ButtonBase is position:relative)
          // still showed. The expanded drawer gets this for free from
          // the resizer's positioning context.
          position: 'relative',
          width: COLLAPSED_RAIL_WIDTH,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          // Half opacity, over a base chosen so the result matches the
          // expanded drawer's tint against the scene (see
          // secondary.workspaceRailBackground) — the rail reads as one
          // continuous column from the toggle down to the logo.
          backgroundColor: `${theme.palette.secondary.workspaceRailBackground}80`,
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
        // Full-width on a phone: a 240px column next to a 3D canvas is
        // too little of each. Resizing goes with it.
        width: isMobile ? '100vw' : drawerWidth,
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
      {!isMobile &&
       <HorizonResizerButton
         drawerRef={drawerRef}
         thickness={RESIZER_THICKNESS}
         isOnLeft={false}
         drawerWidth={drawerWidth}
         drawerWidthInitial={WORKSPACE_DRAWER_WIDTH_INITIAL}
         setDrawerWidth={setDrawerWidth}
         minWidth={COLLAPSE_AT_WIDTH}
         onCollapse={onCollapse}
       />}
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
                        selected={currentModelPath === model.path}
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
                 selected={currentModelPath === model.path}
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

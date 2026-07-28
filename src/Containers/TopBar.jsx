import React, {ReactElement} from 'react'
import {useLocation} from 'react-router-dom'
import {Breadcrumbs, Paper, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import SearchBar from '../Components/Search/SearchBar'
import useStore from '../store/useStore'
import {labelForModelPath} from '../utils/modelDisplayName'
import {ROW_PITCH, TOP_BAR_HEIGHT} from './layoutConstants'


// Model routes all live under the viewer path segment — same test the
// ProjectsDrawer capture effect uses.
const MODEL_ROUTE_RE = /\/v\//

// The search field needs real width to be usable as both element search
// and paste-a-link opener, but must not crowd the breadcrumb on narrow
// panes.
const SEARCH_MAX_WIDTH = '24em'


/**
 * The workspace TopBar (`?feature=workspace` — story #1663, epic
 * assist-300 #1657; plan `conversational-cad.md` §2.3 / §3.1 slice 1):
 * the 58px ToolbarPaper placeholder becomes a real bar carrying the
 * project / model breadcrumb and the relocated element SearchBar.
 *
 * Slice 1 is the shell: the breadcrumb is display-only and search is a
 * relocation of the existing SearchBar, not yet scoped. The anchor/scope
 * mechanic (#1669), SearchProvider seam (#1699) and the pinned NavTree
 * expansion (#1668) all land on top of this bar.
 *
 * @return {ReactElement}
 */
export default function TopBar() {
  const workspaceProjects = useStore((state) => state.workspaceProjects)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const location = useLocation()
  const theme = useTheme()

  const isModelRoute = MODEL_ROUTE_RE.test(location.pathname)
  const modelLabel = isModelRoute ? labelForModelPath(location.pathname) : null
  const project = isModelRoute ?
    workspaceProjects.find((p) => p.models.some((m) => m.path === location.pathname)) :
    null

  return (
    <Paper
      elevation={0}
      sx={{
        // Positioned like the ToolbarPaper it replaces: the center pane
        // owns the space, the bar floats at its top over the canvas
        // (positioned elements paint above the earlier-in-DOM
        // #viewer-container).
        position: 'absolute',
        top: 0,
        height: TOP_BAR_HEIGHT,
        width: '100%',
        backgroundColor: theme.palette.secondary.backgroundColor,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
      }}
      data-testid='TopBar'
    >
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        spacing={2}
        sx={{
          width: '100%',
          minWidth: 0,
          // The ControlsGroup's first row (Open, and Save when signed
          // in) paints over the bar's left edge on the shared 58px
          // grid, so the breadcrumb starts past that column. Goes away
          // when OpenModelControl retires from the canvas (#1664).
          pl: `${ROW_PITCH * 2}px`,
          pr: 2,
        }}
      >
        <Breadcrumbs
          aria-label='Workspace location'
          sx={{minWidth: 0, whiteSpace: 'nowrap'}}
          data-testid='topbar-breadcrumbs'
        >
          {project &&
           <Typography variant='body2' noWrap data-testid='topbar-breadcrumb-project'>
             {project.name}
           </Typography>}
          {modelLabel &&
           <Typography variant='body2' noWrap sx={{fontWeight: 'bold'}} data-testid='topbar-breadcrumb-model'>
             {modelLabel}
           </Typography>}
        </Breadcrumbs>
        {isSearchEnabled &&
         <Stack sx={{flexGrow: 1, maxWidth: SEARCH_MAX_WIDTH}} data-testid='topbar-search'>
           <SearchBar/>
         </Stack>}
      </Stack>
    </Paper>
  )
}

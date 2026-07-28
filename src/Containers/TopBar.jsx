import React, {ReactElement} from 'react'
import {useLocation} from 'react-router-dom'
import {Box, Breadcrumbs, Paper, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import SearchBar from '../Components/Search/SearchBar'
import {entityTypeName} from '../Components/Properties/itemProperties'
import useStore from '../store/useStore'
import {modelPathFromPathname} from '../workspace/modelPath'
import {prettyType} from '../utils/ifc'
import {labelForModelPath} from '../utils/modelDisplayName'
import {ROW_PITCH, TOP_BAR_HEIGHT} from './layoutConstants'


// Model routes all live under the viewer path segment — same test the
// ProjectsDrawer capture effect uses.
const MODEL_ROUTE_RE = /\/v\//

// The search field needs real width to be usable as both element search
// and paste-a-link opener, but must not crowd the breadcrumb on narrow
// panes. Matches the SearchBar form's own desktop width — a smaller cap
// here just reintroduces overflow.
const SEARCH_MAX_WIDTH = '25em'


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
  const model = useStore((state) => state.model)
  const selectedElement = useStore((state) => state.selectedElement)
  const location = useLocation()
  const theme = useTheme()

  // Element selections append numeric segments to the pathname — the
  // crumb names the *model*, not the selected element's expressID.
  const modelPath = MODEL_ROUTE_RE.test(location.pathname) ?
    modelPathFromPathname(location.pathname) :
    null
  // The model's own name where the loader extracted one ('Bldrs' for
  // index.ifc), else the filename; the filename stays reachable as the
  // tooltip either way.
  const fileLabel = modelPath ? labelForModelPath(modelPath) : null
  const modelLabel = (modelPath && model?.name) || fileLabel
  const project = modelPath ?
    workspaceProjects.find((p) => p.models.some((m) => m.path === modelPath)) :
    null

  // Selected-element crumb: named elements show their name ('Together'),
  // anonymous ones their prettified type; the tooltip always carries
  // 'Type: expressID' for orientation.
  let elementLabel = null
  let elementTip = null
  if (modelPath && selectedElement) {
    const typeLabel = prettyType(entityTypeName(model, selectedElement)) || 'Element'
    const name = decodeIFCString(selectedElement.Name?.value || '')
    elementLabel = name || `${typeLabel}: ${selectedElement.expressID}`
    elementTip = `${typeLabel}: ${selectedElement.expressID}`
  }

  return (
    // Zero-height positioned anchor: CenterPane is statically
    // positioned, so an absolute bar would otherwise resolve against
    // the *viewport* — width:100% then overflowed the window by
    // exactly the ProjectsDrawer's width, shoving the search field
    // off-screen. (The flag-off ToolbarPaper gets away with it only
    // because without the drawer the pane spans the viewport.)
    <Box sx={{position: 'relative', width: '100%', height: 0}}>
      <Paper
        elevation={0}
        sx={{
          // The bar floats at the pane's top over the canvas
          // (positioned elements paint above the earlier-in-DOM
          // #viewer-container).
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
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
            flex: '1 1 auto',
            minWidth: 0,
            // The ControlsGroup's first row (Open, and Save when signed
            // in) paints over the bar's left edge on the shared 58px
            // grid, so the breadcrumb starts past that column. Goes away
            // when OpenModelControl retires from the canvas (#1664).
            pl: `${ROW_PITCH * 2}px`,
            // Same reservation on the right for the OperationsGroup's
            // first row (Profile / Apps / Share) until #1665 relocates
            // those into this bar.
            pr: `${ROW_PITCH * 3}px`,
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
           <Tooltip title={fileLabel} placement='bottom'>
             <Typography
               variant='body2'
               noWrap
               sx={{fontWeight: elementLabel ? 'normal' : 'bold'}}
               data-testid='topbar-breadcrumb-model'
             >
               {modelLabel}
             </Typography>
           </Tooltip>}
            {elementLabel &&
           <Tooltip title={elementTip} placement='bottom'>
             <Typography
               variant='body2'
               noWrap
               sx={{fontWeight: 'bold'}}
               data-testid='topbar-breadcrumb-element'
             >
               {elementLabel}
             </Typography>
           </Tooltip>}
          </Breadcrumbs>
          {isSearchEnabled &&
         <Stack sx={{flexGrow: 1, minWidth: 0, maxWidth: SEARCH_MAX_WIDTH}} data-testid='topbar-search'>
           <SearchBar fullWidth/>
         </Stack>}
        </Stack>
      </Paper>
    </Box>
  )
}

import React, {ReactElement, useCallback, useEffect, useState} from 'react'
import {useLocation} from 'react-router-dom'
import {Box, IconButton, Paper, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import AppsControl from '../Components/Apps/AppsControl'
import OpenModelControl from '../Components/Open/OpenModelControl'
import SaveModelControl from '../Components/Open/SaveModelControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import SearchBar from '../Components/Search/SearchBar'
import ShareControl from '../Components/Share/ShareControl'
import {entityTypeName} from '../Components/Properties/itemProperties'
import useStore from '../store/useStore'
import {modelPathFromPathname} from '../workspace/modelPath'
import {prettyType} from '../utils/ifc'
import {labelForModelPath} from '../utils/modelDisplayName'
import {TOP_BAR_HEIGHT} from './layoutConstants'
import {Search as SearchIcon} from '@mui/icons-material'


// Model routes all live under the viewer path segment — same test the
// ProjectsDrawer capture effect uses.
const MODEL_ROUTE_RE = /\/v\//

// The search field needs real width to be usable as both element search
// and paste-a-link opener, but must not crowd the breadcrumb on narrow
// panes. Matches the SearchBar form's own desktop width — a smaller cap
// here just reintroduces overflow.
const SEARCH_MAX_WIDTH = '25em'

// Separators are sized to the icon that replaces them on hover, so the
// swap is width-neutral and the path never shifts under the pointer.
const SEPARATOR_SLOT = '28px'

// The design system's weights: regular for the path, medium (not bold —
// the DS keeps weights light) for the "you are here" crumb.
const WEIGHT_REGULAR = 400
const WEIGHT_MEDIUM = 500


/**
 * The workspace TopBar (`?feature=workspace` — story #1663, epic
 * assist-300 #1657; plan `conversational-cad.md` §2.3 / §3.1 slice 1):
 * the 58px ToolbarPaper placeholder becomes a real bar carrying the
 * project / model / element breadcrumb and the relocated SearchBar.
 *
 * Search is **anchored** to a crumb, following celestiary/web#61: a
 * search icon rides the breadcrumb, defaulting to the last (deepest)
 * crumb; hovering an earlier crumb moves it there, so where the icon
 * sits *is* the search scope. Clicking it replaces every crumb to the
 * right with the search field until the search is cancelled or a new
 * element is picked. Scope is display-only in this slice — actually
 * restricting results to the anchored subtree is #1669/#1699.
 *
 * @return {ReactElement}
 */
export default function TopBar() {
  const workspaceProjects = useStore((state) => state.workspaceProjects)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
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

  const crumbs = []
  if (project) {
    crumbs.push({key: 'project', label: project.name, tip: 'Project'})
  }
  if (modelLabel) {
    crumbs.push({key: 'model', label: modelLabel, tip: fileLabel})
  }
  if (elementLabel) {
    crumbs.push({key: 'element', label: elementLabel, tip: elementTip})
  }

  // Two pieces of state, deliberately separate: where the search field
  // is *committed* (null = closed), and which crumb the pointer is over.
  // Hover only offers the move — the icon is an intent affordance the
  // user still has to click — so travelling across the path never
  // disturbs an open search.
  const [anchorIndex, setAnchorIndex] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const isSearchOpen = anchorIndex !== null && anchorIndex < crumbs.length

  // Escape/blur and any new pick return to the initial state — the
  // icon back at the leaf — rather than to the last placement, so the
  // path always settles somewhere predictable.
  const resetSearch = useCallback(() => {
    setAnchorIndex(null)
    setHoverIndex(null)
  }, [])

  useEffect(() => {
    resetSearch()
  }, [modelPath, elementLabel, resetSearch])

  // Open search hides the crumbs right of the anchor, so the field
  // reads as "searching *inside* this scope".
  const visibleCrumbs = isSearchOpen ? crumbs.slice(0, anchorIndex + 1) : crumbs

  // Hover reveals the move-anchor affordance ONLY while search is open.
  // Off search, hovering the path does nothing — the crumbs' own
  // tooltips are the hover behaviour there, and a second tooltip on a
  // revealed icon just fought them.
  const hoveredSeparator = isSearchOpen ? hoverIndex : null

  return (
    // A block in RootLandscape's WorkspaceMain column (#1992), spanning
    // the NavTree drawer, the centre pane and the right-hand drawers,
    // which all open beneath it.
    <Paper
      elevation={0}
      sx={{
        // Positioned so it paints above the absolutely-positioned,
        // earlier-in-DOM #viewer-container.
        position: 'relative',
        flexShrink: 0,
        // content-box: the hairline sits *below* the 58px bar, exactly
        // as the ProjectsDrawer header's band does (header + 1px edge),
        // so the two bottom edges land on the same pixel row.
        boxSizing: 'content-box',
        height: TOP_BAR_HEIGHT,
        // The design system's header band: the same opaque
        // workspacePaper and workspaceEdge hairline as the
        // ProjectsDrawer's header, so the shell's top edge reads as one
        // persistent strip rather than glass over the canvas.
        backgroundColor: theme.palette.secondary.workspacePaper,
        borderBottom: `1px solid ${theme.palette.secondary.workspaceEdge}`,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
      }}
      data-testid='TopBar'
    >
      {/* Open / Save lead the bar; they used to float into its left edge
          from the ControlsGroup, which collided with the breadcrumb once
          a side drawer opened beneath the bar. */}
      {isOpenEnabled &&
       <Stack direction='row' sx={{flexShrink: 0}} data-testid='topbar-left-controls'>
         <OpenModelControl/>
         {/* Save is shown signed-out too, in the gated look (#1838). */}
         <SaveModelControl/>
       </Stack>}
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        sx={{flex: '1 1 auto', minWidth: 0, pl: isOpenEnabled ? 1 : 2}}
      >
        {/* Own separators rather than MUI's: the slot between two
              crumbs is what swaps to the search icon, and it needs a
              fixed width so that swap can't reflow the path. */}
        <Stack
          component='nav'
          direction='row'
          alignItems='center'
          aria-label='Workspace location'
          // Shrinkable on purpose: the labels ellipsize rather than
          // pushing the trailing search icon out under the
          // OperationsGroup's controls, which is what a long path did
          // on a phone. Goes away once #1665 moves those into the bar.
          sx={{minWidth: 0, flexShrink: 1, overflow: 'hidden', whiteSpace: 'nowrap'}}
          onMouseLeave={() => setHoverIndex(null)}
          data-testid='topbar-breadcrumbs'
        >
          {visibleCrumbs.map((crumb, i) => {
            const isLastVisible = i === visibleCrumbs.length - 1
            return (
              <React.Fragment key={crumb.key}>
                <Tooltip title={crumb.tip || ''} placement='bottom'>
                  <Typography
                    variant='body2'
                    noWrap
                    onMouseEnter={isSearchOpen ? () => setHoverIndex(i) : undefined}
                    sx={{fontWeight: isLastVisible ? WEIGHT_MEDIUM : WEIGHT_REGULAR, cursor: 'default'}}
                    data-testid={`topbar-breadcrumb-${crumb.key}`}
                  >
                    {crumb.label}
                  </Typography>
                </Tooltip>
                {!isLastVisible &&
                   <Box
                     onMouseEnter={isSearchOpen ? () => setHoverIndex(i) : undefined}
                     sx={{
                       width: SEPARATOR_SLOT,
                       flexShrink: 0,
                       display: 'flex',
                       alignItems: 'center',
                       justifyContent: 'center',
                     }}
                   >
                     {hoveredSeparator === i ?
                       <IconButton
                         size='small'
                         aria-label={`Search in ${crumb.label}`}
                         // Keeps focus in the open search field, so the
                         // click lands as an anchor move instead of a
                         // blur-then-dismiss race.
                         onMouseDown={(event) => event.preventDefault()}
                         onClick={() => setAnchorIndex(i)}
                         data-testid='topbar-search-open'
                       >
                         <SearchIcon className='icon-share' fontSize='inherit'/>
                       </IconButton> :
                       <Typography variant='body2' sx={{opacity: 0.4}}>/</Typography>}
                   </Box>}
              </React.Fragment>
            )
          })}
          {isSearchEnabled && !isSearchOpen && crumbs.length > 0 &&
             <Box sx={{width: SEPARATOR_SLOT, flexShrink: 0, display: 'flex', justifyContent: 'center'}}>
               <IconButton
                 size='small'
                 aria-label={`Search in ${crumbs[crumbs.length - 1].label}`}
                 onClick={() => setAnchorIndex(crumbs.length - 1)}
                 data-testid='topbar-search-open'
               >
                 <SearchIcon className='icon-share' fontSize='inherit'/>
               </IconButton>
             </Box>}
        </Stack>
        {isSearchEnabled && isSearchOpen &&
           <Stack sx={{flexGrow: 1, minWidth: 0, maxWidth: SEARCH_MAX_WIDTH}} data-testid='topbar-search'>
             <SearchBar
               fullWidth
               takeFocus
               onSuccess={resetSearch}
               onCancel={resetSearch}
             />
           </Stack>}
      </Stack>
      {/* Profile / Apps / Share close the bar (#1665; Apps joins them,
          per design review #1992), out of the OperationsGroup's top row. */}
      <Stack direction='row' sx={{flexShrink: 0}} data-testid='topbar-right-controls'>
        {isLoginEnabled && <ProfileControl/>}
        {isAppsEnabled && <AppsControl/>}
        {isShareEnabled && <ShareControl/>}
      </Stack>
    </Paper>
  )
}

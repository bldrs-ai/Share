import React, {ReactElement} from 'react'
import {Box, IconButton, Paper} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {ROW_PITCH} from '../../Containers/layoutConstants'
import AppsRegistry from './AppsRegistry.json'
import {Close as CloseIcon} from '@mui/icons-material'


// The close badge on a running app's cell: small, in the cell's top-right
// corner, shown on hover / keyboard focus so it doesn't crowd the icons.
const CLOSE_BADGE_SIZE = 18
const CLOSE_BADGE_INSET = 2


/**
 * The workspace Apps bar (#1993): the Apps drawer docked to the page's
 * right border, the way the ProjectsDrawer collapses to its rail. One
 * control cell wide, under the TopBar's Apps button. Lists pinned apps,
 * then apps running this session; clicking one opens the Apps drawer on
 * it. Shown only while the drawer is closed and there is something to
 * dock — an empty bar would just take width from the model.
 *
 * @return {ReactElement|null}
 */
export default function AppsRail() {
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  const runningApps = useStore((state) => state.runningApps)
  const closeRunningApp = useStore((state) => state.closeRunningApp)
  const pinnedAppNames = useStore((state) => state.pinnedAppNames)
  const theme = useTheme()

  // Pinned first, in pin order, from the registry (they may not have been
  // opened this session); then running apps that aren't pinned.
  const pinned = pinnedAppNames
    .map((name) => AppsRegistry.find((app) => app.appName === name))
    .filter(Boolean)
  const running = runningApps.filter((app) => !pinnedAppNames.includes(app.appName))
  const docked = [...pinned.map((app) => ({app, isPinned: true})), ...running.map((app) => ({app, isPinned: false}))]

  // isAppsEnabled is the Apps kill switch: TopBar and OperationsGroup hide
  // their Apps controls behind it, and a pin left in localStorage from a
  // deploy that had Apps on must not reopen the drawer through the bar.
  if (!isAppsEnabled || isAppsVisible || docked.length === 0) {
    return null
  }

  return (
    <Paper
      elevation={0}
      sx={{
        // Positioned so it paints above the earlier-in-DOM canvas.
        position: 'relative',
        flexShrink: 0,
        width: `${ROW_PITCH}px`,
        height: '100%',
        borderRadius: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: theme.palette.secondary.workspaceBackground,
        borderLeft: `1px solid ${theme.palette.secondary.workspaceBorder}`,
      }}
      data-testid='AppsRail'
    >
      {docked.map(({app, isPinned}) => (
        <Box
          key={app.appName}
          sx={{
            'position': 'relative',
            '& .apps-rail-close': {opacity: 0},
            '&:hover .apps-rail-close, &:focus-within .apps-rail-close': {opacity: 1},
          }}
          data-testid={`apps-rail-${app.appName}`}
        >
          <TooltipIconButton
            title={app.appName}
            placement='left'
            icon={<img src={app.icon} alt='' width={27} height={27}/>}
            onClick={() => {
              setSelectedApp(app)
              setIsAppsVisible(true)
            }}
            dataTestId={`apps-rail-open-${app.appName}`}
          />
          {!isPinned &&
           <IconButton
             className='apps-rail-close'
             aria-label={`Close ${app.appName}`}
             onClick={() => closeRunningApp(app.appName)}
             sx={{
               position: 'absolute',
               top: CLOSE_BADGE_INSET,
               right: CLOSE_BADGE_INSET,
               width: CLOSE_BADGE_SIZE,
               height: CLOSE_BADGE_SIZE,
               minWidth: 0,
               margin: 0,
               padding: 0,
               fontSize: CLOSE_BADGE_SIZE - 4,
               backgroundColor: theme.palette.secondary.workspacePaper,
             }}
             data-testid={`apps-rail-close-${app.appName}`}
           >
             <CloseIcon fontSize='inherit'/>
           </IconButton>}
        </Box>
      ))}
    </Paper>
  )
}

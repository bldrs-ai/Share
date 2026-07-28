import React, {ReactElement} from 'react'
import {Box, Paper, Stack} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import BottomBar from './BottomBar'
import ControlsGroup from './ControlsGroup'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import OperationsGroup from './OperationsGroup'
import ProjectsDrawer from './ProjectsDrawer'
import TopBar from './TopBar'
import {TOP_BAR_HEIGHT} from './layoutConstants'
import RightSideDrawers from './RightSideDrawers'
import TabbedPanels from './TabbedPanels'
import useExistInFeature from '../hooks/useExistInFeature'
import useStore from '../store/useStore'


/**
 * @property {string} pathPrefix App path prefix
 * @property {string} branch For version
 * @property {Function} selectWithShiftClickEvents For multi-select by NavTree
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function RootLandscape({pathPrefix, branch, selectWithShiftClickEvents, deselectItems}) {
  const isMobile = useIsMobile()
  const theme = useTheme()
  const vh = useStore((state) => state.vh)
  // Workspace shell (epic assist-300, #1657): ProjectsDrawer sits left of
  // the NavTree/Versions drawer. Desktop-only for now, like that drawer.
  const isWorkspaceEnabled = useExistInFeature('workspace')

  return (
    <Stack
      direction='row'
      justifyContent='flex-start'
      alignItems='stretch'
      sx={{width: '100%', height: isMobile ? `${vh}px` : '100vh', overflow: 'hidden'}}
      data-testid='RootLandscape-RootStack'
    >
      {isWorkspaceEnabled &&
       <Box
         sx={{flex: '0 0 auto', flexShrink: 0}}
         data-testid='ProjectsDrawer-Container'
       >
         <ProjectsDrawer/>
       </Box>
      }
      {!isMobile &&
       <Box
         sx={{
           // Left drawer should take only its own width.
           flex: '0 0 auto',
           flexShrink: 0,
         }}
       >
         <NavTreeAndVersionsDrawer
           pathPrefix={pathPrefix}
           branch={branch}
           selectWithShiftClickEvents={selectWithShiftClickEvents}
         />
       </Box>
      }
      <Stack
        justifyContent='space-between'
        sx={{flex: '1 1 auto', minWidth: 0, height: '100%'}}
        data-testid='CenterPane'
      >
        {isWorkspaceEnabled ?
          <TopBar/> :
          <Box sx={{opacity: 0.5}}>
            <Paper
              elevation={0}
              sx={{
                position: 'absolute',
                top: 0,
                height: TOP_BAR_HEIGHT,
                width: '100%',
                backgroundColor: theme.palette.secondary.backgroundColor,
                borderRadius: 0,
              }}
              data-testid='RootLandscape-ToolbarPaper'
            />
          </Box>}
        <Stack
          direction='row'
          justifyContent='space-between'
          // This pushes bottom bar down
          flexGrow={1}
          sx={{width: '100%', minWidth: 0}}
          data-testid='RootLandscape-CenterPaneTopStack'
        >
          <ControlsGroup/>
          <OperationsGroup/>
        </Stack>
        <Box
          sx={{
            width: '100%',
          }}
          data-testid='RootLandscape-CenterPaneBottomBox'
        >
          <BottomBar deselectItems={deselectItems}/>
          <AlertDialogAndSnackbar/>
          <LoadingBackdrop/>
        </Box>
      </Stack>
      {isMobile ?
        <TabbedPanels
          pathPrefix={pathPrefix}
          branch={branch}
          selectWithShiftClickEvents={selectWithShiftClickEvents}
        /> :
      // On non-mobile, use RightSideDrawers for the combined drawer logic
        <RightSideDrawers/>
      }
    </Stack>
  )
}

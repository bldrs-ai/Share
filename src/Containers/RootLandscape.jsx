import React, {ReactElement} from 'react'
import {Box, Paper, Stack} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import BottomBar from './BottomBar'
import LeftToolbar from './LeftToolbar'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import OperationsGroup from './OperationsGroup'
import RightSideDrawers from './RightSideDrawers'
import TabbedPanels from './TabbedPanels'
import NavCube from '../Components/NavCube/NavCube'
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

  return (
    <Stack
      direction='row'
      justifyContent='flex-start'
      alignItems='stretch'
      sx={{width: '100%', height: isMobile ? `${vh}px` : '100vh', overflow: 'hidden'}}
      data-testid='RootLandscape-RootStack'
    >
      {!isMobile &&
       <Box sx={{flex: '0 0 auto', flexShrink: 0}}>
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
        <Box sx={{opacity: 0.5}}>
          <Paper
            elevation={0}
            sx={{
              position: 'absolute',
              top: 0,
              height: 58,
              width: '100%',
              backgroundColor: theme.palette.secondary.backgroundColor,
              borderRadius: 0,
            }}
            data-testid='RootLandscape-ToolbarPaper'
          />
        </Box>
        <Box sx={{
          position: 'absolute',
          top: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1,
          opacity: 0.4,
          fontSize: '11px',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          color: theme.palette.primary.contrastText,
        }}>
          build 013
        </Box>
        <Stack
          direction='row'
          justifyContent='space-between'
          flexGrow={1}
          sx={{width: '100%', minWidth: 0}}
          data-testid='RootLandscape-CenterPaneTopStack'
        >
          {!isMobile && <LeftToolbar/>}
        </Stack>
        <Box sx={{width: '100%'}} data-testid='RootLandscape-CenterPaneBottomBox'>
          <BottomBar/>
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
        <RightSideDrawers/>
      }
      {!isMobile && <NavCube/>}
    </Stack>
  )
}

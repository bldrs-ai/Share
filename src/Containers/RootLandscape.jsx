import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import BottomBar from './BottomBar'
import ControlsGroup from './ControlsGroup'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import OperationsGroup from './OperationsGroup'
import RightSideDrawers from './RightSideDrawers'
import TabbedPanels from './TabbedPanels'
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
      justifyContent='space-between'
      alignItems='center'
      sx={{width: '100%', height: `${vh}px`}}
      data-testid='RootLandscape-RootStack'
    >
      {!isMobile &&
       <Box
         sx={{
           flexBasis: '0%',
           flexGrow: 1,
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
        sx={{width: '100%', height: '100%'}}
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
        <Stack
          direction='row'
          justifyContent='space-between'
          // This pushes bottom bar down
          flexGrow={1}
          sx={{width: '100%'}}
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

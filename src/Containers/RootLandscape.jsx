import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import AppsSideDrawer from './AppsSideDrawer'
import BottomBar from './BottomBar'
import ControlsGroup from './ControlsGroup'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import NotesAndPropertiesDrawer from './NotesAndPropertiesDrawer'
import OperationsGroup from './OperationsGroup'
import TabbedPanels from './TabbedPanels'


/**
 * @property {string} pathPrefix App path prefix
 * @property {string} branch For version
 * @property {Function} selectWithShiftClickEvents For multi-select by NavTree
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function RootLandscape({pathPrefix, branch, selectWithShiftClickEvents, deselectItems}) {
  const isMobile = useIsMobile()
  return (
    <Stack
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      sx={{width: '100vw', height: '100vh'}}
      data-testid='RootPane'
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
        <Stack
          direction='row'
          justifyContent='space-between'
          // This pushes bottom bar down
          flexGrow={1}
          sx={{width: '100%'}}
          data-testid='CenterPaneTop'
        >
          <ControlsGroup/>
          <OperationsGroup/>
        </Stack>
        <Box
          sx={{
            width: '100%',
          }}
          data-testid='CenterPaneBottom'
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
       <Stack direction='row' style={{pointerEvents: 'auto'}} data-testid='RightPane'>
         <NotesAndPropertiesDrawer/>
         <AppsSideDrawer/>
       </Stack>
      }
    </Stack>
  )
}

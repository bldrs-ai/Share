import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import AppsSideDrawer from './AppsSideDrawer'
import BottomBar from './BottomBar'
import ControlsGroup from '../Components/ControlsGroup'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import NavTreeAndVersions from './NavTreeAndVersions'
import NotesAndProperties from './NotesAndProperties'
import OperationsGroup from './OperationsGroup'
import SearchBar from '../Components/Search/SearchBar'
import useStore from '../store/useStore'


/**
 * @property {string} pathPrefix App path prefix
 * @property {string} branch For version
 * @property {Function} selectWithShiftClickEvents For multi-select by NavTree
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function RootLandscape({pathPrefix, branch, selectWithShiftClickEvents, deselectItems}) {
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  return (
    <Stack
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      sx={{width: '100vw', height: '100vh'}}
      data-testid='RootPane'
    >
      <Box
        sx={{
          flexBasis: '10%',
          flexGrow: 1,
        }}
      >
        <NavTreeAndVersions
          pathPrefix={pathPrefix}
          branch={branch}
          selectWithShiftClickEvents={selectWithShiftClickEvents}
        />
      </Box>
      <Stack
        justifyContent='space-between'
        sx={{width: '100%', height: '100%'}}
        data-testid='CenterPane'
      >
        <Stack
          direction='row'
          justifyContent='space-between'
          flexGrow={1}
          sx={{width: '100%'}}
          data-testid='CenterPaneTop'
        >
          <Stack direction='row' data-testid='ControlsGroupAndSearch'>
            <ControlsGroup/>
            <Box sx={{width: '100%'}}>
              {isSearchEnabled &&
               isSearchBarVisible &&
               <SearchBar placeholder='Search' id='search'/>}
            </Box>
          </Stack>
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
      <Stack direction='row' style={{pointerEvents: 'auto'}} data-testid='RightPane'>
        <NotesAndProperties/>
        <AppsSideDrawer/>
      </Stack>
    </Stack>
  )
}

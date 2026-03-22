import React, {ReactElement} from 'react'
import {Box, Paper, Stack} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Components/Hooks'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import BottomBar from './BottomBar'
import LeftToolbar from './LeftToolbar'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import TopBar from './TopBar'
import RightSideDrawers from './RightSideDrawers'
import TabbedPanels from './TabbedPanels'
import NavCube from '../Components/NavCube/NavCube'
import ViewerToolbar from './ViewerToolbar'
import SVGFloorPlanView from '../Components/FloorPlan/SVGFloorPlan/SVGFloorPlanView'
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
  const isFloorPlanMode = useStore((state) => state.isFloorPlanMode)
  const isSvgFloorPlanVisible = useStore((state) => state.isSvgFloorPlanVisible)

  return (
    <Stack
      direction='row'
      justifyContent='flex-start'
      alignItems='stretch'
      sx={{width: '100%', height: isMobile ? `${vh}px` : '100vh', overflow: 'hidden'}}
      data-testid='RootLandscape-RootStack'
    >
      {!isMobile &&
       <div style={{flex: '0 0 auto', flexShrink: 0, marginLeft: '40px', marginTop: '40px'}}>
         <NavTreeAndVersionsDrawer
           pathPrefix={pathPrefix}
           branch={branch}
           selectWithShiftClickEvents={selectWithShiftClickEvents}
         />
       </div>
      }
      <Stack
        justifyContent='space-between'
        sx={{flex: '1 1 auto', minWidth: 0, height: '100%'}}
        data-testid='CenterPane'
      >
        <TopBar/>
        <Stack
          direction='row'
          justifyContent='space-between'
          flexGrow={1}
          sx={{width: '100%', minWidth: 0}}
          data-testid='RootLandscape-CenterPaneTopStack'
        >
          {!isMobile && <LeftToolbar/>}
        </Stack>
        <div style={{width: '100%'}} data-testid='RootLandscape-CenterPaneBottomBox'>
          <BottomBar/>
          <AlertDialogAndSnackbar/>
          <LoadingBackdrop/>
        </div>
      </Stack>
      {isSvgFloorPlanVisible && !isMobile && (
        <div style={{
          position: 'fixed',
          top: 40,
          right: 0,
          width: '50vw',
          height: 'calc(100vh - 40px)',
          borderLeft: '1px solid #e0e0e0',
          backgroundColor: '#ffffff',
          color: '#000000',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}>
          <SVGFloorPlanView/>
        </div>
      )}
      {isMobile ?
        <TabbedPanels
          pathPrefix={pathPrefix}
          branch={branch}
          selectWithShiftClickEvents={selectWithShiftClickEvents}
        /> :
        <RightSideDrawers/>
      }
      <ViewerToolbar/>
      {!isMobile && <NavCube/>}
    </Stack>
  )
}

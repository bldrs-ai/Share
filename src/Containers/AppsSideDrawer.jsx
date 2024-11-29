import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import AppsPanel, {AppPreviewPanel} from '../Components/Apps/AppsPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import useStore from '../store/useStore'


/**
 * @return {ReactElement}
 */
export default function AppsSideDrawer() {
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const selectedApp = useStore((state) => state.selectedApp)
  return (
    <SideDrawer isDrawerOpen={isAppsVisible}>
      <Box
        sx={{
          width: '100%',
          overflow: 'hidden',
        }}
        data-test-id='AppsSideDrawer-OverflowHidden'
      >
        <Box
          sx={{
            display: isAppsVisible ? 'block' : 'none',
            height: '100%',
            overflowX: 'hidden',
            overflowY: 'auto',
          }}
          data-test-id='AppsSideDrawer-OverflowYAuto'
        >
          {!selectedApp ?
           <AppsPanel/> :
           <AppPreviewPanel item={selectedApp}/>
          }
        </Box>
      </Box>
    </SideDrawer>
  )
}

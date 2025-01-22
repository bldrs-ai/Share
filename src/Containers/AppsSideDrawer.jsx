import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import AppsPanel from '../Components/Apps/AppsPanel'
import AppPanel from '../Components/Apps/AppPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import useStore from '../store/useStore'


/** @return {ReactElement} */
export default function AppsSideDrawer({setDrawerWidth}) {
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const appsDrawerWidthInitial = useStore((state) => state.appsDrawerWidthInitial)
  const selectedApp = useStore((state) => state.selectedApp)
  return (
    <SideDrawer
      isDrawerVisible={isAppsVisible}
      drawerWidth={appsDrawerWidth}
      drawerWidthInitial={appsDrawerWidthInitial}
      setDrawerWidth={setDrawerWidth}
      dataTestId='AppsDrawer'
    >
      <Box
        sx={{
          height: '100%',
          width: '100%',
          overflow: 'hidden',
        }}
        data-testid='AppsSideDrawer-OverflowHidden'
      >
        <Box
          sx={{
            display: isAppsVisible ? 'block' : 'none',
            height: '100%',
            overflowX: 'hidden',
            overflowY: 'auto',
          }}
          data-testid='AppsSideDrawer-OverflowYAuto'
        >
          {!selectedApp ?
           <AppsPanel/> :
           <AppPanel itemJson={selectedApp}/>
          }
        </Box>
      </Box>
    </SideDrawer>
  )
}

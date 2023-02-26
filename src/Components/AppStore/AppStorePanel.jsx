import React from 'react'
import Box from '@mui/material/Box'
import {CloseButton, FullScreenButton} from '../Buttons'
import useStore from '../../store/useStore'
import {AppStoreListing, AppStoreIFrame} from './AppStoreListing'
import {PanelWithTitle} from '../SideDrawer/SideDrawerPanels'



/** @return {React.Component} */
export function AppStorePanel() {
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const selectedStoreApp = useStore((state) => state.selectedStoreApp)
  return (
    <PanelWithTitle title={'App Store'}
      controlsGroup={
        <>
          <Box>
            <FullScreenButton onClick={toggleAppStoreDrawer}/>
            <CloseButton
              onClick={toggleAppStoreDrawer}
            />
          </Box>
        </>
      }
    >
      {!selectedStoreApp ?
        <AppStoreListing/> :
        <AppStoreIFrame item={selectedStoreApp}/>
      }
    </PanelWithTitle>
  )
}

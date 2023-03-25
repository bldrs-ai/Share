import React from 'react'
import Box from '@mui/material/Box'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import useStore from '../../store/useStore'
import {AppStoreListing, AppStoreIFrame} from './AppStoreListing'
import {PanelWithTitle} from '../SideDrawer/SideDrawerPanels'


/** @return {React.Component} */
export function AppStorePanel() {
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)

  return (
    <PanelWithTitle title={'App Store'}
      controlsGroup={
        <>
          <Box>
            <CloseButton
              onClick={toggleAppStoreDrawer}
            />
          </Box>
        </>
      }
    >
      <AppStoreListing/>
    </PanelWithTitle>
  )
}

/** @return {React.Component} */
export function AppPreviewPanel({item}) {
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const setSelectedStoreApp = useStore((state) => state.setSelectedStoreApp)
  return (
    <PanelWithTitle title={item.appName}
      iconSrc={item.icon}
      controlsGroup={
        <>
          <Box>
            <BackButton
              onClick={() => {
                setSelectedStoreApp(null)
              }}
            />
            <FullScreenButton onClick={() => {
              window.open(item.action, '_blank')
            }}
            />
            <CloseButton
              onClick={toggleAppStoreDrawer}
            />
          </Box>
        </>
      }
    >
      <AppStoreIFrame item={item}/>
    </PanelWithTitle>
  )
}

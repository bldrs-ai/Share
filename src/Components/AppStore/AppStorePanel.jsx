import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import {AppStoreListing, AppStoreIFrame} from './AppStoreListing'


/** @return {ReactElement} */
export function AppStorePanel() {
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)

  return (
    <PanelWithTitle
      title='App Store'
      controlsGroup={<CloseButton onCloseClick={toggleAppStoreDrawer}/>}
    >
      <AppStoreListing/>
    </PanelWithTitle>
  )
}

/** @return {ReactElement} */
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

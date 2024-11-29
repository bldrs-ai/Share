import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import {AppsListing, AppIFrame} from './AppsListing'


/** @return {ReactElement} */
export default function AppsPanel() {
  const toggleAppsIsVisible = useStore((state) => state.toggleAppsIsVisible)
  return (
    <PanelWithTitle
      title='APPS'
      controlsGroup={<CloseButton onCloseClick={toggleAppsIsVisible}/>}
      data-test-id='AppsPanel'
    >
      <AppsListing/>
    </PanelWithTitle>
  )
}


/** @return {ReactElement} */
export function AppPreviewPanel({item}) {
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  return (
    <PanelWithTitle title={item.appName}
      iconSrc={item.icon}
      controlsGroup={
        <Box>
          <BackButton onClick={() => setSelectedApp(null)}/>
          <FullScreenButton onClick={() => window.open(item.action, '_blank')}/>
          <CloseButton onClick={toggleAppsDrawer}/>
        </Box>
      }
    >
      <AppIFrame item={item}/>
    </PanelWithTitle>
  )
}

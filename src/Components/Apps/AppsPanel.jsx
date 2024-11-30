import React, {ReactElement} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../../store/useStore'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import Panel from '../SideDrawer/Panel'
import {AppsListing, AppIFrame} from './AppsListing'


/** @return {ReactElement} */
export default function AppsPanel() {
  const toggleAppsIsVisible = useStore((state) => state.toggleAppsIsVisible)
  return (
    <Panel
      title='Apps'
      onClose={toggleAppsIsVisible}
      data-testid='AppsPanel'
    >
      <AppsListing/>
    </Panel>
  )
}


/** @return {ReactElement} */
export function AppPreviewPanel({item}) {
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  return (
    <Panel
      title={item.appName}
      iconSrc={item.icon}
      controlsGroup={
        <ButtonGroup>
          <BackButton onClick={() => setSelectedApp(null)}/>
          <FullScreenButton onClick={() => window.open(item.action, '_blank')}/>
          <CloseButton onClick={toggleAppsDrawer}/>
        </ButtonGroup>
      }
      data-testid='AppsPreviewPanel'
    >
      <AppIFrame item={item}/>
    </Panel>
  )
}

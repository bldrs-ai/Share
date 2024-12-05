import React, {ReactElement} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../../store/useStore'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import Panel from '../SideDrawer/Panel'
import {AppsListing, AppIFrame} from './AppsListing'
import {removeHashParams} from './hashState'


/** @return {ReactElement} */
export default function AppsPanel() {
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)


  /** Hide panel and remove hash state */
  function onClose() {
    setIsAppsVisible(false)
    removeHashParams()
  }


  return (
    <Panel title='Apps' onClose={onClose} data-testid='AppsPanel'>
      <AppsListing/>
    </Panel>
  )
}


/** @return {ReactElement} */
export function AppPreviewPanel({item}) {
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)
  const setSelectedApp = useStore((state) => state.setSelectedApp)


  /** Hide panel and remove hash state */
  function onClose() {
    setIsAppsVisible(false)
    removeHashParams()
  }


  return (
    <Panel
      title={item.appName}
      onClose={onClose}
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

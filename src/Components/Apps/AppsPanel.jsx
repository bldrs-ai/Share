import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../../store/useStore'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import {AppsListing, AppIFrame} from './AppsListing'


/** @return {ReactElement} */
export default function AppsPanel() {
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)

  return (
    <PanelWithTitle
      title='Apps'
      controlsGroup={<CloseButton onCloseClick={toggleAppsDrawer}/>}
    >
      <AppsListing/>
    </PanelWithTitle>
  )
}

/** @return {ReactElement} */
export function AppPreviewPanel({item}) {
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)
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
              onClick={toggleAppsDrawer}
            />
          </Box>
        </>
      }
    >
      <AppIFrame item={item}/>
    </PanelWithTitle>
  )
}

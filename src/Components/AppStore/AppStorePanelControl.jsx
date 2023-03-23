import React, {useEffect} from 'react'
import Box from '@mui/material/Box'
import {BackButton, CloseButton, FullScreenButton} from '../Buttons'
import useStore from '../../store/useStore'
import {AppStoreListing, AppStoreIFrame} from './AppStoreListing'
import {PanelWithTitle} from '../SideDrawer/SideDrawerPanels'


/** @return {React.Component} */
export function AppStorePanel() {
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const setIsAppStoreEnabled = useStore((state) => state.setIsAppStoreEnabled)

  /**
   * Store initial query parameters settings,
   * since they will be cleared by the application on state change.
   */
  useEffect(() => {
    const initialParameters = new URLSearchParams(window.location.search)
    const enabledFeature = initialParameters.get('feature')
    const appStoreEnabled = enabledFeature && enabledFeature.toLowerCase() === 'apps'
    setIsAppStoreEnabled(appStoreEnabled)
  }, [setIsAppStoreEnabled])

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

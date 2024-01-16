import React, {useState} from 'react'
import AboutControl, {AboutContent, AboutDialog} from './AboutControl'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'


export default {
  AboutControl: <HelmetStoreRouteThemeCtx><AboutControl/></HelmetStoreRouteThemeCtx>,
  AboutDialog: () => {
    const [isDisplayed, setIsDisplayed] = useState(true)
    return (
      <HelmetStoreRouteThemeCtx>
        <AboutDialog
          isDialogDisplayed={isDisplayed}
          setIsDialogDisplayed={setIsDisplayed}
        />
      </HelmetStoreRouteThemeCtx>
    )
  },
  AboutContent: <HelmetStoreRouteThemeCtx><AboutContent/></HelmetStoreRouteThemeCtx>,
}

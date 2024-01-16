import React, {useState} from 'react'
import {AboutDialog} from './AboutControl'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'


/** @return {React.Component} */
export default function AboutDialogFixture() {
  const [isDisplayed, setIsDisplayed] = useState(true)
  return (
    <HelmetStoreRouteThemeCtx>
      <AboutDialog
        isDialogDisplayed={isDisplayed}
        setIsDialogDisplayed={setIsDisplayed}
      />
    </HelmetStoreRouteThemeCtx>
  )
}

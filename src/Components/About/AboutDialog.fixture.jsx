import React from 'react'
import {AboutDialog} from './AboutControl'
import {ThemeCtx} from '../../theme/Theme.fixture'


/** @return {React.Component} */
export default function AboutDialogFixture() {
  return (
    <ThemeCtx>
      <AboutDialog
        isDialogDisplayed={true}
        // eslint-disable-next-line no-empty-function
        setIsDialogDisplayed={() => {}}
      />
    </ThemeCtx>
  )
}

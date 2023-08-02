import React from 'react'
import FixtureContext from '../../FixtureContext'
import {AboutDialog} from './AboutControl'


/** @return {React.Component} */
export default () => {
  return (
    <FixtureContext>
      <AboutDialog
        isDialogDisplayed={true}
        // eslint-disable-next-line no-empty-function
        setIsDialogDisplayed={() => {}}
      />
    </FixtureContext>
  )
}

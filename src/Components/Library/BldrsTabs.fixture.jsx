import React from 'react'
import FixtureContext from '../../FixtureContext'
import BldrsTabs from './BldrsTabs'


const tabNames = ['Explore Model', 'Open Model', 'Save Model']
export default (
  <FixtureContext>
    <BldrsTabs tabNames={tabNames}/>
  </FixtureContext>
)

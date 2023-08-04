import React from 'react'
import FixtureContext from '../../FixtureContext'
import BldrsTabs from './BldrsTabs'


const callback = (value) => {
  alert(value)
}

const tabNames = ['Explore Model', 'Open Model', 'Save Model']
export default (
  <FixtureContext>
    <BldrsTabs tabNames={tabNames} actionCb={callback}/>
  </FixtureContext>
)

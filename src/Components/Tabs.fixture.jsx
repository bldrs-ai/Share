import React from 'react'
import Tabs from './Tabs'
import FixtureContext from '../FixtureContext'
import debug from '../utils/debug'


export default (
  <FixtureContext>
    <Tabs
      tabLabels={['Explore', 'Open', 'Save']}
      actionCb={() => debug().log('Clicked')}
    />
  </FixtureContext>
)

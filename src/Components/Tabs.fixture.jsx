import React from 'react'
import Tabs from './Tabs'
import FixtureContext from '../FixtureContext'


const tabList = ['Explore', 'Open', 'Save']
export default (
  <FixtureContext>
    <Tabs tabList={tabList} scrollable={true}/>
  </FixtureContext>
)

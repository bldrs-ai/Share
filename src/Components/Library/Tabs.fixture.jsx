import React from 'react'
import FixtureContext from '../../FixtureContext'
import Tabs from './Tabs'


const callback = (value) => {
  alert(value)
}

const tabList = [
  {
    name: 'name1',
    content: <div>hello1</div>,
  },
  {
    name: 'name2',
    content: <div>hello2</div>,
  },
  {
    name: 'name3',
    content: <div>hello3</div>,
  },
]

export default (
  <FixtureContext>
    <Tabs tabList={tabList} actionCb={callback}/>
  </FixtureContext>
)

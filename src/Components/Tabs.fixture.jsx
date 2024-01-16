import React from 'react'
import Tabs from './Tabs'
import {ThemeCtx} from '../theme/Theme.fixture'
import debug from '../utils/debug'


export default (
  <ThemeCtx>
    <Tabs
      tabLabels={['Explore', 'Open', 'Save']}
      actionCb={() => debug().log('Clicked')}
    />
  </ThemeCtx>
)

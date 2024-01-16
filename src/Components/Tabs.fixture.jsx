import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import debug from '../utils/debug'
import Tabs from './Tabs'


export default (
  <ThemeCtx>
    <Tabs
      tabLabels={['Explore', 'Open', 'Save']}
      actionCb={() => debug().log('Clicked')}
    />
  </ThemeCtx>
)

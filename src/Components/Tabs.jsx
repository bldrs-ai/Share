import React, {useState, ReactElement} from 'react'
import MuiTabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import {assertDefined} from '../utils/assert'


/**
 * @property {Array<string>} tabLabels Names of each tab
 * @property {Function} actionCb callBack fired when the tabs is selected, returns currect tab number
 * @property {boolean} [isScrollable] Enable scrolling for many (> 5) tabs
 * @return {ReactElement}
 */
export default function Tabs({tabLabels, currentTab, actionCb, isScrollable = false}) {
  assertDefined(tabLabels, actionCb)
  const [value, setValue] = useState(currentTab)
  const handleChange = (event, newValue) => {
    setValue(newValue)
    actionCb(newValue)
  }
  return (
    <MuiTabs value={value} onChange={handleChange} centered variant={isScrollable ? 'scrollable' : 'fullWidth'}>
      {tabLabels.map((tab) => <Tab key={tab} label={tab} data-testid={tab}/>)}
    </MuiTabs>
  )
}

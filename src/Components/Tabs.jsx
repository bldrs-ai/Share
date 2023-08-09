import React, {useState} from 'react'
import MuiTabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'

/**
 * Tabs component.
 *
 * @property {Array<string>} tabList array of Tab strings composed of tab names
 * @property {boolean} scrollableTabs whenever the tabs number is large then 5 variant shall be flipper to scrollable
 * @property {Function} actionCb called back fired when the tabs is selected returns currect tab number
 * @return {React.Component}
 */
export default function Tabs({tabList, scrollableTabs, actionCb}) {
  const [value, setValue] = useState(0)

  const handleChange = (event, newValue) => {
    setValue(newValue)
    actionCb(newValue)
  }
  return (
    <MuiTabs value={value} onChange={handleChange} centered variant={scrollableTabs ? 'scrollable' : 'fullWidth'}>
      {tabList.map((tab) => {
        return (
          <Tab key={tab} label={tab}/>
        )
      })}
    </MuiTabs>
  )
}

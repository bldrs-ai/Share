import React, {useState} from 'react'
import Box from '@mui/material/Box'
import MuiTabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'

/**
 * Tabs component.
 *
 * @property {Array<string>} tabList array of Tab strings composed of tab names
 * @property {Function} actionCb called back fired when the tabs is selected returns currect tab number
 * @return {React.Component}
 */
export default function Tabs({tabList, actionCb}) {
  const [value, setValue] = useState(0)

  const handleChange = (event, newValue) => {
    setValue(newValue)
    actionCb(newValue)
  }
  return (
    <Box sx={{width: '100%'}}>
      <MuiTabs value={value} onChange={handleChange} centered variant="fullWidth">
        {tabList.map((tab) => {
          return (
            <Tab key={tab} label={tab}/>
          )
        })}
      </MuiTabs>
    </Box>
  )
}

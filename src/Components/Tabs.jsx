import React, {useState} from 'react'
import {styled} from '@mui/material/styles'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'


const CustomTabs = styled(Tabs)({
  'borderBottom': '1px solid #e8e8e8',
  '& .MuiTabs-indicator': {
    backgroundColor: '#1890ff',
  },
})


const CustomTab = styled((props) => <Tab disableRipple {...props}/>)(({theme}) => ({
  'textTransform': 'none',
  'minWidth': 0,
  [theme.breakpoints.up('sm')]: {
    minWidth: 0,
  },
  'fontWeight': theme.typography.fontWeightRegular,
  'marginRight': theme.spacing(1),
  'color': 'rgba(0, 0, 0, 0.85)',
  'fontFamily': [
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"',
  ].join(','),
  '&:hover': {
    color: '#40a9ff',
    opacity: 1,
  },
  '&.Mui-selected': {
    color: '#1890ff',
    fontWeight: theme.typography.fontWeightMedium,
  },
  '&.Mui-focusVisible': {
    backgroundColor: '#d1eaff',
  },
}))


/**
 * Styled Tabs copnent.
 *
 * @property {Array} tabs array of tabs
 * @return {React.Component}
 */
export default function BldrsTabs({tabs, actionCb}) {
  const [value, setValue] = useState(0)

  const handleChange = (event, newValue) => {
    setValue(newValue)
  }

  return (
    <Box sx={{width: '100%'}}>
      <Box sx={{bgcolor: '#fff'}}>
        <CustomTabs value={value} onChange={handleChange} aria-label="ant example">
          <CustomTab label="Tab 1"/>
          <CustomTab label="Tab 2"/>
          <CustomTab label="Tab 3"/>
        </CustomTabs>
        <Box sx={{p: 3}}/>
      </Box>
    </Box>
  )
}

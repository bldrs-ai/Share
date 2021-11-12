import React from 'react';

import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';

import { Info } from './info';


function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role='tabpanel'
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}


const MobileTabs = ({
  viewer,
  element,
  onElementSelect
}) => {

  const [value, setValue] = React.useState(0);
  const handleChange = (event, newValue) => {
    setValue(newValue);
  };


  function a11yProps(index) {
    return {
      id: `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
  }


  return (
      <Tabs
        value = {value}
        onChange = {handleChange}
        aria-label = 'simple tabs example'
      >
        <Tab label = 'Tree' {...a11yProps(0)} />
        <Tab label = 'Info' {...a11yProps(1)} />
      </Tabs>
      <TabPanel value = {value} index = {0}>
      </TabPanel>
      <TabPanel value = {value} index = {1}>
        <Info viewer = {viewer} element = {element} />
      </TabPanel>
  );
};

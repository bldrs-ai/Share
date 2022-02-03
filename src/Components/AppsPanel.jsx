import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Apps from '../assets/Apps.svg'
import AppConverter from '../assets/AppConverter.svg'
import AppOptimizer from '../assets/AppOptimizer.svg'
import AppRelocator from '../assets/AppConverter.svg'
import AppSplitter from '../assets/AppConverter.svg'
import AppIcon from '../assets/AppIcon_.svg'
import MenuButton from './MenuButton'



const useStyles = makeStyles({
  panel: {
    position:'absolute',
    top: 72,
    right:10,
    width: '200px',
    height:'220px',
    fontFamily: 'Helvetica',
    backgroundColor:'black',
    overFlow:'hidden',
    zIndex:2000,
    '@media (max-width: 900px)': {
      width: '200px',
      height:'200px',
    },
    "& h1, & h2": {
      color: '#696969',
      fontWeight:200,
      fontSize:'16px'
    },
    "& p, & li": {
      fontWeight:200
    },

  },
  icon:{
    width:'30px',
    height:'30px',
    cursor:'pointer'
  },
  appIcon:{
    width:'40px',
    height:'40px',
    cursor:'pointer',
    padding:'1px'
  },
  closeButton: {
    float:'right',
    cursor:'pointer',
    marginTop:'8px',
    "& svg": {
        width:'24px',
        height:'20px',
    },
  },
  appsContainer:{
    display:'flex',
    justifyContent:'space-around',
    alignItems:'space-around',
    width:'100%',
    height:'100%',
    overFlow:'hidden'
  },
  panelContainer:{
    display:'flex',
    flexDirection:'column',
    justifyContent:'flex-start',
    alignItems:'flex-start ',
    padding:'10px',
    width:'90%',
    height:'100%',
    backgroundColor:'#202020',
    borderRadius:'4px',
    overflow:'scroll',
  }
});


const AppsControl = ({offsetTop}) => {
  const [open, setOpen]=React.useState(false);
 const classes = useStyles();
  return (
    <div >
     <IconButton
        aria-label='About'
        onClick={() => { setOpen(!open) }}
      >
     <Apps className = {classes.icon}/>
    </IconButton>
      {open && <AboutPanel openToggle={()=>{setOpen(!open)}} offsetTop={offsetTop}/>}
    </div>);
};


const AboutPanel = ({openToggle, offsetTop}) => {
  const classes = useStyles({offsetTop:offsetTop});

  return (
    <Paper elevation={3} className={classes.panel}>
      <div className = {classes.panelContainer}>
        <div style = {{ marginLeft:'10px', color: '#7D7D7D', marginTop:'10px', marginBottom:'20px'}}> Apps are coming soon..</div>
        <div className = {classes.appsContainer}>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
        </div>
        <div className = {classes.appsContainer}>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
        </div>
        <div className = {classes.appsContainer}>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
        </div>
        <div className = {classes.appsContainer}>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
        </div>
        <div className = {classes.appsContainer}>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
          <AppOptimizer className={classes.appIcon}/>
        </div>
        <div className = {classes.appsContainer}>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
          <AppSplitter className={classes.appIcon}/>
        </div>
      </div>
    </Paper>
);
};

export {
  AppsControl
}

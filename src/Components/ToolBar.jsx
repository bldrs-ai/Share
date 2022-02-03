import React from 'react';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { makeStyles } from '@mui/styles';
import { AboutIcon } from './AboutPanel';
import LoginMenu from './LoginMenu';
import Logo from '../assets/Logo.svg';
import Open from '../assets/Open.svg';
import Tooltip from '@mui/material/Tooltip';
import MultipleSelect from './DropDownToolbar'
import Toggle from './Toggle'

const ToolBar = ({ fileOpen, offsetTop, toggleTheme }) => {
  const classes = useStyles();
  return (
    <AppBar
      elevation={0}
      position='absolute'
      color='primary'
      className = {classes.appBar}>
      <Toolbar variant='regular' className={classes.toolBar} >
        <div className={classes.leftContainer} >
          <Typography className={classes.title}>
            <Logo className = {classes.logo}/>
          </Typography>
          <div className = {classes.models}>
            <IconButton onClick={fileOpen}>
              <Open className = {classes.icon}/>
            </IconButton>
          </div>
            <Tooltip title='Select a model'>
              <MultipleSelect/>
            </Tooltip>
        </div>
        <div className = {classes.rightContainer}>
          <Toggle onChange={()=>{
                toggleTheme()
              }}/>
          <AboutIcon offsetTop = {offsetTop}/>
          <LoginMenu />
        </div>
      </Toolbar>
    </AppBar>
  );
};


const useStyles = makeStyles({
  appBar:{
    position: 'absolute',
    zIndex:2000,
  },
  title: {
    display: 'flex',
    justifyContent:'center',
    fontSize: 20,
    paddingRight:'10px',
  },
  toolBar:{
    borderBottom: '1px solid 	#696969',
    display: 'flex',
    justifyContent: 'space-between',
  },
  leftContainer:{
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '190px',
  },
  logo:{
    width: '120px',
    height: '40px',
  },
  rightContainer:{
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width:'194px',
  },
  about:{
    height: 18,
    fontFamily: 'Helvetica',
    fontSize: 14,
    fontWeight: 200,
    color: 'grey',
    cursor: 'pointer',
    borderBottom: '1px solid #737373'
  },
  models:{
    '@media (max-width: 900px)': {
      display:'none'
    },
  },
  icon:{
    width:'40px',
    height:'40px',
    cursor:'pointer'
  },
});

export default ToolBar;

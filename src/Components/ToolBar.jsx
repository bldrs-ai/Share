import React from 'react';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { makeStyles } from '@mui/styles';
import { AboutIcon } from './AboutPanel';
import LoginMenu from './LoginMenu';
import Logo from '../assets/Logo.svg';
import Folder from '../assets/Folder.svg';
import { alpha, styled } from '@mui/material/styles';
import { grey } from '@mui/material/colors';


const useStyles = makeStyles({
  appBar:{
    position: 'absolute'
  },
  title: {
    display: 'flex',
    justifyContent:'center',
    fontSize: 20,
    paddingRight:'20px',
  },
  toolBar:{
    borderBottom: '1px solid 	#696969',
    backgroundColor: '#D8D8D8',
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
  folder:{
    width: '40px',
    height: '40px'
  },
  rightContainer:{
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width:'144px',
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
});


const ToolBar = ({ fileOpen, offsetTop }) => {
  const classes = useStyles();
  return (
    <AppBar
      elevation={0}
      position='absolute'
      color='primary'
      className = {classes.appBar}>
      <Toolbar variant='regular' className={classes.toolBar} >
        <div className={classes.leftContainer} >
          <Typography variant='h6' className={classes.title}>
            <Logo className = {classes.logo}/>
          </Typography>
          <IconButton
            edge='start'
            color='secondary'
            aria-label='menu'
            onClick={fileOpen}
          >
            <Folder className = {classes.folder}/>
          </IconButton>
        </div>
        <div className = {classes.rightContainer}>
          <AboutIcon offsetTop = {offsetTop}/>
          <LoginMenu />
      </div>
      </Toolbar>
    </AppBar>
  );
};

export default ToolBar;

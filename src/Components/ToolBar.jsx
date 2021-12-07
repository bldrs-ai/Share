import React from 'react';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { makeStyles } from '@mui/styles';
import LoginMenu from './LoginMenu';
import Logo from '../assets/Logo.svg';
import Folder from '../assets/Folder.svg';

const useStyles = makeStyles((theme) => ({
  title: {
    flexGrow: 1,
    color: 'WhiteSmoke',
    fontSize: 20,
    marginRight: '20px',
  },
  toolBar:{
    borderBottom: '1px solid 	#696969',
    backgroundColor: '#D8D8D8',
    display: 'flex',
    justifyContent: 'space-between',
  },
  logoWrapper:{
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '120px',
  }
}));

const ToolBar = ({ fileOpen, onClickShare }) => {
  const classes = useStyles();
  return (
    <AppBar
      elevation={0}
      position='absolute'
      color='primary'
      style={{
        position: 'absolute',
      }}
    >
      <Toolbar
        variant='regular'
        className={classes.toolBar}
      >
        <div
        className={classes.logoWrapper}
        >
          <Typography variant='h6' className={classes.title}>
            <Logo
              style={{
                width: '120px',
                height: '50px',
              }}
            />
          </Typography>

          <IconButton
            edge='start'
            color='secondary'
            aria-label='menu'
            onClick={fileOpen}
            style={{ marginLeft: 20 }}
          >
            <Folder
              style={{
                width: '40px',
                height: '40px',
              }}
            />
          </IconButton>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            position: 'relative',
            left:10,
          }}
        >
          {<LoginMenu />}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default ToolBar;

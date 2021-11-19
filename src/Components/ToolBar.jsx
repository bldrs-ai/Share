import React from 'react';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { makeStyles } from '@mui/styles';
import LoginMenu from './LoginMenu';

const useStyles = makeStyles((theme) => ({
  title: {
    flexGrow: 1,
    color: 'WhiteSmoke',
    fontSize: 20,
    marginRight: '20px',
  },
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
        style={{
          borderBottom: '1px solid 	#585858',
          backgroundColor: '#787878',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            width: '120px',
          }}
        >
          <Typography variant='h6' className={classes.title}>
            BLDRS
          </Typography>

          <IconButton
            edge='start'
            color='secondary'
            aria-label='menu'
            onClick={fileOpen}
            style={{color: 'white', textDecoration: 'underline', paddingLeft: '2em', fontSize: '1em'}}
          >
            Open
          </IconButton>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/*<IconButton
            edge='start'
            color='secondary'
            aria-label='menu'
            style={{
              position: 'relative',
              right: 10,
              width: 25,
              height: 25,
            }}
          >
            {<CommentIcon
              style={{
                width: 20,
                height: 20,
                color: 'whiteSmoke',
              }}
              />
             </IconButton>
          */}
          {/*<ShareButton name={'Share'} onClick={onClickShare} />*/}
          {<LoginMenu />}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default ToolBar;

import React from 'react';
import Drawer from '@mui/material/Drawer';
import Close from '../assets/Close.svg';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  drawerPaper:{
    marginTop:'65px',
    height:'200px',
    width:'350px',
    borderRadius:'0px',
    marginLeft:'20px',
    zIndex: 10,
    overflow:'hidden',
    '@media (max-width: 900px)': {
    width:'auto',
    borderRadius:'8px',
    marginLeft:'0px',
    },
  },
  headerWrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '10px 10px',
    '@media (max-width: 900px)': {
      paddingBottom: '10px',
      borderBottom:'1px solid lightgrey',
    }
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: '200px',
    color: 'lightgray',
  },
  close: {
    height: '20px',
    width: '20px',
    zIndex: 1000,
    cursor: 'pointer',
  },
  contentContainer:{
    display:'flex',
    flexDirection:'row',
    justifyContent:'center',
    '@media (max-width: 900px)': {
      maxHeight:'200px',
      overflow:'auto'
    },
  }
});


const SideMenu = ({
  title,
  onClose,
  content,
  open,
}) => {
  const classes = useStyles();
  const anchor = window.innerWidth > 500?'right':'bottom'

  return (
    <>
      <React.Fragment key={'right'}>
        <Drawer
          elevation={3}
          BackdropProps={{ invisible: true }}
          anchor={anchor}
          open={open}
          variant='persistent'
          docked
          classes={{paper: classes.drawerPaper}}
        >
          <div className={classes.headerWrapper} onClick={onClose}>
            <div className={classes.title}>{title}</div>
            <Close className={classes.close} />
          </div>
          <div className = {classes.contentContainer}>
            {content}
          </div>
        </Drawer>
      </React.Fragment>
    </>
  );
};

export default SideMenu;

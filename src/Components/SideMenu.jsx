import React from 'react';
import Drawer from '@mui/material/Drawer';
import Close from '../assets/Close.svg';
import { makeStyles } from '@mui/styles';
import { cardClasses } from '@mui/material';

const useStyles = makeStyles({
  closeWrapper: {
    textTransform: 'uppercase',
    marginTop: 25,
    marginRight: 30,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    // border: '1px solid red',
    '@media (max-width: 780px)': {
      position: 'relative',
      marginTop: 25,
      marginLeft: 0,
      right: '-1px',
    },
  },
  close: {
    marginTop: 0,
    marginRight: 0,
    height: 60,
    width: 50,
    zIndex: 1000,
    cursor: 'pointer',
  },
  singin: {
    fontSize: 30,
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    margin: '30px 30px 28px 50px',
    cursor: 'pointer',
    '@media (max-width: 780px)': {
      fontSize: 50,
      margin: '50px 10px 28px 40px',
    },
  },
  buildSpace: {
    fontSize: 60,
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    margin: '5px 40px 30px 50px',
    textDecoration: 'underline',
    cursor: 'pointer',
    '@media (max-width: 780px)': { fontSize: 50, margin: '0px 20px 28px 40px' },
  },
  contactus: {
    fontSize: 60,
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    margin: '290px 30px 30px 50px',
    cursor: 'pointer',
    '@media (max-width: 780px)': {
      fontSize: 50,
      margin: '210px 10px 28px 40px',
    },
  },
  paper: {
    width: 350,
    background: 'none',
    position: 'fixed',
    right: 0,
    top: 50,
    marginTop: '65px',
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '30px',
    fontWeight: 600,
    marginLeft: '10px',
    color: 'lightgray',
  },
  close:{
    width: '30px',
    marginRight: '8px'
  }
});

const SideMenu = ({
  title,
  open,
  onClose,
  viewer,
  element,
  anchor,
  content,
}) => {
  const classes = useStyles();

  return (
    <>
      <React.Fragment key={'right'}>
        <Drawer
          BackdropProps={{ invisible: true }}
          anchor={anchor}
          open={open}
          variant='persistent'
          docked
          classes={{
            paper: classes.paper,
            paperAnchorBottom: classes.modal,
          }}
        >
          <div className={classes.closeWrapper} onClick={() => onClose()}>
            <div className={classes.title}>{title}</div>
            <Close className={classes.close} />
          </div>
          {content}
        </Drawer>
      </React.Fragment>
    </>
  );
};

export default SideMenu;

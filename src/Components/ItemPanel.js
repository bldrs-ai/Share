import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';

import ItemProperties from './ItemProperties.js';


const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 240,
    height: 300,
    border: 'none',
    marginLeft: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
    top: 152,
    right: 20,
    '@media (max-width: 900px)': {
      height: '50%',
      top: 140,
      // width: 400,
      left: 62,
    },
  },
  paper: {
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    height: '50px',
    width: '160px',
  },
}));


const ItemPanel = ({viewer, element}) => {
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        height: 'auto',
        position: 'absolute',
      }}
    >
      <Paper
        elevation={3}
        className={classes.paper}
        style={{
          position: 'absolute',
          width: 'auto',
          height: 'auto',
          top: '0px',
          right: '0px',
          minHeight: '20%',
        }}
      >
        <ItemProperties
          viewer = {viewer}
          element = {element} />
      </Paper>
    </div>
  );
};


export default ItemPanel;

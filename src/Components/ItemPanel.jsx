import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';


const useStyles = makeStyles((theme) => ({
  itemPanel: {
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
    height: 'auto',
    position: 'absolute',
  },
  paper: {
    position: 'absolute',
    top: '0px',
    right: '0px',
    display: 'flex',
    flexDirection: 'column',
    height: '50px',
    width: '160px',
    minHeight: '20%',
    width: 'auto',
    height: 'auto',
    overflow: 'auto',
  },
}));


const ItemPanel = ({viewer, element}) => {
  const classes = useStyles();
  return (
    <div
      className={classes.itemPanel}
    >
      <Paper
        elevation={3}
        className={classes.paper}
      >
        <ItemProperties
          viewer = {viewer}
          element = {element} />
      </Paper>
    </div>
  );
};


export default ItemPanel;

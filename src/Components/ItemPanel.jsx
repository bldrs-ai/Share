import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';

const useStyles = makeStyles((theme) => ({
  itemPanel: {
    width: 300,
    height: 'auto',
    border: 'none',
    marginLeft: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
    top: 140,
    right: 20,
    height: 'auto',
    position: 'absolute',
  },
  paper: {
    position: 'absolute',
    top: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    height: 400,
    width: 400,
    overflow: 'auto',
  },
  panelTitle: {
    fontFamily: 'Helvetica',
    fontSize: 20,
    fontWeight:600,
    marginTop: 10,
    marginBottom:10,
    marginLeft:10,
    color: '#D8D8D8',
  },
}));


const ItemPanel = ({viewer, element}) => {
  const classes = useStyles();
  return (
    <div className={classes.itemPanel}>
      <Paper
        elevation={3}
        className={classes.paper}
      >
        <div className = {classes.panelTitle}>Properties</div>
        <ItemProperties
          viewer = {viewer}
          element = {element} />
      </Paper>
    </div>
  );
};


export default ItemPanel;

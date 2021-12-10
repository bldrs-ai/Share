import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';
import Close from '../assets/Close.svg'


const useStyles = makeStyles((theme) => ({
  paper: {
    fontFamily: 'Helvetica',
    padding: '1em',
    "& h1, & h2": {
      color: '#696969',
    },
    "& h1": {
      marginTop: 0
    }
  },
  close:{
    float:'right',
    cursor:'pointer',
    "& svg": {
        width:'20px',
        height:'20px',
    },
  }
}));

const ShortcutsPanel = ({close}) => {
  const classes = useStyles();
  return (
      <Paper elevation={3} className={classes.paper}>
        <div className = {classes.close}onClick = {close}><Close/></div>
        <h1>ShortCuts</h1>
        <ul>
          <li>Q - Add Section Plane</li>
          <li>W - Delete Section Plane</li>
          <li>A - Clear Selection</li>
        </ul>
      </Paper>
  );
};

export default ShortcutsPanel;

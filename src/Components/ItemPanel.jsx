import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';
import Close from '../assets/Close.svg'


const useStyles = makeStyles(() => ({
  paper: {
    height: '400px',
    width: '400px',
    overflow: 'auto',
  },
  titleContainer: {
    display:'flex',
    flexDirection:'row',
    justifyContent:'space-between',
    alignItems:'center'
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '24px',
    fontWeight:600,
    marginTop: '10px',
    marginLeft:'10px',
    marginBottom:'10px',
    color: '#D8D8D8',
  },
  close: {
    width:'24px',
    height:'24px',
    marginRight:'10px',
    cursor:'pointer'
  },
}));

const ItemPanel = ({viewer, element, close}) => {
  const classes = useStyles();
  return (
      <Paper elevation={3} className={classes.paper}>
        <div className = {classes.titleContainer}>
          <div className = {classes.title}>Properties</div>
          <Close className = {classes.close} onClick = {close}/>
        </div>
        <ItemProperties viewer = {viewer} element = {element} />
      </Paper>
  );
};


export default ItemPanel;

import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';
import Close from '../assets/Close.svg'


const useStyles = makeStyles((theme) => ({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '500px',
    margin: '0 auto',
    fontFamily: 'Helvetica',
    padding: '1em',
    "& h1, & h2": {
      color: '#696969',
    },
    "& h1": {
      marginTop: 0
    }
  },
  closeButton: {
    float:'right',
    cursor:'pointer',
    "& svg": {
        width:'20px',
        height:'20px',
    },
  }
}));


const AboutIcon = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <div onClick={() => { setOpen(!open) }}>
      About {open && <AboutPanel openToggle={()=>{setOpen(!open)}}/>}
    </div>);
};


const AboutPanel = ({openToggle}) => {
  const classes = useStyles();

  return (
    <Paper elevation={3} className={classes.panel}>
      <div className = {classes.closeButton} onClick={openToggle}><Close/></div>
      <h1>About</h1>
      <p><strong>BLDRS</strong> is a collaborative integration environment for IFC files.
        We are just getting started!  Stay tuned for the upcoming MVP release.</p>
      <p>BLDRS is an open source project. Please visit our repository:&nbsp;
      <a href = {'https://github.com/buildrs/Share'} target="_new">github.com/buildrs/Share</a></p>
      <h2>Features</h2>
      <ul>
        <li>Upload IFC file</li>
        <li>Select IFC element</li>
        <li>Get IFC element properties </li>
        <li>Share IFC element with the URL address</li>
      </ul>
    </Paper>);
};

export {
  AboutIcon
}

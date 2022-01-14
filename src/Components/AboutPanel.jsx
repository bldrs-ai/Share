import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Close from '../assets/Close.svg'
import Info from '../assets/Info.svg'
import InfoOn from '../assets/InfoOn.svg'



const useStyles = makeStyles({
  container:{
    position: 'absolute',
    top:'0px',
    left:'0px',
    width:'100%',
    height:'100vh',
    display:'flex',
    justifyContent:'center',
  },
  panel: {
    position:'relative',
    top: (props) => props.offsetTop,
    width: '460px',
    height:'320px',
    fontFamily: 'Helvetica',
    padding: '1em 1em',
    '@media (max-width: 900px)': {
      width: '86%',
      height:'360px',
    },
    "& h1, & h2": {
      color: '#696969',
      fontWeight:200
    },
    "& h1": {
      marginTop: 0,
      fontWeight:200
    },
    "& p, & li": {
      fontWeight:200
    },

  },
  icon:{
    width:'30px',
    height:'30px',
    cursor:'pointer'
  },
  closeButton: {
    float:'right',
    cursor:'pointer',
    marginTop:'8px',
    "& svg": {
        width:'24px',
        height:'20px',
    },
  }
});


const AboutIcon = ({offsetTop}) => {
  const [open, setOpen]=React.useState(false);
 const classes = useStyles();
  return (
    <div >
     <IconButton
        className={classes.iconButton}
        aria-label='About'
        onClick={() => { setOpen(!open) }}
      >
      {open ? <InfoOn className = {classes.icon}/> : <Info className = {classes.icon}/> }
      </IconButton>
      {open && <AboutPanel openToggle={()=>{setOpen(!open)}} offsetTop={offsetTop}/>}
    </div>);
};


const AboutPanel = ({openToggle, offsetTop}) => {
  const classes = useStyles({offsetTop:offsetTop});

  return (
  <div className = {classes.container}>
    <Paper elevation={3} className={classes.panel}>
      <div className = {classes.closeButton} onClick = {openToggle}><Close/></div>
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
    </Paper>
  </div>
);
};

export {
  AboutIcon
}

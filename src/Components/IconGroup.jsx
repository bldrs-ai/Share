import React from 'react';
import { makeStyles } from '@mui/styles';
import CutPlane from '../assets/CutPlane.svg'
import Delete from '../assets/Delete.svg'
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import {QuestionIcon} from './GuidePanel'
import {ShortcutsIcon} from './ShortcutsPanel'


const useStyles = makeStyles((theme) => ({
  container: {
    width:'40px',
    paddingTop:'5px',
    paddingBottom:'5px',
    height:'auto',
    display:'flex',
    flexDirection:'column',
    justifyContent:'space-around',
    alignItems:'center',
    borderRadius:'20px',
    backgroundColor:'#D8D8D8',
    boxShadow:'2px 2px 8px #888888',
    zIndex:2000,
    '@media (max-width: 900px)': {
      background:'none',
      boxShadow:'none',
    },
  },
  icon:{
    width:'30px',
    height:'30px',
    cursor:'pointer',
  }
}));


const IconGroup = ({placeCutPlane,  unSelectItem, toggleShortCutsPanel}) => {
const classes = useStyles();
const width = window.innerWidth;
return(
  <div>
    {width < 500 ?
    <div className = {classes.container}>
      <Tooltip title="Guide" placement="left">
        <IconButton aria-label="cutPlane" size="small">
          <QuestionIcon/>
        </IconButton>
      </Tooltip>
      <Tooltip title="Section Plane" placement="left">
        <IconButton onClick ={placeCutPlane} aria-label="cutPlane" size="small">
          <CutPlane className = {classes.icon}/>
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear Selection" placement="left">
        <IconButton onClick ={unSelectItem} aria-label="cutPlane" size="small">
          <Delete className = {classes.icon}/>
        </IconButton>
      </Tooltip>
    </div>:<div className = {classes.container}>
      <Tooltip title="Shortcuts" placement="left">
        <IconButton onClick ={toggleShortCutsPanel} aria-label="cutPlane" size="small">
          <ShortcutsIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear Selection" placement="left">
        <IconButton onClick ={unSelectItem} aria-label="cutPlane" size="small">
          <Delete className = {classes.icon}/>
        </IconButton>
      </Tooltip>
    </div>}
  </div>
)}

export default  IconGroup;


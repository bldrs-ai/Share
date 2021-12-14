import React from 'react';
import { makeStyles } from '@mui/styles';
import CutPlane from '../assets/CutPlane.svg'
import Delete from '../assets/Delete.svg'
import ShortCuts from '../assets/ShortCuts.svg'
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';


const useStyles = makeStyles((theme) => ({
  container: {
    width:'40px',
    height:'90px',
    backgroundColor:'#D8D8D8',
    display:'flex',
    borderRadius:'20px',
    flexDirection:'column',
    justifyContent:'space-around',
    alignItems:'center',
    boxShadow:'2px 2px 8px #888888',
    zIndex:2000,
  },
}));

const IconGroup = ({placeCutPlane,  unSelectItem, toggleShortCutsPanel}) => {
const classes = useStyles();
return(
    <div className = {classes.container}>
      <Tooltip title="ShortCuts" placement="left">
        <IconButton onClick ={toggleShortCutsPanel} aria-label="cutPlane" size="small">
          <ShortCuts style = {{width:'30px', height:'30px', cursor:'pointer'}}/>
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear Selection" placement="left">
        <IconButton onClick ={unSelectItem} aria-label="cutPlane" size="small">
          <Delete style = {{width:'30px', height:'30px', cursor:'pointer'}}/>
        </IconButton>
      </Tooltip>
    </div>
  )
}
export default  IconGroup;


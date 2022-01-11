import React, {useState} from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import ItemProperties from './ItemProperties';
import Close from '../assets/Close.svg'
import MenuButton from '../Components/MenuButton';


const useStyles = makeStyles({
  toggleButton: {
    position: 'absolute',
    top: (props) =>`${props.topOffset}px`,
    right: '20px',
    '@media (max-width: 900px)': {
      right: '10px',
    },
  },
  itemPanel:{
    position: 'absolute',
    top: '0px',
    right: '0px',
    minWidth: '250px',
    minHeight: '300px',
    overflow: 'auto',
    '@media (max-width: 900px)': {
      height: '400px',
      width: '350px',
    },
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
    fontWeight: 400,
    marginTop: '10px',
    marginLeft:'10px',
    marginBottom:'10px',
    color: '#696969',
  },
  close: {
    width:'24px',
    height:'24px',
    marginRight:'10px',
    cursor:'pointer'
  },
});

const ItemPanelButton = ({viewer, element, topOffset}) =>{
  const [showItemPanel,setShowItemPanel] = useState(false);
  const classes = useStyles({topOffset:topOffset});
  return(
      <div className={classes.toggleButton}>
        <MenuButton onClick={() => setShowItemPanel(!showItemPanel)} />
        {showItemPanel && <ItemPanel
          viewer = {viewer}
          element = {element}
          close = {()=>setShowItemPanel(false)}
          topOffset = {topOffset}
        />}
      </div>
  )
}

const ItemPanel = ({viewer, element, close, topOffset}) => {
  const classes = useStyles({topOffset:topOffset});
  return (
      <Paper elevation={3} className={classes.itemPanel}>
        <div className = {classes.titleContainer}>
          <div className = {classes.title}>Properties</div>
          <Close className = {classes.close} onClick = {close}/>
        </div>
        <ItemProperties viewer = {viewer} element = {element} />
      </Paper>
  );
};

export default ItemPanelButton;

import React from 'react'
import Drawer from '@mui/material/Drawer'
import Close from '../assets/Close.svg'
import {makeStyles} from '@mui/styles'

const useStyles = makeStyles({
  drawerPaper: {
    'marginTop': '65px',
    'width': '350px',
    'borderRadius': '0px',
    'marginLeft': '20px',
    'zIndex': 10,
    '@media (max-width: 900px)': {
      width: 'auto',
      height: '200px',
      borderRadius: '8px',
      marginLeft: '0px',
    },
  },
  drawerContainer: {
    height: '100%',
    width: 'auto',
    overflow: 'hidden',
  },
  headerWrapper: {
    'display': 'flex',
    'justifyContent': 'space-between',
    'alignItems': 'center',
    'margin': '16px 10px 8px 10px',
    'paddingBottom': '12px',
    'borderBottom': '1px solid #494747',
    '@media (max-width: 900px)': {
      paddingBottom: '10px',
      borderBottom: 'none',
    },
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: '200px',
    color: '#696969',
    marginLeft: '13px',
  },
  closeContainer: {
    'position': 'relative',
    'right': '20px',
    '@media (max-width: 900px)': {
      maxHeight: '200px',
      right: '20px',
      top: '2px',
    },
  },
  close: {
    'height': '20px',
    'width': '20px',
    'zIndex': 1000,
    'cursor': 'pointer',
    '@media (max-width: 900px)': {
      height: '30px',
      width: '30px',
    },
  },
  contentContainer: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'center',
    'overflow': 'auto',
    'height': '90%',
    '@media (max-width: 900px)': {
      maxHeight: '200px',
      overflow: 'auto',
    },
  },
})


const ItemPropertiesDrawer = ({
  title,
  onClose,
  content,
  open,
}) => {
  const classes = useStyles()
  const anchor = window.innerWidth > 500?'right':'bottom'

  return (
    <>
      <React.Fragment key={'right'}>
        <Drawer
          elevation={3}
          anchor={anchor}
          open={true || open}
          variant='persistent'
          classes={{paper: classes.drawerPaper}}
        >
          <div className ={classes.drawerContainer}>
            <div className={classes.headerWrapper} >
              <div className={classes.title}>{title}</div>
              <div className = {classes.closeContainer}>
                <Close className={classes.close} onClick={onClose}/>
              </div>
            </div>

            <div className = {classes.contentContainer}>
              {content}
            </div>
          </div>
        </Drawer>
      </React.Fragment>
    </>
  )
}

export default ItemPropertiesDrawer

import React from 'react'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import Close from '../assets/3D/Delete.svg'


/**
 * ItemPropertiesDrawer contains the ItemPanel and allows for
 * show/hide from the right of the screen.
 * @param {string} title Title for the drawer
 * @param {function} onClose Callback
 * @param {Object} content The contained ItemPanel
 * @return {Object} ItemPropertiesDrawer react component
 */
export default function ItemPropertiesDrawer({
  title,
  onClose,
  content,
}) {
  const classes = useStyles()
  const anchor = window.innerWidth > 500 ? 'right' : 'bottom'
  return (
    <Drawer
      elevation={4}
      anchor={anchor}
      variant='persistent'
      classes={{paper: classes.drawerPaper}}
      open={true}
    >
      <div className={classes.drawerContainer}>
        <div className={classes.headerWrapper} >
          <div className={classes.title}>{title}</div>
          <Close className={classes.close} onClick={onClose}/>
        </div>
        <div className={classes.contentContainer}>
          {content}
        </div>
      </div>
    </Drawer>
  )
}


const useStyles = makeStyles({
  drawerPaper: {
    'marginTop': '0px',
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
    'margin': '30px 10px 8px 10px',
    'paddingBottom': '12px',
    '@media (max-width: 900px)': {
      paddingBottom: '10px',
      borderBottom: 'none',
    },
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: 200,
    marginLeft: '13px',
    borderBottom: '1px solid grey',
  },
  closeContainer: {
    'position': 'relative',
    'right': '40px',
    'top': '6px',
    '@media (max-width: 900px)': {
      maxHeight: '200px',
      right: '20px',
      top: '2px',
    },
  },
  close: {
    'position': 'relative',
    'right': '20px',
    'height': '24px',
    'width': '24px',
    'zIndex': 1000,
    'cursor': 'pointer',
    '@media (max-width: 900px)': {
      height: '20px',
      width: '20px',
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


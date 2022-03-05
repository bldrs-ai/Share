import React from 'react'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import CloseIcon from '../assets/2D_Icons/Delete.svg'
import {useWindowDimensions} from './Hooks'


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
  const {width} = useWindowDimensions()
  const isLandscape = width > 500
  const anchor = isLandscape ? 'right' : 'bottom'
  const classes = useStyles({isLandscape: isLandscape})
  return (
    <Drawer
      open={true}
      anchor={anchor}
      variant='persistent'
      elevation={4}
      className={classes.drawer}>
      <div className={classes.headerBar}>
        <h1>{title}</h1>
        <TooltipIconButton
          title='Close properties'
          onClick={onClose}
          icon={<CloseIcon/>}/>
      </div>
      <div className={classes.content}>{content}</div>
    </Drawer>
  )
}


const useStyles = makeStyles((props) => ({
  drawer: {
    'height': '100%',
    'width': 'auto',
    'overflow': 'hidden',
    'fontFamily': 'Helvetica',
    '@media (max-width: 900px)': {
      width: 'auto',
      height: '200px',
      borderRadius: '8px',
      marginLeft: '0px',
    },
    '& > .MuiPaper-root': {
      width: (props) => props.isLandscape ? '320px' : 'auto',
      // This lets the h1 in ItemProperties use 1em padding but have
      // its mid-line align with the text in SearchBar
      padding: '4px 1em',
    },
    '& .MuiPaper-root': {
      marginTop: '0px',
      borderRadius: '0px',
      zIndex: 10,
    },
    '& h1, & h2': {
      fontSize: '1.2em',
      fontWeight: 200,
      marginLeft: '1em 0',
      borderBottom: '1px solid grey',
    },
  },
  headerBar: {
    'display': 'flex',
    'justifyContent': 'space-between',
    'alignItems': 'center',
    'margin': '1em 0',
    '@media (max-width: 900px)': {
      paddingBottom: '10px',
      borderBottom: 'none',
    },
  },
  content: {
    'overflow': 'auto',
    'height': '90%',
    '@media (max-width: 900px)': {
      maxHeight: '200px',
      overflow: 'auto',
    },
  },
}))


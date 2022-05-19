import React, {useEffect} from 'react'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import {MOBILE_WIDTH} from './Hooks'
import {preprocessMediaQuery} from '../utils/mediaQuery'
import useStore from '../utils/store'
import {PropertiesPanel, CommentsPanel} from './SideDrawerPanels'


/**
 * ItemPropertiesDrawer contains the ItemPanel and allows for
 * show/hide from the right of the screen.
 * @param {string} title Title for the drawer
 * @param {Object} content The contained ItemPanel
 * @param {function} onClose Callback
 * @return {Object} ItemPropertiesDrawer react component
 */
export default function SideDrawer() {
  const classes = useStyles()
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)

  useEffect(()=>{
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
    console.log('in the use effect')
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  return (
    <Drawer
      open={true}
      anchor={'right'}
      variant='persistent'
      elevation={4}
      className={classes.drawer}>
      <div className={classes.content}>
        <div className = {classes.container} style = { isCommentsOn ? {} : {display: 'none'} }>
          {isCommentsOn?<CommentsPanel/>:null}
        </div>
        <div style = {
          isCommentsOn ?
          {height: '5px',
            backgroundColor: 'cyan',
            width: '100%',
            marginTop: '15px',
            marginBottom: '5px'} :
          {display: 'none'} }/>
        <div className = {classes.container}>
          {isPropertiesOn?<PropertiesPanel/>:null }
        </div>
      </div>
    </Drawer>
  )
}


const useStyles = makeStyles((props) => (preprocessMediaQuery(MOBILE_WIDTH, {
  drawer: {
    '& > .MuiPaper-root': {
      'width': '20em',
      // This lets the h1 in ItemProperties use 1em padding but have
      // its mid-line align with the text in SearchBar
      'padding': '4px 1em',
      '@media (max-width: MOBILE_WIDTH)': {
        width: 'auto',
        height: '250px',
      },
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
      paddingBottom: '.5em',
      borderBottom: '1px solid lightGrey',
    },
  },
  headerBar: {
    'display': 'flex',
    'justifyContent': 'space-between',
    'alignItems': 'center',
    'margin': '1em 0',
    '@media (max-width: MOBILE_WIDTH)': {
      borderBottom: 'none',
      height: '20px',
    },
  },
  content: {
    'overflow': 'auto',
    'height': '90%',
    'marginTop': '20px',
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'space-between',
    '@media (max-width: MOBILE_WIDTH)': {
      overflow: 'auto',
    },
  },
  container: {
    height: '500px',
    overflow: 'scroll',
  },
})))

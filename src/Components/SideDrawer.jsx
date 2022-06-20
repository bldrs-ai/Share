import React, {useEffect} from 'react'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import {MOBILE_WIDTH} from './Hooks'
import {preprocessMediaQuery} from '../utils/mediaQuery'
import useStore from '../store/useStore'
import {PropertiesPanel} from './SideDrawerPanels'
import {useIsMobile} from './Hooks'
import MobileDrawer from './MobileDrawer'


/**
 * SideDrawer contains the ItemPanel and CommentPanel.
 * It is connected to the global store and controlled by isDrawerOpen property.
 * @return {Object} SideDrawer react component
 */
export default function SideDrawer() {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const classes = useStyles({divider: (isPropertiesOn), isPropertiesOn: isPropertiesOn})
  const isMobile = useIsMobile()

  useEffect(()=>{
    if (!isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isPropertiesOn, isDrawerOpen, closeDrawer])

  return (
    <>
      {
        isMobile && isDrawerOpen ?
        <MobileDrawer
          content={<PropertiesPanel/>}/>:
        <Drawer
          open={isDrawerOpen}
          anchor={'right'}
          variant='persistent'
          elevation={4}
          className={classes.drawer}>
          <div className={classes.content}>
            <div className = {classes.containerProperties}>
              {isPropertiesOn ? <PropertiesPanel/> : null }
            </div>
          </div>
        </Drawer>
      }
    </>

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
    'overflow': 'hidden',
    'height': '95%',
    'marginTop': '20px',
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'space-between',
    '@media (max-width: MOBILE_WIDTH)': {
      overflow: 'auto',
    },
  },
  container: {
    borderRadius: '5px',
    overflow: 'hidden',
  },
  containerNotes: {
    overflow: 'hidden ',
    borderRadius: '0px',
    borderBottom: '1px solid lightGrey',
  },
  containerProperties: {
    borderRadius: '5px',
    overflow: 'hidden',
    height: (props) => props.isPropertiesOn ? 'auto' : '50%',
  },
  divider: {
    height: '1px',
    width: '100%',
    marginTop: '2px',
    marginBottom: '2px',
    display: (props)=>props.divider ? 'block' : 'none',
  },
})))

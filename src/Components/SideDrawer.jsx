import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import {getHashParams} from '../utils/location'
import {preprocessMediaQuery} from '../utils/mediaQuery'
import useStore from '../store/useStore'
import MobileDrawer from './MobileDrawer'
import {MOBILE_WIDTH, useIsMobile} from './Hooks'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'


/**
 * SideDrawer contains the ItemPanel and CommentPanel and allows for
 * show/hide from the right of the screen.
 * it is connected to the global store and controlled by isDrawerOpen property.
 *
 * @return {object} SideDrawer react component
 */
export function SideDrawer({
  isDrawerOpen,
  closeDrawer,
  isCommentsOn,
  isPropertiesOn,
  setSelectedIssueId}) {
  const classes = useStyles({
    divider: (isCommentsOn && isPropertiesOn),
    isCommentsOn: isCommentsOn,
    isPropertiesOn: isPropertiesOn,
  })
  const isMobile = useIsMobile()


  useEffect(() => {
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  return (
    <>
      {isMobile && isDrawerOpen ?
        <MobileDrawer
          content={
            <div className={classes.content}>
              <div className={classes.containerNotes}>
                {isCommentsOn ? <NotesPanel/> : null}
              </div>
              <div className={classes.divider}/>
              <div className={classes.containerProperties}>
                {isPropertiesOn ? <PropertiesPanel/> : null}
              </div>
            </div>
          }
        /> :
        <Drawer
          open={isDrawerOpen}
          anchor={'right'}
          variant='persistent'
          elevation={4}
          className={classes.drawer}
        >
          <div className={classes.content}>
            <div className={classes.containerNotes}>
              {isCommentsOn ? <NotesPanel/> : null}
            </div>
            <div className={classes.divider}/>
            <div className={classes.containerProperties}>
              {isPropertiesOn ? <PropertiesPanel/> : null }
            </div>
          </div>
        </Drawer>
      }
    </>
  )
}


/**
 * SideDrawerWrapper is the container for the SideDrawer component.
 * it is loaded into the CadView, connected to the store and passes the props to the sideDrawer.
 * It makes it is possible to test Side Drawer outside of the cad view.
 *
 * @return {object} SideDrawer react component
 */
export default function SideDrawerWrapper() {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const location = useLocation()


  useEffect(() => {
    const issueHash = getHashParams(location, 'i')
    if (issueHash !== undefined) {
      const extractedCommentId = issueHash.split(':')[1]
      setSelectedIssueId(Number(extractedCommentId))
      openDrawer()
      turnCommentsOn()
    }
  }, [location, openDrawer, setSelectedIssueId, turnCommentsOn])


  return (
    <>
      {isDrawerOpen &&
        <SideDrawer
          isDrawerOpen={isDrawerOpen}
          closeDrawer={closeDrawer}
          isCommentsOn={isCommentsOn}
          isPropertiesOn={isPropertiesOn}
          openDrawer={openDrawer}
          setSelectedIssueId={setSelectedIssueId}
        />}
    </>
  )
}


export const SIDE_DRAWER_WIDTH = '31em'


const useStyles = makeStyles((props) => (preprocessMediaQuery(MOBILE_WIDTH, {
  drawer: {
    '::-webkit-scrollbar': {
      display: 'none',
    },
    '& > .MuiPaper-root': {
      'width': SIDE_DRAWER_WIDTH,
      // This lets the h1 in ItemProperties use 1em padding but have
      // its mid-line align with the text in SearchBar
      'padding': '4px 1em',
      '@media (max-width: MOBILE_WIDTH)': {
        width: '100%',
        height: '400px',
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
    'overflow': 'scroll',
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
    height: (p) => p.isPropertiesOn ? '50%' : '1200px',
    display: (p) => p.isCommentsOn ? '' : 'none',
    borderRadius: '0px',
    borderBottom: '1px solid lightGrey',
  },
  containerProperties: {
    borderRadius: '5px',
    overflow: 'hidden',
    display: (p) => p.isPropertiesOn ? '' : 'none',
    height: (p) => p.isCommentsOn ? '50%' : '98%',
  },
  divider: {
    height: '1px',
    width: '100%',
    marginTop: '2px',
    marginBottom: '2px',
    display: (p) => p.divider ? 'block' : 'none',
  },
})))

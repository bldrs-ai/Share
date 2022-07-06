import React, {useEffect} from 'react'
import Drawer from '@mui/material/Drawer'
import {makeStyles} from '@mui/styles'
import {MOBILE_WIDTH} from './Hooks'
import {preprocessMediaQuery} from '../utils/mediaQuery'
import useStore from '../store/useStore'
import {useIsMobile} from './Hooks'
import MobileDrawer from './MobileDrawer'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import {getHashParams} from '../utils/location'

/**
 * SideDrawer contains the ItemPanel and CommentPanel and allows for
 * show/hide from the right of the screen.
 * it is connected to the global store and controlled by isDrawerOpen property.
 * @return {Object} SideDrawer react component
 */
export function SideDrawer({
  isDrawerOpen,
  closeDrawer,
  isCommentsOn,
  isPropertiesOn,
  openDrawer,
  toggleIsCommentsOn,
  setSelectedIssueId}) {
  const classes = useStyles({divider: (isCommentsOn && isPropertiesOn), isCommentsOn: isCommentsOn, isPropertiesOn: isPropertiesOn})
  const isMobile = useIsMobile()


  useEffect(() => {
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])

  useEffect(() => {
    const issueHash = getHashParams(window.location, 'i')
    if (issueHash !== undefined) {
      const extractedCommentId = issueHash.split(':')[1]
      setSelectedIssueId(Number(extractedCommentId))
      openDrawer()
      toggleIsCommentsOn()
    }
  }, [])


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
                {isPropertiesOn ? <PropertiesPanel/> : null }
              </div>
            </div>
          }
        /> :
        <Drawer
          open={isDrawerOpen}
          anchor={'right'}
          variant='persistent'
          elevation={4}
          className={classes.drawer}>
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
 * @return {Object} SideDrawer react component
 */
export default function SideDrawerWrapper() {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  return (
    <>
      <SideDrawer
        isDrawerOpen={isDrawerOpen}
        closeDrawer={closeDrawer}
        isCommentsOn={isCommentsOn}
        isPropertiesOn={isPropertiesOn}
        openDrawer={openDrawer}
        toggleIsCommentsOn={toggleIsCommentsOn}
        setSelectedIssueId={setSelectedIssueId}
      />
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
    height: (props) => props.isPropertiesOn ? '50%' : '1200px',
    display: (props) => props.isCommentsOn ? '' : 'none',
    borderRadius: '0px',
    borderBottom: '1px solid lightGrey',
  },
  containerProperties: {
    borderRadius: '5px',
    overflow: 'hidden',
    display: (props) => props.isPropertiesOn ? '' : 'none',
    height: (props) => props.isCommentsOn ? '50%' : '1200px',
  },
  divider: {
    height: '1px',
    width: '100%',
    marginTop: '2px',
    marginBottom: '2px',
    display: (props) => props.divider ? 'block' : 'none',
  },
})))

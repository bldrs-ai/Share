import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Drawer from '@mui/material/Drawer'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../store/useStore'
import {getHashParams} from '../utils/location'
import {preprocessMediaQuery} from '../utils/mediaQuery'
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
}) {
  const classes = useStyles({
    divider: (isCommentsOn && isPropertiesOn),
    isCommentsOn: isCommentsOn,
    isPropertiesOn: isPropertiesOn,
  })
  const isMobile = useIsMobile()
  const theme = useTheme()


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
            <div
              sx={{
                height: isPropertiesOn ? '50%' : '100%',
                display: isCommentsOn ? '' : 'none',
                borderRadius: '0px',
                borderBottom: `1px solid ${theme.palette.highlight.heaviest}`,
              }}
            >
              {isCommentsOn ? <NotesPanel/> : null}
            </div>
            <div className={classes.divider}/>
            <div className={classes.containerProperties}>
              {isPropertiesOn ? <PropertiesPanel/> : null}
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
      if (!isDrawerOpen) {
        openDrawer()
        turnCommentsOn()
      }
    }
    // This address bug #314 by clearing selected issue when new model is loaded
    if (issueHash === undefined && isDrawerOpen) {
      setSelectedIssueId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedIssueId])


  return (
    <>
      {isDrawerOpen &&
        <SideDrawer
          isDrawerOpen={isDrawerOpen}
          closeDrawer={closeDrawer}
          isCommentsOn={isCommentsOn}
          isPropertiesOn={isPropertiesOn}
          openDrawer={openDrawer}
        />}
    </>
  )
}


export const SIDE_DRAWER_WIDTH = '31em'


const useStyles = makeStyles((theme, props) => (preprocessMediaQuery(MOBILE_WIDTH, {
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
  containerProperties: {
    borderRadius: '5px',
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

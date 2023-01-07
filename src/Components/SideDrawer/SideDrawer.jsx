import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import {useTheme} from '@mui/styles'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import {preprocessMediaQuery} from '../../utils/mediaQuery'
import MobileDrawer from '../MobileDrawer'
import {MOBILE_WIDTH, useIsMobile} from '../Hooks'
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
            <Box sx={preprocessMediaQuery(MOBILE_WIDTH, {
              position: 'relative',
              bottom: 0,
              height: 'auto',
              marginTop: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            })}
            >
              <Box
                sx={{
                  display: isCommentsOn ? 'block' : 'none',
                  height: isPropertiesOn ? '50%' : '100%',
                  borderRadius: '0px',
                  borderBottom: `1px solid ${theme.palette.primary.contrastText}`,
                  paddingTop: '20px',
                  overflowX: 'hidden',
                  overflowY: 'auto',
                }}
              >
                <NotesPanel/>
              </Box>
              <Box sx={{
                display: isPropertiesOn ? 'block' : 'none',
                height: isCommentsOn ? '50%' : '100%',
                borderRadius: '5px',
                overflowX: 'hidden',
                overflowY: 'auto',
              }}
              >
                <PropertiesPanel/>
              </Box>
            </Box>
          }
        /> :
        <Drawer
          open={isDrawerOpen}
          anchor={'right'}
          variant='persistent'
          elevation={4}
          PaperProps={{variant: 'control'}}
          sx={preprocessMediaQuery(MOBILE_WIDTH, {
            '& ::-webkit-scrollbar': {
              display: 'none',
            },
            '& > .MuiPaper-root': {
              width: SIDE_DRAWER_WIDTH,
              // This lets the h1 in ItemProperties use 1em padding but have
              // its mid-line align with the text in SearchBar
              padding: '1em',
            },
            '& .MuiPaper-root': {
              marginTop: '0px',
              borderRadius: '0px',
            },
          })}
        >
          <Box sx={preprocessMediaQuery(MOBILE_WIDTH, {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflowX: 'hidden',
            overflowY: 'auto',
          })}
          >
            <Box
              sx={{
                display: isCommentsOn ? 'block' : 'none',
                height: isPropertiesOn ? '50%' : '100%',
                borderRadius: '0px',
                borderBottom: `1px solid ${theme.palette.primary.contrastText}`,
                overflowX: 'hidden',
                overflowY: 'auto',
              }}
            >
              {isCommentsOn && <NotesPanel/>}
            </Box>
            <Box sx={{
              display: isPropertiesOn ? 'block' : 'none',
              height: isCommentsOn ? '50%' : '100%',
              borderRadius: '5px',
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
            >
              {isPropertiesOn && <PropertiesPanel/>}
            </Box>
          </Box>
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
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const location = useLocation()


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      if (!isDrawerOpen) {
        openDrawer()
        turnCommentsOn()
      }
    }

    // This address bug #314 by clearing selected issue when new model is loaded
    if (noteHash === undefined && isDrawerOpen) {
      setSelectedNoteId(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedNoteId])


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

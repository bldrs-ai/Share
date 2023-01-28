import React, {useEffect, useContext, useRef, useState, useCallback} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import OperationsGroup from '../../Components/OperationsGroup'
import {ColorModeContext} from '../../Context/ColorMode'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import {useIsMobile} from '../Hooks'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import {dayColor, nightColor} from '../../utils/constants'


/**
 * It is loaded into the CadView, connected to the store and passes the props to the sideDrawer.
 * It makes it is possible to test Side Drawer outside of the cad view.
 *
 * @param {Function} unSelectItem deselects currently selected element
 * @return {React.Component}
 */
export default function SideDrawer({unSelectItem}) {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const viewer = useStore((state) => state.viewer)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const setSidebarHeight = useStore((state) => state.setSidebarHeight)
  const isSidebarExpanded = useStore((state) => state.isSidebarExpanded)
  const toggleIsSidebarExpanded = useStore((state) => state.toggleIsSidebarExpanded)
  const location = useLocation()
  const isMobile = useIsMobile()
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)
  const sidebarRef = useRef(null)
  const [isXResizing, setIsXResizing] = useState(false)
  const [isYResizing, setIsYResizing] = useState(false)


  const startXResizing = useCallback(() => {
    setIsXResizing(true)
  }, [])


  const stopXResizing = useCallback(() => {
    setIsXResizing(false)
  }, [])


  const startYResizing = useCallback(() => {
    setIsYResizing(true)
  }, [])


  const stopYResizing = useCallback(() => {
    setIsYResizing(false)
  }, [])


  const onYResizerClick = useCallback((e) => {
    switch (e.detail) {
      case 1: { // single click
        break
      }
      // eslint-disable-next-line no-magic-numbers
      case 2: { // double click
        toggleIsSidebarExpanded()
        break
      }
      // eslint-disable-next-line no-magic-numbers
      case 3: { // triple click
        break
      }
      default: {
        break
      }
    }
  }, [toggleIsSidebarExpanded])


  const resize = useCallback(
      (mouseMoveEvent) => {
        if (isXResizing) {
        // eslint-disable-next-line no-magic-numbers
          let tempSidebarWidth = sidebarRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX + 4
          if (tempSidebarWidth > window.innerWidth) {
            tempSidebarWidth = window.innerWidth
          }
          setSidebarWidth(tempSidebarWidth)
        }
        if (isYResizing) {
          if (!isSidebarExpanded) {
            toggleIsSidebarExpanded()
          }
          // eslint-disable-next-line no-magic-numbers
          let tempSidebarHeight = mouseMoveEvent.clientY - sidebarRef.current.getBoundingClientRect().top - 4
          if (tempSidebarHeight > window.innerHeight) {
            tempSidebarHeight = window.innerHeight
          }
          setSidebarHeight(tempSidebarHeight)
        }
      },
      [isXResizing, isYResizing, setSidebarWidth, isSidebarExpanded, setSidebarHeight, toggleIsSidebarExpanded],
  )


  useEffect(() => {
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopXResizing)
    window.addEventListener('mouseup', stopYResizing)
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopXResizing)
      window.removeEventListener('mouseup', stopYResizing)
    }
  }, [resize, stopXResizing, stopYResizing])


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


  useEffect(() => {
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  return (
    <Box
      sx={{
        position: 'absolute',
        width: '100%',
        top: 0,
        left: 0,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {viewer &&
        <OperationsGroup
          unSelectItem={unSelectItem}
        />
      }
      {/* Sidebar */}
      <Box
        sx={{
          position: 'relative',
          display: isDrawerOpen ? 'flex' : 'none',
          width: isMobile ? '100vw' : sidebarWidth,
          minWidth: '8px',
          minHeight: '8px',
          maxHeight: isSidebarExpanded ? sidebarHeight ? sidebarHeight : '100vh' : 0,
          flexDirection: 'row',
          borderLeft: 'grey 1px solid',
          color: colorTheme.isDay() ? 'black' : 'lightGrey',
        }}
        ref={sidebarRef}
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* X Resizer */}
        <Box
          sx={{
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: '8px',
            justifySelf: 'flex-start',
            // eslint-disable-next-line no-magic-numbers
            display: (isMobile || !isSidebarExpanded || (isSidebarExpanded && sidebarHeight < 40 && sidebarHeight > 0)) ? 'none' : 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'col-resize',
            resize: 'horizontal',
            maxHeight: '100vh',
            backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '40px',
              backgroundColor: '#c1c3c5b4',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseDown={startXResizing}
          >
            {Array.from({length: 3}).map((v, i) =>
              <Box
                key={i}
                sx={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
                }}
              />,
            )}
          </Box>
        </Box>
        {/* Y Resizer */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            // eslint-disable-next-line no-magic-numbers
            display: sidebarWidth >= 40 ? 'flex' : 'none',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'row-resize',
            resize: 'vertical',
            width: '100%',
            backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
          }}
        >
          <Box
            sx={{
              width: '40px',
              height: '8px',
              backgroundColor: '#c1c3c5b4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseDown={startYResizing}
            onClick={onYResizerClick}
          >
            {Array.from({length: 3}).map((v, i) =>
              <Box
                key={i}
                sx={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
                }}
              />,
            )}
          </Box>
        </Box>
        {/* Content */}
        <Box sx={{
          flexDirection: 'column',
          flex: 1,
          maxHeight: '100%',
          overflowY: isSidebarExpanded ? 'auto' : 'hidden',
          backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
          paddingBottom: '8px',
        }}
        >
          <Box
            sx={{
              display: isCommentsOn ? 'block' : 'none',
              borderBottom: `${theme.palette.highlight.heaviest} 1px solid`,
              padding: '0 .5em',
            }}
          >
            {isCommentsOn && <NotesPanel/>}
          </Box>
          <Box
            sx={{
              display: isPropertiesOn ? 'block' : 'none',
              padding: '0 .5em',
            }}
          >
            {isPropertiesOn && <PropertiesPanel/>}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

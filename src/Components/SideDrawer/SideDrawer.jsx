import React, {useEffect, useContext, useRef, useState, useCallback} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import {useDoubleTap} from 'use-double-tap'
import OperationsGroup from '../../Components/OperationsGroup'
import {ColorModeContext} from '../../Context/ColorMode'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import {useIsMobile} from '../Hooks'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import {dayColor, MOBILE_HEIGHT, MOBILE_WIDTH, nightColor} from '../../utils/constants'


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
  const isSidebarXExpanded = useStore((state) => state.isSidebarXExpanded)
  const setIsSidebarXExpanded = useStore((state) => state.setIsSidebarXExpanded)
  const isSidebarYExpanded = useStore((state) => state.isSidebarYExpanded)
  const setIsSidebarYExpanded = useStore((state) => state.setIsSidebarYExpanded)
  const location = useLocation()
  const isMobile = useIsMobile()
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)
  const sidebarRef = useRef(null)
  const yResizerRef = useRef(null)
  const [isXResizing, setIsXResizing] = useState(false)
  const [isYResizing, setIsYResizing] = useState(false)


  const startXResizing = useCallback(() => {
    setIsXResizing(true)
  }, [])


  const startYResizing = useCallback(() => {
    setIsYResizing(true)
  }, [])


  const stopResizing = useCallback(() => {
    setIsXResizing(false)
    setIsYResizing(false)
  }, [])


  const onXResizerDblTap = useDoubleTap((e) => {
    setIsSidebarXExpanded(!isSidebarXExpanded)
  })


  const onYResizerDblTap = useDoubleTap((e) => {
    setIsSidebarYExpanded(!isSidebarYExpanded)
  })


  const resize = useCallback(
      (mouseMoveEvent) => {
        if (isXResizing) {
        // eslint-disable-next-line no-magic-numbers
          tempSidebarWidth = sidebarRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX + 4
          if (tempSidebarWidth < 0) {
            tempSidebarWidth = 0
          }
          if (tempSidebarWidth > window.innerWidth) {
            tempSidebarWidth = window.innerWidth
          }
          setSidebarWidth(tempSidebarWidth)
        }
        if (isYResizing) {
          if (isMobile) {
          // eslint-disable-next-line no-magic-numbers
            tempSidebarHeight = sidebarRef.current.getBoundingClientRect().bottom - mouseMoveEvent.clientY + 4
          } else {
          // eslint-disable-next-line no-magic-numbers
            tempSidebarHeight = mouseMoveEvent.clientY - sidebarRef.current.getBoundingClientRect().top - 4
          }
          if (tempSidebarHeight < 0) {
            tempSidebarHeight = 0
          }
          if (tempSidebarHeight > window.innerHeight) {
            tempSidebarHeight = window.innerHeight
          }
          setSidebarHeight(tempSidebarHeight)
        }
      },
      [isXResizing, isYResizing, setSidebarWidth, isMobile, setSidebarHeight],
  )


  useEffect(() => {
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [resize, stopResizing])


  useEffect(() => {
    const onResize = (e) => {
      if (e.target.innerWidth < sidebarWidth) {
        tempSidebarWidth = e.target.innerWidth
        setSidebarWidth(tempSidebarWidth)
      }
      if (e.target.innerHeight < sidebarHeight) {
        tempSidebarHeight = e.target.innerHeight
        setSidebarHeight(tempSidebarHeight)
      }
    }
    window.addEventListener('resize', onResize)
    const yResizer = yResizerRef.current
    const onTouchStart = (e) => {
      switch (e.touches.length) {
        case 1: // one finger
          startYResizing(true)
          break
        // eslint-disable-next-line no-magic-numbers
        case 2: // two finger
          break
        // eslint-disable-next-line no-magic-numbers
        case 3: // three finger
          break
        default:
          break
      }
    }
    yResizer.addEventListener('touchstart', onTouchStart)
    const onTouchEnd = (e) => {
      stopResizing()
    }
    yResizer.addEventListener('touchend', onTouchEnd)
    const onTouchMove = (e) => {
      switch (e.touches.length) {
        case 1: // one finger
          resize(e.touches[0])
          break
        // eslint-disable-next-line no-magic-numbers
        case 2: // two finger
          break
        // eslint-disable-next-line no-magic-numbers
        case 3: // three finger
          break
        default:
          break
      }
    }
    yResizer.addEventListener('touchmove', onTouchMove)
    return () => {
      window.removeEventListener('resize', onResize)
      yResizer.removeEventListener('touchstart', onTouchStart)
      yResizer.removeEventListener('touchend', onTouchEnd)
      yResizer.removeEventListener('touchmove', onTouchMove)
    }
  }, [resize, setSidebarHeight, setSidebarWidth, sidebarHeight, sidebarWidth, startYResizing, stopResizing])


  useEffect(() => {
    if (isSidebarXExpanded) {
      setSidebarWidth(tempSidebarWidth)
    } else {
      const defaultWidth = Math.min(window.innerWidth, MOBILE_WIDTH)
      setSidebarWidth(defaultWidth)
    }
    if (isSidebarYExpanded) {
      setSidebarHeight(tempSidebarHeight)
    } else {
      const defaultHeight = Math.min(window.innerHeight, MOBILE_HEIGHT)
      setSidebarHeight(defaultHeight)
    }
  }, [isSidebarXExpanded, isSidebarYExpanded, setSidebarHeight, setSidebarWidth])


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
          position: isMobile ? 'fixed' : 'relative',
          bottom: 0,
          left: 0,
          display: isDrawerOpen ? 'flex' : 'none',
          width: isMobile ? '100vw' : sidebarWidth,
          minWidth: '8px',
          height: isMobile ? sidebarHeight : '100vh',
          minHeight: '8px',
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
            display: (isMobile || !isSidebarYExpanded || (isSidebarYExpanded && sidebarHeight < 40)) ? 'none' : 'flex',
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
            data-testid="x_resizer"
            onMouseDown={startXResizing}
            {...onXResizerDblTap}
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
            // eslint-disable-next-line no-magic-numbers
            display: (sidebarWidth >= 40 && isMobile) ? 'flex' : 'none',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'row-resize',
            resize: 'vertical',
            width: '100%',
            backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
            ...(isMobile ? {
              top: 0,
            } : {
              bottom: 0,
            }),
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
            ref={yResizerRef}
            data-testid="y_resizer"
            onMouseDown={startYResizing}
            {...onYResizerDblTap}
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
          // eslint-disable-next-line no-magic-numbers
          overflowY: sidebarHeight > 40 ? 'auto' : 'hidden',
          backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
          ...(isMobile ? {
            paddingTop: '8px',
          } : {
            paddingBottom: '8px',
          }),
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


let tempSidebarWidth = MOBILE_WIDTH
let tempSidebarHeight = MOBILE_HEIGHT

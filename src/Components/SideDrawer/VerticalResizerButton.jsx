import React, {useEffect, useState, useCallback, useRef} from 'react'
import {useDoubleTap} from 'use-double-tap'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {MOBILE_HEIGHT} from '../../utils/constants'
import {isNumber} from '../../utils/strings'


/**
 * Grab button to for resizing SideDrawer vertically.
 *
 * @property {useRef} sidebarRef sidebar ref object.
 * @property {Function} setSidebarHeight sidebar width changing button.
 * @property {number} thickness resizer thickness in pixels.
 * @property {boolean} isOnTop resizer is on the top.
 * @property {string} sidebarHeight sidebar width (...px, ...vw).
 * @return {React.Component}
 */
export default function VerticalResizerButton({
  sidebarRef,
  setSidebarHeight,
  thickness = 10,
  isOnTop = true,
  sidebarHeight = MOBILE_HEIGHT,
}) {
  const [isResizing, setIsResizing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const resizerRef = useRef(null)
  const theme = useTheme()
  const gripButtonRatio = 0.5
  const gripSize = thickness * gripButtonRatio

  const startResizing = useCallback(() => {
    setIsResizing(true)
  }, [])


  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])


  const onResizerDblTap = useDoubleTap((e) => {
    setIsExpanded(!isExpanded)
  })


  const resize = useCallback(
      (mouseMoveEvent) => {
        if (isResizing) {
          if (isOnTop) {
          // eslint-disable-next-line no-magic-numbers
            expansionSidebarHeight = sidebarRef.current.getBoundingClientRect().bottom - mouseMoveEvent.clientY + (thickness / 2)
          } else {
          // eslint-disable-next-line no-magic-numbers
            expansionSidebarHeight = mouseMoveEvent.clientX - sidebarRef.current.getBoundingClientRect().top - (thickness / 2)
          }
          if (expansionSidebarHeight < 0) {
            expansionSidebarHeight = 0
          }
          if (expansionSidebarHeight > window.innerHeight) {
            expansionSidebarHeight = window.innerHeight
          }
          if (expansionSidebarHeight < thickness) {
            expansionSidebarHeight = thickness
          }
          setSidebarHeight(expansionSidebarHeight)
          setIsExpanded(true)
        }
      },
      [isResizing, isOnTop, setSidebarHeight, sidebarRef, thickness],
  )


  useEffect(() => {
    const onWindowResize = (e) => {
      if (e.target.innerHeight < expansionSidebarHeight) {
        expansionSidebarHeight = e.target.innerHeight
      }
      if (e.target.innerHeight < sidebarHeight) {
        setSidebarHeight(e.target.innerHeight)
      }
    }
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [resize, setSidebarHeight, sidebarHeight, stopResizing])


  useEffect(() => {
    const resizer = resizerRef.current
    const onTouchStart = (e) => {
      switch (e.touches.length) {
        case 1: // one finger
          startResizing(true)
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
    const onTouchEnd = (e) => {
      stopResizing()
    }
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
    resizer.addEventListener('touchstart', onTouchStart)
    resizer.addEventListener('touchend', onTouchEnd)
    resizer.addEventListener('touchmove', onTouchMove)
    return () => {
      resizer.removeEventListener('touchstart', onTouchStart)
      resizer.removeEventListener('touchend', onTouchEnd)
      resizer.removeEventListener('touchmove', onTouchMove)
    }
  }, [resize, setSidebarHeight, sidebarHeight, startResizing, stopResizing])


  useEffect(() => {
    if (isExpanded) {
      setSidebarHeight(expansionSidebarHeight)
    } else {
      const defaultHeight = isNumber(MOBILE_HEIGHT) ? Math.min(window.innerHeight, MOBILE_HEIGHT) : MOBILE_HEIGHT
      setSidebarHeight(defaultHeight)
    }
  }, [isExpanded, setSidebarHeight])


  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'row-resize',
        resize: 'vertical',
        ...(isOnTop ? {
          top: 0,
        } : {
          bottom: 0,
        }),
      }}
    >
      <Paper
        sx={{
          width: '150px',
          paddingTop: `10px`,
          paddingBottom: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${gripSize}px`,
          background: theme.palette.primary.background,
        }}
        elevation={0}
        ref={resizerRef}
        data-testid="y_resizer"
        onMouseDown={startResizing}
        {...onResizerDblTap}
      >
        {Array.from({length: 3}).map((v, i) =>
          <Box
            key={i}
            sx={{
              width: `${gripSize}px`,
              height: `${gripSize}px`,
              borderRadius: '3px',
              background: theme.palette.primary.contrastText,
              opacity: '0.3',
            }}
          />,
        )}
      </Paper>
    </Box>
  )
}


let expansionSidebarHeight = window.innerHeight

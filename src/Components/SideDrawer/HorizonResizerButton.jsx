import React, {useEffect, useState, useCallback, useRef} from 'react'
import {useDoubleTap} from 'use-double-tap'
import useStore from '../../store/useStore'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'
import {isNumber} from '../../utils/strings'


/**
 * Grab button to for resizing SideDrawer horizontally.
 *
 * @property {useRef} sidebarRef sidebar ref object.
 * @property {Function} setSidebarWidth sidebar width changing button.
 * @property {number} thickness resizer thickness in pixels.
 * @property {boolean} isOnLeft resizer is on the left.
 * @property {string} sidebarWidth sidebar width (...px, ...vw).
 * @return {React.Component}
 */
export default function HorizonResizerButton({
  sidebarRef,
  thickness = 100,
  isOnLeft = true,
}) {
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const sidebarWidthInitial = useStore((state) => state.sidebarWidthInitial)
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)

  const [isResizing, setIsResizing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const resizerRef = useRef(null)

  const theme = useTheme()

  const gripButtonRatio = 0.5
  const gripSize = thickness * gripButtonRatio
  const horizonPadding = (thickness - gripSize) / 2

  const startResizing = useCallback(() => {
    setIsResizing(true)
  }, [])


  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])


  const onResizerDblTap = useDoubleTap((e) => {
    setIsExpanded(!isExpanded)
  })


  const half = 0.5
  const resize = useCallback(
      (mouseMoveEvent) => {
        if (isResizing) {
          if (isOnLeft) {
            expansionSidebarWidth =
              sidebarRef.current.getBoundingClientRect().right -
              mouseMoveEvent.clientX +
              (thickness * half)
          } else {
            expansionSidebarWidth =
              mouseMoveEvent.clientX -
              sidebarRef.current.getBoundingClientRect().left -
              (thickness * half)
          }
          if (expansionSidebarWidth < 0) {
            expansionSidebarWidth = 0
          }
          if (expansionSidebarWidth > window.innerWidth) {
            expansionSidebarWidth = window.innerWidth
          }
          if (expansionSidebarWidth < thickness) {
            expansionSidebarWidth = thickness
          }
          setSidebarWidth(expansionSidebarWidth)
          setIsExpanded(true)
        }
      },
      [isResizing, isOnLeft, setSidebarWidth, sidebarRef, thickness],
  )


  useEffect(() => {
    const onWindowResize = (e) => {
      if (e.target.innerWidth < expansionSidebarWidth) {
        expansionSidebarWidth = e.target.innerWidth
      }
      if (e.target.innerWidth < sidebarWidth) {
        setSidebarWidth(e.target.innerWidth)
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
  }, [resize, setSidebarWidth, sidebarWidth, stopResizing])


  useEffect(() => {
    const resizer = resizerRef.current
    const onTouchStart = (e) => {
      switch (e.touches.length) {
        case 1: // one finger
          startResizing(true)
          break
        case 2: // two finger
          break
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
        case 2: // two finger
          break
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
  }, [resize, setSidebarWidth, sidebarWidth, startResizing, stopResizing])


  useEffect(() => {
    if (isExpanded) {
      setSidebarWidth(expansionSidebarWidth)
    } else {
      const defaultWidth =
        isNumber(sidebarWidthInitial) ?
        Math.min(window.innerWidth, sidebarWidthInitial) :
        sidebarWidthInitial
      setSidebarWidth(defaultWidth)
    }
  }, [isExpanded, sidebarWidthInitial, setSidebarWidth])


  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        resize: 'horizontal',
        ...(isOnLeft ? {
          left: 0,
        } : {
          right: 0,
        }),
      }}
    >
      <Box
        sx={{
          padding: `${gripSize}px ${horizonPadding}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${gripSize}px`,
          background: theme.palette.primary.background,
          cursor: 'col-resize',
        }}
        ref={resizerRef}
        data-testid="x_resizer"
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
      </Box>
    </Box>
  )
}


let expansionSidebarWidth = window.innerWidth

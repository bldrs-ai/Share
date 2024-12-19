import React, {ReactElement, useEffect, useState, useCallback, useRef} from 'react'
import {useDoubleTap} from 'use-double-tap'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'
import {disablePageTextSelect, reenablePageTextSelect} from '../../utils/event'
import {isNumber} from '../../utils/strings'


/**
 * Grab button to for resizing SideDrawer horizontally.
 *
 * @property {useRef} drawerRef drawer ref object.
 * @property {Function} setDrawerWidth drawer width changing button.
 * @property {number} thickness resizer thickness in pixels.
 * @property {boolean} isOnLeft resizer is on the left.
 * @property {string} drawerWidth drawer width (...px, ...vw).
 * @return {ReactElement}
 */
export default function HorizonResizerButton({
  drawerRef,
  thickness = 100,
  isOnLeft = true,
  drawerWidth,
  drawerWidthInitial,
  setDrawerWidth,
}) {
  const [isResizing, setIsResizing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const resizerRef = useRef(null)

  const theme = useTheme()

  const gripButtonRatio = 0.5
  const gripSize = thickness * gripButtonRatio
  const horizonPadding = (thickness - gripSize) / 2

  const startResizing = useCallback(() => setIsResizing(true), [])
  const stopResizing = useCallback(() => setIsResizing(false), [])
  const onResizerDblTap = useDoubleTap((e) => setIsExpanded(!isExpanded))

  useEffect(() => {
    if (isResizing) {
      disablePageTextSelect()
    } else {
      reenablePageTextSelect()
    }
    return () => reenablePageTextSelect()
  }, [isResizing])

  const half = 0.5
  const resize = useCallback(
    (mouseMoveEvent) => {
      let expansionDrawerWidth = window.innerWidth
      if (isResizing) {
        if (isOnLeft) {
          expansionDrawerWidth =
            drawerRef.current.getBoundingClientRect().right -
            mouseMoveEvent.clientX +
            (thickness * half)
        } else {
          expansionDrawerWidth =
            mouseMoveEvent.clientX -
            drawerRef.current.getBoundingClientRect().left -
            (thickness * half)
        }
        if (expansionDrawerWidth < 0) {
          expansionDrawerWidth = 0
        }
        if (expansionDrawerWidth > window.innerWidth) {
          expansionDrawerWidth = window.innerWidth
        }
        if (expansionDrawerWidth < thickness) {
          expansionDrawerWidth = thickness
        }
        setDrawerWidth(expansionDrawerWidth)
        // setIsExpanded(true)
      }
    },
    [isResizing, isOnLeft, setDrawerWidth, drawerRef, thickness],
  )


  useEffect(() => {
    let expansionDrawerWidth = window.innerWidth
    const onWindowResize = (e) => {
      if (e.target.innerWidth < expansionDrawerWidth) {
        expansionDrawerWidth = e.target.innerWidth
      }
      if (e.target.innerWidth < drawerWidth) {
        setDrawerWidth(e.target.innerWidth)
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
  }, [resize, setDrawerWidth, drawerWidth, stopResizing])


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
  }, [resize, setDrawerWidth, drawerWidth, startResizing, stopResizing])


  // Double-click on resizer switches to previous width
  useEffect(() => {
    const expansionDrawerWidth = window.innerWidth
    if (isExpanded) {
      setDrawerWidth(expansionDrawerWidth, isExpanded)
    } else {
      const width =
            isNumber(drawerWidthInitial) ?
            Math.min(window.innerWidth, drawerWidthInitial) :
            drawerWidthInitial
      setDrawerWidth(width, isExpanded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, drawerWidthInitial])


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
        data-testid={ID_RESIZE_HANDLE_X}
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


export const ID_RESIZE_HANDLE_X = 'resize-handle-x'

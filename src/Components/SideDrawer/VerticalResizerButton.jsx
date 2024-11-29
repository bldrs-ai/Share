import React, {ReactElement, useEffect, useState, useCallback, useRef} from 'react'
import {useDoubleTap} from 'use-double-tap'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import {useTheme} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {isNumber} from '../../utils/strings'


/**
 * Grab button to for resizing SideDrawer vertically.
 *
 * @property {useRef} sidebarRef sidebar ref object.
 * @property {number} thickness resizer thickness in pixels.
 * @property {boolean} isOnTop resizer is on the top.
 * @return {ReactElement}
 */
export default function VerticalResizerButton({
  sidebarRef,
  thickness = 10,
  isOnTop = true,
}) {
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const sidebarHeightInitial = useStore((state) => state.sidebarHeightInitial)
  const setSidebarHeight = useStore((state) => state.setSidebarHeight)

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


  const half = 0.5
  const resize = useCallback(
      (mouseMoveEvent) => {
        if (isResizing) {
          if (isOnTop) {
            expansionSidebarHeight =
              sidebarRef.current.getBoundingClientRect().bottom -
              mouseMoveEvent.clientY +
              (thickness * half)
          } else {
            expansionSidebarHeight =
              mouseMoveEvent.clientX -
              sidebarRef.current.getBoundingClientRect().top -
              (thickness * half)
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
  }, [resize, setSidebarHeight, sidebarHeight, startResizing, stopResizing])


  useEffect(() => {
    if (isExpanded) {
      setSidebarHeight(expansionSidebarHeight)
    } else {
      const defaultHeight =
        isNumber(sidebarHeightInitial) ?
        Math.min(window.innerHeight, sidebarHeightInitial) :
        sidebarHeightInitial
      setSidebarHeight(defaultHeight)
    }
  }, [isExpanded, setSidebarHeight, sidebarHeightInitial])


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
        elevation={0}
        ref={resizerRef}
        onMouseDown={startResizing}
        {...onResizerDblTap}
        sx={{
          width: '150px',
          paddingTop: `10px`,
          paddingBottom: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${gripSize}px`,
          background: theme.palette.secondary.main,
        }}
        data-testid='y_resizer'
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

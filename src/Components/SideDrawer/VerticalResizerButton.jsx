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
 * @property {useRef} drawerRef drawer ref object.
 * @property {number} thickness resizer thickness in pixels.
 * @property {boolean} isOnTop resizer is on the top.
 * @return {ReactElement}
 */
export default function VerticalResizerButton({
  drawerRef,
  thickness = 10,
  isOnTop = true,
}) {
  const drawerHeight = useStore((state) => state.drawerHeight)
  const drawerHeightInitial = useStore((state) => state.drawerHeightInitial)
  const setDrawerHeight = useStore((state) => state.setDrawerHeight)

  const [isResizing, setIsResizing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const resizerRef = useRef(null)

  const theme = useTheme()

  const gripButtonRatio = 0.6
  const gripSize = thickness * gripButtonRatio

  const startResizing = useCallback(() => setIsResizing(true), [])
  const stopResizing = useCallback(() => setIsResizing(false), [])
  const onResizerDblTap = useDoubleTap(() => setIsExpanded(!isExpanded))

  const half = 0.5
  const resize = useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        let newHeight = window.innerHeight
        if (isOnTop) {
          const btm = drawerRef.current.getBoundingClientRect().bottom
          const offset = (thickness * half)
          const cy = mouseMoveEvent.clientY
          newHeight = btm - cy + offset
        } else {
          const top = drawerRef.current.getBoundingClientRect().top
          newHeight = mouseMoveEvent.clientX - top - (thickness * half)
        }
        if (newHeight < 0) {
          newHeight = 0
        }
        if (newHeight > window.innerHeight) {
          newHeight = window.innerHeight
        }
        if (newHeight < thickness) {
          newHeight = thickness
        }
        setDrawerHeight(newHeight)
      }
    },
    [isResizing, isOnTop, setDrawerHeight, drawerRef, thickness],
  )


  useEffect(() => {
    let newHeight = window.innerHeight
    const onWindowResize = (e) => {
      if (e.target.innerHeight < newHeight) {
        newHeight = e.target.innerHeight
      }
      if (e.target.innerHeight < drawerHeight) {
        setDrawerHeight(e.target.innerHeight)
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
  }, [resize, setDrawerHeight, drawerHeight, stopResizing])


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
    const onTouchEnd = () => {
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
  }, [resize, setDrawerHeight, drawerHeight, startResizing, stopResizing])


  useEffect(() => {
    const newHeight = window.innerHeight
    if (isExpanded) {
      setDrawerHeight(newHeight)
    } else {
      const defaultHeight =
        isNumber(drawerHeightInitial) ?
          Math.min(window.innerHeight, drawerHeightInitial) :
          drawerHeightInitial
      setDrawerHeight(defaultHeight)
    }
  }, [isExpanded, setDrawerHeight, drawerHeightInitial])


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
          paddingBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${gripSize}px`,
          background: 'transparent',
        }}
        data-testid={ID_RESIZE_HANDLE_Y}
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


export const ID_RESIZE_HANDLE_Y = 'resize-handle-y'

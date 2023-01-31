import React, {useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'


/**
 * Grab button to for resizing SideDrawer.
 *
 * @property {React.Element} The sidebar controlled by this button's action.
 * @return {React.Component}
 */
export default function ResizerButton({sidebarRef}) {
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)

  const startResizing = React.useCallback(() => {
    setIsResizing(true)
  }, [])


  const stopResizing = React.useCallback(() => {
    setIsResizing(false)
  }, [])


  const resize = React.useCallback(
      (mouseMoveEvent) => {
        if (isResizing) {
          // eslint-disable-next-line no-magic-numbers
          setSidebarWidth(sidebarRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX + 4)
        }
      },
      [isResizing, setSidebarWidth, sidebarRef])


  useEffect(() => {
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [resize, stopResizing])


  const isMobile = useIsMobile()
  const theme = useTheme()
  return (
    <Box
      sx={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: '8px',
        justifySelf: 'flex-start',
        display: isMobile ? 'none' : 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'col-resize',
        resize: 'horizontal',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          background: theme.palette.primary.background,
          padding: '3px',
        }}
        onMouseDown={startResizing}
      >
        {Array.from({length: 3}).map((v, i) =>
          <Box
            key={i}
            sx={{
              width: '5px',
              height: '5px',
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

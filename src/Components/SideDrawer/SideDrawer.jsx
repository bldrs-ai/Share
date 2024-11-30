import React, {ReactElement, useRef} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import HorizonResizerButton from './HorizonResizerButton'
import VerticalResizerButton from './VerticalResizerButton'


/**
 * Container for Notes and Properties
 *
 * @property {boolean} isDrawerVisible State toggle for drawer state
 * @property {Array<ReactElement>} children Drawer content
 * @return {ReactElement}
 */
export default function SideDrawer({
  isDrawerVisible,
  drawerWidth,
  drawerWidthInitial,
  setDrawerWidth,
  isResizeOnLeft = true,
  dataTestId,
  children,
}) {
  // Only one bottom drawer, so accessed here instead of passed in
  const drawerHeight = useStore((state) => state.drawerHeight)
  const drawerHeightInitial = useStore((state) => state.drawerHeightInitial)
  const setDrawerHeight = useStore((state) => state.setDrawerHeight)
  const isMobile = useIsMobile()
  const theme = useTheme()
  const drawerRef = useRef(null)
  const resizeButtonThickness = 10
  const resizeMargin = isResizeOnLeft ? '0 0 0 1em' : '0 1em 0 0'
  return (
    <Box
      sx={Object.assign({
        display: isDrawerVisible ? 'flex' : 'none',
        flexDirection: 'row',
        flexGrow: 1,
      }, isMobile ? {
        width: '100%',
        height: drawerHeight,
      } : {
        top: 0,
        width: drawerWidth,
        height: '100vh',
        minWidth: '8px',
      })}
      data-testid={dataTestId}
    >
      <Paper
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderRadius: 0,
          backgroundColor: theme.palette.secondary.backgroundColor,
        }}
        ref={drawerRef}
      >
        {!isMobile &&
         <HorizonResizerButton
           drawerRef={drawerRef}
           thickness={resizeButtonThickness}
           isOnLeft={isResizeOnLeft}
           drawerWidth={drawerWidth}
           drawerWidthInitial={drawerWidthInitial}
           setDrawerWidth={setDrawerWidth}
         />}
        {isMobile &&
         <VerticalResizerButton
           drawerRef={drawerRef}
           thickness={resizeButtonThickness}
           isOnTop={true}
           drawerHeight={drawerHeight}
           drawerHeightInitial={drawerHeightInitial}
           setDrawerHeight={setDrawerHeight}
         />}
        <Box
          sx={{
            width: '100%',
            margin: resizeMargin,
            overflow: 'hidden',
            padding: isResizeOnLeft ? '0 1em 0 0' : '0 0 0 1em',
          }}
          data-testid='SideDrawer-OverflowHidden'
        >
          {children}
        </Box>
      </Paper>
    </Box>
  )
}

import React, {ReactElement, useRef} from 'react'
import {Box, Paper} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Hooks'
import useExistInFeature from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import HorizonResizerButton from './HorizonResizerButton'
import VerticalResizerButton from './VerticalResizerButton'


/**
 * Container for Notes and Properties
 *
 * @property {boolean} isDrawerVisible State toggle for drawer state
 * @property {number} drawerWidth In pixels
 * @property {number} drawerWidthInitial In pixels
 * @property {Function} setDrawerWidth In pixels
 * @property {boolean} [isResizeOnLeft] Position of the resize handle. Default: true
 * @property {string} [dataTestId] data-testid tag
 * @property {Array<ReactElement>} children Drawer content
 * @return {ReactElement}
 */
export default function SideDrawer({
  isDrawerVisible,
  drawerWidth,
  drawerWidthInitial,
  setDrawerWidth,
  children,
  isResizeOnLeft = true,
  dataTestId = 'SideDrawer',
}) {
  assertDefined(isDrawerVisible, drawerWidth, drawerWidthInitial, setDrawerWidth, isResizeOnLeft, dataTestId, children)
  // Only one bottom drawer, so accessed here instead of passed in
  const drawerHeight = useStore((state) => state.drawerHeight)
  const drawerHeightInitial = useStore((state) => state.drawerHeightInitial)
  const setDrawerHeight = useStore((state) => state.setDrawerHeight)
  const isMobile = useIsMobile()
  const theme = useTheme()
  // Workspace shell: the design system divides each pair of columns with
  // the same neutral hairline the ProjectsDrawer has on its right edge, so
  // a side drawer takes one on the edge that faces the centre pane. Desktop
  // only: on a phone this is the bottom sheet.
  const isWorkspaceEnabled = useExistInFeature('workspace')
  const centreEdge = isResizeOnLeft ? 'borderLeft' : 'borderRight'
  const drawerRef = useRef(null)
  const resizeButtonThickness = 10
  const resizeMargin = isResizeOnLeft ? '0 0 0 1em' : '0 1em 0 0'
  return (
    <Box
      sx={Object.assign({
        display: isDrawerVisible ? 'flex' : 'none',
        flexDirection: 'row',
        // Desktop drawers must be fixed-width flex items.
        // If they grow/shrink, resizing one drawer can push siblings off-screen.
        ...(isMobile ? {} : {flex: '0 0 auto', flexShrink: 0}),
      }, isMobile ? {
        width: '100%',
        height: drawerHeight,
      } : {
        top: 0,
        width: drawerWidth,
        // Under the workspace shell the drawer sits in a row beneath the
        // TopBar (#1992), so it fills that row rather than the window.
        height: isWorkspaceEnabled ? '100%' : '100vh',
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
          backdropFilter: theme.palette.secondary.backdropFilter,
          ...(isWorkspaceEnabled && !isMobile ?
            {[centreEdge]: `1px solid ${theme.palette.secondary.workspaceBorder}`} :
            {}),
        }}
        ref={drawerRef}
        data-testid='SideDrawer-Paper'
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
            margin: isMobile ? '1em 0 0 0' : resizeMargin,
            overflow: 'hidden',
            padding: isMobile ? '0px' : (isResizeOnLeft ? '0 1em 0 0' : '0 0 0 1em'),
          }}
          data-testid='SideDrawer-OverflowHidden'
        >
          {children}
        </Box>
      </Paper>
    </Box>
  )
}

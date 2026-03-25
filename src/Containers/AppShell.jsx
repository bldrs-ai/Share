import React, {ReactElement, useRef, useEffect} from 'react'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Components/Hooks'
import LeftToolbar from './LeftToolbar'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import TopBar from './TopBar'
import RightSideDrawers from './RightSideDrawers'
import NavCube from '../Components/NavCube/NavCube'
import useStore from '../store/useStore'


/**
 * Application shell — owns the top-level layout.
 * Children (CadView/Share) render inside the content pane.
 *
 * ┌──────────────────────────────────────────┐
 * │ TopBar (40px, fixed)                     │
 * ├────┬─────────┬──────────────┬────────────┤
 * │Left│ NavTree │  Content     │ Side Panel │
 * │Tool│ (opt)   │  (children)  │ (apps/etc) │
 * │bar │         │  flex:1      │            │
 * └────┴─────────┴──────────────┴────────────┘
 */
export default function AppShell({children, pathPrefix, branch}) {
  const isMobile = useIsMobile()
  const theme = useTheme()
  const vh = useStore((state) => state.vh)
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const contentRef = useRef(null)

  // Resize the Three.js renderer when the content pane changes size
  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(() => {
      if (!viewer) return
      const el = contentRef.current
      if (!el) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (w <= 0 || h <= 0) return
      try {
        const renderer = viewer.context.getRenderer()
        renderer.setSize(w, h)
        const camera = viewer.context.getCamera()
        if (camera.isPerspectiveCamera) {
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
      } catch {
        // viewer may not be ready
      }
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [viewer])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: isMobile ? `${vh}px` : '100vh',
      overflow: 'hidden',
    }}>
      {/* Row 1: TopBar */}
      {!isMobile && <TopBar/>}

      {/* Row 2: Main content row */}
      <div style={{
        display: 'flex',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Left toolbar */}
        {!isMobile && <LeftToolbar/>}

        {/* Left panel: nav tree */}
        {!isMobile && viewer && isModelReady && (
          <NavTreeAndVersionsDrawer
            pathPrefix={pathPrefix}
            branch={branch}
            selectWithShiftClickEvents={() => {}}
          />
        )}

        {/* Content pane — CadView renders here */}
        <div
          ref={contentRef}
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>

        {/* Right panels: apps, notes, properties */}
        {!isMobile && viewer && isModelReady && <RightSideDrawers/>}
      </div>

      {/* Overlays */}
      {!isMobile && <NavCube/>}
    </div>
  )
}

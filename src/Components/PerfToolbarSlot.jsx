import React, {ReactElement, useEffect, useRef} from 'react'
import Box from '@mui/material/Box'
import useExistInFeature from '../hooks/useExistInFeature'
import {mountPerfPanel, unmountPerfPanel} from '../utils/PerfMonitor'
import {useIsMobile} from './Hooks'


/**
 * Toolbar slot that docks the PerfMonitor panel left of the profile
 * icon when the `?feature=perf` flag is on.
 *
 * Returns `null` when:
 *   - the flag is off (no slot reserved, layout identical to before), or
 *   - the viewport is mobile (the SearchBar's `calc(100vw - 120px)` width
 *     assumes exactly two sibling buttons, so adding a third would
 *     overflow — perf data is still reachable via `window.perf` and a
 *     desktop window).
 *
 * The panel itself (canvases + sampling) is owned by
 * `src/utils/PerfMonitor.js`; this component just provides a React-owned
 * host element and bridges mount/unmount.  See DESIGN.md
 * "Render loop & perf monitor".
 *
 * @return {ReactElement|null}
 */
export default function PerfToolbarSlot() {
  const isPerfEnabled = useExistInFeature('perf')
  const isMobile = useIsMobile()
  const hostRef = useRef(null)

  useEffect(() => {
    if (!isPerfEnabled || isMobile || !hostRef.current) {
      return undefined
    }
    mountPerfPanel(hostRef.current)
    return () => {
      // Detach the canvas before React tears down our host div, so React
      // doesn't reconcile a child it doesn't own.
      unmountPerfPanel()
    }
  }, [isPerfEnabled, isMobile])

  if (!isPerfEnabled || isMobile) {
    return null
  }

  return (
    <Box
      ref={hostRef}
      data-testid='perf-toolbar-slot'
      sx={{
        display: 'flex',
        alignItems: 'center',
        // Don't squeeze sibling toolbar items; the panel is intrinsic
        // 80x48px and small enough to flow without breaking the layout.
        flex: '0 0 auto',
      }}
    />
  )
}

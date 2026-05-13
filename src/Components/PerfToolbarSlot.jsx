import React, {ReactElement, useEffect, useRef} from 'react'
import Box from '@mui/material/Box'
import {isPerfEnabled, mountPerfPanel, unmountPerfPanel} from '../utils/PerfMonitor'


/**
 * Bottom-bar slot that docks the PerfMonitor panel left of the
 * Help/Bot control when the `?feature=perf` flag is on.  Mounted by
 * `src/Containers/BottomBar.jsx`.
 *
 * Visible across desktop and mobile — the bottom bar has more lateral
 * room than the top control cluster, and the panel needs to be visible
 * on mobile (where users can't reach a devtools console to call
 * `window.perf.on()`).
 *
 * Returns `null` only when the flag is off, in which case the bottom
 * bar's layout is byte-for-byte identical to before.
 *
 * The panel itself (canvases + sampling) is owned by
 * `src/utils/PerfMonitor.js`; this component just provides a React-owned
 * host element and bridges mount/unmount.  See DESIGN.md
 * "Render loop & perf monitor".
 *
 * @return {ReactElement|null}
 */
export default function PerfToolbarSlot() {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!isPerfEnabled || !hostRef.current) {
      return undefined
    }
    mountPerfPanel(hostRef.current)
    return () => {
      // Detach the canvas before React tears down our host div, so
      // React doesn't reconcile a child it doesn't own.
      unmountPerfPanel()
    }
  }, [])

  if (!isPerfEnabled) {
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
        // Center the panel vertically against the sibling icon button
        // without forcing `alignItems` on the parent Stack.
        alignSelf: 'center',
      }}
    />
  )
}

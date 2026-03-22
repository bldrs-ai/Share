import React, {useCallback, useRef} from 'react'
import {Box, IconButton, Tooltip, Typography} from '@mui/material'
import {ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X} from 'lucide-react'
import useStore from '../../store/useStore'


const STEP = 0.5 // meters per click


/**
 * Small corner widget for controlling active section planes.
 * Shows arrows to move each active plane along its axis.
 * Appears when section planes are active.
 */
export default function SectionPlaneControl() {
  const viewer = useStore((state) => state.viewer)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const isCutPlaneActive = useStore((state) => state.isCutPlaneActive)

  const dragRef = useRef(null)

  const movePlane = useCallback((direction, delta) => {
    if (!viewer?.glbClipper) return
    const clipper = viewer.glbClipper
    const pd = clipper.planes.find((p) => p.direction === direction)
    if (!pd) return

    // Move along the plane's normal
    const movement = pd.normal.clone().multiplyScalar(delta)
    pd.point.add(movement)
    pd.plane.setFromNormalAndCoplanarPoint(pd.normal, pd.point)
    pd.gizmo.position.copy(pd.point)
    pd.offset += delta

    clipper.updateRendererPlanes()
    clipper.applyClippingToMaterials()
  }, [viewer])

  const handleDragStart = useCallback((direction, sign, e) => {
    e.preventDefault()
    const startY = e.clientY
    const startX = e.clientX

    const onMove = (ev) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.lastX
      const dy = ev.clientY - dragRef.current.lastY
      // Use the larger movement axis
      const delta = (Math.abs(dx) > Math.abs(dy) ? dx : -dy) * 0.02 * sign
      if (Math.abs(delta) > 0.001) {
        movePlane(direction, delta)
      }
      dragRef.current.lastX = ev.clientX
      dragRef.current.lastY = ev.clientY
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    dragRef.current = {lastX: startX, lastY: startY}
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [movePlane])

  const clearPlane = useCallback((direction) => {
    if (!viewer?.glbClipper) return
    // Trigger removal via store
    const removeCutPlaneDirection = useStore.getState().removeCutPlaneDirection
    const setCutPlaneDirections = useStore.getState().setCutPlaneDirections
    const setIsCutPlaneActive = useStore.getState().setIsCutPlaneActive
    const clipper = viewer.glbClipper

    clipper.deleteAllPlanes()

    const remaining = cutPlanes.filter((cp) => cp.direction !== direction)
    if (remaining.length > 0) {
      // Recreate remaining planes — need model center
      setCutPlaneDirections(remaining)
    } else {
      setCutPlaneDirections([])
      setIsCutPlaneActive(false)
      clipper.setInteractionEnabled(false)
    }
  }, [viewer, cutPlanes])

  if (!isCutPlaneActive || cutPlanes.length === 0) return null

  const activeDirections = cutPlanes.map((cp) => cp.direction)

  const directionLabels = {
    y: 'Plan (Y)',
    x: 'Section (X)',
    z: 'Elevation (Z)',
  }

  const arrowSx = {
    width: 28,
    height: 28,
    color: 'var(--color-primary)',
    opacity: 0.7,
    cursor: 'grab',
    '&:hover': {opacity: 1},
    '&:active': {cursor: 'grabbing'},
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 1000,
        backgroundColor: 'var(--color-toolbar-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--color-toolbar-border)',
        borderRadius: '10px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 100,
      }}
      data-testid='SectionPlaneControl'
    >
      {activeDirections.map((dir) => (
        <Box key={dir} sx={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <Typography sx={{fontSize: '11px', opacity: 0.5, mb: '2px'}}>
            {directionLabels[dir] || dir}
          </Typography>
          <Box sx={{display: 'flex', alignItems: 'center', gap: '2px'}}>
            <Tooltip title='Move backward (drag for continuous)' placement='left'>
              <IconButton
                size='small'
                onClick={() => movePlane(dir, -STEP)}
                onMouseDown={(e) => handleDragStart(dir, -1, e)}
                sx={arrowSx}
              >
                {dir === 'y' ? <ArrowDown size={16}/> : <ArrowLeft size={16}/>}
              </IconButton>
            </Tooltip>

            <Box sx={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              opacity: 0.4,
              fontSize: '11px',
              fontWeight: 600,
            }}>
              {dir.toUpperCase()}
            </Box>

            <Tooltip title='Move forward (drag for continuous)' placement='right'>
              <IconButton
                size='small'
                onClick={() => movePlane(dir, STEP)}
                onMouseDown={(e) => handleDragStart(dir, 1, e)}
                sx={arrowSx}
              >
                {dir === 'y' ? <ArrowUp size={16}/> : <ArrowRight size={16}/>}
              </IconButton>
            </Tooltip>

            <Tooltip title='Remove' placement='right'>
              <IconButton
                size='small'
                onClick={() => clearPlane(dir)}
                sx={{width: 20, height: 20, opacity: 0.3, '&:hover': {opacity: 1, color: '#f44336'}}}
              >
                <X size={12}/>
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

import React, {ReactElement, useState, useEffect, useRef, useCallback} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3, Box3} from 'three'
import {IconButton, Tooltip, Typography, Box} from '@mui/material'
import {Scissors, GripVertical} from 'lucide-react'
import useStore from '../../store/useStore'
import GlbClipper from '../../Infrastructure/GlbClipper'
import debug from '../../utils/debug'
import {addHashParams, getHashParams, getObjectParams, removeParams} from '../../utils/location'
import {floatStrTrim, isNumeric} from '../../utils/strings'
import {HASH_PREFIX_CUT_PLANE} from './hashState'


function getModelCenter(model) {
  const modelCenter = new Vector3()
  if (model?.geometry?.boundingBox) {
    model.geometry.boundingBox.getCenter(modelCenter)
  } else if (model) {
    const box = new Box3()
    box.setFromObject(model)
    box.getCenter(modelCenter)
  }
  return modelCenter
}


/**
 * Section plane toggle button + inline sub-bar with draggable X/Y/Z handles.
 * Renders inside ViewerToolbar. When active, shows a sub-bar below.
 */
export default function useCutPlaneControls(barSx) {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const addCutPlaneDirection = useStore((state) => state.addCutPlaneDirection)
  const removeCutPlaneDirection = useStore((state) => state.removeCutPlaneDirection)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const isCutPlaneActive = useStore((state) => state.isCutPlaneActive)
  const setIsCutPlaneActive = useStore((state) => state.setIsCutPlaneActive)

  const [glbClipper, setGlbClipper] = useState(null)
  const [showControls, setShowControls] = useState(false)

  const location = useLocation()

  // Initialize clipper
  useEffect(() => {
    if (model && viewer) {
      const clipper = new GlbClipper(viewer, model)
      setGlbClipper(clipper)
      viewer.glbClipper = clipper
      return () => {
        clipper.dispose()
        setGlbClipper(null)
        delete viewer.glbClipper
      }
    }
  }, [model, viewer])

  // Restore from hash
  useEffect(() => {
    const planeHash = getHashParams(location, HASH_PREFIX_CUT_PLANE)
    if (planeHash && model && viewer && glbClipper) {
      const planes = getPlanes(planeHash)
      if (planes && planes.length) {
        setIsCutPlaneActive(true)
        setShowControls(true)
        planes.forEach((plane) => togglePlane(plane))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, glbClipper])

  const togglePlane = ({direction, offset = 0}) => {
    if (setLevelInstance) setLevelInstance(null)
    const modelCenter = getModelCenter(model)
    const box = new Box3().setFromObject(model)
    console.log('[CutPlane] toggle:', direction, 'center:', modelCenter, 'box:', box.min.toArray(), box.max.toArray())
    const {normal, modelCenterOffset} = getPlaneSceneInfo({modelCenter, box, direction, offset})

    if (cutPlanes.findIndex((cp) => cp.direction === direction) > -1) {
      // Remove
      removeParams(HASH_PREFIX_CUT_PLANE, [direction])
      removeCutPlaneDirection(direction)
      if (glbClipper) {
        glbClipper.deleteAllPlanes()
        const rest = cutPlanes.filter((cp) => cp.direction !== direction)
        rest.forEach((cp) => {
          const info = getPlaneSceneInfo({modelCenter, box, direction: cp.direction, offset: cp.offset})
          glbClipper.createPlane(info.normal, info.modelCenterOffset, cp.direction, cp.offset)
        })
        if (rest.length === 0) {
          setIsCutPlaneActive(false)
        }
      }
    } else {
      // Add
      addHashParams(window.location, HASH_PREFIX_CUT_PLANE, {[direction]: offset}, true)
      addCutPlaneDirection({direction, offset})
      if (glbClipper) {
        glbClipper.createPlane(normal, modelCenterOffset, direction, offset)
      }
      setIsCutPlaneActive(true)
    }
  }

  const handleToggleControls = () => {
    setShowControls(!showControls)
  }

  const clearAll = () => {
    if (glbClipper) glbClipper.deleteAllPlanes()
    setCutPlaneDirections([])
    setIsCutPlaneActive(false)
    setShowControls(false)
    removePlanesFromHashState()
  }

  const isActive = isCutPlaneActive || showControls

  return {
    button: (
      <Tooltip title='Section planes' placement='bottom'>
        <IconButton
          size='small'
          onClick={handleToggleControls}
          sx={{
            width: 30,
            height: 30,
            borderRadius: '6px',
            color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
            opacity: isActive ? 1 : 0.6,
            '&:hover': {opacity: 1},
          }}
          data-testid='control-button-cut-plane'
        >
          <Scissors size={15} strokeWidth={1.75}/>
        </IconButton>
      </Tooltip>
    ),
    subBar: showControls ? (
      <SectionSubBar
        cutPlanes={cutPlanes}
        togglePlane={togglePlane}
        clearAll={clearAll}
        viewer={viewer}
        barSx={barSx}
      />
    ) : null,
  }
}


/**
 * Sub-bar with X/Y/Z drag handles.
 */
function SectionSubBar({cutPlanes, togglePlane, clearAll, viewer, barSx}) {
  const axes = [
    {direction: 'x', label: 'X'},
    {direction: 'y', label: 'Y'},
    {direction: 'z', label: 'Z'},
  ]

  const isPlaneActive = (dir) => cutPlanes.some((cp) => cp.direction === dir)

  return (
    <Box
      sx={{
        ...barSx,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {axes.map(({direction, label}) => (
        <DragHandle
          key={direction}
          direction={direction}
          label={label}
          active={isPlaneActive(direction)}
          togglePlane={togglePlane}
          viewer={viewer}
        />
      ))}

      {cutPlanes.length > 0 && (
        <Tooltip title='Clear all' placement='bottom'>
          <Typography
            onClick={clearAll}
            sx={{
              fontSize: '11px',
              cursor: 'pointer',
              opacity: 0.4,
              ml: '4px',
              '&:hover': {opacity: 1, color: '#f44336'},
            }}
          >
            Clear
          </Typography>
        </Tooltip>
      )}
    </Box>
  )
}


/**
 * Draggable axis handle — click to toggle plane, drag up/down to move it.
 */
function DragHandle({direction, label, active, togglePlane, viewer}) {
  const dragRef = useRef(null)
  const movedRef = useRef(false)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    movedRef.current = false

    // If plane not active, activate on click (handled in mouseup)
    if (!active) return

    const startY = e.clientY
    dragRef.current = {startY, lastY: startY}

    const onMove = (ev) => {
      if (!dragRef.current || !viewer?.glbClipper) return
      const dy = ev.clientY - dragRef.current.lastY
      if (Math.abs(dy) > 1) movedRef.current = true
      const delta = -dy * 0.05
      dragRef.current.lastY = ev.clientY

      const clipper = viewer.glbClipper
      const pd = clipper.planes.find((p) => p.direction === direction)
      if (pd && Math.abs(delta) > 0.001) {
        const movement = pd.normal.clone().multiplyScalar(delta)
        pd.point.add(movement)
        pd.plane.setFromNormalAndCoplanarPoint(pd.normal, pd.point)
        pd.gizmo.position.copy(pd.point)
        pd.offset += delta
        clipper.updateRendererPlanes()
        clipper.applyClippingToMaterials()
      }
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }

    document.body.style.cursor = 'ns-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [active, direction, viewer])

  const handleClick = useCallback(() => {
    // Only toggle if user didn't drag
    if (!movedRef.current) {
      togglePlane({direction})
    }
  }, [direction, togglePlane])

  return (
    <Tooltip title={active ? `Drag to move ${label} plane` : `Add ${label} section plane`} placement='bottom'>
      <Box
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '2px 6px',
          borderRadius: '6px',
          cursor: active ? 'ns-resize' : 'pointer',
          border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          backgroundColor: active ? 'var(--color-selected)' : 'transparent',
          color: active ? 'var(--color-primary)' : 'var(--color-text)',
          opacity: active ? 1 : 0.5,
          userSelect: 'none',
          '&:hover': {
            opacity: 1,
            borderColor: 'var(--color-primary)',
          },
        }}
      >
        {active && <GripVertical size={12} strokeWidth={1.5}/>}
        <Typography sx={{fontSize: '13px', fontWeight: 600, lineHeight: 1}}>{label}</Typography>
      </Box>
    </Tooltip>
  )
}


// --- Utility functions (unchanged) ---

export function resetState(viewer, setCutPlaneDirections, setIsCutPlaneActive) {
  if (viewer && viewer.clipper && setCutPlaneDirections && setIsCutPlaneActive) {
    removePlanes(viewer)
    removePlanesFromHashState()
    setCutPlaneDirections([])
    setIsCutPlaneActive(false)
  }
}

export function removePlanes(viewer) {
  if (viewer?.glbClipper) viewer.glbClipper.deleteAllPlanes()
}

export function getPlanesOffset(viewer, ifcModel) {
  const planes = viewer?.glbClipper ? viewer.glbClipper.planes : []
  if (planes && planes.length > 0) {
    const planesOffset = {}
    const modelCenter = getModelCenter(ifcModel)
    planes.forEach((planeData) => {
      const plane = planeData.plane
      const normal = plane.normal
      const constant = plane.constant
      for (const [key, value] of Object.entries(normal)) {
        if (value !== 0) {
          const planeAxisCenter = modelCenter[key]
          planesOffset[key] = floatStrTrim(constant - planeAxisCenter)
        }
      }
    })
    return planesOffset
  }
  return undefined
}

export function addPlanesToHashState(viewer, ifcModel) {
  const planes = viewer?.glbClipper ? viewer.glbClipper.planes : []
  if (planes && planes.length > 0) {
    const planeInfo = getPlanesOffset(viewer, ifcModel)
    addHashParams(window.location, HASH_PREFIX_CUT_PLANE, planeInfo, true)
  }
}

export function getPlanes(planeHash) {
  if (!planeHash) return []
  const parts = planeHash.split(':')
  if (parts[0] !== HASH_PREFIX_CUT_PLANE || !parts[1]) return []
  const planeObjectParams = getObjectParams(planeHash)
  const planes = []
  const removableParamKeys = []
  Object.entries(planeObjectParams).forEach(([key, value]) => {
    if (isNumeric(key)) {
      removableParamKeys.push(key)
    } else {
      planes.push({direction: key, offset: floatStrTrim(value)})
    }
  })
  if (removableParamKeys.length) removeParams(HASH_PREFIX_CUT_PLANE, removableParamKeys)
  return planes
}

export function removePlanesFromHashState() {
  removeParams(HASH_PREFIX_CUT_PLANE)
}

export function getPlaneSceneInfo({modelCenter, box, direction, offset = 0}) {
  let normal
  const finiteOffset = floatStrTrim(offset)
  // Start position: use bounding box for smarter defaults
  // Y (plan): 1/3 from bottom (ground floor area)
  // X, Z: model center
  const point = modelCenter.clone()

  switch (direction) {
    case 'x':
      normal = new Vector3(-1, 0, 0)
      point.x += finiteOffset
      break
    case 'y':
      normal = new Vector3(0, -1, 0)
      if (box && finiteOffset === 0) {
        // Default to 1/3 from bottom — typically ground floor cut height
        point.y = box.min.y + (box.max.y - box.min.y) * 0.33
      } else {
        point.y += finiteOffset
      }
      break
    case 'z':
      normal = new Vector3(0, 0, -1)
      point.z += finiteOffset
      break
    default:
      normal = new Vector3(0, 1, 0)
      break
  }

  return {normal, modelCenterOffset: point}
}

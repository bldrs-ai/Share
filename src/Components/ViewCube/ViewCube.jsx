import React, {ReactElement, useEffect, useRef} from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {
  Home as HomeIcon,
  KeyboardArrowDown as TiltDownIcon,
  KeyboardArrowUp as TiltUpIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from '@mui/icons-material'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'


/**
 * ViewCube is an Autodesk-style navigation gizmo rendered in the top-right
 * corner of the viewer.  It shows a labeled cube whose orientation mirrors the
 * main camera; clicking a face or corner snaps the main camera to that standard
 * view and fits the model to frame.  Dragging the cube orbits the view freely
 * (fine rotation), and a ring of arrows around the cube orbits in fixed steps
 * with an isometric home button.
 *
 * The cube is drawn in its own tiny Three.js scene (independent of the main
 * viewer) so face/corner picking stays simple and self-contained.  The main
 * camera is read from `viewer.IFC.context` and driven via the camera-controls
 * instance the rest of Share already uses (see CameraControl.jsx).
 *
 * @return {ReactElement}
 */
export default function ViewCube() {
  const viewer = useStore((state) => state.viewer)
  // Right-drawer state so the widget can sit clear of any open drawer.
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const rightDrawerWidth = useStore((state) => state.rightDrawerWidth)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  // On mobile the drawers are bottom sheets, so they don't push the widget aside.
  const isMobile = useIsMobile()

  const mountRef = useRef(null)
  // Live handles so the ring buttons and fit calls can reach the viewer.
  const controlsRef = useRef(null)
  const contextRef = useRef(null)

  useEffect(() => {
    const context = viewer && viewer.IFC && viewer.IFC.context
    if (!context || !context.ifcCamera) {
      return undefined
    }
    const mount = mountRef.current
    if (!mount) {
      return undefined
    }

    const cameraControls = context.ifcCamera.cameraControls
    controlsRef.current = cameraControls
    contextRef.current = context

    // --- Mini scene: a fixed orthographic camera looking at a rotating cube ---
    const scene = new Scene()
    const halfExtent = 0.9
    const camera = new OrthographicCamera(
      -halfExtent, halfExtent, halfExtent, -halfExtent, NEAR_PLANE, FAR_PLANE)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)

    const renderer = new WebGLRenderer({alpha: true, antialias: true})
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(CUBE_SIZE_PX, CUBE_SIZE_PX)
    mount.appendChild(renderer.domElement)

    const materials = CUBE_FACES.map((face) => new MeshBasicMaterial({
      map: makeFaceTexture(face.label),
      transparent: true,
    }))
    const cube = new Mesh(new BoxGeometry(1, 1, 1), materials)
    scene.add(cube)

    // --- Keep the cube oriented to match what the main camera sees ---
    let frameId = 0
    const renderLoop = () => {
      const active = context.getCamera()
      if (active) {
        // Rotating the cube by the inverse of the camera rotation reproduces the
        // model's on-screen orientation inside the gizmo.
        cube.quaternion.copy(active.quaternion).invert()
      }
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    // --- Pointer handling: click a face/corner to snap, drag to orbit freely,
    // hover to highlight the face under the cursor. ---
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let isPointerDown = false
    let isDragging = false
    let lastX = 0
    let lastY = 0
    let hoveredIndex = -1

    const raycastFromPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
      pointer.y = (-((event.clientY - rect.top) / rect.height) * 2) + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(cube)
      return hits.length > 0 ? hits[0] : null
    }

    // Tint the face under the cursor by multiplying its texture with a highlight.
    const setHover = (index) => {
      if (index === hoveredIndex) {
        return
      }
      if (hoveredIndex >= 0) {
        materials[hoveredIndex].color.setHex(BASE_HEX)
      }
      if (index >= 0) {
        materials[index].color.setHex(HOVER_HEX)
      }
      hoveredIndex = index
    }

    const snapFromPointer = (event) => {
      const hit = raycastFromPointer(event)
      if (!hit) {
        return
      }
      const direction = pickDirection(hit, cube)
      snapToDirection(cameraControls, direction)
      fitModelToFrame()
      debug().log('ViewCube: snap to', direction)
    }

    const onPointerDown = (event) => {
      isPointerDown = true
      isDragging = false
      lastX = event.clientX
      lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (!isPointerDown) {
        const hit = raycastFromPointer(event)
        setHover(hit ? hit.face.materialIndex : -1)
        return
      }
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      if (!isDragging && (Math.abs(dx) + Math.abs(dy)) < DRAG_THRESHOLD_PX) {
        return
      }
      isDragging = true
      setHover(-1) // Clear the highlight while dragging.
      lastX = event.clientX
      lastY = event.clientY
      const {azimuth, polar} = dragRotation(dx, dy, ROTATE_SENSITIVITY)
      cameraControls.rotate(azimuth, polar, false)
    }
    const onPointerUp = (event) => {
      if (isPointerDown && renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }
      if (isPointerDown && !isDragging) {
        // A click (not a drag): snap to the picked view.
        snapFromPointer(event)
      }
      isPointerDown = false
      isDragging = false
    }
    const onPointerLeave = () => setHover(-1)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'

    return () => {
      cancelAnimationFrame(frameId)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      controlsRef.current = null
      contextRef.current = null
      cube.geometry.dispose()
      materials.forEach((m) => {
        if (m.map) {
          m.map.dispose()
        }
        m.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [viewer])

  /** Fit the loaded model to the frame, preserving the current view direction. */
  const fitModelToFrame = () => {
    const context = contextRef.current
    const navMode = context && context.ifcCamera && context.ifcCamera.currentNavMode
    if (navMode && typeof navMode.fitModelToFrame === 'function') {
      navMode.fitModelToFrame()
    }
  }

  /**
   * Orbit the main camera by a relative step, guarding against an unmounted
   * viewer.
   *
   * @param {number} deltaAzimuthRad Azimuth delta in radians
   * @param {number} deltaPolarRad Polar delta in radians
   */
  const orbit = (deltaAzimuthRad, deltaPolarRad) => {
    if (controlsRef.current) {
      controlsRef.current.rotate(deltaAzimuthRad, deltaPolarRad, true)
    }
  }

  /** Snap to a front-right-top isometric "home" view and fit the model. */
  const goHome = () => {
    if (controlsRef.current) {
      snapToDirection(controlsRef.current, ISO_DIRECTION.clone())
      fitModelToFrame()
    }
  }

  // Sit clear of any open right-side drawer (Notes, Apps).  On mobile the
  // drawers are bottom sheets, so only the base margin applies.
  const drawerInset = isMobile ? 0 :
    (isNotesVisible ? rightDrawerWidth : 0) + (isAppsVisible ? appsDrawerWidth : 0)
  const rightInset = MARGIN_PX + drawerInset

  return (
    <Box
      sx={{
        'position': 'absolute',
        'top': `${TOP_INSET_PX}px`,
        'right': `${rightInset}px`,
        'width': `${WIDGET_SIZE_PX}px`,
        'height': `${WIDGET_SIZE_PX}px`,
        'display': 'grid',
        'gridTemplateColumns': '1fr auto 1fr',
        'gridTemplateRows': '1fr auto 1fr',
        'placeItems': 'center',
        'zIndex': 100,
        'pointerEvents': 'none',
        'transition': 'right 0.2s ease',
        '& > *': {pointerEvents: 'auto'},
      }}
      data-testid='view-cube'
    >
      <RingButton
        title='Rotate up'
        onClick={() => orbit(0, -TILT_STEP_RAD)}
        icon={<TiltUpIcon/>}
        sx={{gridColumn: 2, gridRow: 1}}
      />
      <RingButton
        title='Rotate left'
        onClick={() => orbit(-ORBIT_STEP_RAD, 0)}
        icon={<RotateLeftIcon/>}
        sx={{gridColumn: 1, gridRow: 2}}
      />
      <Box ref={mountRef} sx={{gridColumn: 2, gridRow: 2, lineHeight: 0}}/>
      <RingButton
        title='Rotate right'
        onClick={() => orbit(ORBIT_STEP_RAD, 0)}
        icon={<RotateRightIcon/>}
        sx={{gridColumn: 3, gridRow: 2}}
      />
      <RingButton
        title='Rotate down'
        onClick={() => orbit(0, TILT_STEP_RAD)}
        icon={<TiltDownIcon/>}
        sx={{gridColumn: 2, gridRow: 3}}
      />
      <RingButton
        title='Home (isometric)'
        onClick={goHome}
        icon={<HomeIcon/>}
        sx={{gridColumn: 3, gridRow: 3}}
      />
    </Box>
  )
}


/**
 * A compact icon button used for the ring of orbit controls around the cube.
 *
 * @property {string} title Tooltip + aria label
 * @property {Function} onClick Callback
 * @property {ReactElement} icon Icon element
 * @property {object} sx Grid placement styles
 * @return {ReactElement}
 */
function RingButton({title, onClick, icon, sx}) {
  return (
    <Tooltip title={title} placement='left'>
      <IconButton
        onClick={onClick}
        size='small'
        aria-label={title}
        sx={sx}
      >
        {icon}
      </IconButton>
    </Tooltip>
  )
}


/**
 * Determine the model-space view direction for a click on the cube.  Because
 * the cube's local axes map to the model's axes (local +Z is the model front),
 * the clicked zone in cube-local space is the direction to look from.  A click
 * near a corner (three active axes) or an edge (two active axes) yields the
 * corresponding diagonal direction; a face-center click (one or zero active
 * axes) resolves to the clicked face's outward normal.
 *
 * @param {object} hit Raycaster intersection against the cube
 * @param {Mesh} cube The cube mesh
 * @return {Vector3} Unit direction, in model space, to place the camera along
 */
export function pickDirection(hit, cube) {
  const local = cube.worldToLocal(hit.point.clone())
  const zone = new Vector3(
    zoneSign(local.x),
    zoneSign(local.y),
    zoneSign(local.z),
  )
  const activeAxes = Math.abs(zone.x) + Math.abs(zone.y) + Math.abs(zone.z)
  // Two active axes = edge, three = corner; both look along the diagonal.
  const edgeAxes = 2
  if (activeAxes >= edgeAxes) {
    return zone.normalize()
  }
  // Face center: snap to the clicked face's outward normal.
  return hit.face.normal.clone().normalize()
}


/**
 * Snap the main camera to look from `direction`, keeping the current target and
 * distance.  Converts the direction to the camera-controls (azimuth, polar)
 * spherical angles and animates there.
 *
 * @param {object} cameraControls camera-controls instance from the viewer
 * @param {Vector3} direction Unit direction to place the camera along
 */
export function snapToDirection(cameraControls, direction) {
  if (!cameraControls) {
    return
  }
  const clampedY = Math.min(1, Math.max(-1, direction.y))
  let polar = Math.acos(clampedY)
  // Nudge off the exact poles so azimuth stays well-defined for top/bottom.
  polar = Math.min(Math.PI - POLAR_EPS, Math.max(POLAR_EPS, polar))
  const azimuth = Math.atan2(direction.x, direction.z)
  cameraControls.rotateTo(azimuth, polar, true)
}


/**
 * Convert a pointer drag delta (in pixels) into a relative camera-controls
 * rotation.  Horizontal drag maps to azimuth, vertical drag to polar; both are
 * negated so the model appears to follow the cursor.
 *
 * @param {number} dx Horizontal pixels moved
 * @param {number} dy Vertical pixels moved
 * @param {number} sensitivity Radians per pixel
 * @return {{azimuth: number, polar: number}} Relative rotation in radians
 */
export function dragRotation(dx, dy, sensitivity) {
  return {azimuth: -dx * sensitivity, polar: -dy * sensitivity}
}


/**
 * Bucket a cube-local coordinate (range [-0.5, 0.5]) into -1, 0 or 1 by which
 * third of the face it falls in.
 *
 * @param {number} coord
 * @return {number} -1, 0 or 1
 */
function zoneSign(coord) {
  if (coord > ZONE_THRESHOLD) {
    return 1
  }
  if (coord < -ZONE_THRESHOLD) {
    return -1
  }
  return 0
}


/**
 * Render a face label onto a canvas for use as a cube-face texture.
 *
 * @param {string} label Face label, e.g. 'FRONT'
 * @return {CanvasTexture}
 */
function makeFaceTexture(label) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f5f5f5'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, size, size)
  ctx.fillStyle = '#333'
  ctx.font = 'bold 20px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, size / 2, size / 2)
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  return texture
}


// BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
// Model space (Y-up, loader-aligned): +Z front, +X right, +Y top.
const CUBE_FACES = [
  {label: 'RIGHT'},
  {label: 'LEFT'},
  {label: 'TOP'},
  {label: 'BOTTOM'},
  {label: 'FRONT'},
  {label: 'BACK'},
]

const CUBE_SIZE_PX = 96
// Wide enough to contain the 96px cube plus a ~48px ring button on each side,
// so the right-column buttons (Rotate right, Home) stay inside the widget
// instead of overflowing off-screen / onto an open drawer.
const WIDGET_SIZE_PX = 200
const TOP_INSET_PX = 80
const MARGIN_PX = 20
const NEAR_PLANE = 0.1
const FAR_PLANE = 100
const ORBIT_STEP_RAD = Math.PI / 2 // 90 degrees
const TILT_STEP_RAD = Math.PI / 4 // 45 degrees
const POLAR_EPS = 0.001
const DRAG_THRESHOLD_PX = 4
const ROTATE_SENSITIVITY = 0.008 // radians per pixel of drag
const BASE_HEX = 0xffffff // Face texture shown untinted.
const HOVER_HEX = 0xbfe0ff // Light-blue tint for the hovered face.
// Half the cube's edge length; a face spans [-CUBE_HALF, CUBE_HALF] locally.
const CUBE_HALF = 0.5
const FACE_THIRDS = 3
// The center third of a face (a face view) is |coord| < CUBE_HALF / 3.
const ZONE_THRESHOLD = CUBE_HALF / FACE_THIRDS
const ISO_DIRECTION = new Vector3(1, 1, 1).normalize()

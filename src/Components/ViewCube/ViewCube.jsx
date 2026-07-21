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
import useStore from '../../store/useStore'
import debug from '../../utils/debug'


/**
 * ViewCube is an Autodesk-style navigation gizmo rendered in the top-right
 * corner of the viewer.  It shows a labeled cube whose orientation mirrors the
 * main camera; clicking a face or corner snaps the main camera to that standard
 * view.  A ring of arrows around the cube orbits the view in 90/45 degree steps
 * and a home button returns to an isometric view.
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
  const mountRef = useRef(null)
  // Holds the live camera-controls handle so the ring buttons can drive it.
  const controlsRef = useRef(null)

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

    // --- Picking: click a face/corner to snap the main camera to that view ---
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const onClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
      pointer.y = (-((event.clientY - rect.top) / rect.height) * 2) + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(cube)
      if (hits.length === 0) {
        return
      }
      const direction = pickDirection(hits[0], cube)
      snapToDirection(cameraControls, direction)
      debug().log('ViewCube: snap to', direction)
    }
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.style.cursor = 'pointer'

    return () => {
      cancelAnimationFrame(frameId)
      renderer.domElement.removeEventListener('click', onClick)
      controlsRef.current = null
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

  /** Snap to a front-right-top isometric "home" view. */
  const goHome = () => {
    if (controlsRef.current) {
      snapToDirection(controlsRef.current, ISO_DIRECTION.clone())
    }
  }

  return (
    <Box
      sx={{
        'position': 'absolute',
        'top': '80px',
        'right': '20px',
        'width': `${WIDGET_SIZE_PX}px`,
        'height': `${WIDGET_SIZE_PX}px`,
        'display': 'grid',
        'gridTemplateColumns': '1fr auto 1fr',
        'gridTemplateRows': '1fr auto 1fr',
        'placeItems': 'center',
        'zIndex': 100,
        'pointerEvents': 'none',
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
 * the clicked zone in cube-local space is the direction to look from.  Corner
 * clicks (all three coordinates near an edge) yield a diagonal isometric
 * direction; face and edge clicks resolve to the clicked face normal.
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
  const cornerAxes = 3
  const isCorner = (Math.abs(zone.x) + Math.abs(zone.y) + Math.abs(zone.z)) === cornerAxes
  if (isCorner) {
    return zone.normalize()
  }
  // Face or edge: snap to the clicked face's outward normal.
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
const WIDGET_SIZE_PX = 150
const NEAR_PLANE = 0.1
const FAR_PLANE = 100
const ORBIT_STEP_RAD = Math.PI / 2 // 90 degrees
const TILT_STEP_RAD = Math.PI / 4 // 45 degrees
const POLAR_EPS = 0.001
// Half the cube's edge length; a face spans [-CUBE_HALF, CUBE_HALF] locally.
const CUBE_HALF = 0.5
const FACE_THIRDS = 3
// The center third of a face (a face view) is |coord| < CUBE_HALF / 3.
const ZONE_THRESHOLD = CUBE_HALF / FACE_THIRDS
const ISO_DIRECTION = new Vector3(1, 1, 1).normalize()

import React, {ReactElement, useEffect, useRef} from 'react'
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
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
 * ViewCube is an Autodesk-style navigation gizmo rendered in a corner of the
 * viewer.  It shows a chamfered, labeled cube whose orientation mirrors the
 * main camera.  Clicking a face, chamfered edge, or corner snaps the main
 * camera to that standard view and fits the model to frame; hovering a region
 * highlights it (edges/corners in the bldrs green).  Dragging the cube orbits
 * the view freely, and a ring of arrows orbits in fixed steps with a home
 * button.
 *
 * The cube is drawn in its own tiny Three.js scene (independent of the main
 * viewer): 6 face quads, 12 edge bevels and 8 corner triangles, each a
 * pickable sub-mesh carrying its own view direction.  The main camera is read
 * from `viewer.IFC.context` and driven via the camera-controls instance the
 * rest of Share already uses (see CameraControl.jsx).
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

    const {group, regions, dispose: disposeCube} = createViewCube()
    scene.add(group)

    // --- Keep the cube oriented to match what the main camera sees ---
    let frameId = 0
    const renderLoop = () => {
      const active = context.getCamera()
      if (active) {
        // Rotating the cube by the inverse of the camera rotation reproduces the
        // model's on-screen orientation inside the gizmo.
        group.quaternion.copy(active.quaternion).invert()
      }
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    // --- Pointer handling: click a region to snap, drag to orbit freely,
    // hover to highlight the region under the cursor. ---
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let isPointerDown = false
    let isDragging = false
    let lastX = 0
    let lastY = 0
    let hoveredMesh = null

    const raycastFromPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
      pointer.y = (-((event.clientY - rect.top) / rect.height) * 2) + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(regions, false)
      return hits.length > 0 ? hits[0] : null
    }

    // Highlight the region under the cursor; edges/corners use the bldrs green.
    const setHover = (mesh) => {
      if (mesh === hoveredMesh) {
        return
      }
      if (hoveredMesh) {
        hoveredMesh.material.color.setHex(hoveredMesh.userData.baseColor)
      }
      if (mesh) {
        const hl = mesh.userData.kind === 'face' ? FACE_HOVER_HEX : BLDRS_GREEN_HEX
        mesh.material.color.setHex(hl)
      }
      hoveredMesh = mesh
    }

    const snapFromPointer = (event) => {
      const hit = raycastFromPointer(event)
      if (!hit) {
        return
      }
      const direction = hit.object.userData.dir
      snapToDirection(cameraControls, direction)
      fitModelToFrame()
      debug().log('ViewCube: snap to', hit.object.userData.kind, direction)
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
        setHover(hit ? hit.object : null)
        return
      }
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      if (!isDragging && (Math.abs(dx) + Math.abs(dy)) < DRAG_THRESHOLD_PX) {
        return
      }
      isDragging = true
      setHover(null) // Clear the highlight while dragging.
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
    const onPointerLeave = () => setHover(null)
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
      disposeCube()
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
        'bottom': `${BOTTOM_INSET_PX}px`,
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
 * Build the chamfered ViewCube as a group of pickable sub-meshes: 6 labeled
 * face quads, 12 edge bevels and 8 corner triangles.  Each mesh carries its
 * view direction and highlight base color in userData.
 *
 * @return {{group: Group, regions: Array<Mesh>, dispose: Function}}
 */
export function createViewCube() {
  const group = new Group()
  const regions = []
  const disposables = []
  const H = CUBE_HALF
  const S = FACE_HALF
  const vec = (x, y, z) => new Vector3(x, y, z)

  const addRegion = (geometry, material, dir, kind, baseColor) => {
    const mesh = new Mesh(geometry, material)
    mesh.userData = {dir, kind, baseColor}
    group.add(mesh)
    regions.push(mesh)
    disposables.push(geometry, material)
  }

  // Faces: an inset quad on each of the 6 outer planes, carrying its label.
  CUBE_FACES.forEach(({n, u, v, label}) => {
    const nn = vec(...n)
    const uu = vec(...u)
    const vv = vec(...v)
    const center = nn.clone().multiplyScalar(H)
    const corner = (su, sv) =>
      center.clone().addScaledVector(uu, su * S).addScaledVector(vv, sv * S)
    const bl = corner(-1, -1)
    const br = corner(1, -1)
    const tr = corner(1, 1)
    const tl = corner(-1, 1)
    const geo = geomFromTris(
      [bl, br, tr, bl, tr, tl],
      [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])
    const tex = makeFaceTexture(label)
    disposables.push(tex)
    const mat = new MeshBasicMaterial({map: tex, side: DoubleSide})
    addRegion(geo, mat, nn.clone().normalize(), 'face', FACE_BASE_HEX)
  })

  // Edge bevels: a chamfer strip between each pair of perpendicular faces.
  const normals = CUBE_FACES.map((f) => vec(...f.n))
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const nA = normals[i]
      const nB = normals[j]
      if (nA.dot(nB) !== 0) {
        continue // Opposite (or same) faces share no edge.
      }
      const axisA = nonZeroAxis(nA)
      const axisB = nonZeroAxis(nB)
      const axisC = THREE_AXES - axisA - axisB
      const sgnA = nA.getComponent(axisA)
      const sgnB = nB.getComponent(axisB)
      const at = (onA, onB, onC) => {
        const out = new Vector3()
        out.setComponent(axisA, onA)
        out.setComponent(axisB, onB)
        out.setComponent(axisC, onC)
        return out
      }
      const pA1 = at(H * sgnA, S * sgnB, S)
      const pA2 = at(H * sgnA, S * sgnB, -S)
      const pB2 = at(S * sgnA, H * sgnB, -S)
      const pB1 = at(S * sgnA, H * sgnB, S)
      const geo = geomFromTris([pA1, pA2, pB2, pA1, pB2, pB1])
      const mat = new MeshBasicMaterial({color: CHAMFER_GREY_HEX, side: DoubleSide})
      addRegion(geo, mat, nA.clone().add(nB).normalize(), 'edge', CHAMFER_GREY_HEX)
    }
  }

  // Corner triangles: a chamfer at each of the 8 cube corners.
  const signs = [-1, 1]
  signs.forEach((sx) => signs.forEach((sy) => signs.forEach((sz) => {
    const pX = vec(H * sx, S * sy, S * sz)
    const pY = vec(S * sx, H * sy, S * sz)
    const pZ = vec(S * sx, S * sy, H * sz)
    const geo = geomFromTris([pX, pY, pZ])
    const mat = new MeshBasicMaterial({color: CHAMFER_GREY_HEX, side: DoubleSide})
    addRegion(geo, mat, vec(sx, sy, sz).normalize(), 'corner', CHAMFER_GREY_HEX)
  })))

  const dispose = () => disposables.forEach((d) => d.dispose && d.dispose())
  return {group, regions, dispose}
}


/**
 * Build a BufferGeometry from a flat list of triangle vertices.
 *
 * @param {Array<Vector3>} verts Triangle vertices (length a multiple of 3)
 * @param {Array<number>} [uvs] Optional UV pairs, one per vertex
 * @return {BufferGeometry}
 */
function geomFromTris(verts, uvs) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(verts.length * 3)
  verts.forEach((vtx, i) => {
    pos[i * 3] = vtx.x
    pos[(i * 3) + 1] = vtx.y
    pos[(i * 3) + 2] = vtx.z
  })
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  if (uvs) {
    geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(uvs), 2))
  }
  geo.computeVertexNormals()
  return geo
}


/**
 * @param {Vector3} axisVector A unit vector aligned to one axis
 * @return {number} The index (0, 1 or 2) of its non-zero component
 */
function nonZeroAxis(axisVector) {
  if (axisVector.x !== 0) {
    return 0
  }
  return axisVector.y !== 0 ? 1 : 2
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


// Model space (Y-up, loader-aligned): +Z front, +X right, +Y top.  Each face
// has a right (u) and up (v) tangent with u x v = n so labels read upright.
const CUBE_FACES = [
  {n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], label: 'FRONT'},
  {n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], label: 'BACK'},
  {n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], label: 'RIGHT'},
  {n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], label: 'LEFT'},
  {n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], label: 'TOP'},
  {n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], label: 'BOTTOM'},
]

const CUBE_SIZE_PX = 96
const WIDGET_SIZE_PX = 200
const BOTTOM_INSET_PX = 80
const MARGIN_PX = 20
const NEAR_PLANE = 0.1
const FAR_PLANE = 100
const ORBIT_STEP_RAD = Math.PI / 2 // 90 degrees
const TILT_STEP_RAD = Math.PI / 4 // 45 degrees
const POLAR_EPS = 0.001
const DRAG_THRESHOLD_PX = 4
const ROTATE_SENSITIVITY = 0.008 // radians per pixel of drag
const THREE_AXES = 3 // axis indices 0, 1, 2 sum to 3
const CUBE_HALF = 0.5 // half the cube's edge length
const CHAMFER = 0.16 // how far faces are inset to form the chamfer
const FACE_HALF = CUBE_HALF - CHAMFER // face half-span
const BLDRS_GREEN_HEX = 0x459a47 // brand green (Logo_Buildings.svg)
const CHAMFER_GREY_HEX = 0xd8d8d8 // edge/corner bevel base color
const FACE_BASE_HEX = 0xffffff // face texture shown untinted
const FACE_HOVER_HEX = 0xbfe0ff // light-blue tint for a hovered face
const ISO_DIRECTION = new Vector3(1, 1, 1).normalize()

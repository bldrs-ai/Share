import React, {useEffect, useRef, ReactElement} from 'react'
import {Box} from '@mui/material'
import {ChevronUp, ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react'
import {
  AmbientLight,
  CircleGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  WireframeGeometry,
  LineSegments,
  LineBasicMaterial,
  DoubleSide,
} from 'three'
import useStore from '../../store/useStore'


const SIZE = 100
const ROTATE_STEP = Math.PI / 6 // 30 degrees per click


export default function NavCube() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({x: 0, y: 0})
  const viewer = useStore((state) => state.viewer)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const isSvgFloorPlanVisible = useStore((state) => state.isSvgFloorPlanVisible)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true})
    renderer.setSize(SIZE, SIZE)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)

    const scene = new Scene()
    const cam = new OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10)
    cam.position.set(2, 1.5, 2)
    cam.lookAt(0, 0, 0)

    scene.add(new AmbientLight(0xffffff, 0.8))
    const dirLight = new DirectionalLight(0xffffff, 0.3)
    dirLight.position.set(2, 3, 2)
    scene.add(dirLight)

    // Background disc — light grey to match nav
    const bgGeom = new CircleGeometry(1.45, 32)
    const bgMat = new MeshBasicMaterial({color: 0xd0d0d0, transparent: true, opacity: 0.35, side: DoubleSide})
    const bgDisc = new Mesh(bgGeom, bgMat)
    bgDisc.position.set(0, 0, -0.01)
    scene.add(bgDisc)

    // Wireframe sphere — dark grey for visibility
    const sphereGeom = new SphereGeometry(1, 20, 14)
    const wireGeom = new WireframeGeometry(sphereGeom)
    const wireMat = new LineBasicMaterial({color: 0x555555, transparent: true, opacity: 0.5})
    const wireframe = new LineSegments(wireGeom, wireMat)
    scene.add(wireframe)

    stateRef.current = {renderer, scene, cam, wireframe, bgDisc}

    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (viewer?.context) {
        const mainCam = viewer.context.getCamera()
        if (mainCam) {
          const q = mainCam.quaternion.clone().invert()
          wireframe.quaternion.copy(q)
        }
      }
      // Keep background disc facing camera
      bgDisc.quaternion.copy(cam.quaternion)
      renderer.render(scene, cam)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      sphereGeom.dispose()
      wireGeom.dispose()
      wireMat.dispose()
      bgGeom.dispose()
      bgMat.dispose()
      renderer.dispose()
    }
  }, [viewer])


  const rotateCamera = (azimuth, polar) => {
    if (!viewer?.context?.ifcCamera?.cameraControls) return
    const controls = viewer.context.ifcCamera.cameraControls
    controls.rotate(azimuth * ROTATE_STEP, polar * ROTATE_STEP, true)
  }

  // Drag to orbit
  const handleMouseDown = (event) => {
    isDragging.current = false
    lastMouse.current = {x: event.clientX, y: event.clientY}

    const onMouseMove = (e) => {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDragging.current = true

      if (isDragging.current && viewer?.context?.ifcCamera?.cameraControls) {
        const controls = viewer.context.ifcCamera.cameraControls
        controls.rotate(-dx * 0.01, -dy * 0.01, true)
        lastMouse.current = {x: e.clientX, y: e.clientY}
      }
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setTimeout(() => { isDragging.current = false }, 50)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  let rightOffsetCSS = '0px'
  if (isSvgFloorPlanVisible && isAppsVisible) {
    rightOffsetCSS = `calc(50vw + ${appsDrawerWidth}px)`
  } else if (isSvgFloorPlanVisible) {
    rightOffsetCSS = '50vw'
  } else if (isAppsVisible) {
    rightOffsetCSS = `${appsDrawerWidth}px`
  }

  const arrowSx = {
    position: 'absolute',
    cursor: 'pointer',
    color: 'rgba(85,85,85,0.6)',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '&:hover': {color: 'rgba(85,85,85,1)'},
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 16,
        left: `calc((100vw - ${rightOffsetCSS}) / 2)`,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        opacity: 0.85,
        transition: 'left 50ms ease',
        '&:hover': {opacity: 1},
      }}
      data-testid='NavSphere'
    >
      <Box sx={{position: 'relative', width: SIZE, height: SIZE}}>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onMouseDown={handleMouseDown}
          style={{display: 'block', cursor: 'grab'}}
        />
        {/* Arrow controls */}
        <Box onClick={() => rotateCamera(0, -1)} sx={{...arrowSx, top: 0, left: '50%', transform: 'translateX(-50%)'}}>
          <ChevronUp size={16} strokeWidth={2.5}/>
        </Box>
        <Box onClick={() => rotateCamera(0, 1)} sx={{...arrowSx, bottom: 0, left: '50%', transform: 'translateX(-50%)'}}>
          <ChevronDown size={16} strokeWidth={2.5}/>
        </Box>
        <Box onClick={() => rotateCamera(1, 0)} sx={{...arrowSx, left: 0, top: '50%', transform: 'translateY(-50%)'}}>
          <ChevronLeft size={16} strokeWidth={2.5}/>
        </Box>
        <Box onClick={() => rotateCamera(-1, 0)} sx={{...arrowSx, right: 0, top: '50%', transform: 'translateY(-50%)'}}>
          <ChevronRight size={16} strokeWidth={2.5}/>
        </Box>
      </Box>
    </Box>
  )
}

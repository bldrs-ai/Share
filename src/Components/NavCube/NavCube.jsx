import React, {useEffect, useRef, ReactElement} from 'react'
import {Box} from '@mui/material'
import {
  AmbientLight,
  CircleGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry,
  LineSegments,
  LineBasicMaterial,
  DoubleSide,
} from 'three'
import useStore from '../../store/useStore'


const SIZE = 100

const VIEWS = [
  {name: 'Front', pos: [0, 0, 1], up: [0, 1, 0], color: 0x55cc88},
  {name: 'Back', pos: [0, 0, -1], up: [0, 1, 0], color: 0x55cc88},
  {name: 'Right', pos: [1, 0, 0], up: [0, 1, 0], color: 0xdd6666},
  {name: 'Left', pos: [-1, 0, 0], up: [0, 1, 0], color: 0xdd6666},
  {name: 'Top', pos: [0, 1, 0], up: [0, 0, -1], color: 0x6688dd},
  {name: 'Bottom', pos: [0, -1, 0], up: [0, 0, 1], color: 0x6688dd},
]


export default function NavCube() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({x: 0, y: 0})
  const viewer = useStore((state) => state.viewer)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)

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

    // Dark background disc so sphere is visible against any model
    const bgGeom = new CircleGeometry(1.45, 32)
    const bgMat = new MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.4, side: DoubleSide})
    const bgDisc = new Mesh(bgGeom, bgMat)
    bgDisc.position.set(0, 0, -0.01)
    // Don't rotate with camera — face the camera
    scene.add(bgDisc)

    // Wireframe sphere — brighter
    const sphereGeom = new SphereGeometry(1, 20, 14)
    const wireGeom = new WireframeGeometry(sphereGeom)
    const wireMat = new LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.3})
    const wireframe = new LineSegments(wireGeom, wireMat)
    scene.add(wireframe)

    // Axis rings
    const ringDefs = [
      {color: 0xff6666, rot: [0, 0, Math.PI / 2]},
      {color: 0x66ff66, rot: [0, 0, 0]},
      {color: 0x6688ff, rot: [Math.PI / 2, 0, 0]},
    ]
    const rings = ringDefs.map(({color, rot}) => {
      const geom = new RingGeometry(0.96, 1.04, 32)
      const mat = new MeshBasicMaterial({color, side: DoubleSide, transparent: true, opacity: 0.4})
      const ring = new Mesh(geom, mat)
      ring.rotation.set(...rot)
      scene.add(ring)
      return ring
    })

    // Clickable dot markers
    const dotMeshes = []
    VIEWS.forEach((view) => {
      const geom = new SphereGeometry(0.14, 8, 8)
      const mat = new MeshBasicMaterial({color: view.color, transparent: true, opacity: 0.8})
      const dot = new Mesh(geom, mat)
      dot.position.set(...view.pos)
      dot.userData.viewName = view.name
      scene.add(dot)
      dotMeshes.push(dot)
    })

    const raycaster = new Raycaster()
    const mouse = new Vector2()
    const rotatingGroup = [wireframe, ...rings, ...dotMeshes]

    stateRef.current = {renderer, scene, cam, rotatingGroup, dotMeshes, raycaster, mouse, bgDisc}

    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (viewer?.context) {
        const mainCam = viewer.context.getCamera()
        if (mainCam) {
          const q = mainCam.quaternion.clone().invert()
          rotatingGroup.forEach((obj) => obj.quaternion.copy(q))
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
      dotMeshes.forEach((d) => { d.geometry.dispose(); d.material.dispose() })
      rings.forEach((r) => { r.geometry.dispose(); r.material.dispose() })
      renderer.dispose()
    }
  }, [viewer])


  const handleClick = (event) => {
    if (isDragging.current) return
    if (!stateRef.current || !viewer?.context) return
    const {raycaster, mouse, dotMeshes, cam} = stateRef.current
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    mouse.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
    mouse.y = -(((event.clientY - rect.top) / rect.height) * 2) + 1

    raycaster.setFromCamera(mouse, cam)
    const hits = raycaster.intersectObjects(dotMeshes)
    if (hits.length === 0) return

    const viewName = hits[0].object.userData.viewName
    const view = VIEWS.find((v) => v.name === viewName)
    if (!view) return

    const cameraControls = viewer.context.ifcCamera?.cameraControls
    if (cameraControls) {
      const dist = cameraControls.distance
      const lookTarget = cameraControls.getTarget(new Vector3())
      const eye = new Vector3(...view.pos).multiplyScalar(dist).add(lookTarget)
      cameraControls.setLookAt(eye.x, eye.y, eye.z, lookTarget.x, lookTarget.y, lookTarget.z, true)
    }
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

  const rightOffset = isAppsVisible ? appsDrawerWidth : 0

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 16,
        left: `calc((100vw - ${rightOffset}px) / 2)`,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        cursor: 'grab',
        opacity: 0.85,
        transition: 'left 0.2s ease',
        '&:hover': {opacity: 1},
        '&:active': {cursor: 'grabbing'},
      }}
      data-testid='NavSphere'
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{display: 'block'}}
      />
    </Box>
  )
}

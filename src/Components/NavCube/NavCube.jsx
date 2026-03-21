import React, {useEffect, useRef, ReactElement} from 'react'
import {Box} from '@mui/material'
import {
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import useStore from '../../store/useStore'


const SIZE = 80
const FACES = ['right', 'left', 'top', 'bottom', 'front', 'back']
const LABELS = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK']
const FACE_COLORS = [
  '#cc3333', '#cc3333', // right, left (red axis)
  '#3366cc', '#3366cc', // top, bottom (blue axis)
  '#33aa55', '#33aa55', // front, back (green axis)
]


function makeFaceTexture(label, bgColor) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, 124, 124)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 64, 64)
  return new CanvasTexture(canvas)
}


const FACE_CAMERAS = {
  right: {eye: [1, 0, 0], up: [0, 1, 0]},
  left: {eye: [-1, 0, 0], up: [0, 1, 0]},
  top: {eye: [0, 1, 0], up: [0, 0, -1]},
  bottom: {eye: [0, -1, 0], up: [0, 0, 1]},
  front: {eye: [0, 0, 1], up: [0, 1, 0]},
  back: {eye: [0, 0, -1], up: [0, 1, 0]},
}


/** @return {ReactElement} */
export default function NavCube() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const viewer = useStore((state) => state.viewer)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true})
    renderer.setSize(SIZE, SIZE)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    const scene = new Scene()
    const cam = new OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 10)
    cam.position.set(2, 2, 2)
    cam.lookAt(0, 0, 0)
    scene.add(new DirectionalLight(0xffffff, 0.8))
    const light2 = new DirectionalLight(0xffffff, 0.4)
    light2.position.set(-1, -1, -1)
    scene.add(light2)
    const materials = LABELS.map((label, i) =>
      new MeshLambertMaterial({map: makeFaceTexture(label, FACE_COLORS[i])}),
    )
    const cube = new Mesh(new BoxGeometry(1.6, 1.6, 1.6), materials)
    scene.add(cube)
    const raycaster = new Raycaster()
    const mouse = new Vector2()
    stateRef.current = {renderer, scene, cam, cube, raycaster, mouse}
    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (viewer?.context) {
        const mainCam = viewer.context.getCamera()
        if (mainCam) {
          cube.quaternion.copy(mainCam.quaternion).invert()
        }
      }
      renderer.render(scene, cam)
    }
    animate()
    return () => {
      cancelAnimationFrame(animId)
      cube.geometry.dispose()
      materials.forEach((m) => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
      renderer.dispose()
    }
  }, [viewer])


  const handleClick = (event) => {
    if (!stateRef.current || !viewer?.context) return
    const {raycaster, mouse, cube, cam} = stateRef.current
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    mouse.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
    mouse.y = -(((event.clientY - rect.top) / rect.height) * 2) + 1
    raycaster.setFromCamera(mouse, cam)
    const hits = raycaster.intersectObject(cube)
    if (hits.length === 0) return
    const faceIndex = hits[0].face.materialIndex
    const face = FACES[faceIndex]
    const target = FACE_CAMERAS[face]
    if (!target) return
    const cameraControls = viewer.context.ifcCamera?.cameraControls
    if (cameraControls) {
      const dist = cameraControls.distance
      const lookTarget = cameraControls.getTarget(new Vector3())
      const eye = new Vector3(...target.eye).multiplyScalar(dist).add(lookTarget)
      cameraControls.setLookAt(eye.x, eye.y, eye.z, lookTarget.x, lookTarget.y, lookTarget.z, true)
    }
  }


  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        zIndex: 1000,
        cursor: 'pointer',
      }}
      data-testid='NavCube'
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        style={{display: 'block'}}
      />
    </Box>
  )
}

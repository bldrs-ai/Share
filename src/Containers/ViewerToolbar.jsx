import React, {useState, useCallback} from 'react'
import {IconButton, Slider, Stack, Tooltip} from '@mui/material'
import {
  Sun,
  Maximize,
  RotateCcw,
  RotateCw,
  Box as BoxIcon,
  Grid3x3,
} from 'lucide-react'
import {Scissors} from 'lucide-react'
import useCutPlaneControls from '../Components/CutPlane/CutPlaneMenu'
import LightManager from '../Infrastructure/LightManager'
import SunCompass from '../Components/Sun/SunCompass'
import useStore from '../store/useStore'


/**
 * Viewer toolbar — floating bar centered above the 3D viewport.
 * Contains tools that directly affect the 3D view.
 */
export default function ViewerToolbar() {
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)

  const [lightOn, setLightOn] = useState(false)
  const [lightManager, setLightManager] = useState(null)
  const [azimuth, setAzimuth] = useState(315)
  const [elevation, setElevation] = useState(25)
  const [isRotating, setIsRotating] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [ortho, setOrtho] = useState(false)

  const toggleLight = useCallback(() => {
    if (!viewer) return
    let mgr = lightManager
    if (!mgr) {
      mgr = new LightManager(viewer)
      setLightManager(mgr)
    }
    const nowOn = mgr.toggle()
    setLightOn(nowOn)
    if (!nowOn && isRotating) {
      setIsRotating(false)
    }
    if (nowOn) {
      setAzimuth(mgr.getAzimuth())
      setElevation(mgr.getElevation())
    }
  }, [viewer, lightManager, isRotating])

  const onAzimuthChange = useCallback((deg) => {
    if (!lightManager) return
    lightManager.setAzimuth(deg)
    setAzimuth(deg)
  }, [lightManager])

  const onElevationChange = useCallback((_, val) => {
    if (!lightManager) return
    lightManager.setElevation(val)
    setElevation(val)
  }, [lightManager])

  const toggleRotation = useCallback(() => {
    if (!lightManager) return
    if (isRotating) {
      lightManager.stopRotation()
      setIsRotating(false)
    } else {
      lightManager.startRotation((az) => setAzimuth(Math.round(az)))
      setIsRotating(true)
    }
  }, [lightManager, isRotating])

  const fitToView = useCallback(() => {
    if (!viewer) return
    try {
      viewer.IFC.context.ifcCamera.currentNavMode.fitModelToFrame()
    } catch { /* */ }
  }, [viewer])

  const resetCamera = useCallback(() => {
    if (!viewer) return
    try {
      const controls = viewer.IFC.context.ifcCamera.cameraControls
      controls.reset(true)
    } catch { /* */ }
  }, [viewer])

  const toggleWireframe = useCallback(() => {
    if (!viewer) return
    const scene = viewer.context.getScene()
    const newState = !wireframe
    scene.traverse((obj) => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          mat.wireframe = newState
        })
      }
    })
    setWireframe(newState)
  }, [viewer, wireframe])

  const toggleProjection = useCallback(() => {
    if (!viewer) return
    try {
      const camera = viewer.context.getCamera()
      const controls = viewer.IFC.context.ifcCamera.cameraControls
      if (camera.isPerspectiveCamera) {
        controls.camera.fov = ortho ? 45 : 1
        controls.camera.updateProjectionMatrix()
        setOrtho(!ortho)
      }
    } catch { /* */ }
  }, [viewer, ortho])

  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const isSvgFloorPlanVisible = useStore((state) => state.isSvgFloorPlanVisible)

  const sectionBarSx = {
    backgroundColor: 'var(--color-toolbar-bg)',
    backdropFilter: 'blur(8px)',
    borderRadius: '10px',
    padding: '3px 8px',
    border: '1px solid var(--color-toolbar-border)',
  }
  const cutPlane = useCutPlaneControls(sectionBarSx)

  if (!viewer || !isModelReady) return null

  let rightOffsetCSS = '0px'
  if (isSvgFloorPlanVisible && isAppsVisible) {
    rightOffsetCSS = `calc(50vw + ${appsDrawerWidth}px)`
  } else if (isSvgFloorPlanVisible) {
    rightOffsetCSS = '50vw'
  } else if (isAppsVisible) {
    rightOffsetCSS = `${appsDrawerWidth}px`
  }

  const btnSx = (active) => ({
    width: 30,
    height: 30,
    borderRadius: '6px',
    color: active ? 'var(--color-primary)' : 'var(--color-text)',
    opacity: active ? 1 : 0.6,
    '&:hover': {opacity: 1},
  })

  const barSx = {
    backgroundColor: 'var(--color-toolbar-bg)',
    backdropFilter: 'blur(8px)',
    borderRadius: '10px',
    padding: '3px 8px',
    border: '1px solid var(--color-toolbar-border)',
  }

  const sliderSx = {
    width: 60,
    color: 'var(--color-text)',
    opacity: 0.6,
    '& .MuiSlider-thumb': {
      width: 10,
      height: 10,
    },
    '& .MuiSlider-rail': {
      opacity: 0.3,
    },
  }

  return (
    <Stack
      direction='column'
      alignItems='center'
      spacing={0.5}
      sx={{
        position: 'absolute',
        top: '48px',
        left: `calc((100vw - ${rightOffsetCSS}) / 2)`,
        transform: 'translateX(-50%)',
        transition: 'left 50ms ease',
        zIndex: 5,
        pointerEvents: 'none',
      }}
      data-testid='ViewerToolbar'
    >
      {/* Main toolbar row */}
      <Stack
        direction='row'
        alignItems='center'
        spacing={0.25}
        sx={{...barSx, pointerEvents: 'auto'}}
      >
        <Tooltip title='Fit to view' placement='bottom'>
          <IconButton size='small' onClick={fitToView} sx={btnSx(false)}>
            <Maximize size={15} strokeWidth={1.75}/>
          </IconButton>
        </Tooltip>

        <Tooltip title='Reset camera' placement='bottom'>
          <IconButton size='small' onClick={resetCamera} sx={btnSx(false)}>
            <RotateCcw size={15} strokeWidth={1.75}/>
          </IconButton>
        </Tooltip>

        <Tooltip title={lightOn ? 'Light off' : 'Light on'} placement='bottom'>
          <IconButton size='small' onClick={toggleLight} sx={btnSx(lightOn)}>
            <Sun size={15} strokeWidth={1.75}/>
          </IconButton>
        </Tooltip>

        <Tooltip title={wireframe ? 'Solid' : 'Wireframe'} placement='bottom'>
          <IconButton size='small' onClick={toggleWireframe} sx={btnSx(wireframe)}>
            <Grid3x3 size={15} strokeWidth={1.75}/>
          </IconButton>
        </Tooltip>

        <Tooltip title={ortho ? 'Perspective' : 'Orthographic'} placement='bottom'>
          <IconButton size='small' onClick={toggleProjection} sx={btnSx(ortho)}>
            <BoxIcon size={15} strokeWidth={1.75}/>
          </IconButton>
        </Tooltip>

        {cutPlane.button}
      </Stack>

      {/* Section plane controls — appears below when scissors is clicked */}
      {cutPlane.subBar}

      {/* Sun controls sub-bar — appears below when light is on */}
      {lightOn && (
        <Stack
          direction='row'
          alignItems='center'
          spacing={0.5}
          sx={{...barSx, pointerEvents: 'auto'}}
        >
          <Tooltip title={`Azimuth: ${azimuth}°`} placement='bottom'>
            <span style={{display: 'flex', alignItems: 'center'}}>
              <SunCompass azimuth={azimuth} onChange={onAzimuthChange} active={lightOn}/>
            </span>
          </Tooltip>

          <Tooltip title={`Elevation: ${elevation}°`} placement='bottom'>
            <Slider
              size='small'
              min={5}
              max={85}
              step={1}
              value={elevation}
              onChange={onElevationChange}
              sx={sliderSx}
            />
          </Tooltip>

          <Tooltip title={isRotating ? 'Stop rotation' : 'Rotate sun'} placement='bottom'>
            <IconButton size='small' onClick={toggleRotation} sx={btnSx(isRotating)}>
              <RotateCw size={15} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  )
}

import React, {useState, useCallback} from 'react'
import {IconButton, InputBase, Slider, Stack, Tooltip} from '@mui/material'
import {
  Sun,
  Maximize,
  RotateCcw,
  RotateCw,
  Box as BoxIcon,
  Grid3x3,
  Search,
} from 'lucide-react'
import {Scissors} from 'lucide-react'
import useCutPlaneControls from '../Components/CutPlane/CutPlaneMenu'
import useElementFilter from '../Components/Filter/useElementFilter.jsx'
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
  const elementFilter = useElementFilter(sectionBarSx)

  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const rootElement = useStore((state) => state.rootElement)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const handleSearch = useCallback((text) => {
    setSearchText(text)
    if (!text.trim() || !rootElement) {
      setSearchResults([])
      return
    }
    const query = text.trim().toLowerCase()
    const results = []
    const searchTree = (node, parentPath) => {
      if (results.length >= 20) return
      const name = node.Name?.value || node.Name || ''
      const longName = node.LongName?.value || node.LongName || ''
      const type = node.type || ''
      const description = node.Description?.value || node.Description || ''
      const displayName = name || longName || `${type} #${node.expressID}`
      const currentPath = parentPath ? `${parentPath} > ${displayName}` : displayName

      const match = name.toLowerCase().includes(query) ||
        longName.toLowerCase().includes(query) ||
        type.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query)
      if (match && node.expressID !== undefined) {
        // Find parent storey
        let storey = ''
        let p = node.parent
        while (p) {
          if (p.type === 'IFCBUILDINGSTOREY') {
            storey = p.Name?.value || p.Name || ''
            break
          }
          p = p.parent
        }
        const childCount = node.children ? node.children.length : 0
        const typeClean = type.replace(/^IFC/, '').replace(/([A-Z])/g, ' $1').trim()
        results.push({
          expressID: node.expressID,
          name: displayName,
          longName: longName && longName !== name ? longName : '',
          type,
          typeClean,
          description,
          storey,
          childCount,
          path: parentPath || '',
        })
      }
      if (node.children) {
        node.children.forEach((child) => searchTree(child, currentPath))
      }
    }
    searchTree(rootElement, '')
    setSearchResults(results)
  }, [rootElement])

  const selectSearchResult = useCallback((result) => {
    if (!viewer) return
    try {
      // Select the element
      viewer.setSelection([result.expressID])
      // Zoom to it
      viewer.IFC.context.ifcCamera.currentNavMode.fitModelToFrame()
    } catch (err) {
      console.warn('[Search] Failed to select/zoom:', err)
    }
    setSearchOpen(false)
    setSearchText('')
    setSearchResults([])
  }, [viewer])

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
        {/* Search */}
        {isSearchEnabled && (
          <>
            <Tooltip title='Search' placement='bottom'>
              <IconButton size='small' onClick={() => setSearchOpen(!searchOpen)} sx={btnSx(false)}>
                <Search size={15} strokeWidth={1.75}/>
              </IconButton>
            </Tooltip>
            {searchOpen && (
              <div style={{position: 'relative'}}>
                <InputBase
                  autoFocus
                  placeholder='Search elements...'
                  value={searchText}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setSearchOpen(false); setSearchText(''); setSearchResults([]) }
                  }}
                  sx={{
                    fontSize: '13px',
                    color: 'var(--color-text)',
                    width: 180,
                    height: 24,
                    px: 1,
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-surface)',
                    '& input': {padding: 0},
                    '& input::placeholder': {opacity: 0.4, fontSize: '11px'},
                  }}
                />
                {searchResults.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: 36,
                    left: 0,
                    width: 420,
                    maxHeight: 360,
                    overflowY: 'auto',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}>
                    <div style={{padding: '6px 12px', fontSize: 11, opacity: 0.4, borderBottom: '1px solid var(--color-border)'}}>
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    {searchResults.map((r) => (
                      <div
                        key={r.expressID}
                        onClick={() => selectSearchResult(r)}
                        style={{
                          padding: '10px 12px',
                          cursor: 'pointer',
                          color: 'var(--color-text)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        {/* Title line — element name */}
                        <div style={{fontSize: 13, fontWeight: 500, marginBottom: 2}}>
                          {r.name}
                          {r.longName && <span style={{fontWeight: 400, opacity: 0.6, marginLeft: 6}}>{r.longName}</span>}
                        </div>
                        {/* Type + location breadcrumb */}
                        <div style={{fontSize: 11, opacity: 0.5, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                          <span style={{
                            backgroundColor: 'var(--color-selected)',
                            color: 'var(--color-primary)',
                            padding: '1px 6px',
                            borderRadius: 3,
                            fontWeight: 500,
                          }}>
                            {r.typeClean}
                          </span>
                          {r.storey && <span>Storey: {r.storey}</span>}
                          {r.childCount > 0 && <span>{r.childCount} children</span>}
                          <span>ID: {r.expressID}</span>
                        </div>
                        {/* Description */}
                        {r.description && (
                          <div style={{fontSize: 11, opacity: 0.4, marginTop: 3}}>{r.description}</div>
                        )}
                        {/* Path breadcrumb */}
                        {r.path && (
                          <div style={{fontSize: 11, opacity: 0.3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            {r.path}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span style={{width: 1, height: 20, backgroundColor: 'var(--color-border)', margin: '0 4px', flexShrink: 0}}/>
          </>
        )}

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
        {elementFilter.button}
      </Stack>

      {/* Section plane controls — appears below when scissors is clicked */}
      {cutPlane.subBar}

      {/* Element filter — appears below when filter is clicked */}
      {elementFilter.subBar}

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

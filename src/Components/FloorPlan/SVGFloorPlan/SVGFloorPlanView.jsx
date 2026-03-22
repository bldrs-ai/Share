import React, {useState, useEffect, useRef, useCallback} from 'react'
import useStore from '../../../store/useStore'
import {extractFloorPlanGeometry} from './GeometryExtractor'
import {renderSVG} from './SVGRenderer'
import {
  findSnapPoint,
  createDistanceMeasurement,
  svgEventToWorldCoords,
} from './MeasurementTool'
import {downloadSVG, generateFilename} from './ExportManager'
import './svgStyles.css'


/**
 * SVG Floor Plan side panel.
 * Renders 2D floor plan geometry with measurement tools.
 */
export default function SVGFloorPlanView() {
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const floors = useStore((state) => state.floors)
  const currentFloorIndex = useStore((state) => state.currentFloorIndex)
  const isFloorPlanMode = useStore((state) => state.isFloorPlanMode)

  const [elements, setElements] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [annotations, setAnnotations] = useState([])
  const [activeTool, setActiveTool] = useState('select') // select | measure | text
  const [pendingPoint, setPendingPoint] = useState(null)
  const [snapIndicator, setSnapIndicator] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  // Zoom & pan state: [x, y, width, height] of the viewBox
  const [viewBox, setViewBox] = useState(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({x: 0, y: 0})

  const svgContainerRef = useRef(null)

  const currentFloor = currentFloorIndex !== null ? floors[currentFloorIndex] : null

  // Extract geometry when floor changes
  useEffect(() => {
    if (!viewer || !model || !currentFloor || !isFloorPlanMode) {
      setElements([])
      return
    }

    let cancelled = false
    setLoading(true)
    setStatus('Extracting geometry...')

    extractFloorPlanGeometry(viewer, currentFloor.expressId, model)
      .then((els) => {
        if (!cancelled) {
          setElements(els)
          setLoading(false)
          setStatus(`${els.length} elements extracted`)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false)
          setStatus(`Error: ${err.message}`)
        }
      })

    return () => { cancelled = true }
  }, [viewer, model, currentFloor, isFloorPlanMode])

  // Reset viewBox when elements change
  useEffect(() => {
    if (elements.length > 0) {
      setViewBox(null) // null = use default from SVG
    }
  }, [elements])

  // Zoom with scroll wheel
  const handleWheel = useCallback((event) => {
    event.preventDefault()
    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    const vb = svgEl.viewBox.baseVal
    if (!vb || vb.width === 0) return

    // Current viewBox
    let {x, y, width, height} = viewBox || {x: vb.x, y: vb.y, width: vb.width, height: vb.height}

    // Zoom factor
    const zoomSpeed = 0.1
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed

    // Zoom towards mouse position
    const rect = svgEl.getBoundingClientRect()
    const mx = (event.clientX - rect.left) / rect.width  // 0..1
    const my = (event.clientY - rect.top) / rect.height

    const newWidth = width * delta
    const newHeight = height * delta

    // Adjust origin so zoom centers on mouse
    const newX = x + (width - newWidth) * mx
    const newY = y + (height - newHeight) * my

    setViewBox({x: newX, y: newY, width: newWidth, height: newHeight})
  }, [viewBox])

  // Pan with middle mouse button or when select tool is active
  const handlePanStart = useCallback((event) => {
    // Pan on middle mouse, or left mouse in select mode
    if (event.button === 1 || (event.button === 0 && activeTool === 'select')) {
      isPanningRef.current = true
      panStartRef.current = {x: event.clientX, y: event.clientY}
    }
  }, [activeTool])

  const handlePanMove = useCallback((event) => {
    if (!isPanningRef.current) return

    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    const vb = svgEl.viewBox.baseVal
    const rect = svgEl.getBoundingClientRect()
    const {x, y, width, height} = viewBox || {x: vb.x, y: vb.y, width: vb.width, height: vb.height}

    // Convert pixel delta to viewBox units
    const dx = -(event.clientX - panStartRef.current.x) * (width / rect.width)
    const dy = -(event.clientY - panStartRef.current.y) * (height / rect.height)

    panStartRef.current = {x: event.clientX, y: event.clientY}
    setViewBox({x: x + dx, y: y + dy, width, height})
  }, [viewBox])

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false
  }, [])

  // Handle SVG click for measurements
  const handleSVGClick = useCallback((event) => {
    if (activeTool !== 'measure') return

    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    const [wx, wz] = svgEventToWorldCoords(event, svgEl)
    const snap = findSnapPoint(wx, wz, elements)

    if (!pendingPoint) {
      // First click — start measurement
      setPendingPoint([snap.x, snap.z])
      setStatus('Click second point to measure distance')
    } else {
      // Second click — complete measurement
      const m = createDistanceMeasurement(pendingPoint, [snap.x, snap.z])
      setMeasurements((prev) => [...prev, m])
      setPendingPoint(null)
      setStatus(`Distance: ${m.distance.toFixed(2)}m`)
    }
  }, [activeTool, pendingPoint, elements])

  // Handle mouse move for snap indicator
  const handleMouseMove = useCallback((event) => {
    if (activeTool !== 'measure') {
      setSnapIndicator(null)
      return
    }

    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    const [wx, wz] = svgEventToWorldCoords(event, svgEl)
    const snap = findSnapPoint(wx, wz, elements)

    if (snap.snapped) {
      setSnapIndicator({x: snap.x, z: snap.z})
    } else {
      setSnapIndicator(null)
    }
  }, [activeTool, elements])

  const handleExport = useCallback(() => {
    const svg = renderSVG(elements, measurements, annotations, {
      scale: 100,
      title: 'Model',
      storey: currentFloor?.name || 'Unknown',
    })
    const filename = generateFilename('model', currentFloor?.name)
    downloadSVG(svg, filename)
    setStatus(`Exported: ${filename}`)
  }, [elements, measurements, annotations, currentFloor])

  const handleClearMeasurements = useCallback(() => {
    setMeasurements([])
    setPendingPoint(null)
    setStatus('Measurements cleared')
  }, [])

  const handleDeleteLastMeasurement = useCallback(() => {
    setMeasurements((prev) => prev.slice(0, -1))
  }, [])

  if (!isFloorPlanMode || !currentFloor) {
    return null
  }

  // Generate SVG content
  const svgContent = renderSVG(elements, measurements, annotations, {
    scale: 100,
    storey: currentFloor?.name,
  })

  // Override viewBox if user has zoomed/panned
  let liveSvg = svgContent
  if (viewBox) {
    liveSvg = liveSvg.replace(
      /viewBox="[^"]*"/,
      `viewBox="${viewBox.x.toFixed(4)} ${viewBox.y.toFixed(4)} ${viewBox.width.toFixed(4)} ${viewBox.height.toFixed(4)}"`,
    )
  }

  // Add snap indicator
  if (snapIndicator) {
    const r = viewBox ? viewBox.width * 0.008 : 0.15
    const snapCircle = `<circle cx="${snapIndicator.x}" cy="${snapIndicator.z}" r="${r}" fill="none" stroke="#c00" stroke-width="${r * 0.3}" class="snap-point"/>`
    liveSvg = liveSvg.replace('</svg>', `${snapCircle}\n</svg>`)
  }
  if (pendingPoint) {
    const r = viewBox ? viewBox.width * 0.005 : 0.1
    const pendingCircle = `<circle cx="${pendingPoint[0]}" cy="${pendingPoint[1]}" r="${r}" fill="#c00" class="snap-point"/>`
    liveSvg = liveSvg.replace('</svg>', `${pendingCircle}\n</svg>`)
  }

  const handleClose = useCallback(() => {
    // Exit floor plan mode entirely
    const setIsFloorPlanMode = useStore.getState().setIsFloorPlanMode
    const setCurrentFloorIndex = useStore.getState().setCurrentFloorIndex
    setIsFloorPlanMode(false)
    setCurrentFloorIndex(null)
    // Clear clipping — trigger the FloorPlanManager exit via Escape key event
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))
  }, [])

  return (
    <div className='svg-floorplan-panel'>
      <div className='svg-floorplan-toolbar'>
        <button className='close-btn' onClick={handleClose} title='Close floor plan'>
          ✕
        </button>
        <div className='separator'/>
        <button
          className={activeTool === 'select' ? 'active' : ''}
          onClick={() => { setActiveTool('select'); setPendingPoint(null) }}
        >
          Select
        </button>
        <button
          className={activeTool === 'measure' ? 'active' : ''}
          onClick={() => setActiveTool('measure')}
        >
          Measure
        </button>
        <div className='separator'/>
        <button onClick={handleDeleteLastMeasurement} disabled={measurements.length === 0}>
          Undo
        </button>
        <button onClick={handleClearMeasurements} disabled={measurements.length === 0}>
          Clear
        </button>
        <div className='separator'/>
        <button onClick={handleExport} disabled={elements.length === 0}>
          Export SVG
        </button>
      </div>
      <div
        className='svg-floorplan-viewport'
        ref={svgContainerRef}
        onClick={handleSVGClick}
        onMouseMove={(e) => { handleMouseMove(e); handlePanMove(e) }}
        onMouseDown={handlePanStart}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onWheel={handleWheel}
        dangerouslySetInnerHTML={{__html: liveSvg}}
      />
      <div className='svg-floorplan-status'>
        {loading ? 'Loading...' : status}
        {measurements.length > 0 && ` | ${measurements.length} measurement${measurements.length > 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

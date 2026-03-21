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

  // Add snap indicator to live SVG
  let liveSvg = svgContent
  if (snapIndicator) {
    const snapCircle = `<circle cx="${snapIndicator.x}" cy="${snapIndicator.z}" r="0.15" fill="none" stroke="#FF6B35" stroke-width="0.05" class="snap-point"/>`
    liveSvg = liveSvg.replace('</svg>', `${snapCircle}\n</svg>`)
  }
  if (pendingPoint) {
    const pendingCircle = `<circle cx="${pendingPoint[0]}" cy="${pendingPoint[1]}" r="0.1" fill="#FF6B35" class="snap-point"/>`
    liveSvg = liveSvg.replace('</svg>', `${pendingCircle}\n</svg>`)
  }

  return (
    <div className='svg-floorplan-panel'>
      <div className='svg-floorplan-toolbar'>
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
        onMouseMove={handleMouseMove}
        dangerouslySetInnerHTML={{__html: liveSvg}}
      />
      <div className='svg-floorplan-status'>
        {loading ? 'Loading...' : status}
        {measurements.length > 0 && ` | ${measurements.length} measurement${measurements.length > 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

import React, {useState, useEffect, useRef, useCallback} from 'react'
import useStore from '../../../store/useStore'
import {extractFloorPlanGeometry} from './GeometryExtractor'
import {renderSVG} from './SVGRenderer'
import {
  findSnapPoint,
  createDistanceMeasurement,
  createAreaMeasurement,
  svgEventToWorldCoords,
} from './MeasurementTool'
import {downloadSVG, generateFilename} from './ExportManager'
import {renderWithTemplate} from './templates/TemplateRenderer'
import {createDocument, saveDocument, createNewVersion, getDocumentsForModel} from './storage/DocumentStore'
import DocumentBar from './DocumentBar'
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
  const [activeTool, setActiveTool] = useState('select') // select | measure | area
  const [pendingPoint, setPendingPoint] = useState(null)
  const [areaPoints, setAreaPoints] = useState([]) // accumulates points for area measurement
  const [snapIndicator, setSnapIndicator] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [currentDoc, setCurrentDoc] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const autoSaveTimerRef = useRef(null)

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

  // Create or load document when floor changes
  useEffect(() => {
    if (!currentFloor || !isFloorPlanMode) return

    // Check for existing document for this floor
    const modelId = window.location.pathname || 'local'
    const existing = getDocumentsForModel(modelId)
    const forFloor = existing.find((d) => d.storeyName === currentFloor.name)

    if (forFloor) {
      setCurrentDoc(forFloor)
      setMeasurements(forFloor.measurements || [])
      setAnnotations(forFloor.annotations || [])
      setSaveStatus('Loaded')
    } else {
      const doc = createDocument({
        modelId,
        name: currentFloor.name,
        storeyName: currentFloor.name,
        storeyElevation: currentFloor.elevation,
      })
      setCurrentDoc(doc)
      setSaveStatus('New')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFloor, isFloorPlanMode])

  // Auto-save on changes (debounced 2s)
  useEffect(() => {
    if (!currentDoc) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    setSaveStatus('Unsaved')

    autoSaveTimerRef.current = setTimeout(() => {
      const updated = {
        ...currentDoc,
        measurements,
        annotations,
        viewBox,
      }
      saveDocument(updated)
      setCurrentDoc(updated)
      setSaveStatus('Saved')
    }, 2000)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, annotations, viewBox])

  // Document management callbacks
  const handleDocNameChange = useCallback((name) => {
    if (!currentDoc) return
    const updated = {...currentDoc, name}
    saveDocument(updated)
    setCurrentDoc(updated)
  }, [currentDoc])

  const handleTemplateChange = useCallback((templateId) => {
    if (!currentDoc) return
    const updated = {...currentDoc, templateId}
    saveDocument(updated)
    setCurrentDoc(updated)
  }, [currentDoc])

  const handleScaleChange = useCallback((scale) => {
    if (!currentDoc) return
    const updated = {...currentDoc, scale}
    saveDocument(updated)
    setCurrentDoc(updated)
  }, [currentDoc])

  const handleNewVersion = useCallback(() => {
    if (!currentDoc) return
    const updated = createNewVersion({...currentDoc, measurements, annotations, viewBox})
    setCurrentDoc(updated)
    setSaveStatus(`Version ${updated.version}`)
    setStatus(`Created version ${updated.version}`)
  }, [currentDoc, measurements, annotations, viewBox])

  const handleOpenDoc = useCallback((doc) => {
    setCurrentDoc(doc)
    setMeasurements(doc.measurements || [])
    setAnnotations(doc.annotations || [])
    if (doc.viewBox) setViewBox(doc.viewBox)
    setSaveStatus('Loaded')
  }, [])

  const handleNewDoc = useCallback(() => {
    const modelId = window.location.pathname || 'local'
    const doc = createDocument({
      modelId,
      name: `${currentFloor?.name || 'Floor'} - New`,
      storeyName: currentFloor?.name || '',
      storeyElevation: currentFloor?.elevation || 0,
    })
    setCurrentDoc(doc)
    setMeasurements([])
    setAnnotations([])
    setViewBox(null)
    setSaveStatus('New')
  }, [currentFloor])

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
    if (activeTool !== 'measure' && activeTool !== 'area') return

    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    const [wx, wz] = svgEventToWorldCoords(event, svgEl)
    const snap = findSnapPoint(wx, wz, elements)
    const pt = [snap.x, snap.z]

    if (activeTool === 'measure') {
      // Distance: two-point measurement
      if (!pendingPoint) {
        setPendingPoint(pt)
        setStatus('Click second point to measure distance')
      } else {
        const m = createDistanceMeasurement(pendingPoint, pt)
        setMeasurements((prev) => [...prev, m])
        setPendingPoint(null)
        setStatus(`Distance: ${m.distance.toFixed(2)}m`)
      }
    } else if (activeTool === 'area') {
      // Area: multi-point polygon
      const newPoints = [...areaPoints, pt]

      // Close polygon if clicking near the first point (and we have 3+ points)
      if (areaPoints.length >= 3) {
        const first = areaPoints[0]
        const dist = Math.sqrt((pt[0] - first[0]) ** 2 + (pt[1] - first[1]) ** 2)
        const closeThreshold = viewBox ? viewBox.width * 0.03 : 0.5
        if (dist < closeThreshold) {
          // Close the polygon — compute area
          const areaMeasurement = createAreaMeasurement(areaPoints)
          setMeasurements((prev) => [...prev, areaMeasurement])
          setAreaPoints([])
          setStatus(`Area: ${areaMeasurement.area.toFixed(2)} m²`)
          return
        }
      }

      setAreaPoints(newPoints)
      setStatus(`${newPoints.length} points — click near first point to close (${newPoints.length >= 3 ? 'ready' : 'need 3+'})`)
    }
  }, [activeTool, pendingPoint, areaPoints, elements, viewBox])

  // Handle double-click to close area polygon
  const handleSVGDoubleClick = useCallback((event) => {
    if (activeTool !== 'area' || areaPoints.length < 3) return
    event.preventDefault()

    const areaMeasurement = createAreaMeasurement(areaPoints)
    setMeasurements((prev) => [...prev, areaMeasurement])
    setAreaPoints([])
    setStatus(`Area: ${areaMeasurement.area.toFixed(2)} m²`)
  }, [activeTool, areaPoints])

  // Handle mouse move for snap indicator
  const handleMouseMove = useCallback((event) => {
    if (activeTool !== 'measure' && activeTool !== 'area') {
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
    const scale = currentDoc?.scale || 100
    const templateId = currentDoc?.templateId || 'minimal'
    const baseSvg = renderSVG(elements, measurements, annotations, {
      scale,
      storey: currentFloor?.name || 'Unknown',
    })
    const svg = renderWithTemplate(baseSvg, templateId, {
      project: currentDoc?.name || 'Untitled',
      storey: currentFloor?.name || '',
      scale: `1:${scale}`,
      date: new Date().toLocaleDateString(),
      revision: String(currentDoc?.version || 1),
    })
    const filename = generateFilename(currentDoc?.name || 'model', currentFloor?.name)
    downloadSVG(svg, filename)
    setStatus(`Exported: ${filename}`)
  }, [elements, measurements, annotations, currentFloor, currentDoc])

  const handleClearMeasurements = useCallback(() => {
    setMeasurements([])
    setPendingPoint(null)
    setAreaPoints([])
    setStatus('Measurements cleared')
  }, [])

  const handleUndo = useCallback(() => {
    // If we're in the middle of placing area points, remove the last point
    if (areaPoints.length > 0) {
      setAreaPoints((prev) => prev.slice(0, -1))
      setStatus(areaPoints.length > 1 ? `${areaPoints.length - 1} points` : 'Area tool: click to start')
      return
    }
    // If we have a pending distance point, cancel it
    if (pendingPoint) {
      setPendingPoint(null)
      setStatus('Measurement cancelled')
      return
    }
    // Otherwise remove the last completed measurement
    if (measurements.length > 0) {
      setMeasurements((prev) => prev.slice(0, -1))
      setStatus('Last measurement removed')
    }
  }, [areaPoints, pendingPoint, measurements])

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

  // Draw in-progress area polygon
  if (areaPoints.length > 0) {
    const sw = viewBox ? viewBox.width * 0.003 : 0.03
    const r = viewBox ? viewBox.width * 0.005 : 0.08
    let areaOverlay = ''

    // Filled polygon preview + live area calculation (if 3+ points)
    if (areaPoints.length >= 3) {
      const pts = areaPoints.map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`).join(' ')
      areaOverlay += `<polygon points="${pts}" fill="rgba(0,150,200,0.15)" stroke="#0096c8" stroke-width="${sw}" stroke-dasharray="${sw * 4},${sw * 2}"/>`

      // Live area value at centroid
      const liveArea = createAreaMeasurement(areaPoints)
      let cx = 0, cz = 0
      for (const [x, z] of areaPoints) { cx += x; cz += z }
      cx /= areaPoints.length; cz /= areaPoints.length
      const fontSize = viewBox ? viewBox.width * 0.02 : 0.25
      const areaLabel = liveArea.area >= 1 ? `${liveArea.area.toFixed(1)} m²` : `${(liveArea.area * 10000).toFixed(0)} cm²`
      areaOverlay += `<text x="${cx.toFixed(4)}" y="${cz.toFixed(4)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="#0096c8" text-anchor="middle" dominant-baseline="middle" font-weight="600">${areaLabel}</text>`
    }

    // Lines connecting points
    for (let i = 0; i < areaPoints.length - 1; i++) {
      const [x1, z1] = areaPoints[i]
      const [x2, z2] = areaPoints[i + 1]
      areaOverlay += `<line x1="${x1.toFixed(4)}" y1="${z1.toFixed(4)}" x2="${x2.toFixed(4)}" y2="${z2.toFixed(4)}" stroke="#0096c8" stroke-width="${sw}"/>`

      // Edge length label
      const edgeLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
      if (edgeLen > 0.3) {
        const emx = (x1 + x2) / 2, emz = (z1 + z2) / 2
        const edgeFontSize = viewBox ? viewBox.width * 0.012 : 0.15
        areaOverlay += `<text x="${emx.toFixed(4)}" y="${emz.toFixed(4)}" font-family="Helvetica, Arial, sans-serif" font-size="${edgeFontSize}" fill="#0096c8" text-anchor="middle" dominant-baseline="middle">${edgeLen.toFixed(2)}</text>`
      }
    }

    // Point markers with numbers
    for (let i = 0; i < areaPoints.length; i++) {
      const [x, z] = areaPoints[i]
      areaOverlay += `<circle cx="${x.toFixed(4)}" cy="${z.toFixed(4)}" r="${r}" fill="#0096c8"/>`
    }

    // First point highlight — large target for closing
    if (areaPoints.length >= 3) {
      const [fx, fz] = areaPoints[0]
      const closeR = r * 4 // larger close target
      areaOverlay += `<circle cx="${fx.toFixed(4)}" cy="${fz.toFixed(4)}" r="${closeR}" fill="rgba(0,150,200,0.1)" stroke="#0096c8" stroke-width="${sw}" stroke-dasharray="${sw * 3},${sw}"/>`
      const labelSize = viewBox ? viewBox.width * 0.01 : 0.12
      areaOverlay += `<text x="${fx.toFixed(4)}" y="${(fz - closeR - labelSize).toFixed(4)}" font-family="Helvetica, Arial, sans-serif" font-size="${labelSize}" fill="#0096c8" text-anchor="middle">click to close</text>`
    }

    liveSvg = liveSvg.replace('</svg>', `${areaOverlay}\n</svg>`)
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
          onClick={() => { setActiveTool('measure'); setAreaPoints([]) }}
        >
          Distance
        </button>
        <button
          className={activeTool === 'area' ? 'active' : ''}
          onClick={() => { setActiveTool('area'); setPendingPoint(null) }}
        >
          Area
        </button>
        <div className='separator'/>
        <button
          onClick={handleUndo}
          disabled={measurements.length === 0 && areaPoints.length === 0 && !pendingPoint}
        >
          Undo
        </button>
        <button
          onClick={handleClearMeasurements}
          disabled={measurements.length === 0 && areaPoints.length === 0}
        >
          Clear
        </button>
        <div className='separator'/>
        <button onClick={handleExport} disabled={elements.length === 0}>
          Export SVG
        </button>
      </div>
      <DocumentBar
        document={currentDoc}
        onNameChange={handleDocNameChange}
        onTemplateChange={handleTemplateChange}
        onScaleChange={handleScaleChange}
        onNewVersion={handleNewVersion}
        onOpen={handleOpenDoc}
        onNew={handleNewDoc}
        saveStatus={saveStatus}
      />
      <div
        className='svg-floorplan-viewport'
        ref={svgContainerRef}
        onClick={handleSVGClick}
        onDoubleClick={handleSVGDoubleClick}
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

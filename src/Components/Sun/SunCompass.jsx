import React, {useRef, useCallback} from 'react'


const SIZE = 36
const CENTER = SIZE / 2
const RING_R = 14
const HANDLE_R = 4
const TICK_LEN = 3


/**
 * Circular compass dial for sun azimuth control.
 * 0° = North (top), 90° = East (right), 180° = South, 270° = West.
 */
export default function SunCompass({azimuth, onChange, active}) {
  const svgRef = useRef(null)

  const azToAngle = (az) => (az - 90) * (Math.PI / 180)

  const handleX = CENTER + RING_R * Math.cos(azToAngle(azimuth))
  const handleY = CENTER + RING_R * Math.sin(azToAngle(azimuth))

  const computeAzimuth = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    // atan2 gives angle from +X axis; rotate so up (negative Y) = 0°
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    deg = ((deg % 360) + 360) % 360
    return Math.round(deg)
  }, [])

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    const svg = svgRef.current
    svg.setPointerCapture(e.pointerId)
    onChange(computeAzimuth(e.clientX, e.clientY))

    const onMove = (ev) => onChange(computeAzimuth(ev.clientX, ev.clientY))
    const onUp = (ev) => {
      svg.releasePointerCapture(ev.pointerId)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
    }
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
  }, [onChange, computeAzimuth])

  // Cardinal tick marks at N(0°), E(90°), S(180°), W(270°)
  const ticks = [0, 90, 180, 270].map((deg) => {
    const a = azToAngle(deg)
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    return {
      x1: CENTER + (RING_R - TICK_LEN) * cos,
      y1: CENTER + (RING_R - TICK_LEN) * sin,
      x2: CENTER + (RING_R + 1) * cos,
      y2: CENTER + (RING_R + 1) * sin,
    }
  })

  const color = 'currentColor'
  const handleColor = active ? '#00ff00' : color

  return (
    <svg
      ref={svgRef}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{cursor: 'pointer', flexShrink: 0}}
      onPointerDown={onPointerDown}
    >
      {/* Ring */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.4}
      />
      {/* Cardinal ticks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={color}
          strokeWidth={1}
          opacity={0.5}
        />
      ))}
      {/* Handle */}
      <circle
        cx={handleX}
        cy={handleY}
        r={HANDLE_R}
        fill={handleColor}
        opacity={active ? 1 : 0.6}
      />
    </svg>
  )
}

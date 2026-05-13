/* eslint-disable no-magic-numbers */
/**
 * Lightweight render-loop perf panel — FPS, frame time (ms), and JS heap
 * memory (MB, where `performance.memory` exists).  A minimal port of
 * mrdoob's stats.js (MIT) — the panel that the three.js examples use.
 *
 * Off by default so production builds pay nothing.  Toggle from devtools:
 *
 *   perf.on()       show panel + start sampling
 *   perf.off()      remove panel + stop sampling
 *   perf.toggle()
 *
 * The render loop calls `perfBegin()` / `perfEnd()` unconditionally; both
 * are cheap no-ops when the panel isn't active, so we don't have to
 * conditionalise the hot path.
 *
 * Click the panel to cycle FPS -> MS -> MB.
 */

const PANEL_WIDTH = 80
const PANEL_HEIGHT = 48
const GRAPH_X = 3
const GRAPH_Y = 15
const GRAPH_WIDTH = 74
const GRAPH_HEIGHT = 30
const TEXT_X = 3
const TEXT_Y = 2
const PIXEL_RATIO = Math.round(window.devicePixelRatio || 1)
const PW = PANEL_WIDTH * PIXEL_RATIO
const PH = PANEL_HEIGHT * PIXEL_RATIO
const GX = GRAPH_X * PIXEL_RATIO
const GY = GRAPH_Y * PIXEL_RATIO
const GW = GRAPH_WIDTH * PIXEL_RATIO
const GH = GRAPH_HEIGHT * PIXEL_RATIO
const TX = TEXT_X * PIXEL_RATIO
const TY = TEXT_Y * PIXEL_RATIO
const TEXT_PX = 9 * PIXEL_RATIO

// Sample-window for the FPS counter — refresh the displayed number once
// per second so it doesn't strobe.
const FPS_REFRESH_MS = 1000
// Upper end of the graph y-axis (visual ceiling, not a clamp on the
// stored value).  100fps / 200ms are loose; the three.js examples use
// the same numbers.
const FPS_MAX = 100
const MS_MAX = 200
const BYTES_PER_MB = 1048576

// Panel indices into Monitor#panels — order matches PANELS below.
const I_FPS = 0
const I_MS = 1
const I_MB = 2

const PANELS = [
  {name: 'FPS', fg: '#0ff', bg: '#002'},
  {name: 'MS', fg: '#0f0', bg: '#020'},
  {name: 'MB', fg: '#f08', bg: '#201'},
]


/**
 * A single panel (one of FPS / MS / MB).  Backed by a canvas drawn in
 * two regions: a label row up top, and a scrolling graph below.
 */
class Panel {
  /**
   * @param {{name: string, fg: string, bg: string}} spec
   */
  constructor(spec) {
    this.spec = spec
    this.min = Infinity
    this.max = 0

    const canvas = document.createElement('canvas')
    canvas.width = PW
    canvas.height = PH
    canvas.style.cssText = `width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;display:block`
    this.canvas = canvas

    const ctx = canvas.getContext('2d')
    ctx.font = `bold ${TEXT_PX}px Helvetica,Arial,sans-serif`
    ctx.textBaseline = 'top'

    ctx.fillStyle = spec.bg
    ctx.fillRect(0, 0, PW, PH)

    ctx.fillStyle = spec.fg
    ctx.fillText(spec.name, TX, TY)
    ctx.fillRect(GX, GY, GW, GH)

    ctx.fillStyle = spec.bg
    ctx.globalAlpha = 0.9
    ctx.fillRect(GX, GY, GW, GH)
    this.ctx = ctx
  }

  /**
   * Push a new sample. `max` is the value used to label the panel's
   * historical ceiling (so we display `min/max`).
   *
   * @param {number} value
   * @param {number} maxValue
   */
  update(value, maxValue) {
    this.min = Math.min(this.min, value)
    this.max = Math.max(this.max, value)

    const {ctx, spec} = this
    ctx.fillStyle = spec.bg
    ctx.globalAlpha = 1
    ctx.fillRect(0, 0, PW, GY)
    ctx.fillStyle = spec.fg
    const label = `${Math.round(value)} ${spec.name} (${Math.round(this.min)}-${Math.round(this.max)})`
    ctx.fillText(label, TX, TY)

    // Scroll the existing graph 1 column left, then paint the new sample
    // on the right edge.
    ctx.drawImage(this.canvas, GX + PIXEL_RATIO, GY, GW - PIXEL_RATIO, GH, GX, GY, GW - PIXEL_RATIO, GH)

    ctx.fillRect(GX + GW - PIXEL_RATIO, GY, PIXEL_RATIO, GH)

    ctx.fillStyle = spec.bg
    ctx.globalAlpha = 0.9
    const h = (1 - value / maxValue) * GH
    ctx.fillRect(GX + GW - PIXEL_RATIO, GY, PIXEL_RATIO, h)
  }
}


/** Holds the panels and stitched DOM container; created lazily on `on()`. */
class Monitor {
  constructor() {
    this.activeIndex = 0
    this.panels = PANELS.map((spec) => new Panel(spec))

    const dom = document.createElement('div')
    dom.id = 'perf-monitor'
    dom.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'z-index:10000',
      'opacity:0.9',
      'cursor:pointer',
      // Stack panels — only the active one is `display:block` (set below).
    ].join(';')
    this.panels.forEach((p, i) => {
      p.canvas.style.display = i === this.activeIndex ? 'block' : 'none'
      dom.appendChild(p.canvas)
    })
    dom.addEventListener('click', (e) => {
      e.preventDefault()
      this.showNext()
    })
    this.dom = dom

    this.beginTime = performance.now()
    this.prevTime = this.beginTime
    this.frames = 0
  }

  showNext() {
    this.activeIndex = (this.activeIndex + 1) % this.panels.length
    this.panels.forEach((p, i) => {
      p.canvas.style.display = i === this.activeIndex ? 'block' : 'none'
    })
  }

  begin() {
    this.beginTime = performance.now()
  }

  end() {
    this.frames++
    const time = performance.now()

    this.panels[I_MS].update(time - this.beginTime, MS_MAX)

    if (time >= this.prevTime + FPS_REFRESH_MS) {
      const fps = (this.frames * FPS_REFRESH_MS) / (time - this.prevTime)
      this.panels[I_FPS].update(fps, FPS_MAX)

      // Chromium-only — `performance.memory` is non-standard.  Skip when
      // unavailable so Firefox / Safari just stay at 0.
      const mem = performance.memory
      if (mem) {
        this.panels[I_MB].update(mem.usedJSHeapSize / BYTES_PER_MB, mem.jsHeapSizeLimit / BYTES_PER_MB)
      }

      this.prevTime = time
      this.frames = 0
    }
    return time
  }
}


let monitor = null


/** Hot-path begin marker.  No-op when the monitor isn't installed. */
export function perfBegin() {
  if (monitor) {
    monitor.begin()
  }
}


/** Hot-path end marker.  No-op when the monitor isn't installed. */
export function perfEnd() {
  if (monitor) {
    monitor.end()
  }
}


/** Mount the panel and start sampling.  Idempotent. */
export function perfOn() {
  if (monitor) {
    return
  }
  monitor = new Monitor()
  document.body.appendChild(monitor.dom)
}


/** Remove the panel and stop sampling.  Idempotent. */
export function perfOff() {
  if (!monitor) {
    return
  }
  monitor.dom.remove()
  monitor = null
}


/** Toggle the panel.  @return {boolean} new on-state. */
export function perfToggle() {
  if (monitor) {
    perfOff()
    return false
  }
  perfOn()
  return true
}


// Install devtools control surface.  Safe to assign unconditionally —
// SSR doesn't apply here (browser-only app) and overwriting a prior
// install is fine (HMR re-runs this file).
if (typeof window !== 'undefined') {
  window.perf = {on: perfOn, off: perfOff, toggle: perfToggle}
}

/**
 * Lightweight render-loop perf panel — FPS, frame time (ms), and JS heap
 * memory (MB, where `performance.memory` exists).  A minimal port of
 * mrdoob's stats.js (MIT) — the panel the three.js examples use.
 *
 * Shown at startup with `?feature=perf` or `?feature=look`, and toggled at
 * runtime, in prod too, by the backtick key together with the look panel
 * (src/viewer/debugPanels.js).  The Monitor (canvases, DOM, `window.perf`)
 * is built the first time the panel is shown, so a session that never shows
 * it allocates nothing.  `withPerf(fn)` always wraps the render closure, so
 * a runtime toggle has something to sample; while hidden the wrapper is one
 * boolean check per frame and samples nothing.
 *
 * The panel is docked in the bottom bar (left of the Help/Bot control) by
 * `src/Components/PerfToolbarSlot.jsx`, which renders while the panel is
 * visible (`subscribePerf` / `isPerfVisible`) and calls
 * `mountPerfPanel(slotEl)` on mount.
 *
 * Devtools controls (defined once the panel has been shown):
 *   perf.on()       show panel
 *   perf.off()      hide panel
 *   perf.toggle()
 *   perf.fps()      the FPS the panel shows
 *
 * Click the panel to cycle FPS -> MS -> MB.
 *
 * Today the only render closure that uses `withPerf` is the one installed
 * by `src/viewer/three/IfcHighlighter.js` via `ThreeContext.setRenderUpdate`;
 * see DESIGN.md "Render loop & perf monitor" for the architectural seam.
 *
 * Test note: the startup state reads `window.location.search` once, at
 * import.  Tests that need the shown-at-startup path set it *before*
 * importing (with `jest.isolateModules`/`jest.resetModules`), or call
 * `setPerfVisible(true)`.
 */

const STARTUP_FLAGS = ['perf', 'look']


/**
 * Read whether `?feature=perf` or `?feature=look` asks for the panel at
 * startup, once, at module load.
 *
 * @return {boolean}
 */
function readStartupFlag() {
  if (typeof window === 'undefined' || !window.location) {
    return false
  }
  const featureParam = new URLSearchParams(window.location.search).get('feature') || ''
  const asked = featureParam.split(',').map((s) => s.trim().toLowerCase())
  return STARTUP_FLAGS.some((flag) => asked.includes(flag))
}


/**
 * Frozen at module load — true iff the URL asked for the panel at startup.
 * The panel's live state is `isPerfVisible()`.
 */
export const isPerfEnabled = readStartupFlag()


// Whether the panel is shown (and sampling). Starts from the URL; the
// backtick key flips it (debugPanels.js).
let visible = false
const listeners = new Set()


/** @return {boolean} whether the panel is shown */
export function isPerfVisible() {
  return visible
}


/**
 * Show or hide the panel. The first show builds it.
 *
 * @param {boolean} next
 */
export function setPerfVisible(next) {
  next = next === true
  if (next === visible) {
    return
  }
  if (next && !monitor) {
    createMonitor()
  }
  visible = next
  if (monitor) {
    monitor.reset()
  }
  listeners.forEach((fn) => fn())
}


/**
 * Subscribe to show/hide (for `useSyncExternalStore` in PerfToolbarSlot).
 *
 * @param {Function} fn
 * @return {Function} unsubscribe
 */
export function subscribePerf(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}


/**
 * Wrap a per-frame update function with sampling, which runs only while
 * the panel is shown.
 *
 * @param {Function} fn per-frame closure (typically the one passed to
 *   `ThreeContext.setRenderUpdate`).
 * @return {Function}
 */
export function withPerf(fn) {
  return function perfWrappedUpdate() {
    if (!visible) {
      return fn()
    }
    monitor.begin()
    // The render closure returns false for a frame it didn't paint (on
    // demand, renderDemand.js): the panel counts paints, so an idle viewer
    // reads 0 FPS rather than the display's refresh rate.
    const painted = fn()
    monitor.end(painted !== false)
    return painted
  }
}


// ---------------------------------------------------------------------------
// Everything below runs only once the panel has been shown.
// ---------------------------------------------------------------------------


const PANEL_WIDTH = 80
const PANEL_HEIGHT = 48
const GRAPH_X = 3
const GRAPH_Y = 15
const GRAPH_WIDTH = 74
const GRAPH_HEIGHT = 30
const TEXT_X = 3
const TEXT_Y = 2
const PIXEL_RATIO = typeof window === 'undefined' ? 1 : Math.round(window.devicePixelRatio || 1)
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

const PANELS = [
  {name: 'FPS', fg: '#0ff', bg: '#002'},
  {name: 'MS', fg: '#0f0', bg: '#020'},
  {name: 'MB', fg: '#f08', bg: '#201'},
]

// Panel indices into Monitor#panels — derived from PANELS so reordering
// the spec list doesn't silently break Monitor.end().
const I_FPS = PANELS.findIndex((p) => p.name === 'FPS')
const I_MS = PANELS.findIndex((p) => p.name === 'MS')
const I_MB = PANELS.findIndex((p) => p.name === 'MB')


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

    // `getContext('2d')` returns null in headless / no-canvas
    // environments (notably jsdom, where the tests run).  Keep the
    // canvas element in the DOM so mount/unmount and visibility tests
    // still work, but skip drawing — `update()` mirrors this check.
    const ctx = canvas.getContext('2d')
    this.ctx = ctx
    if (!ctx) {
      return
    }
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
  }

  /**
   * Push a new sample.  `maxValue` is the upper bound used to scale the
   * bar height for this frame; the running min/max are tracked
   * separately and shown in the label.
   *
   * @param {number} value
   * @param {number} maxValue
   */
  update(value, maxValue) {
    this.min = Math.min(this.min, value)
    this.max = Math.max(this.max, value)

    const {ctx, spec} = this
    // Headless / jsdom — see the constructor's matching guard.
    if (!ctx) {
      return
    }
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
    const h = (1 - (value / maxValue)) * GH
    ctx.fillRect(GX + GW - PIXEL_RATIO, GY, PIXEL_RATIO, h)
  }
}


/** Holds the panels and stitched DOM container; created lazily on init. */
class Monitor {
  /** Build the three sub-panels, the click-to-cycle host div, and seed the timers. */
  constructor() {
    this.activeIndex = 0
    this.panels = PANELS.map((spec) => new Panel(spec))

    const dom = document.createElement('div')
    dom.id = 'perf-monitor'
    // Flow-positioned so it docks cleanly inside its host (toolbar slot).
    // `line-height:0` strips the inline-baseline gap under the canvas;
    // `cursor:pointer` because clicking cycles the active panel.
    dom.style.cssText = [
      'line-height:0',
      'opacity:0.9',
      'cursor:pointer',
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
    // The FPS last shown, for `window.perf.fps()`.
    this.lastFps = null
  }

  /**
   * Restart the FPS window, so a panel shown after a hidden stretch doesn't
   * average the frames it never saw.
   */
  reset() {
    this.prevTime = performance.now()
    this.frames = 0
  }

  /** Advance to the next sub-panel and update which canvas is visible. */
  showNext() {
    this.activeIndex = (this.activeIndex + 1) % this.panels.length
    this.panels.forEach((p, i) => {
      p.canvas.style.display = i === this.activeIndex ? 'block' : 'none'
    })
  }

  /** Stamp the frame-start time.  Paired with `end()`. */
  begin() {
    this.beginTime = performance.now()
  }

  /**
   * Stamp the frame-end time and push samples into the sub-panels.
   * MS updates every painted frame; FPS and MB update once per
   * `FPS_REFRESH_MS` so the displayed numbers don't strobe.
   *
   * @param {boolean} [painted] whether this frame painted; one that didn't
   *   (render-on-demand) counts toward neither FPS nor MS
   */
  end(painted = true) {
    const time = performance.now()
    if (painted) {
      this.frames++
      this.panels[I_MS].update(time - this.beginTime, MS_MAX)
    }

    if (time >= this.prevTime + FPS_REFRESH_MS) {
      const fps = (this.frames * FPS_REFRESH_MS) / (time - this.prevTime)
      this.panels[I_FPS].update(fps, FPS_MAX)
      this.lastFps = fps

      // Chromium-only — `performance.memory` is non-standard.  Skip when
      // unavailable so Firefox / Safari just don't update the MB panel.
      const mem = performance.memory
      if (mem) {
        this.panels[I_MB].update(mem.usedJSHeapSize / BYTES_PER_MB, mem.jsHeapSizeLimit / BYTES_PER_MB)
      }

      this.prevTime = time
      this.frames = 0
    }
  }
}


// Singleton, built on the first `setPerfVisible(true)`.
let monitor = null


/** Build the Monitor and the devtools surface. */
function createMonitor() {
  monitor = new Monitor()
  window.perf = {
    /** Show the panel. */
    on() {
      setPerfVisible(true)
    },
    /** Hide the panel. */
    off() {
      setPerfVisible(false)
    },
    /** @return {boolean} new visible-state */
    toggle() {
      setPerfVisible(!visible)
      return visible
    },
    /** @return {number|null} the FPS the panel shows: paints per second */
    fps() {
      return monitor.lastFps
    },
  }
}


if (isPerfEnabled) {
  setPerfVisible(true)
}


/**
 * Dock the panel inside `parent`.  Called by `PerfToolbarSlot` once
 * the BottomBar has rendered its slot.  No-op before the panel has been
 * shown.
 *
 * Safe to call multiple times — `appendChild` of an already-parented
 * node detaches it from its previous parent first.
 *
 * @param {HTMLElement} parent
 */
export function mountPerfPanel(parent) {
  if (!monitor || !parent) {
    return
  }
  parent.appendChild(monitor.dom)
}


/**
 * Detach the panel from its current host.  Called by `PerfToolbarSlot`
 * on unmount so React doesn't blow up trying to reconcile a slot whose
 * DOM child it doesn't own.  No-op before the panel has been shown or
 * when it is already detached.
 */
export function unmountPerfPanel() {
  if (!monitor) {
    return
  }
  monitor.dom.remove()
}

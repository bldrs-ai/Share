/**
 * Lightweight render-loop perf panel — FPS, frame time (ms) and JS heap
 * memory (MB, where `performance.memory` exists) as three scrolling graphs,
 * plus the renderer's counts for the last painted frame: geometries and
 * textures resident on the GPU, draw calls and triangles.  The graphs are a
 * minimal port of mrdoob's stats.js (MIT) — the panel the three.js examples
 * use.
 *
 * Shown at startup with `?feature=perf` or `?feature=look`, and toggled at
 * runtime, in prod too, by the backtick key together with the Render panel
 * (src/viewer/debugPanels.js).  The Monitor (canvases, `window.perf`) is built
 * the first time the panel is shown, so a session that never shows it
 * allocates nothing.  `withPerf(fn)` always wraps the render closure, so a
 * runtime toggle has something to sample; while hidden the wrapper is one
 * boolean check per frame and samples nothing.
 *
 * The panel lives in the debug dock (src/Components/DebugDock/DebugDock.jsx),
 * which renders while it is visible (`subscribePerf` / `isPerfVisible`), docks
 * the graphs with `mountPerfPanel(el)`, and shows the numbers it reads from
 * `getPerfStats` (`subscribePerfStats`, about once a second).  Its colours
 * come from the app theme (`setPerfColors`).
 *
 * Devtools controls (defined once the panel has been shown):
 *   perf.on()       show panel
 *   perf.off()      hide panel
 *   perf.toggle()
 *   perf.fps()      the FPS the panel shows
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
const statsListeners = new Set()


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
 * Subscribe to show/hide (for `useSyncExternalStore` in the dock).
 *
 * @param {Function} fn
 * @return {Function} unsubscribe
 */
export function subscribePerf(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}


/**
 * The panel's numbers. A new object each refresh (about once a second), so
 * `useSyncExternalStore` can compare by identity.
 *
 * @return {object} `{fps, ms, mb, geometries, textures, calls, triangles}`,
 *   each a number or null (not measured yet; MB off Chromium)
 */
export function getPerfStats() {
  return monitor ? monitor.stats : EMPTY_STATS
}


/**
 * Subscribe to the numbers' refresh.
 *
 * @param {Function} fn
 * @return {Function} unsubscribe
 */
export function subscribePerfStats(fn) {
  statsListeners.add(fn)
  return () => statsListeners.delete(fn)
}


/**
 * The three graph readings as one short string, `fps/ms/MB`, for the dock's
 * minimised header. A reading not taken yet (or MB off Chromium) is `–`.
 *
 * @param {object} stats from `getPerfStats`
 * @return {string}
 */
export function formatPerfSummary(stats) {
  const fmt = (v) => (v === null || v === undefined ? '–' : String(Math.round(v)))
  return `${fmt(stats.fps)}/${fmt(stats.ms)}/${fmt(stats.mb)}`
}


/**
 * Wrap a per-frame update function with sampling, which runs only while
 * the panel is shown.
 *
 * Renderer counts: three resets `renderer.info.render` at the start of every
 * `renderer.render()` call, and a composer frame is several (the scene, the
 * AO and tone-mapping passes, the outline), so with auto-reset on the counts
 * would describe only the last full-screen pass. While shown, the wrapper
 * turns auto-reset off, reads the totals after each painted frame and resets
 * them itself; hidden, it puts auto-reset back.
 *
 * @param {Function} fn per-frame closure (typically the one passed to
 *   `ThreeContext.setRenderUpdate`); returns false for a frame it didn't paint
 * @param {Function} [getRenderer] returns the WebGLRenderer, for its counts
 * @return {Function}
 */
export function withPerf(fn, getRenderer = () => null) {
  let autoResetOff = null
  return function perfWrappedUpdate() {
    if (!visible) {
      if (autoResetOff) {
        autoResetOff.autoReset = true
        autoResetOff = null
      }
      return fn()
    }
    const info = getRenderer()?.info ?? null
    if (info && autoResetOff !== info) {
      info.autoReset = false
      info.reset()
      autoResetOff = info
    }
    monitor.begin()
    // The render closure returns false for a frame it didn't paint (on
    // demand, renderDemand.js): the panel counts paints, so an idle viewer
    // reads 0 FPS rather than the display's refresh rate.
    const painted = fn()
    monitor.end(painted !== false, info)
    return painted
  }
}


/**
 * Use these colours for the graphs (the dock passes the app theme's).
 *
 * @param {{fg: string, bg: string, graph: string}} colors text, background
 *   and graph-bar colours, any CSS colour
 */
export function setPerfColors(colors) {
  Object.assign(perfColors, colors)
  monitor?.panels.forEach((p) => p.clear())
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

const PANEL_NAMES = ['FPS', 'MS', 'MB']
const [I_FPS, I_MS, I_MB] = [0, 1, 2]

const EMPTY_STATS = Object.freeze({
  fps: null, ms: null, mb: null, geometries: null, textures: null, calls: null, triangles: null,
})

// The graphs' colours; the dock replaces these with the theme's.
const perfColors = {fg: '#ddd', bg: '#222', graph: '#0ff'}


/**
 * A single panel (one of FPS / MS / MB).  Backed by a canvas drawn in
 * two regions: a label row up top, and a scrolling graph below.
 */
class Panel {
  /** @param {string} name */
  constructor(name) {
    this.name = name
    this.min = Infinity
    this.max = 0

    const canvas = document.createElement('canvas')
    canvas.width = PW
    canvas.height = PH
    canvas.style.cssText = `width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;display:block`
    canvas.dataset.panel = name
    this.canvas = canvas

    // `getContext('2d')` returns null in headless / no-canvas
    // environments (notably jsdom, where the tests run).  Keep the
    // canvas element in the DOM so mount/unmount and visibility tests
    // still work, but skip drawing — `update()` mirrors this check.
    this.ctx = canvas.getContext('2d')
    this.clear()
  }

  /** Repaint the empty panel in the current colours. */
  clear() {
    const {ctx} = this
    if (!ctx) {
      return
    }
    ctx.font = `bold ${TEXT_PX}px Helvetica,Arial,sans-serif`
    ctx.textBaseline = 'top'
    ctx.globalAlpha = 1
    ctx.fillStyle = perfColors.bg
    ctx.fillRect(0, 0, PW, PH)
    ctx.fillStyle = perfColors.fg
    ctx.fillText(this.name, TX, TY)
    ctx.fillStyle = perfColors.graph
    ctx.fillRect(GX, GY, GW, GH)
    ctx.fillStyle = perfColors.bg
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

    const {ctx} = this
    // Headless / jsdom — see the constructor's matching guard.
    if (!ctx) {
      return
    }
    ctx.fillStyle = perfColors.bg
    ctx.globalAlpha = 1
    ctx.fillRect(0, 0, PW, GY)
    ctx.fillStyle = perfColors.fg
    const label = `${Math.round(value)} ${this.name} (${Math.round(this.min)}-${Math.round(this.max)})`
    ctx.fillText(label, TX, TY)

    // Scroll the existing graph 1 column left, then paint the new sample
    // on the right edge.
    ctx.drawImage(this.canvas, GX + PIXEL_RATIO, GY, GW - PIXEL_RATIO, GH, GX, GY, GW - PIXEL_RATIO, GH)

    ctx.fillStyle = perfColors.graph
    ctx.fillRect(GX + GW - PIXEL_RATIO, GY, PIXEL_RATIO, GH)

    ctx.fillStyle = perfColors.bg
    ctx.globalAlpha = 0.9
    const h = (1 - (value / maxValue)) * GH
    ctx.fillRect(GX + GW - PIXEL_RATIO, GY, PIXEL_RATIO, h)
  }
}


/** Holds the panels, their row of canvases and the latest numbers. */
class Monitor {
  /** Build the three graphs and seed the timers. */
  constructor() {
    this.panels = PANEL_NAMES.map((name) => new Panel(name))

    const dom = document.createElement('div')
    dom.id = 'perf-monitor'
    // The three graphs in a row. `line-height:0` strips the inline-baseline
    // gap under the canvases.
    dom.style.cssText = 'display:flex;gap:2px;line-height:0'
    this.panels.forEach((p) => dom.appendChild(p.canvas))
    this.dom = dom

    this.beginTime = performance.now()
    this.prevTime = this.beginTime
    this.frames = 0
    this.lastMs = null
    // Counts of the last painted frame (renderer.info), kept until the next.
    this.lastCalls = null
    this.lastTriangles = null
    // The FPS last shown, for `window.perf.fps()`.
    this.lastFps = null
    this.stats = EMPTY_STATS
  }

  /**
   * Restart the FPS window, so a panel shown after a hidden stretch doesn't
   * average the frames it never saw.
   */
  reset() {
    this.prevTime = performance.now()
    this.frames = 0
  }

  /** Stamp the frame-start time.  Paired with `end()`. */
  begin() {
    this.beginTime = performance.now()
  }

  /**
   * Stamp the frame-end time and push samples into the sub-panels.
   * MS updates every painted frame; FPS, MB and the counts update once per
   * `FPS_REFRESH_MS` so the displayed numbers don't strobe.
   *
   * @param {boolean} [painted] whether this frame painted; one that didn't
   *   (render-on-demand) counts toward neither FPS nor MS
   * @param {object} [info] the renderer's `info`, auto-reset off (withPerf)
   */
  end(painted = true, info = null) {
    const time = performance.now()
    if (painted) {
      this.frames++
      this.lastMs = time - this.beginTime
      this.panels[I_MS].update(this.lastMs, MS_MAX)
      if (info) {
        this.lastCalls = info.render.calls
        this.lastTriangles = info.render.triangles
        info.reset()
      }
    }

    if (time >= this.prevTime + FPS_REFRESH_MS) {
      const fps = (this.frames * FPS_REFRESH_MS) / (time - this.prevTime)
      this.panels[I_FPS].update(fps, FPS_MAX)
      this.lastFps = fps

      // Chromium-only — `performance.memory` is non-standard.  Skip when
      // unavailable so Firefox / Safari just don't update the MB panel.
      const mem = performance.memory
      let mb = null
      if (mem) {
        mb = mem.usedJSHeapSize / BYTES_PER_MB
        this.panels[I_MB].update(mb, mem.jsHeapSizeLimit / BYTES_PER_MB)
      }

      this.stats = {
        fps,
        ms: this.lastMs,
        mb,
        geometries: info ? info.memory.geometries : null,
        textures: info ? info.memory.textures : null,
        calls: this.lastCalls,
        triangles: this.lastTriangles,
      }
      statsListeners.forEach((fn) => fn())

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
 * Dock the graphs inside `parent`.  Called by the debug dock once it has
 * rendered.  No-op before the panel has been shown.
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
 * Detach the graphs from their current host.  Called by the dock on unmount
 * so React doesn't blow up trying to reconcile a host whose DOM child it
 * doesn't own.  No-op before the panel has been shown or when it is already
 * detached.
 */
export function unmountPerfPanel() {
  if (!monitor) {
    return
  }
  monitor.dom.remove()
}

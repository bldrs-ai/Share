/* eslint-disable no-magic-numbers */
/**
 * Lightweight render-loop perf panel — FPS, frame time (ms), and JS heap
 * memory (MB, where `performance.memory` exists).  A minimal port of
 * mrdoob's stats.js (MIT) — the panel the three.js examples use.
 *
 * Gated on the `?feature=perf` URL flag.  When the flag is absent:
 *   - the Panel / Monitor classes are never instantiated,
 *   - `window.perf` is not defined,
 *   - `withPerf(fn)` returns `fn` unchanged, so the render loop pays
 *     no per-frame branch or closure cost.
 *
 * When the flag is on the panel is docked inside the AppBar toolbar
 * (left of the profile icon) by `src/Components/PerfToolbarSlot.jsx`,
 * which calls `mountPerfPanel(slotEl)` on React mount.  Sampling starts
 * at module load regardless of whether the panel is attached to the DOM
 * — the canvases just aren't visible until mounted.
 *
 * Devtools controls (only defined when the flag is on):
 *   perf.on()       show panel
 *   perf.off()      hide panel (sampling continues)
 *   perf.toggle()
 *
 * Click the panel to cycle FPS -> MS -> MB.
 *
 * Today the only render closure that uses `withPerf` is the one installed
 * by `src/viewer/three/IfcHighlighter.js` via `ThreeContext.setRenderUpdate`;
 * see DESIGN.md "Render loop & perf monitor" for the architectural seam.
 */

const PERF_FEATURE_FLAG = 'perf'


/**
 * Read the `?feature=perf` URL flag once, at module load.  Toggling at
 * runtime requires a page reload — matches how `useExistInFeature`
 * treats URL flags.
 *
 * @return {boolean}
 */
function readPerfFlag() {
  if (typeof window === 'undefined' || !window.location) {
    return false
  }
  const featureParam = new URLSearchParams(window.location.search).get('feature') || ''
  return featureParam.split(',').map((s) => s.trim().toLowerCase()).includes(PERF_FEATURE_FLAG)
}


/**
 * Frozen at module load — true iff `?feature=perf` was in the URL.
 * Exported so the React side (`PerfToolbarSlot`) reads from the exact
 * same source of truth as `window.perf` / `withPerf`, instead of
 * re-resolving the flag through `useExistInFeature` (which is async
 * via `useEffect` and can lag a render).
 */
export const isPerfEnabled = readPerfFlag()


/**
 * Wrap a per-frame update function with sampling.  Returns `fn`
 * unchanged when the perf flag is off — that's the "zero runtime cost"
 * path: callers can apply this unconditionally without branching at
 * call sites.
 *
 * @param {Function} fn per-frame closure (typically the one passed to
 *   `ThreeContext.setRenderUpdate`).
 * @return {Function}
 */
export function withPerf(fn) {
  if (!isPerfEnabled) {
    return fn
  }
  return function perfWrappedUpdate() {
    monitor.begin()
    fn()
    monitor.end()
  }
}


// ---------------------------------------------------------------------------
// Everything below is only reached when `isPerfEnabled` is true.  The
// classes are still defined unconditionally (so the module remains
// tree-shake-friendly across both paths), but no instance is constructed
// and no DOM is touched unless the flag was set.
// ---------------------------------------------------------------------------


const PANEL_WIDTH = 80
const PANEL_HEIGHT = 48
const GRAPH_X = 3
const GRAPH_Y = 15
const GRAPH_WIDTH = 74
const GRAPH_HEIGHT = 30
const TEXT_X = 3
const TEXT_Y = 2
const PIXEL_RATIO = isPerfEnabled ? Math.round(window.devicePixelRatio || 1) : 1
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
      // unavailable so Firefox / Safari just don't update the MB panel.
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


// Singleton — only constructed when the feature flag is on, so
// `withPerf`'s wrapped path can dereference it directly without a null
// check.  Sampling is decoupled from DOM attachment: canvas draws
// happen on `monitor.end()` whether or not the panel is mounted, which
// keeps `withPerf`'s wrapper branch-free.
let monitor = null


if (isPerfEnabled) {
  monitor = new Monitor()

  // Devtools control surface.  Only installed when the flag is on, so
  // typing `perf` in the console of a normal session is `undefined`.
  window.perf = {
    /** Show the panel.  Sampling continues regardless of visibility. */
    on() {
      monitor.dom.style.display = ''
    },
    /** Hide the panel.  Sampling continues regardless of visibility. */
    off() {
      monitor.dom.style.display = 'none'
    },
    /** @return {boolean} new visible-state */
    toggle() {
      const hidden = monitor.dom.style.display === 'none'
      monitor.dom.style.display = hidden ? '' : 'none'
      return hidden
    },
  }
}


/**
 * Dock the panel inside `parent`.  Called by `PerfToolbarSlot` once the
 * AppBar has rendered its slot.  No-op when the feature flag is off.
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
 * DOM child it doesn't own.  No-op when the feature flag is off or the
 * panel is already detached.
 */
export function unmountPerfPanel() {
  if (!monitor) {
    return
  }
  monitor.dom.remove()
}

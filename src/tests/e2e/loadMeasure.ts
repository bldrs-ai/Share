import {CDPSession, ConsoleMessage, Page, Request, Response} from '@playwright/test'
import {mkdir, readFile, writeFile} from 'fs/promises'
import {dirname, resolve} from 'path'
import {ParsedReport, parseReportLines} from './loadReport'
import {waitForModelReady} from './models'


/**
 * Browser-side load measurement harness (conway #394 / #544 / #541).
 *
 * Every preview and load number published for M3 so far comes out of a
 * Node harness no user runs (`conway scripts/preview_timeline.mjs`,
 * `stream_corpus_sweep.mjs`). This is the browser counterpart: it drives a
 * real model load through Share's normal path in Chromium and records what
 * a user would actually experience, in a machine-readable form that can be
 * diffed commit-to-commit.
 *
 * Two consumers shape the record:
 *
 * - **conway #544** wants a browser `Preview:` line whose first-mesh time
 *   lands in the same range `preview_timeline.mjs` reports for the same
 *   file. That script's `t0` sits *after* wasm init and immediately before
 *   `OpenModelStream`, so the comparable browser quantity is
 *   `derived.firstMeshSinceOpenMs` — NOT anything measured from
 *   navigation start. See {@link deriveTimings}.
 * - **conway #541** asks whether the `?feature=workers` regression is CPU-
 *   or bandwidth-bound. `cpu` carries the CDP `Performance.getMetrics`
 *   delta, where `processTimeMs` (whole renderer process, worker threads
 *   included) against `wallMs` is the saturation signal, and
 *   `processTimeMs - threadTimeMs` is the off-main-thread half.
 *
 * Nothing here touches product code: every in-page observable is read from
 * the Zustand store already exposed on `window.store` (playwright builds
 * only) or from the three.js scene reachable through it.
 */

/** Timestamped stage boundary, page-relative ms, from `currentLoadLine`. */
export interface StageTransition {
  label: string
  atMs: number
}

/** CDP `Performance.getMetrics` deltas across the load window. */
export interface CpuMetrics {
  taskDurationMs: number
  scriptDurationMs: number
  layoutDurationMs: number
  /** Main-thread CPU time. */
  threadTimeMs: number
  /** Whole-renderer-process CPU time — includes dedicated-worker threads. */
  processTimeMs: number
  jsHeapUsedMbEnd: number
  /**
   * `processTimeMs / wallMs`. At or above ~1.0 the renderer burned a full
   * core for the whole load (CPU-bound); well below it the load spent its
   * time waiting (network, disk, locks) — conway #541's question.
   */
  processTimeOverWall: number
  /** `processTimeMs - threadTimeMs`: CPU spent off the main thread. */
  offMainThreadMs: number
}

/** One measured load. */
export interface LoadSample {
  iteration: number
  ok: boolean
  error: string | null
  timings: {
    /** Wall clock around goto→ready, measured from the Playwright side. */
    harnessWallMs: number
    /** `performance.timeOrigin` of the document that ran the load. */
    documentTimeOriginEpochMs: number
    documentUrl: string
    /** All the below are page-relative ms (`performance.now()` domain). */
    domContentLoadedMs: number | null
    modelRequestStartMs: number | null
    modelResponseStartMs: number | null
    modelResponseEndMs: number | null
    sceneFirstSeenMs: number | null
    /**
     * Meshes already in the scene when the baseline census was taken —
     * the viewer's own furniture (ground plane, helpers). The
     * "first NEW mesh" observable is only meaningful if this census
     * happened before any model geometry landed, so it is recorded.
     */
    baselineMeshCount: number | null
    firstMeshMs: number | null
    firstMeshFrame: number | null
    firstMeshName: string | null
    stageTransitions: StageTransition[]
    modelReadyMs: number | null
    reportSettledMs: number | null
  }
  /**
   * True from iteration 1 on: the browser's HTTP cache already holds the
   * bundle and the conway wasm binary, so those fetches are near-free.
   *
   * It does NOT mean a warm engine. Each iteration is a full
   * `page.goto`, which tears the JS context down, so conway's lazy wasm
   * `Init()` runs again every time — and it runs *inside* the window
   * `firstMeshSinceOpenMs` measures. Iteration 0 and the rest are
   * therefore different measurements; the summary reports min/median/max
   * rather than a mean so one cold outlier cannot quietly move the number.
   */
  warm: boolean
  derived: {
    downloadMs: number | null
    /**
     * **The conway #544 cross-check number.** First mesh on screen,
     * measured from the `Opening model` status line — which ShareIfcLoader
     * emits immediately before `parseIfcWithConway`, i.e. the same point
     * `scripts/preview_timeline.mjs` sets its `t0`. Excludes download.
     * INCLUDES conway's lazy wasm `Init()` on a cold sample (`warm:
     * false`), which the Node script pays for before its `t0`; compare
     * against a warm sample, or expect the cold one to run long by the
     * init cost.
     */
    firstMeshSinceOpenMs: number | null
    /**
     * The same quantity anchored on the `Parsing` stage instead — after
     * wasm init, so tighter, but null whenever the parse was too short to
     * publish a `Parsing` line of its own.
     */
    firstMeshSinceParseStartMs: number | null
    /**
     * Millisecond-accurate but *includes* wasm init on a cold page, since
     * conway's `Init()` is lazy inside `parseIfcWithConway`. Use it as the
     * upper bound on the same quantity.
     */
    firstMeshSinceDownloadMs: number | null
  }
  bytes: {model: number | null, modelResponseUrl: string | null}
  scene: {meshes: number | null, triangles: number | null}
  report: ParsedReport | null
  cpu: CpuMetrics | null
  consoleErrors: string[]
}

/** Central tendency for one metric across iterations. */
export interface MetricSummary {
  n: number
  min: number
  median: number
  max: number
}

/** The file this harness writes. `schema` is the compatibility handle. */
export interface LoadMeasurementRecord {
  schema: 'bldrs.loadMeasure/1'
  recordedAtIso: string
  run: {
    label: string
    modelUrl: string
    formFactor: string
    features: string[]
    iterations: number
    cpuThrottleRate: number
    network: NetworkProfile | null
  }
  env: {
    /** The Share preamble line, which carries build + commit, verbatim. */
    shareLine: string | null
    /** The conway actually resolved in node_modules — not the pin in package.json. */
    conwayInstalled: string | null
    /** The engine's own version claim from the report. */
    engineLine: string | null
    userAgent: string | null
    hardwareConcurrency: number | null
    deviceMemoryGb: number | null
    viewport: {width: number, height: number} | null
  }
  samples: LoadSample[]
  summary: Record<string, MetricSummary>
}

/** CDP `Network.emulateNetworkConditions` shape, in friendlier units. */
export interface NetworkProfile {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
}

/** Everything a caller can vary about one measurement run. */
export interface MeasureOptions {
  /** Short stable name — becomes the output filename. */
  label: string
  /**
   * Either a Share route (`/share/v/gh/<owner>/<repo>/<ref>/<path>`) or an
   * absolute URL. Routes under `bldrs-ai/test-models` are served by the
   * playwright dev server from `src/tests/fixtures/github/**` with no
   * interception needed; other owners need the caller to have already run
   * `setupVirtualPathIntercept`.
   */
  modelUrl: string
  formFactor?: string
  /** `?feature=` values to apply, e.g. `['demandGeometry', 'workers']`. */
  features?: string[]
  iterations?: number
  /** CDP CPU throttle multiplier; 1 = unthrottled. */
  cpuThrottleRate?: number
  network?: NetworkProfile | null
  /** Directory for the JSON record; defaults to `tools/measure`. */
  outDir?: string
  /** Milliseconds to allow one load before giving up. */
  timeoutMs?: number
}

const DEFAULT_OUT_DIR = 'tools/measure'
const DEFAULT_ITERATIONS = 1
const DEFAULT_TIMEOUT_MS = 120_000
const MS_PER_SECOND = 1000
const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB
const MS_ROUNDING = 10 // one decimal place
const RATIO_ROUNDING = 100 // two decimal places
// Column widths for the human-readable summary block.
const SUMMARY_KEY_WIDTH = 30
const SUMMARY_VALUE_WIDTH = 9
const BITS_PER_BYTE = 8
// CDP wants byte/s; the option is in Mbit/s.
const BYTES_PER_SECOND_PER_MBPS = MS_PER_SECOND * MS_PER_SECOND / BITS_PER_BYTE


/**
 * Round to 0.1 ms. Below any real measurement noise here, and it keeps
 * committed/diffed records from churning on float tails.
 *
 * @param value
 * @return the rounded value, or null when the input was absent
 */
function round1(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.round(value * MS_ROUNDING) / MS_ROUNDING
}


/**
 * Round a unitless ratio to two decimals — the precision the CPU-bound
 * question is decided at, not more.
 *
 * @param value
 * @return the rounded ratio
 */
function round2(value: number): number {
  return Math.round(value * RATIO_ROUNDING) / RATIO_ROUNDING
}


/**
 * Subtract two possibly-absent page-relative marks.
 *
 * @param end
 * @param start
 * @return the difference, or null when either mark is absent
 */
function delta(end: number | null, start: number | null): number | null {
  if (end === null || start === null) {
    return null
  }
  return round1(end - start)
}


/**
 * The in-page probe, injected at document start so its first
 * `requestAnimationFrame` runs long before the viewer exists.
 *
 * **First-mesh observable, and why this one.** The probe censuses the
 * three.js scene once per frame and reports the first frame containing a
 * mesh that was not in the scene when the scene first became reachable.
 * The baseline is everything the viewer builds at init (ground plane,
 * helpers); anything new is model geometry, whether it arrived through the
 * parse-time preview channel (`ON_PREVIEW_MESH` →
 * `ProgressiveLoadSession.addPreviewMesh`), the durable batch pump, or a
 * one-shot end-of-load build. Being uuid-based rather than name-based, it
 * needs no knowledge of which path produced the mesh — which is the point,
 * since the whole M3 question is which path fires first.
 *
 * It measures *scene-graph presence*, accurate to about one frame (~16 ms)
 * of the first frame that actually paints those pixels; two rAF callbacks
 * in the same frame have no defined order relative to each other. It does
 * NOT include download or wasm init (both happen before any mesh exists);
 * `derived` carries the anchors that put those back in.
 *
 * Rejected alternatives: reading the canvas back needs
 * `preserveDrawingBuffer`, i.e. a product change with a real per-frame
 * cost; CDP screencast frames are throttled and re-encoded, so their
 * timestamps are worse than a frame; hooking `ON_PREVIEW_MESH` directly is
 * only reachable from inside product code and would see preview meshes
 * only, missing every non-deferring path.
 */
function probeSource(): void {
  /** The subset of a three.js Object3D the census reads. */
  interface SceneObject {
    uuid: string
    name?: string
    type?: string
    isMesh?: boolean
    isBatchedMesh?: boolean
    isInstancedMesh?: boolean
    geometry?: {index?: {count: number} | null, attributes?: {position?: {count: number}}}
  }
  interface SceneLike {
    traverse: (visit: (obj: SceneObject) => void) => void
  }
  interface ViewerLike {
    context?: {getScene?: () => SceneLike, scene?: SceneLike}
    scene?: SceneLike
  }
  interface ProbeState {
    timeOrigin: number
    frames: number
    sceneFirstSeenMs: number | null
    baselineMeshCount: number | null
    firstMeshMs: number | null
    firstMeshFrame: number | null
    firstMeshName: string | null
    stageTransitions: {label: string, atMs: number}[]
    modelReadyMs: number | null
    reportSettledMs: number | null
    reportLines: string[] | null
    sceneMeshes: number | null
    sceneTriangles: number | null
  }
  interface StoreSnapshot {
    isModelReady?: boolean
    loadReportLines?: string[]
    currentLoadLine?: string | null
    viewer?: ViewerLike | null
  }
  interface ProbeWindow extends Window {
    __bldrsLoadProbe?: ProbeState
    store?: {
      getState: () => StoreSnapshot
      subscribe?: (listener: (state: StoreSnapshot) => void) => () => void
    }
  }

  const VERTICES_PER_TRIANGLE = 3
  const self = window as unknown as ProbeWindow
  const probe: ProbeState = {
    timeOrigin: performance.timeOrigin,
    frames: 0,
    sceneFirstSeenMs: null,
    baselineMeshCount: null,
    firstMeshMs: null,
    firstMeshFrame: null,
    firstMeshName: null,
    stageTransitions: [],
    modelReadyMs: null,
    reportSettledMs: null,
    reportLines: null,
    sceneMeshes: null,
    sceneTriangles: null,
  }
  self.__bldrsLoadProbe = probe

  const baseline = new Set<string>()
  let lastStageLabel: string | null = null
  let subscribed = false

  /**
   * The scene, if the viewer has built it yet. `context.getScene()` is the
   * fork's accessor (src/viewer/ShareViewer.js uses it throughout); the
   * fallbacks cover shapes an engine swap could produce.
   *
   * @return the three.js scene, or null if the viewer has not built it
   */
  function findScene(): SceneLike | null {
    const viewer = self.store?.getState?.().viewer
    const scene = viewer?.context?.getScene?.() ?? viewer?.context?.scene ?? viewer?.scene ?? null
    return scene && typeof scene.traverse === 'function' ? scene : null
  }

  /**
   * @param obj
   * @return triangles the object's geometry would draw
   */
  function triangleCount(obj: SceneObject): number {
    const count = obj.geometry?.index?.count ?? obj.geometry?.attributes?.position?.count ?? 0
    return Math.floor(count / VERTICES_PER_TRIANGLE)
  }

  /**
   * Record everything observable from one store state.
   *
   * Driven by a Zustand `subscribe`, not by the frame loop: stage
   * transitions are the anchors the whole cross-check hangs off, and
   * sampling for them loses short stages outright. loadProgress.js
   * republishes `currentLoadLine` on stage close *and* on a 100 ms tick,
   * so a 74 ms `Parsing` stage is a single ~14 ms window that a 16 ms rAF
   * sampler misses about half the time — observed, not theorized. A
   * subscription sees every set.
   *
   * @param state
   */
  function recordStore(state: StoreSnapshot): void {
    if (probe.modelReadyMs === null && state.isModelReady === true) {
      probe.modelReadyMs = performance.now()
    }
    const lines = state.loadReportLines
    if (Array.isArray(lines) && lines.length > 0) {
      probe.reportLines = lines.slice()
    }
    const current = state.currentLoadLine
    // "Settled" is LoadReportControl's own test for a finished load:
    // report lines present and no stage still animating. The report
    // becomes non-empty at the *first* progress event (publishReport runs
    // on every one), so a first-non-empty mark would time load start.
    if (lastStageLabel !== null && probe.reportSettledMs === null &&
        (current === null || current === undefined) &&
        Array.isArray(lines) && lines.length > 0) {
      probe.reportSettledMs = performance.now()
    }
    if (typeof current === 'string' && current.length > 0) {
      // `Label [0%...56%] 1.2s` or `Label: 1.2s` — the label is the stable
      // part, and a new label IS a new stage (progress_log.js infers stage
      // transitions exactly this way).
      const label = current.split(/[[:]/)[0].trim()
      if (label.length > 0 && label !== lastStageLabel) {
        lastStageLabel = label
        probe.stageTransitions.push({label, atMs: performance.now()})
      }
    }
  }

  /** One frame of observation. */
  function tick(): void {
    probe.frames++
    const store = self.store
    if (store !== undefined) {
      if (!subscribed && typeof store.subscribe === 'function') {
        subscribed = true
        store.subscribe(recordStore)
      }
      recordStore(store.getState())
    }
    const scene = findScene()
    if (scene !== null) {
      let meshes = 0
      let triangles = 0
      let newMesh: SceneObject | null = null
      scene.traverse((obj: SceneObject) => {
        if (obj.isMesh !== true && obj.isBatchedMesh !== true && obj.isInstancedMesh !== true) {
          return
        }
        meshes++
        triangles += triangleCount(obj)
        if (probe.sceneFirstSeenMs === null) {
          baseline.add(obj.uuid)
        } else if (newMesh === null && !baseline.has(obj.uuid)) {
          newMesh = obj
        }
      })
      probe.sceneMeshes = meshes
      probe.sceneTriangles = triangles
      if (probe.sceneFirstSeenMs === null) {
        probe.sceneFirstSeenMs = performance.now()
        probe.baselineMeshCount = meshes
      } else if (probe.firstMeshMs === null && newMesh !== null) {
        probe.firstMeshMs = performance.now()
        probe.firstMeshFrame = probe.frames
        const found: SceneObject = newMesh
        probe.firstMeshName = String(found.name || found.type || 'unnamed')
      }
    }
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}


/**
 * Read the probe out of the page.
 *
 * @param page
 * @return null when the probe never installed
 */
async function readProbe(page: Page) {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const probe = (window as any).__bldrsLoadProbe
    if (!probe) {
      return null
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      ...probe,
      documentUrl: location.href,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deviceMemoryGb: (navigator as any).deviceMemory ?? null,
      viewport: {width: window.innerWidth, height: window.innerHeight},
    }
  })
}


/**
 * Build the model URL with any `?feature=` flags applied.
 *
 * Share reads features off the query string, and multiple flags are
 * comma-joined on a single `feature` param (src/utils/featureFlags.js).
 *
 * @param modelUrl
 * @param features
 * @return the URL with a `feature=` query param applied
 */
export function withFeatures(modelUrl: string, features: string[]): string {
  if (features.length === 0) {
    return modelUrl
  }
  const separator = modelUrl.includes('?') ? '&' : '?'
  return `${modelUrl}${separator}feature=${features.join(',')}`
}


/**
 * CDP `Performance.getMetrics` as a flat map. Chromium reports durations in
 * seconds and sizes in bytes.
 *
 * @param cdp
 * @return metric name to raw value (seconds for durations, bytes for sizes)
 */
async function metricsMap(cdp: CDPSession): Promise<Record<string, number>> {
  const result = await cdp.send('Performance.getMetrics')
  const out: Record<string, number> = {}
  for (const metric of result.metrics) {
    out[metric.name] = metric.value
  }
  return out
}


/**
 * Turn a before/after `Performance.getMetrics` pair into the CPU record.
 *
 * @param before
 * @param after
 * @param wallMs
 * @return the CPU record for the load window
 */
function cpuDelta(
  before: Record<string, number>,
  after: Record<string, number>,
  wallMs: number,
): CpuMetrics {
  /**
   * @param name
   * @return seconds → ms
   */
  function seconds(name: string): number {
    return ((after[name] ?? 0) - (before[name] ?? 0)) * MS_PER_SECOND
  }
  const threadTimeMs = seconds('ThreadTime')
  const processTimeMs = seconds('ProcessTime')
  return {
    taskDurationMs: round1(seconds('TaskDuration')) ?? 0,
    scriptDurationMs: round1(seconds('ScriptDuration')) ?? 0,
    layoutDurationMs: round1(seconds('LayoutDuration')) ?? 0,
    threadTimeMs: round1(threadTimeMs) ?? 0,
    processTimeMs: round1(processTimeMs) ?? 0,
    jsHeapUsedMbEnd: round1((after.JSHeapUsedSize ?? 0) / BYTES_PER_MB) ?? 0,
    processTimeOverWall: wallMs > 0 ? round2(processTimeMs / wallMs) : 0,
    offMainThreadMs: round1(processTimeMs - threadTimeMs) ?? 0,
  }
}


/**
 * Fill `derived` from the raw marks.
 *
 * The stage anchors are what make a browser run comparable with
 * `conway scripts/preview_timeline.mjs`, whose `t0` sits immediately
 * before `OpenModelStream`. Anchoring on navigation start instead would
 * fold in page boot, bundle parse and the model download — on a small
 * model that is most of the number.
 *
 * @param timings
 * @return the derived timings for one sample
 */
function deriveTimings(timings: LoadSample['timings']): LoadSample['derived'] {
  const at = (re: RegExp): number | null =>
    timings.stageTransitions.find((t) => re.test(t.label))?.atMs ?? null
  return {
    downloadMs: delta(timings.modelResponseEndMs, timings.modelRequestStartMs),
    firstMeshSinceOpenMs: delta(timings.firstMeshMs, at(/^opening/i)),
    firstMeshSinceParseStartMs: delta(timings.firstMeshMs, at(/^pars/i)),
    firstMeshSinceDownloadMs: delta(timings.firstMeshMs, timings.modelResponseEndMs),
  }
}


/**
 * min/median/max over the finite values of one metric.
 *
 * @param values
 * @return the summary, or null when no iteration produced a value
 */
function summarize(values: (number | null)[]): MetricSummary | null {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b)
  if (finite.length === 0) {
    return null
  }
  const mid = Math.floor(finite.length / 2)
  const median = finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid]
  return {
    n: finite.length,
    min: round1(finite[0]) ?? 0,
    median: round1(median) ?? 0,
    max: round1(finite[finite.length - 1]) ?? 0,
  }
}


/**
 * Measure one model load in the current page.
 *
 * The page must already have `measureLoadProbeSetup` applied (this does it
 * for you when you use {@link measureLoad}).
 *
 * @param page
 * @param options
 * @param iteration
 * @return one measured sample
 */
async function measureOnce(page: Page, options: MeasureOptions, iteration: number): Promise<LoadSample> {
  const url = withFeatures(options.modelUrl, options.features ?? [])
  const modelBasename = decodeURIComponent(options.modelUrl.split('?')[0].split('/').pop() ?? '')
  // Named so both listeners can be detached at the end of the iteration.
  // Leaving them attached would let iteration 0's arrays keep filling
  // during iterations 1..N — the record is written after every iteration
  // has run, so the first sample would silently report the whole run's
  // console errors as its own.
  const consoleErrors: string[] = []
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  }
  page.on('console', onConsole)

  // Every response whose URL mentions the model file. That deliberately
  // over-collects: the GitHub Contents API mock names the file too, and its
  // JSON body arrives *before* the bytes do, so taking the first match
  // would time the metadata round-trip and call it the download. The real
  // download is picked afterwards as the largest body — true for both the
  // dev-server fixture path and the raw.githubusercontent legacy path,
  // where the fixture is an order of magnitude bigger than its metadata.
  const modelCandidates: Response[] = []
  const onResponse = (response: Response) => {
    if (modelBasename.length === 0 || response.request().resourceType() === 'document') {
      return
    }
    if (response.url().includes(modelBasename)) {
      modelCandidates.push(response)
    }
  }
  page.on('response', onResponse)

  // CDP is chromium-only and can be unavailable (e.g. a non-chromium
  // project); a missing CPU record must not fail the measurement.
  let cdp: CDPSession | null = null
  let metricsBefore: Record<string, number> = {}
  try {
    cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    if ((options.cpuThrottleRate ?? 1) !== 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: options.cpuThrottleRate ?? 1})
    }
    if (options.network) {
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: options.network.latencyMs,
        downloadThroughput: options.network.downloadMbps * BYTES_PER_SECOND_PER_MBPS,
        uploadThroughput: options.network.uploadMbps * BYTES_PER_SECOND_PER_MBPS,
      })
    }
    metricsBefore = await metricsMap(cdp)
  } catch {
    cdp = null
  }

  const startedAt = Date.now()
  let ok = true
  let error: string | null = null
  try {
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    // The shared helper's own 15 s default is sized for fixture specs; a
    // measurement run is exactly the case that outgrows it (a big model, a
    // throttled CPU), so the caller's budget wins.
    await waitForModelReady(page, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  } catch (e) {
    ok = false
    error = e instanceof Error ? e.message : String(e)
  }
  const harnessWallMs = Date.now() - startedAt

  let cpu: CpuMetrics | null = null
  if (cdp !== null) {
    try {
      cpu = cpuDelta(metricsBefore, await metricsMap(cdp), harnessWallMs)
    } catch {
      cpu = null
    }
  }

  const probe = await readProbe(page)
  const timeOrigin = probe?.timeOrigin ?? 0
  /**
   * Playwright resource timings are epoch-ms `startTime` plus ms offsets;
   * the probe's marks are `performance.now()`. Put both in one domain.
   *
   * @param epochMs
   * @return the mark in the page's `performance.now()` domain
   */
  const toPageRelative = (epochMs: number | null): number | null =>
    epochMs === null || timeOrigin === 0 ? null : round1(epochMs - timeOrigin)

  let modelRequest: Request | null = null
  let modelBytes: number | null = null
  let modelResponseUrl: string | null = null
  for (const candidate of modelCandidates) {
    const headers = candidate.headers()
    // The Contents API mock is JSON by construction; the model bytes never
    // are. Dropping JSON first means the size comparison below is only
    // ever between plausible bodies.
    if ((headers['content-type'] ?? '').includes('json')) {
      continue
    }
    // `sizes()` reports -1 (and other negatives) for a route-fulfilled
    // response, so content-length is the primary and sizes() the fallback.
    const declared = Number(headers['content-length'])
    let size = Number.isFinite(declared) && declared > 0 ? declared : null
    if (size === null) {
      try {
        const measured = (await candidate.request().sizes()).responseBodySize
        size = measured > 0 ? measured : null
      } catch {
        size = null
      }
    }
    if (size !== null && (modelBytes === null || size > modelBytes)) {
      modelBytes = size
      modelRequest = candidate.request()
      modelResponseUrl = candidate.url()
    }
  }

  const timing = modelRequest === null ? null : modelRequest.timing()
  const timings: LoadSample['timings'] = {
    harnessWallMs,
    documentTimeOriginEpochMs: timeOrigin,
    documentUrl: probe?.documentUrl ?? '',
    domContentLoadedMs: round1(probe?.domContentLoadedMs ?? null),
    modelRequestStartMs: toPageRelative(timing === null ? null : timing.startTime),
    modelResponseStartMs: toPageRelative(
      timing === null || timing.responseStart < 0 ? null : timing.startTime + timing.responseStart),
    modelResponseEndMs: toPageRelative(
      timing === null || timing.responseEnd < 0 ? null : timing.startTime + timing.responseEnd),
    sceneFirstSeenMs: round1(probe?.sceneFirstSeenMs ?? null),
    baselineMeshCount: probe?.baselineMeshCount ?? null,
    firstMeshMs: round1(probe?.firstMeshMs ?? null),
    firstMeshFrame: probe?.firstMeshFrame ?? null,
    firstMeshName: probe?.firstMeshName ?? null,
    stageTransitions: (probe?.stageTransitions ?? []).map(
      (t: StageTransition) => ({label: t.label, atMs: round1(t.atMs) ?? 0})),
    modelReadyMs: round1(probe?.modelReadyMs ?? null),
    reportSettledMs: round1(probe?.reportSettledMs ?? null),
  }


  page.off('console', onConsole)
  page.off('response', onResponse)

  return {
    iteration,
    ok,
    error,
    warm: iteration > 0,
    timings,
    derived: deriveTimings(timings),
    bytes: {model: modelBytes, modelResponseUrl},
    scene: {meshes: probe?.sceneMeshes ?? null, triangles: probe?.sceneTriangles ?? null},
    report: probe?.reportLines ? parseReportLines(probe.reportLines) : null,
    cpu,
    consoleErrors,
  }
}


/**
 * The conway version actually linked into `node_modules`.
 *
 * Recorded instead of `package.json`'s pin because the two diverge exactly
 * when it matters: a sandbox with a stale `node_modules` reports the pin it
 * is not running. That mismatch has already produced wrong conclusions on
 * this line of work, so the record carries the resolved version and the
 * engine's own claim (`env.engineLine`) side by side — disagreement between
 * them is the tell.
 *
 * @return the installed version, or null when it cannot be read
 */
async function installedConwayVersion(): Promise<string | null> {
  try {
    const raw = await readFile(resolve('node_modules/@bldrs-ai/conway/package.json'), 'utf8')
    return JSON.parse(raw).version ?? null
  } catch {
    return null
  }
}


/**
 * Install the in-page probe. Must run before the first navigation.
 *
 * @param page
 */
export async function installLoadProbe(page: Page): Promise<void> {
  await page.addInitScript(probeSource)
}


/**
 * The metrics rolled up in `summary` — the short list a before/after
 * comparison actually reads. Everything else stays in `samples`.
 */
const SUMMARY_METRICS: {key: string, pick: (s: LoadSample) => number | null}[] = [
  {key: 'harnessWallMs', pick: (s) => s.timings.harnessWallMs},
  {key: 'firstMeshMs', pick: (s) => s.timings.firstMeshMs},
  {key: 'firstMeshSinceOpenMs', pick: (s) => s.derived.firstMeshSinceOpenMs},
  {key: 'firstMeshSinceParseStartMs', pick: (s) => s.derived.firstMeshSinceParseStartMs},
  {key: 'firstMeshSinceDownloadMs', pick: (s) => s.derived.firstMeshSinceDownloadMs},
  {key: 'modelReadyMs', pick: (s) => s.timings.modelReadyMs},
  {key: 'reportSettledMs', pick: (s) => s.timings.reportSettledMs},
  {key: 'downloadMs', pick: (s) => s.derived.downloadMs},
  {key: 'reportTotalSeconds', pick: (s) => s.report?.total?.seconds ?? null},
  {key: 'previewFirstMeshMs', pick: (s) => s.report?.preview?.firstMeshMs ?? null},
  {key: 'cpuProcessTimeMs', pick: (s) => s.cpu?.processTimeMs ?? null},
  {key: 'cpuProcessTimeOverWall', pick: (s) => s.cpu?.processTimeOverWall ?? null},
  {key: 'cpuOffMainThreadMs', pick: (s) => s.cpu?.offMainThreadMs ?? null},
]


/**
 * Run a full measurement (N iterations), write the JSON record, and return
 * it. The caller is responsible for any fixture interception the model URL
 * needs — see {@link MeasureOptions.modelUrl}.
 *
 * @param page
 * @param options
 * @return the record that was written
 */
export async function measureLoad(page: Page, options: MeasureOptions): Promise<LoadMeasurementRecord> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  page.setDefaultTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  await installLoadProbe(page)

  const samples: LoadSample[] = []
  for (let i = 0; i < iterations; i++) {
    samples.push(await measureOnce(page, options, i))
  }

  const first = samples[0]
  const engineLine = first?.report?.lines.find((l) => /^Conway\b|^web-ifc\b/i.test(l)) ?? null
  const probe = await readProbe(page)
  const record: LoadMeasurementRecord = {
    schema: 'bldrs.loadMeasure/1',
    recordedAtIso: new Date().toISOString(),
    run: {
      label: options.label,
      modelUrl: options.modelUrl,
      formFactor: options.formFactor ?? 'desktop',
      features: options.features ?? [],
      iterations,
      cpuThrottleRate: options.cpuThrottleRate ?? 1,
      network: options.network ?? null,
    },
    env: {
      shareLine: first?.report?.lines[0] ?? null,
      conwayInstalled: await installedConwayVersion(),
      engineLine,
      userAgent: probe?.userAgent ?? null,
      hardwareConcurrency: probe?.hardwareConcurrency ?? null,
      deviceMemoryGb: probe?.deviceMemoryGb ?? null,
      viewport: probe?.viewport ?? null,
    },
    samples,
    summary: {},
  }
  for (const metric of SUMMARY_METRICS) {
    const summary = summarize(samples.map(metric.pick))
    if (summary !== null) {
      record.summary[metric.key] = summary
    }
  }

  const outDir = options.outDir ?? process.env.BLDRS_MEASURE_OUT ?? DEFAULT_OUT_DIR
  const slug = `${options.label}-${options.formFactor ?? 'desktop'}`.replace(/[^\w.-]+/g, '_')
  const outPath = resolve(outDir, `${slug}.json`)
  await mkdir(dirname(outPath), {recursive: true})
  await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  process.stdout.write(`${formatRecord(record)}\nwrote ${outPath}\n`)
  return record
}


/**
 * The human-readable summary. Deliberately close in shape to the load
 * report itself, so a harness run and a pasted browser report read alike.
 *
 * @param record
 * @return the human-readable summary block
 */
export function formatRecord(record: LoadMeasurementRecord): string {
  const out: string[] = []
  const {run, summary} = record
  out.push(`[loadMeasure] ${run.label} (${run.formFactor}) ${run.modelUrl}`)
  out.push(`  features=${run.features.length ? run.features.join(',') : 'none'}` +
    ` iterations=${run.iterations} cpuThrottle=${run.cpuThrottleRate}` +
    ` network=${run.network ? `${run.network.downloadMbps}Mbps/${run.network.latencyMs}ms` : 'unthrottled'}`)
  for (const [key, value] of Object.entries(summary)) {
    out.push(`  ${key.padEnd(SUMMARY_KEY_WIDTH)} min ${String(value.min).padStart(SUMMARY_VALUE_WIDTH)}` +
      `  med ${String(value.median).padStart(SUMMARY_VALUE_WIDTH)}  max ${String(value.max).padStart(SUMMARY_VALUE_WIDTH)}  (n=${value.n})`)
  }
  const report = record.samples[0]?.report
  if (report) {
    out.push('  report:')
    for (const line of report.lines) {
      out.push(`    ${line}`)
    }
    if (report.preview === null) {
      out.push('    (no Preview: line — Share does not call conway setPreviewStats yet; conway#544)')
    }
  }
  return out.join('\n')
}

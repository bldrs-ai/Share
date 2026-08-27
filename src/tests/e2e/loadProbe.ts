/**
 * The two halves of the measurement harness that have to be unit-testable:
 * the source of the in-page probe, and the resolution of what the browser
 * is pointed at.
 *
 * Free of any `@playwright/test` import, and that is load-bearing rather
 * than tidy — the same reason `loadReport.ts` is. Importing
 * `@playwright/test` into a module a Jest suite loads brings Playwright's
 * own `expect` along, which mutates the shared expect state the repo's
 * matchers run on; every `toEqual` in that suite then dies with
 * `TypeError: this.customTesters is not iterable`. Neither piece below can
 * be proved from a browser run — the probe's attach window is one task wide
 * during app startup, and a mis-resolved model URL surfaces only as a
 * `waitForModelReady` timeout — so both live here, where Jest can reach
 * them (`loadProbe.test.js`).
 */

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
 *
 * Exported only so `loadMeasure.test.js` can run it against a fake store in
 * jsdom — the timing window it has to get right (attaching before the first
 * stage can open and close) is not reproducible from a real browser load.
 * It is otherwise never called here: `loadMeasure.ts`'s `installLoadProbe`
 * ships it into the page as source via `addInitScript`, so it must stay
 * self-contained,
 * with no reference to anything outside its own body.
 */
export function probeSource(): void {
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

  /**
   * Subscribe to the store and take one reading of the state it already
   * holds. Idempotent — the first caller wins.
   *
   * @param store the store as exposed on `window.store`, if any
   */
  function attachStore(store: ProbeWindow['store']): void {
    if (subscribed || store === undefined || typeof store.subscribe !== 'function') {
      return
    }
    subscribed = true
    store.subscribe(recordStore)
    recordStore(store.getState())
  }

  /** One frame of observation. */
  function tick(): void {
    probe.frames++
    const store = self.store
    if (store !== undefined) {
      // Belt-and-braces: the setter below normally attaches first. This
      // only fires if something redefined `window.store` over our accessor.
      attachStore(store)
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

  // Attach in the same task as `window.store = useStore` (src/BaseRoutes.jsx),
  // not on the next frame. That assignment happens in a React effect, and
  // the load effects that publish stages run right behind it, so a stage
  // that opens and closes inside that same task is over before any rAF
  // callback runs — and the `getState()` that a frame-driven attach takes
  // afterwards recovers only the label current at that instant, never the
  // one that already closed. That is precisely the sampling gap this probe
  // subscribes to stages to avoid (see recordStore); leaving it at the
  // attach point would drop the same short stages one level up and still
  // report the boundary list as complete.
  let storeValue = self.store
  Object.defineProperty(self, 'store', {
    configurable: true,
    enumerable: true,
    get: () => storeValue,
    set: (value: ProbeWindow['store']) => {
      storeValue = value
      attachStore(value)
    },
  })
  // Covers a store that somehow exists already — an init script is meant to
  // run before any page script, but the probe must not depend on it.
  attachStore(storeValue)

  requestAnimationFrame(tick)
}


// A Share viewer route in any of its five forms (src/ShareRoutes.jsx):
// /share/v/{p,new,gh,u,g}/…, optionally under the GitHub-Pages install
// prefix (/Share/share/v/…). Matched against the *pathname* only, so a
// hosted model that happens to carry `share` in its query or host is not
// mistaken for one.
const SHARE_VIEWER_PATH_RE = /\/share\/v\/(?:p|new|gh|u|g)(?:\/|$)/i


/**
 * Resolve what the caller pointed at into a URL the viewer can actually
 * open.
 *
 * `BLDRS_MEASURE_MODEL` is the whole point of the env overrides — pointing
 * the harness at a corpus model (PSB, DOWA) is how conway #541's
 * CPU-versus-bandwidth question gets settled. But `page.goto` on a raw
 * `https://host/PSB.ifc` navigates Chromium *at the IFC bytes*: there is no
 * Share app on that page, so no `cadview-dropzone`, no probe store, and the
 * run dies as a `waitForModelReady` timeout — which reads like a slow model
 * rather than a misaimed harness.
 *
 * Three cases, and guessing wrong in either direction is its own bug, so
 * they are separated on structure rather than on a heuristic:
 *
 * 1. **Not absolute** (`new URL` throws — `/share/v/gh/o/r/main/x.ifc`) — a
 *    route, resolved against the Playwright `baseURL`. Unchanged, and this
 *    is the only way to reach a viewer.
 * 2. **Absolute with a Share viewer route in its path**
 *    (`https://deploy-preview-1774--bldrs-share.netlify.app/share/v/gh/…`)
 *    — **rejected**, see below.
 * 3. **Absolute, anything else** (`https://host/PSB.ifc`) — a hosted model.
 *    Wrapped in the generic-URL route, `/share/v/u/<encoded>`.
 *
 * Case 2 used to be passed through, which advertised a mode that cannot
 * work. `BaseRoutes.jsx` exposes `window.store` only when the build was
 * configured for playwright, so against a production or deploy-preview
 * origin the injected probe finds no store — and therefore no viewer, no
 * scene, no stage transitions and no ready timestamp. The model loads and
 * every cross-check assertion fails anyway. A remote viewer is not
 * measurable by this harness, so it says so, at the point of use, instead
 * of failing later and blaming the model. Measuring a *different build* is
 * the interesting version of that request and it needs a different design
 * (a probe observable that survives a production build); it is not
 * something this function can paper over.
 *
 * The wrapped URL is percent-encoded, as `SearchBar` and `routes.spec.ts`
 * both do: it keeps a signed URL's own `?…` inside the splat segment
 * instead of colliding with the `?feature=` query {@link withFeatures}
 * appends afterwards.
 *
 * A scheme-less external reference (`host/x.ifc`) is case 1 by
 * construction and will 404 — external models must carry their scheme.
 * The host must also serve CORS headers the viewer can fetch through, the
 * same requirement any `/share/v/u/` load has.
 *
 * @param modelUrl the caller's `modelUrl` / `BLDRS_MEASURE_MODEL`
 * @return a URL that lands on the local, instrumented Share viewer
 * @throws when handed an absolute Share viewer URL, which is unmeasurable
 */
export function toViewerUrl(modelUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(modelUrl)
  } catch {
    return modelUrl
  }
  if (SHARE_VIEWER_PATH_RE.test(parsed.pathname)) {
    throw new Error(
      `Cannot measure a remote Share viewer URL (${modelUrl}). ` +
      'window.store is exposed only in a playwright-configured build ' +
      '(src/BaseRoutes.jsx), so the probe would see no store, no scene, no stage ' +
      'transitions and no ready flip, and the run would fail its cross-check ' +
      'assertions even though the model loaded. Pass the route instead ' +
      '(e.g. /share/v/gh/org/repo/main/model.ifc), which runs against the local ' +
      'instrumented build, or pass the model file URL to have it wrapped in ' +
      '/share/v/u/.')
  }
  return `/share/v/u/${encodeURIComponent(modelUrl)}`
}


/**
 * The real hosts a measurement run deliberately asked for, for
 * `homepageSetup`'s network guard.
 *
 * The guard (`utils.ts` / `networkGuard.ts`) aborts `raw.githubusercontent.com`
 * and `media.githubusercontent.com` among others, and it is right to: a
 * hermetic spec reaching real GitHub can paper over a broken mock. But a
 * `BLDRS_MEASURE_MODEL` pointed at a corpus model on one of those hosts is
 * the opposite of incidental leakage — an operator named that exact file —
 * and blocking it produces the same `waitForModelReady` timeout that
 * {@link toViewerUrl} exists to eliminate, which again reads like a slow
 * model rather than a blocked fetch.
 *
 * So: exactly the model URL's own host, and only when the caller passed an
 * absolute URL. A route (the in-repo fixture, the default) allows nothing
 * and the guard is untouched.
 *
 * @param modelUrl the caller's `modelUrl` / `BLDRS_MEASURE_MODEL`
 * @return the hosts to allow, empty for a route
 */
export function measureAllowHosts(modelUrl: string): string[] {
  try {
    return [new URL(modelUrl).hostname]
  } catch {
    return []
  }
}


/**
 * The model file's name, as it identifies the download among a page's
 * responses.
 *
 * Percent-decoded, and {@link urlMatchesModel} decodes the response URL to
 * match — the two must be normalized the same way or a filename with an
 * escaped character never matches at all. Corpus paths with spaces are not
 * hypothetical (`ISSUE_021_Mini Project.ifc` is in conway's smoke set), and
 * the failure is quiet: no response is collected, so `bytes.model` and every
 * download timing come back null on a model that loaded fine.
 *
 * @param modelUrl the caller's `modelUrl` / `BLDRS_MEASURE_MODEL`
 * @return the decoded basename, or '' when there is none
 */
export function modelBasenameOf(modelUrl: string): string {
  return decodeMaybe(modelUrl.split('?')[0].split('#')[0].split('/').pop() ?? '')
}


/**
 * Whether a response URL is plausibly the model download.
 *
 * @param responseUrl `response.url()`, which keeps its percent-encoding
 * @param modelBasename from {@link modelBasenameOf}
 * @return true when the response URL names that file
 */
export function urlMatchesModel(responseUrl: string, modelBasename: string): boolean {
  if (modelBasename.length === 0) {
    return false
  }
  return decodeMaybe(responseUrl).includes(modelBasename)
}


/**
 * Percent-decode, tolerating a string that is not validly encoded — a URL
 * may legitimately contain a bare `%`, and `decodeURIComponent` throws on it.
 *
 * @param value
 * @return the decoded value, or the input when it does not decode
 */
function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
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

# Off-main-thread rendering — three.js in an OffscreenCanvas worker (open-205)

**Status:** scoping (no code). Spike measured 2026-11-03 (§5).
**Epic:** `open-205` (#2011). Story: #2055. **Related:** #2043 (interactive at first mesh: stuttery camera
expected), #2030 (no blocking calls), #2019 (per-model sessions), #2031
(close and eviction), #1251 (`open-210`, multi-model overlay), the
per-model Conway engine-worker story #2053 (scoped in parallel in
`design/new/engine-worker.md`; §6.4 says how the two compose).
**Reads with:** [in-app-model-switch.md](in-app-model-switch.md) §4.1
(P1.0 measurements) and §4.4 (Share's own long tasks),
[viewer-replacement.md](viewer-replacement.md) §8.4 "Move B" and Phase 7
(this is that separate spec), DESIGN.md §"Render loop & perf monitor".

This doc scopes moving Share's three.js renderer, scene and camera off the
main thread, so that camera interaction, picking and frame rendering stay
smooth while the main thread is busy (model loads, React updates, workspace
switches), and so rendering stops competing with the load. It inventories
everything that touches the renderer from the main thread, checks the
platform, reports a spike, and recommends an order of work. Line numbers are
at `86f9908`.


## 1. Conclusion first

1. **Do render-on-demand on the main thread first (§7.1).** It is the
   cheapest win, needs no worker, and is a prerequisite for the worker
   anyway. Today the loop renders every display frame whether or not
   anything changed: `IfcContext.render` re-arms `requestAnimationFrame`
   unconditionally (`src/viewer/three/context/context.js:51`), and the
   composer renders on each one (`src/viewer/three/IfcHighlighter.js:109`).
   Two more rAF loops run beside it: PlaceMark (`src/Infrastructure/PlaceMark.js:308`,
   never cancelled) and the ViewCube (`src/Components/ViewCube/ViewCube.jsx:143`,
   which already only draws when dirty). With an idle camera, a load pays
   for every frame of the growing scene. In the spike, rendering on main
   stretched the same pump work by 29%; with nothing drawn it doesn't (§5).
2. **Then, after the engine worker and a real-GPU measurement (§9.1), a
   single render worker, separate from the per-model engine workers
   (option (a), §6).** Geometry goes engine worker → render worker
   over a `MessageChannel` as transferred `ArrayBuffer`s. Main brokers the
   port and never holds the geometry. Picking, hover, highlight, residency,
   isolation masks and the cut planes live in the render worker. Selection,
   hide and isolate *as logical state* stay on main, in the store, where
   React reads them.
3. **A render worker does not fix input latency on its own.** DOM input
   events are dispatched on the main thread, so while main is blocked for
   250 ms, the worker gets no pointer events for 250 ms either. Damping,
   streaming geometry and animation keep painting in the worker, but a drag
   stalls. Input latency is fixed by keeping main's tasks short. That means
   the engine worker (which removes Conway's pump) plus #2030 (Share's own
   multi-second blocks), not the render worker. In the spike, a render
   worker with the pump still on main made input → frame latency *worse*
   (p50 105 → 152 ms), while moving the pump off main halved it (p50 63 ms,
   p95 117 ms). Either move gave the same +60% frame rate (§5).
4. **The biggest blocker is not the platform but the shape of Share's
   state.** The store's `model` *is* the three.js `Object3D` in the scene
   (`src/Containers/CadView.jsx:1006, 1014`), CadView's pick handler reads
   per-batch typed-array tables off the picked mesh (`CadView.jsx:1513-1535`),
   and `ShareViewer` builds both the engine and the renderer
   (`src/viewer/ShareViewer.js:255-268`). Moving the renderer means the
   model becomes a handle on main. That is the same split #2019 (sessions)
   and the engine worker need, so it is shared work, not overhead.
5. **No platform blocker.** WebGL2 in an `OffscreenCanvas` in a dedicated
   worker ships in Chrome/Edge 69, Firefox 105 and Safari 17 (incl. iOS 17)
   (§3). Two caveats: macOS 13 Ventura's Safari 17 reportedly lacks worker
   WebGL, so detect *inside a worker*, and Chrome has no
   `requestAnimationFrame` in a *nested* worker, so the page must spawn the
   render worker itself. Neither needs `SharedArrayBuffer` or cross-origin
   isolation; the whole design uses transfer and message passing only.
6. **A worker renderer must pace itself.** In the spike the worker's rAF
   wasn't back-pressured by a slow GPU the way main's is. It queued frames,
   then blocked for 2–8 s at a time. Keep one frame in flight with a
   WebGL2 fence (§3.3).


## 2. Inventory: what touches the renderer, scene or camera from main

Classes:

- **M — moves cleanly.** It runs in the worker as-is, or with a local
  edit (an `OffscreenCanvas` for a `document.createElement('canvas')`, a
  size passed in instead of read from `window`).
- **P — needs a proxy or RPC.** It stays on main, or main keeps calling it,
  so it needs a message API, an event proxy, or a main-side mirror of
  state that is cheap to keep in sync.
- **B — blocks.** It must be restructured before the worker can own the
  scene, or it has no worker equivalent without a shim.
- **D — dead.** It runs today but does nothing; delete it instead of
  porting it.

### 2.1 Viewer setup and render loop

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 1 | `WebGLRenderer` construction, pixel ratio, size | `src/viewer/three/context/renderer/renderer.js:20-28, 57-63` | M | Pass `canvas: offscreen`. `setSize(w, h, false)`: r184 writes `canvas.style` unless `updateStyle === false` (`node_modules/three/src/renderers/WebGLRenderer.js:651-666`), and an `OffscreenCanvas` has no `style`. `window.devicePixelRatio` (`:28`) comes in the resize message. |
| 2 | Render loop: rAF re-armed every frame | `context/context.js:40-57, 225-228` | M | Dedicated workers have `requestAnimationFrame` (Chrome 69, Firefox 99, Safari 16.4), but not nested ones in Chrome (§3). Becomes render-on-demand (§7.1). |
| 3 | `setRenderUpdate` seam + composer closure | `ThreeContext.js:217`, `IfcHighlighter.js:39, 103-111` | M | The seam moves with the loop. `window.innerHeight/innerWidth` passed to the outline effect (`IfcHighlighter.js:29-30`) become the resize message's size. |
| 4 | `EffectComposer`, `OutlineEffect`, `ToneMappingEffect`, SSAO + `NormalPass` | `src/viewer/three/CustomPostProcessor.js:56, 83-124, 216` | M | `postprocessing` 6.39.1 guards its one `document` use (`visibilitychange`, `build/index.js:847`). Its other `document.createElement` calls are in the ASCII and LUT textures, which Share doesn't use. |
| 5 | Scene, lights | `context/scene.js:28-83` | M | |
| 6 | Gradient IBL texture from a 2D canvas, PMREM | `ShareViewer.js:96-110, 345` | M | `new OffscreenCanvas(16, 256)` instead of `document.createElement('canvas')`. |
| 7 | Contact-shadow ground plane | `ShareViewer.js:398-530` (`groundModel`) | M | |
| 8 | Camera + `camera-controls` construction | `context/camera/camera.js:41-60` | P | `getDimensions()` reads the container's `clientWidth`. Controls need the element proxy (§6.5). |
| 9 | `CSS2DRenderer` created and rendered every frame | `renderer.js:15, 53, 63, 97-100` | D | No `CSS2DObject` exists anywhere in `src/`. PlaceMarks are WebGL sprites now. Delete it before the move (and save a DOM pass per frame today). |
| 10 | Vendored `Postproduction` | `context/renderer/postproduction.js:14, 85, 216` | D | Never activated (`isActive` false). Its constructor still makes an `<img>`. Delete it. |
| 11 | Window `resize` listener | `context.js:229-231` | P | Main's `ResizeObserver` on the container posts `{width, height, dpr, rect}`. |
| 12 | Viewer init/dispose: container lookup, canvas `tabIndex`, `forceContextLoss` | `src/Containers/viewer.js:35-113, 127-176` | P | Init transfers the canvas. Dispose posts `dispose` then terminates. A transferred canvas can't be transferred again (§3.3), so a new viewer needs a new `<canvas>`. |

### 2.2 Input: pointer, wheel, touch, keyboard

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 13 | `camera-controls` DOM listeners | `node_modules/camera-controls/dist/camera-controls.module.js:506-549, 840-845` | P | Listens on the element *and* `element.ownerDocument` (`pointermove`/`pointerup` during a drag). Calls `preventDefault` on `wheel` (passive: false), `contextmenu` and touch moves, which only main can do. §6.5 has the shims. |
| 14 | `camera-controls` environment sniffing | same file `:164-166, 778` | P | `isPointerEventsNotSupported = !(isBrowser && 'PointerEvent' in window)` is evaluated at import. In a worker `window` is undefined, so it is true, and controls register `mousedown`/`touchstart` paths too. `document.pointerLockElement` is read on every drag. |
| 15 | `IfcMouse`: NDC pointer from `canvas.onmousemove` | `context/mouse.js:11-18` | P | Fed by forwarded `pointermove`. |
| 16 | Hover pick: `window` `mousemove` → `highlightIfcItem` at ≤30 Hz | `Containers/viewer.js:141-167`, `ShareViewer.js:1613-1702` | P | Runs worker-local from forwarded moves: no round trip, no main involvement. |
| 17 | Double-click pick + id resolution | `CadView.jsx:1183, 1462-1575` | P | Split: the raycast and the table lookups (`instanceParents`, `instanceOccurrenceIds`, `instanceMap`) move to the worker as `pick()`. The selection funnel (`selectFromInstancePick`, `elementSelection`) stays on main. |
| 18 | Keyboard shortcuts on the canvas (`Q W A H U I R`) | `src/utils/shortcutKeys.js:8-30` | P | Stays on main. Q/W become `clipper.createPlaneAtPointer()` / `deletePlaneAtPointer()` RPCs that use the worker's last pointer. The canvas element stays in the DOM after transfer, so it still takes focus and `tagName === 'CANVAS'` still holds. |
| 19 | Camera-permalink listeners on the canvas | `src/Components/Camera/CameraControl.jsx:78-81` | P | Stay on main (they only clear the `#c:` hash). |

### 2.3 Camera

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 20 | `#c:` permalink read/write | `CameraControl.jsx:32, 107-138, 201-208` | P | `getPosition`/`getTarget` read the camera mirror synchronously. `setPosition`/`setTarget` are RPCs. |
| 21 | `cameraControls` in the store; `rest` listener for analytics | `CameraControl.jsx:35`, `CadView.jsx:795-800` | P | The store keeps the `CameraProxy` (§6.6), which re-emits `rest`/`control*` from the worker. |
| 22 | Framing: `fitCameraLimitsToModel`, `fitModelToFrame`, camera follow | `CadView.jsx:1027-1033`, `orbit-control.js:62-129`, `ProgressiveLoadSession.js:620-633` | M | Runs where the bounds are. Main calls `frame(modelKey)`. |
| 23 | Assistant `view.*` and share tools | `src/viewer/tools/viewTools.js:917, 934`, `shareTools.js:53` | P | Camera mirror + RPC. |
| 24 | ViewCube: own `WebGLRenderer` + rAF, reads main camera quaternion, drives `rotate`/`rotateTo` | `ViewCube.jsx:108-143, 234, 538` | P | Stays on main with its own small context, fed by the mirror's quaternion. The cube lags while main is blocked; that's acceptable (open decision §9.4). |

### 2.4 Picking, highlight, residency, isolation, cut planes

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 25 | Raycaster, three-mesh-bvh BVH build and raycast | `context/raycaster.js:19-34`, `Picker.js:31-45`, `buildBatchedConwayModel.js:81-140` | M | Pure. The 2.2–2.4 s BVH/bounds task (in-app-model-switch.md §4.4 item 2) leaves main for good. |
| 26 | Selection / preselection painting (`setColorAt`, subsets, outline) | `ShareViewer.js:899-1110, 1358-1600, 1810-1835`, `ifc/batchedHighlight.js:325-400`, `three/elementSubsets.js` | M | Worker side. Main sends `select({modelKey, expressIds | instanceIds})`. |
| 27 | Occurrence → instance lookups used by selection and the assistant | `ShareViewer.js:1115-1356` (`getInstanceIdsForOccurrencePath`, `getRootLevelInstances`, `getGeometryIdsForOccurrencePath`) | P | These are table lookups, not rendering. Answer them in the worker by async RPC, or keep a copy of the per-batch tables on main. Open decision §9.5. |
| 28 | Isolation / hide masks | `three/IfcIsolator.js` (1691 lines; `onBatchEdit` at `:750`) | M + P | Masks move. The logical state CadView, refs and the Widget API read synchronously (`canBePickedInScene`, `hiddenIds`, `visualElementsIds`; `Containers/selection.js:27`, `viewer/tools/refs.js:98, 159`, `WidgetApi/event-handlers/*`) needs a main-side mirror. |
| 29 | Residency (distance / screen-size streaming) | `viewer/residency/ResidencyController.js:51-205` | M | Reads the camera each frame, so it belongs with it. |
| 30 | Display overrides (color, shading) | `viewer/display/DisplayController.js:46-171` | M | `applyDisplayOverrides(model, overrides)` becomes an RPC with the overrides as data. |
| 31 | Post-load edits and their synchronous listeners | `ifc/batchedEdit.js:159-212` (`onBatchEdit`), subscribers in batchedHighlight `:77`, Residency `:93`, Isolator `:750` | M | All three subscribers move with the batches, so model-edit.md §6.2's "state is right when the edit returns" contract holds *inside* the worker. Edit ops arrive as RPCs. |
| 32 | Cut planes: `MeshClipper` plane arrows, drag, `material.clippingPlanes` | `three/MeshClipper.js:61-140, 256-309, 412-554` | M + P | The plane and its drag move (they need the pointer and camera). Cursor style (`:309, 536`) becomes a `cursor` event to main. `CutPlaneMenu` (`Components/CutPlane/CutPlaneMenu.jsx:26-34, 98-149`) computes the model center with `Box3.setFromObject(model)`; it gets bounds from the model handle instead. `ShareDialog.jsx:73-88` reads the plane list: mirror. |
| 33 | Section fills | — | — | None exist. The fork's `SectionFillManager` went in slice 5d.3 (`ShareViewer.js:237`). Nothing to move; a future fill (stencil caps) is worker-side by construction. |

### 2.5 Overlays from 3D

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 34 | PlaceMark sprites, raycast drop/select, per-frame scale+sort | `Infrastructure/PlaceMark.js:28-311` | M + P | The sprites and their rAF update move. The pin icon is an SVG drawn through `new Image()` + a 2D canvas (`:236-249`); a worker has no `Image`, so main rasterizes it once and transfers an `ImageBitmap`. |
| 35 | MarkerControl drives PlaceMark: creates markers, holds sprites in a Map, sets `material.color` | `Components/Markers/MarkerControl.jsx:112, 204-262, 301-333, 347, 372` | P | Markers become ids: `markers.put/remove/setActive/setColor`. `onSceneClick`/`onSceneDoubleClick` return a `pick()` result. (#2017 rebinds PlaceMark per viewer; do that first.) |
| 36 | CSS2D / DOM labels positioned from 3D | — | — | None live (#9). A future DOM overlay reads the camera mirror's matrices and projects on main. |

### 2.6 Loaders that build the scene

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 37 | Conway-direct batched build (`IncrementalBatchedBuilder`, `flatMeshToBatchedModel`, `assembleBatchedModel`) | `viewer/ifc/incrementalBatchedBuilder.js:184`, `buildBatchedConwayModel.js:57-165` | M | Fed by geometry buffers from the engine worker (§6.4). That takes Share's ~4 s of PSB batch building off main. |
| 38 | Progressive preview group | `viewer/ProgressiveLoadSession.js:188-195` | M | Same stream. |
| 39 | GLB / glTF (+ DRACO, meshopt), STL, OBJ, PLY, PDB, XYZ, BLD, ADF, 3DM | `src/loader/Loader.js:2112-2230, 2273-2300` | M | `GLTFLoader` picks `ImageBitmapLoader` whenever `createImageBitmap` exists (`GLTFLoader.js:2579-2606`), which is true in workers. `DRACOLoader` spawns its own (nested) workers, which works. 3DM fetches `rhino3dm` from jsDelivr (`Loader.js:2224`). |
| 40 | FBX and USDZ textures | `FBXLoader.js:173` (`TextureLoader` → `ImageLoader` → `document.createElementNS`), `usd/USDComposer.js:3866` (`new Image()`) | B (minor) | Shim `TextureLoader` with an `ImageBitmapLoader` in the worker realm, or parse these two formats on main and transfer the result. Open decision §9.7. |
| 41 | Gaussian splats (Spark 2.1.0) | `loader/splats.js:67-73, 152-162` | M, verify | Share passes `fileBytes`, so Spark's `window.location` URL resolution (`spark.module.js:11184, 13765`) isn't reached. Spark spawns its own workers from blob URLs; check it on Safari. |
| 42 | Loader/CadView install the model into the scene and the store | `CadView.jsx:1003-1060`, `Loader.js` (35 reads of three-object fields on `model`) | B | See #46. |

### 2.7 Screenshots, export, perf, look GUI

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 43 | `takeScreenshot` → second `WebGLRenderer` on a cloned canvas → `toDataURL` | `ShareViewer.js:1867-1872`, `renderer.js:66-91`, used by `Components/Notes/NoteFooter.jsx:170` | P | Becomes async: render into a render target in the worker, `readPixels`, `OffscreenCanvas.convertToBlob()`. NoteFooter awaits it. |
| 44 | Sample thumbnails | `tools/thumbnails/generate.mjs:193-229` | P | Clears `scene.background` through `window.store` (needs a probe, #48). The element screenshot of `#viewer-container canvas` still works: the compositor shows an offscreen canvas like any other. |
| 45 | GLB cache writer reads the live scene: `exportBatchedModelAsInstancedGlb`, `GLTFExporter` | `Loader.js:989-1040`, `loader/glbExport.js:111-140, 231-379` | P | Run its preparation in the render worker (where the batches are) and post the result to the existing GLB writer worker, or post the batch arrays to that worker. That also takes the 6.0 s main-thread writer task (in-app-model-switch.md §4.4 item 1) off main. The Pro export reads the OPFS artifact, not the scene, so it doesn't change (glb-export-premium.md §1.1). |
| 46 | Perf panel (`withPerf`, `?feature=perf`) | `src/utils/PerfMonitor.js:77, 105, 152, 227, 307` | P | The panel stays a DOM element on main. The worker times its frames and posts samples (e.g. 4 Hz). Show worker frame time *and* main-thread long tasks, since FPS alone stops describing jank. |
| 47 | `?feature=look` lil-gui panel; `applyLook`, env/shadow setters | `three/LightingGui.js:110-140`, `ShareViewer.js:335-630` | P | lil-gui is DOM: the panel stays on main and its controllers call RPC setters. |

### 2.8 Tests and globals

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 48 | E2E specs and helpers reading three.js state via `window.useStore`/`window.store` | 24 files, e.g. `src/tests/e2e/utils.ts:382-470` (`pauseViewerRendering`, `captureRenderedFrame` read the WebGL context), `Components/Camera/permalinkCamera.spec.ts`, `viewer/three/IfcIsolator.spec.ts`, `Components/Share/exportGlb.spec.ts` | P | Under the worker, `viewer.context` holds no scene. Add a test-only probe bridge with named probes registered in the worker (`camera`, `sceneSummary`, `readFrame`, `pause/resume`, `isolatorState`). Named, not `eval`, so no `unsafe-eval` in the worker. Keep the flag-off path so existing specs keep running unchanged. |
| 49 | `window.markerScene` test hook | `PlaceMark.js:34-38`, `MarkerControl.jsx:193-198` | P | Same bridge. |
| 50 | Jest: jsdom canvas stubs, ShareViewer mocks | `tools/jest/setupTests.js:67-70`, `src/__mocks__/` | M | The render core is plain modules, testable in jsdom as today. The transport gets a same-thread implementation for tests (§6.8). |

### 2.9 Structural blockers

| # | What | Where | Class | Note |
|---|---|---|---|---|
| 51 | The store's `model` is the scene's `Object3D` | `CadView.jsx:1006-1014`, `src/store/IFCSlice.js:97`; 20 files read `state.model`/`selectReadModel` | B | Main needs a `ModelHandle`: capabilities, bounds, the `ifcManager` property surface (which the engine worker makes async anyway), and a `modelKey` the render worker understands. Scene consumers (clipper, isolator, ViewCube) talk to the render worker by key. |
| 52 | `ShareViewer` builds the engine and the renderer together | `ShareViewer.js:255-268`; `Loader.js:159, 1020, 1028` reach `viewer.IFC.loader.ifcManager.ifcAPI` | B | #2019 moves the engine into the session and the engine-worker story moves it off main. The render worker needs the same split, so sequence it after (§8). |
| 53 | Synchronous viewer API returning scene results | `castRayToIfcScene` (`ShareViewer.js:875`), `takeScreenshot`, `getCameraControls().getPosition()`, isolator getters | P | Each becomes a mirror read (camera, isolation, planes) or an `await` (pick, screenshot). Listed in §6.6. |

### 2.10 Totals

| Class | Count | Items |
|---|---|---|
| M — moves cleanly | 21 | 1–7, 22, 25, 26, 29–31, 37–39, 41, 50, and the moving halves of 28, 32, 34 |
| P — proxy / RPC / mirror | 24 | 8, 11–21, 23, 24, 27, 35, 43–49, 53 |
| B — blocks | 4 | 40 (minor), 42, 51, 52 |
| D — dead, delete | 2 | 9, 10 |
| — nothing to move | 2 | 33, 36 |

53 rows in all. 28, 32 and 34 are split (their scene half moves, their
callers need RPC); they're counted once, under M. **Main-side scene use
outside `src/viewer/`:** 22 files import three.js outside `src/viewer/`,
not counting tests and fixtures: CadView, `Containers/viewer.js`,
CutPlaneMenu, MarkerControl, ViewCube, PlaceMark, `Filetype.js`,
`utils/svg.js`, and 14 under `src/loader/`.

**The top blockers are #51 and #52**, which are
structure, not platform, and are already on the open-205 path through
#2019 and the engine worker. **The biggest proxy surface is input (#13–17)
and the camera mirror (#20–24)**, and the riskiest single item is
`camera-controls` in a worker (#13–14).


## 3. Platform check

### 3.1 Support

From MDN's browser-compat-data (`api/OffscreenCanvas.json`,
`api/HTMLCanvasElement.json`, `api/DedicatedWorkerGlobalScope.json`, read
2026-11-03), plus the WebKit bug discussion for the Ventura caveat.

| | Chrome / Edge | Firefox | Safari (macOS) | Safari iOS / iPadOS |
|---|---|---|---|---|
| `transferControlToOffscreen` | 69 | 105 | 16.4 | 16.4 |
| `OffscreenCanvas` `webgl` / `webgl2` context | 69 | 105 | **17** (16.4–16.6: 2D only) | **17** |
| `requestAnimationFrame` in a dedicated worker | 69, **not in nested workers** (crbug 41483010) | 99 | 16.4 | 16.4 |
| `convertToBlob` / `transferToImageBitmap` | 69 | 105 | 16.4 | 16.4 |
| Android (Chrome / Samsung Internet) | mirrors Chrome | | | |

- **Safari 17 on macOS 13 Ventura** reportedly returns no WebGL context in
  a worker, while Sonoma works (comments on WebKit bug 183720). A
  main-thread probe passes on Ventura, so **feature-detect inside a
  worker**: spawn the render worker, try
  `new OffscreenCanvas(1, 1).getContext('webgl2')`, and fall back when it
  is null (§6.9).
- Share's current support floor already needs WebGL2 (three r184 dropped
  WebGL1), so the browsers that would fall back are Safari 16.x, Safari
  17 on Ventura, and Firefox < 105.

### 3.2 Context loss

- three r184 listens for `webglcontextlost` / `webglcontextrestored` /
  `webglcontextcreationerror` on whatever canvas it gets
  (`WebGLRenderer.js:383-385`). An `OffscreenCanvas` is an `EventTarget`, so
  the same handlers fire in the worker in Chrome (Chromium has had a worker
  context-lost/restored test since 2016). MDN marks the OffscreenCanvas
  `contextlost`/`contextrestored` events, which are the *2D* ones, as Chrome
  99 / Firefox 125 / not Safari. Firing of `webglcontextlost` on an
  OffscreenCanvas in Safari and Firefox workers is **unverified**; test it
  with `WEBGL_lose_context` in the cross-browser smoke.
- **Plan.** On loss, the worker stops its loop and posts `contextLost`. On
  restore, three re-initialises its state and resources upload again. If no
  restore comes within a timeout, or the worker dies (an `error` event, or
  an OOM kill, which takes the worker with it), main treats it as a crash.
  It replaces the `<canvas>` element (a canvas transfers once), starts a new
  render worker, and re-adds the active models: from the engine worker's
  retained geometry where that exists, else from the OPFS GLB cache. The
  logical state (selection, hide, isolate, planes, camera, markers) is on
  main, so it replays. That replay is the same "rebind the view to a
  session" step #2019 needs.
- Today `disposeViewer` forces context loss to stay under Chrome's ~16
  live contexts (`Containers/viewer.js:86-92`). In the worker: dispose,
  `forceContextLoss()`, then `worker.terminate()`. One render worker for the
  page (option (a)) keeps the count at one plus the ViewCube.

### 3.3 `transferControlToOffscreen` limits

- **The canvas is taken.** After transfer, main can't call `getContext`,
  `toDataURL`, `toBlob`, or set `width`/`height` on that element; they throw
  `InvalidStateError`. It can still style it (`style.width/height`), focus
  it, and receive its events. Today's direct `getContext` readers are only
  the E2E helpers (#48).
- **It transfers once.** A second `transferControlToOffscreen` on the same
  element throws. Every new viewer, and every crash recovery, needs a fresh
  `<canvas>`. `initViewer` already empties the container (`viewer.js:130`).
- **Resize.** The worker sets `offscreen.width/height` (the drawing
  buffer) through `renderer.setSize(w, h, false)`; main keeps the CSS size at
  100% of the container. Main sends `{cssWidth, cssHeight, dpr, rect}` from a
  `ResizeObserver`. `devicePixelBoxContentSize` gives exact device pixels
  where it exists. The existing `Math.min(dpr, 2)` cap
  (`renderer.js:28`) stays.
- **devicePixelRatio** doesn't exist in a worker. Main re-sends it when it
  changes (`matchMedia('(resolution: Xdppx)')` change, e.g. a window moved
  between monitors).
- **Frame pacing** follows the worker's own rAF, which is tied to the
  canvas's display. A hidden tab throttles it as it does on main.
- **Pitfall: the worker's rAF is not back-pressured like main's.** In the
  spike (§5), the worker's rAF kept firing at ~60 Hz while SwiftShader
  needed 250+ ms per frame. The worker queued frames the GPU process
  couldn't draw, then blocked for 2–8 s at a time when the queue filled.
  Main's rAF, on the same scene, slowed to the GPU's pace instead. Whether
  a hardware GPU shows the same is unverified, but the guard is cheap. The
  worker keeps at most one frame in flight: after each frame it issues a
  WebGL2 `fenceSync`, and the next rAF skips drawing until
  `clientWaitSync(fence, 0, 0)` reports it signalled.

### 3.4 three.js r184 and the libraries

`package.json`: three 0.184.0, camera-controls 1.36.1, postprocessing
6.39.1, three-mesh-bvh 0.9.10, @sparkjsdev/spark 2.1.0.

- **three r184 supports it.** `WebGLRenderer` takes
  `HTMLCanvasElement | OffscreenCanvas`, skips `setAttribute` on an
  OffscreenCanvas (`WebGLRenderer.js:379`), and `WebGLTextures` uses
  `OffscreenCanvas` for its resize canvas when available
  (`webgl/WebGLTextures.js:19-40`).
- **Pitfall: `setSize` without `updateStyle = false` throws** on an
  OffscreenCanvas (`style` is undefined). The spike calls it with `false`.
- **Pitfall: textures.** `TextureLoader` → `ImageLoader` →
  `document.createElementNS('img')` doesn't exist in a worker. `GLTFLoader`
  avoids it (ImageBitmapLoader). FBX and USDZ don't (#40). Any texture Share
  makes itself from a DOM canvas or image (IBL gradient #6, PlaceMark icon
  #34, ViewCube faces, which stay on main) needs `OffscreenCanvas` or an
  `ImageBitmap` from main.
- **Pitfall: `camera-controls` needs shims (#13–14).** The element proxy
  (§6.5) gives it a fake element. Two globals it reads at import or per
  drag, `window.PointerEvent` and `document.pointerLockElement`, need a
  narrow, build-time patch for the worker entry rather than a global
  `self.document`. A global `document` would flip the `typeof document`
  feature checks in `postprocessing` and Spark into DOM paths.
- **OrbitControls** isn't used (Share's "Orbit" nav mode is camera-controls).
- **`gsap` / `Animator`** (`context/animator.js`) is constructed but has no
  caller outside the context. Drop it with the move.
- **`postprocessing`** is fine (#4). **three-mesh-bvh** is pure.
  **lil-gui** is DOM and stays on main (#47).


## 4. What the measurements already say

From in-app-model-switch.md §4.1, P1.0 and the #2043 framing:

- In headless Chromium with software WebGL, PSB (860 MB IFC) Geometry
  takes 37 s with the render loop frozen and 615–695 s at 1 fps. SEESTRASSE
  takes 21.3 s at full rate and 4.7 s throttled to 1 Hz. Each frame of the
  growing scene competes with the geometry pump on one thread. On real GPUs
  the per-frame cost is far smaller, but it is the same contention, and on
  BatchedMesh it isn't only GPU time. `perObjectFrustumCulled` is left at
  its default `true` (`viewer/display/shadingMode.js:131-135`), so
  BatchedMesh culls every instance and rebuilds its multi-draw list on the
  CPU each frame, on the render thread.
- Share's own three.js batch building costs about 4 s of PSB Geometry, all
  on main. End-of-load assembly (BVH + robust bounds) is 2.2–2.4 s and the
  GLB writer's preparation is 6.0 s on sp-231MB, both main-thread single
  tasks.
- #2043 expects a stuttery camera from 187 event-loop blocks over 50 ms
  (max 0.6 s) during the open.


## 5. Spike (2026-11-03)

**Setup.** A throwaway page (not product code; scripts kept out of the
repo) built with Share's own three r184. One `BatchedMesh` of boxes, spheres
and cylinders with per-instance colours. `MeshLambertMaterial`, antialias
and `logarithmicDepthBuffer` as Share's renderer. 1280×800 at DPR 1. A slow
spin plus a pointer-driven azimuth. The renderer calls `gl.finish()` after
each frame, so the thread that renders pays for the frame. A synthetic
**pump** stands in for the geometry pump: blocks of 50–250 ms of
synchronous work (uniform, seeded), each followed by a `setTimeout(0)`
yield, until 12 s of work is done (~80 blocks). Playwright sends a
`mouseMoved` over CDP every 16 ms without awaiting, as a drag would. Input
latency is from the event's `timeStamp` (stamped when the browser receives
it, whatever the main thread is doing) to the end of the first frame that
used it. Each scenario runs in a fresh browser, twice, under
`/home/user/.bench.lock`.

| Scenario | Render | Pump |
|---|---|---|
| S0 | none (the render-on-demand ceiling: camera idle) | main |
| S1 | main (today) | main |
| S2 | render worker | main |
| S3 | main | worker (engine worker only) |
| S4 | render worker | worker (both) |

**Environment.** A 4-vCPU container with no GPU. Chromium 1243, headless,
ANGLE on SwiftShader. SwiftShader rasterizes in the GPU process on several
threads (about 3.3 cores busy while drawing), so the render worker and
the pump also compete for cores there; on a real GPU they mostly don't.
Absolute frame times are not user-representative (a 58k-triangle frame
costs ~125 ms here). **Read the ratios.**

**Method notes.** The first pass is discarded because of three flaws, and
they're worth knowing for the next spike. First, a pump that spins for
*time* rather than *work* hides contention: its wall time was identical in
every scenario. Second, `event.timeStamp` is set when the main thread
dispatches the event, not when the browser received it, so it reads ~10 ms
even behind a 250 ms block. Third, at 1280×800 with MSAA and log depth,
SwiftShader's rasterization in the GPU process bounds every scenario at
~4 fps, whichever thread draws. The pass below fixes all three:

- the pump does a fixed number of iterations, calibrated once on a quiet
  machine;
- input latency is measured *per sent event*: from the runner's send time
  to the end of the first frame showing that event or a later one;
- the scene is render-thread-bound rather than raster-bound.

**Scene B: render-thread-bound** (the closer model of a real GPU, where the
frame's cost is CPU-side). 300k instances (7.2 M triangles in the batch).
The camera sits inside the grid with a 24-unit far plane, so every
instance is frustum-tested on the CPU each frame
(`perObjectFrustumCulled`, as Share leaves it) but only a few hundred are
rasterized. 640×400, no MSAA or log depth. The render thread is busy ~22 ms
per frame. Median of 3 runs, each 79 pump blocks:

| | Pump wall (×S0) | Frames/s | Frame interval p50 / p95 / max (ms) | Input → frame p50 / p95 / max (ms) |
|---|---|---|---|---|
| S0 no render, pump on main | 12.2 s (1.00) | — | — | — |
| **S1 today**: render main, pump main | 15.8 s (**1.29**) | 9.3 | 96 / 260 / 276 | 105 / 240 / 300 |
| S2 render worker, pump main | 13.4 s (1.10) | 15.0 | 63 / 117 / 433 | **152 / 287 / 449** |
| S3 render main, pump in worker | 13.3 s (1.09) | 15.1 | 63 / 110 / 172 | **63 / 117 / 205** |
| S4 render worker, pump in worker | 13.3 s (1.09) | 14.9 | 66 / 104 / 170 | 71 / 117 / 197 |

What it says:

- **Rendering competes with the load.** Rendering on main stretches the
  same pump work by 29% (S1 vs S0). Moving *either* side to a worker
  brings that to 9–10%; the rest is contention for 4 vCPUs with
  SwiftShader's GPU-process threads. Render-on-demand gets S0's number
  outright whenever the camera is idle (§7.1).
- **Either worker gives the same frame-rate gain** (+60%, p95 frame
  interval −55 to −60%).
- **Only taking the busy work off main fixes input.** With the pump on
  main, the render worker makes input latency *worse* (S2: p50 105 → 152
  ms). Every event waits for main to yield, then queues behind the worker's
  frame in flight. With the pump in a worker, latency roughly halves (S3:
  p50 63 ms, p95 117 ms).
- **With the pump already off main, the render worker adds little here**
  (S4 ≈ S3), because in this synthetic page the pump is the only thing
  main does. In Share, main also builds the batches (~4 s on PSB), the
  BVHs and bounds (2.2 s on sp-231MB), the GLB writer's preparation (6 s),
  and the React/store work of a workspace switch. The engine worker leaves
  batch assembly on main (`engine-worker.md` §9: "assembly moves with the
  scene"). Those are the blocks the render worker removes from the frame
  path, and #2030 removes from the input path. Size the render worker's
  value by what main still blocks on *after* the engine worker, measured on
  a real GPU (§9.1).

**Scene A: raster-bound** (300 heavier instances, 1280×800, MSAA + log
depth, as P1.0's environment). Here every scenario runs at 3–5 fps, set by
SwiftShader's throughput, and the pump's wall-time ratios are inside the
noise. (S0 ranged 10.2–11.7 s; another agent's Jest run overlapped part of
this pass outside the lock, so only the qualitative result is kept.) One
result held in both passes and is not noise: **with rendering in the worker
and the pump on main (S2), the worker's frames stalled for 2–8 s at a
time**, and input → frame reached p95 3.4–5.3 s. The worker's rAF kept
firing at ~60 Hz (frame-interval p50 16.7 ms) while each frame took
250+ ms to rasterize, so frames piled up in the GPU process until the
worker blocked. Main's rAF on the same scene slowed to the GPU's pace
instead. Hence the one-frame-in-flight rule in §3.3.

Scripts (throwaway, outside the repo): a three-geometry `BatchedMesh`
scene module shared by both threads, a pump module, a render worker, a
pump worker and a Playwright runner driving CDP input. They are described
here rather than committed, per the dispatch.


## 6. Design

### 6.1 Options

**(a) One render worker, separate from the per-model engine workers.**
The page spawns one render worker that owns the `OffscreenCanvas`, the
`WebGLRenderer`, one scene for every open model, the camera and controls,
picking, highlight, residency, isolation masks, cut planes and markers.
Each open model has its own engine worker (the parallel story). Main
creates a `MessageChannel` per model session and hands one port to the
engine worker and the other to the render worker. Geometry flows engine →
render directly, as transferred buffers. Main holds sessions, the store and
the UI.

- *For:* rendering never shares a thread with a parse, so a frame is never
  held behind a 250 ms pump batch. One WebGL context for the page, so
  multi-model overlay (#1251) is one scene with one depth buffer. Eviction
  stays "terminate the engine worker" plus a `removeModel(key)` to the
  render worker, which frees that model's GPU buffers. Shader programs and
  the IBL are built once, not per model.
- *Against:* geometry crosses a thread boundary once (a transfer, so ~free;
  but the engine can't keep the same buffers, see §6.4). The model handle
  on main has to be built (#51), which #2019 needs anyway. Two kinds of
  workers to debug.

**(b) Render + engine per model, in one worker per model.** Each model
worker parses, builds batches and renders into its own canvas. Switching
models swaps which canvas is visible.

- *For:* geometry never crosses a thread. Termination frees the engine and
  its GPU resources together.
- *Against:* **it fails the goal.** The pump and the frame share the
  worker's one thread, so a 250 ms pump batch still holds the frame. That's
  today's contention moved into a worker, unless the engine yields every
  ~16 ms, which Conway doesn't (50–130 ms slices, plus a ~1 s synchronous
  `populateStyledItemsMap` on 231 MB). N WebGL contexts (Chrome caps ~16,
  phones much less memory). Programs and IBL are per model. Multi-model
  overlay needs one depth buffer and can't composite across contexts.
  Picking across models needs a fan-out. Rejected.

**(c) Stay on main; render on demand only.** Draw only when something
changed (camera moved, geometry arrived, highlight or display changed,
damping in flight). Cap re-renders while streaming when the camera is idle.
Combine with the engine worker, which takes the pump off main.

- *For:* small. No new thread, no proxy, no API change. A load with an idle
  camera stops paying for frames. Benefits battery and thermals on every
  device, loading or not.
- *Against:* main still runs React, Share's own batch build (~4 s PSB),
  BVH/bounds (2.2 s), the GLB writer's preparation (6 s), and the store
  churn of a workspace switch, so the camera still stutters during those.
  Rendering during interaction still competes with whatever main is doing.

### 6.2 Recommendation

**(c) now, then (a).** Concretely:

1. Render-on-demand on main (§7.1). It is useful on its own (the spike's
   1.29× load stretch goes away while the camera is idle), and (a) needs it
   too: a worker that draws every frame for nothing burns a core and GPU
   time.
2. The engine worker (parallel story) plus #2030's chunking takes the pump
   and most of the long tasks off main. That's what fixes input latency, and
   in the spike it alone gave the full frame-rate gain. It is the
   higher-return step of the two workers.
3. (a) behind a flag. It removes frame cost from main entirely and makes
   frame pacing independent of React, the writer and the store. It also
   moves the BVH/bounds and batch building into a thread that isn't main.

**Trade-offs we accept with (a):**
- **Input still flows through main.** A drag stalls while main is blocked,
  so the long-task work in #2030 stays necessary (§5).
- **Async where it used to be sync:** pick, screenshot, occurrence lookups
  (unless mirrored), the isolator's getters (mirrored).
- **A second debugging context** (devtools' worker target) and a separate
  esbuild entry for the worker.
- **Memory:** the geometry lives in the render worker, and the engine
  worker keeps no copy (§6.4). So the GLB writer's preparation has to run
  where the batches are.

**Should engine and renderer share a worker?** No: that's (b), and it fails
the goal for the reason above.

### 6.3 Threads and ownership

```
main thread                         render worker (one per page)
-----------                         ----------------------------
React, store, sessions (#2019)      WebGLRenderer on OffscreenCanvas
ModelHandle per model               Scene: models keyed by modelKey
CameraProxy (mirror + RPC)          camera + camera-controls (+ shims)
logical selection/hide/iso/planes   pick, hover, highlight, residency,
input proxy (DOM listeners)         isolation masks, cut planes, markers
ViewCube (own small context)        ProgressiveLoadSession preview + follow
perf panel, lil-gui (DOM)           batch build + BVH + robust bounds
                                    GLB writer preparation
         ^  RenderHost API (postMessage, transfers)
         |
engine worker per model (parallel story)
Conway IfcAPI, index, properties ---- MessageChannel port ----> render worker
   (geometry: transferred ArrayBuffers, one way)
```

### 6.4 Composing with the per-model engine worker

The parallel engine-worker scope (`design/new/engine-worker.md`, in
review at the time of writing) puts one dedicated worker per model session
around the Conway `IfcAPI`. Index, property and tree reads are async
requests to it, eviction is `terminate()`, and no `SharedArrayBuffer` is
used. Its protocol (§4 there) already has the hook this needs: `open`
takes `stream: {sink?: MessagePort}`, and its `preview` and `batch` events
(placement columns plus new geometries, buffers transferred) go to that
sink instead of the worker's own port. Its §9 reaches the same topology as
this section.

- **Geometry route: MessageChannel, engine → render, transferred.** At
  session start, main creates a `MessageChannel`, passes `port1` as the
  engine's `open({stream: {sink}})`, and posts `port2` to the render worker
  as `attachEngine(modelKey, port2)`. The engine posts each `preview` and
  `batch` as typed arrays (positions, normals, indices, per-instance
  matrices, colours, and the id tables `instanceParents`,
  `instanceOccurrenceIds`, occurrence paths, geometry ids) with their
  `ArrayBuffer`s in the transfer list. Main never sees them, so a busy main
  thread can't delay geometry reaching the screen. The only copy is the
  engine's one copy out of the wasm heap.
- **Epochs.** The engine protocol stamps every message with the session's
  `epoch`, which is bumped on each respawn. The render worker drops a
  `batch` whose epoch isn't the model's current one, so a terminated
  engine's last in-flight batch can't land in a re-opened model.
  - *Not through main:* relaying via main would re-introduce main as the
    bottleneck for every batch, and structured-clone relays copy unless
    each hop transfers.
  - *Not a shared buffer:* no SAB without cross-origin isolation, which
    breaks the sign-in popups and the Drive picker (#1610, #2047).
- **Ownership after transfer.** A transferred buffer is gone from the
  engine. The engine re-extracts on demand if it needs geometry again (it
  already has `demandGeometry` and `ReleaseModelGeometry`). The GLB cache
  writer reads the render worker's batches (#45), not the engine.
- **The spawn rule.** Chrome has no `requestAnimationFrame` in a nested
  worker, so main spawns the render worker; an engine worker must not.
  Engine workers can be spawned by either.
- **Eviction (#2031).** Main aborts the load, terminates the engine worker
  and sends `removeModel(modelKey)` to the render worker, which disposes
  the batches, BVHs and textures and closes its port. Engine-worker
  termination needs no help from the render worker. A port whose other end
  died just stops delivering.
- **Interactive at index (#2029) and at first mesh (#2043).** Unchanged in
  shape. Index-level reads go main → engine. Preview meshes go engine →
  render. A pick during the parse returns the preview's element id from the
  render worker (#2043 item 2), and main's pending-selection path resolves
  properties once the engine has the index.
- **Without the render worker** (fallback, or before phase 3): the engine
  worker's port is handed to the main-thread render core instead. That's
  the same code (§6.8), so the engine worker doesn't care which thread
  renders.

### 6.5 Input-event proxy

**Main side** (`RenderHost` on the real `<canvas>`, which stays in the DOM):

- Listens on the canvas for `pointerdown/move/up/cancel`,
  `lostpointercapture`, `wheel` (`passive: false`) and `contextmenu`.
- Calls `preventDefault()` synchronously for `wheel`, `contextmenu` and
  touch-pointer moves (camera-controls' own calls can't reach a real event
  from the worker). It sets `touch-action: none` on the canvas
  (PlaceMark already does, `PlaceMark.js:47`).
- Calls `setPointerCapture(pointerId)` on `pointerdown` itself, so a drag
  that leaves the canvas keeps delivering to it, as camera-controls'
  document-level listeners do today.
- Serializes a fixed field set:
  `{type, pointerId, pointerType, isPrimary, button, buttons, clientX, clientY,
  deltaX, deltaY, deltaZ, deltaMode, ctrlKey, shiftKey, altKey, metaKey, timeStamp}`.
  It posts each one as it arrives. The browser already coalesces
  `pointermove` to one per frame while main is busy, and
  `getCoalescedEvents()` can be added if drag precision matters.
- Keyboard stays on main (#18); it never goes to camera-controls.

**Worker side** (`ElementProxy extends EventTarget`):

- `clientWidth`, `clientHeight`, `getBoundingClientRect()` from the last
  resize message; `style` (a plain object sink); `ownerDocument` (a second
  `EventTarget`; each forwarded event is dispatched on both, which is what
  camera-controls' drag listeners expect); `setPointerCapture`,
  `releasePointerCapture`, `hasPointerCapture` (local bookkeeping, since
  main already captured); `focus()` (no-op).
- Events are plain objects with `preventDefault`/`stopPropagation` no-ops,
  dispatched with `dispatchEvent`.
- Build-time patch for camera-controls in the worker entry only: treat
  `PointerEvent` as supported, and `document.pointerLockElement` as null
  (§3.4).

**Latency:** one `postMessage` hop, sub-millisecond when main is idle. When
main is busy, input waits for main to yield, as it does today (§5).

### 6.6 Main ↔ worker API

One `RenderHost` on main, one `RenderCore` in the worker. Requests carry
an id and resolve a promise. Events flow back unprompted. Everything is
data (ids, numbers, typed arrays), never three.js objects. **Rule: main
owns logical state, the worker owns pixels.** Every logical change is sent
as the new state, not a delta, so a restarted worker can be re-sent the
whole thing.

| Area | Main → worker | Worker → main | Main-side mirror (sync reads) |
|---|---|---|---|
| Lifecycle | `init({canvas, size, dpr, look, theme})`, `resize`, `dispose` | `ready({webgl2, maxTextureSize})`, `contextLost`, `contextRestored`, `error` | — |
| Models | `attachEngine(modelKey, port)`, `addModel(modelKey, {buffers})` (non-Conway formats, transferred), `removeModel(modelKey)` | `modelProgress(modelKey, {batches, triangles})`, `modelReady(modelKey, {bounds, robustBounds, capabilities, tables?})` | `ModelHandle`: key, capabilities, bounds, framing-exclusion report |
| Camera | `camera.setPose({position, target}, animate)`, `rotate(az, polar)`, `rotateTo`, `frame(modelKey)`, `setLimits`, `setProjection` | `camera({position, target, quaternion, distance, projection})` (each changed frame, coalesced), `rest`, `controlstart`, `controlend` | `CameraProxy`: `getPosition`, `getTarget`, `quaternion`, `addEventListener('rest' \| 'control*')`. Used by #20–24 |
| Pick | `pick({clientX, clientY, targets: 'model' \| 'planes' \| 'markers'})` | `{modelKey, parentExpressId, instanceId, rawOccurrencePath, isRootLevel, pickedGeometryId, point, normal, markerId?, planeId?}` or `null` | — |
| Hover | (pointer stream) | `hover({modelKey, id} \| null)` (throttled) and `cursor('pointer' \| 'default' \| 'alias')` | — |
| Selection | `select({modelKey, expressIds?, instanceIds?, focus?})`, `preselect({...})`, `clearSelection` | — | the store (unchanged) |
| Hide / isolate | `visibility({modelKey, hidden, isolated, revealHidden})` (whole state) | `visibilityApplied(modelKey)` | `isolator` mirror: `hiddenIds`, `isolatedIds`, `canBePickedInScene` |
| Display | `display({modelKey, overrides})`, `look(name)`, `lightingParams({...})` | — | the store (`displayOverrides`) |
| Residency | `residency({modelKey, metric, budget})` | `residencyStats` | — |
| Cut planes | `planes([{id, normal, constant}])`, `createPlaneAtPointer()`, `deletePlaneAtPointer()`, `planeInteraction(enabled)` | `planes([...])` after a drag or Q/W | plane list, for `#cp:` and ShareDialog |
| Markers | `markerIcon(ImageBitmap)`, `markers([{id, point, normal, color, active}])` | (via `pick`) | the notes store |
| Edits | `edit({modelKey, op})` (model-edit.md's L0 ops) | `edited({modelKey, revision})` | op log (main) |
| Screenshot | `screenshot({width, height, camera?})` | `Blob` | — |
| Export | `prepareGlb(modelKey)` | prepared parts, transferred to the GLB writer worker | — |
| Perf / test | `perf(on)`, test-only probes (`readFrame`, `pause`, `resume`, `sceneSummary`) | `perfSample({frameMs, drawCalls, triangles})` | — |

**Occurrence tables** (`getInstanceIdsForOccurrencePath` and friends,
#27): either the worker answers them by RPC (async; touches CadView's
selection funnel and viewTools), or the worker sends the per-batch id tables
to main in `modelReady` and main answers them synchronously as today
(memory: ~a few MB on large models; the tables are typed arrays, so a
copy or a second transfer from the engine). Open decision §9.5.

### 6.7 Overlays

- **PlaceMarks:** worker-side sprites (#34–35). Main rasterizes the SVG
  icon once and transfers the `ImageBitmap`.
- **ViewCube:** stays on main (#24), driven by `camera` events. Moving it
  into the render worker as a scissored second viewport is possible later
  and would make it smooth under load too.
- **Future DOM overlays** (labels, measurement callouts): project on main
  from the camera event's matrices. Never `CSS2DRenderer` in the worker,
  since it needs the DOM.

### 6.8 One render core, two transports

`RenderCore` is ordinary module code with no `window`/`document`. It
takes a canvas-like object, a size and an event target. Two transports:

- **`WorkerTransport`**: `postMessage` + transfer lists, the canvas is an
  `OffscreenCanvas`, the event target is the `ElementProxy`.
- **`LocalTransport`**: the same messages, delivered by direct call on the
  main thread. The canvas is the real `HTMLCanvasElement`; the event target
  is the real element.

`ShareViewer` becomes the main-side facade over `RenderHost` in both
cases. The fallback is therefore today's behaviour on today's thread, not a
second implementation. Jest exercises `RenderCore` with `LocalTransport`
under jsdom, as it exercises the viewer now.

### 6.9 Fallback

- **Decide at viewer init.** The flag is on, and a probe worker got a
  WebGL2 context on `new OffscreenCanvas(1, 1)`, so use the worker.
  Otherwise use `LocalTransport`. The probe's result is cached for the
  page; it costs one worker spawn (~tens of ms), and the probe can be the
  render worker itself, so the cost is paid once.
- **Runtime fallback:** if the worker fails to start, or crashes twice,
  switch the page to `LocalTransport` for the session and report it (load
  report Health line + Sentry breadcrumb).
- **Force it either way** for debugging: `?feature=offscreenRender` turns
  the worker on; the flag off is main.


## 7. Migration plan (small flagged PRs)

Each step ships green with its own desktop + mobile happy-path E2E per
AGENTS.md (`describeMobileAndDesktop`), and each is useful if the next one
never lands.

### 7.1 Render-on-demand on the main thread (no flag needed, or `?feature=renderOnDemand` for burn-in)

- The loop draws only when `needsRender` is set. Setters: `cameraControls`
  `update(delta)` returns true (moving or damping), a model/batch/preview was
  added, highlight, preselection, isolation, display, residency, plane, marker
  or look changed, resize, and anything the ViewCube or permalink pokes.
  Spark splats need a frame while their sort is in flight.
- While streaming with an idle camera, cap draws (e.g. ≤ 4 Hz) so geometry
  still appears without paying 60 Hz.
- Delete the dead `CSS2DRenderer` pass (#9), `Postproduction` (#10) and
  `gsap`/`Animator`. Fold PlaceMark's own rAF loop into the main loop (and
  cancel it on dispose).
- The E2E `pauseViewerRendering` helper keeps working (it replaces the
  seam). Tests must not assume a frame per rAF; `captureRenderedFrame`
  forces one.
- *Acceptance:* with an idle camera, no draws (counted at the seam); a
  drag draws every frame; streaming paints at the cap; load timings on
  SEESTRASSE / sp-231MB before/after.

### 7.2 Split the viewer facade from the scene (no behaviour change)

- `ModelHandle` in the store instead of the `Object3D` (#51). Scene reads
  in CadView, CutPlaneMenu, MarkerControl and the Loader go through the
  viewer by key.
- `pick()` returns ids, not three objects: move CadView's table lookups
  (`CadView.jsx:1503-1575`) into the viewer.
- `CameraProxy` wraps camera-controls (still on main) with the mirror
  interface; switch CameraControl, shareTools, viewTools, ViewCube and
  CadView's `rest` listener to it.
- Isolator, clipper and markers get the "logical state on main, applied by
  message-shaped calls" shape, with `LocalTransport` semantics.
- Depends on #2019 (sessions) for the engine split (#52).

### 7.3 `RenderCore` + `LocalTransport` (no behaviour change)

- Move everything §2 marks M behind the message API, still on main.
- Remove every `window`/`document` read from the core (#1, 3, 6, 11).
- Test-probe bridge for E2E (#48), with the existing specs moved onto it.

### 7.4 `WorkerTransport` behind `?feature=offscreenRender`

- The worker entry (its own esbuild entry, as `OPFS.worker.js` and
  `GlbWriter.worker.js` are), `ElementProxy`, the camera-controls build
  patch, resize/DPR, context-loss handling and crash recovery, the in-worker
  probe and fallback.
- Non-Conway formats load in the worker (#39). FBX/USDZ use the chosen
  path (#40).
- Screenshot via `convertToBlob` (#43), perf samples (#46).
- *Acceptance:* the E2E suite passes with the flag on in the Chromium
  projects, plus a dedicated spec that blocks main for 1 s and asserts the
  worker kept drawing (frame count via the probe).

### 7.5 Engine-worker geometry to the render worker

- `attachEngine(modelKey, port)`: batches and previews go engine → render
  over the port. Batch build, BVH and robust bounds run in the render
  worker. Needs the engine worker to have landed.
- The GLB writer's preparation moves to the render worker (#45).

### 7.6 Default on

- Cross-browser smoke on Chrome, Firefox, Safari 17+ (macOS Sonoma and
  Ventura, iOS 17+), including forced context loss.
- Real-GPU frame numbers (open decision §9.1).
- Flip the default; keep `?feature=disableOffscreenRender` as the escape
  hatch (`?feature=` can only turn flags on).


## 8. Dependencies and order

- §7.1 depends on nothing and can start now.
- §7.2 overlaps #2019 (the model handle and the engine split). Do it as
  part of, or right after, sessions.
- §7.3 depends on §7.2. §7.4 on §7.3.
- §7.5 depends on the engine-worker story and §7.4.
- #2030's chunking (writer preparation, end-of-load assembly) is
  independent and stays necessary: §7.5 moves those tasks off main, but
  until then they block both input and frames.


## 9. Open decisions

1. **Is (a) worth it, and when?** The spike ran on SwiftShader. Once the
   pump was off main, the render worker added nothing measurable (S4 ≈ S3,
   §5), because the synthetic page had nothing else on main. Its value in
   Share is the main-thread work left after the engine worker: batch
   assembly, BVH and bounds, the GLB writer's preparation, React and store
   work on a switch. On a real GPU the frame's own CPU cost (BatchedMesh
   culling, multi-draw list building, three's per-object work) is likely a
   few ms on large models, which matters on phones. Proposal: land §7.1–7.3
   (useful regardless) and the engine worker, measure main-thread long
   tasks and frame intervals during a large load and a workspace switch on
   a real laptop and phone (a deploy preview), then decide on §7.4. The
   gate could be: if main still blocks > 100 ms more than N times in a
   large open, the render worker goes ahead.
2. **Camera follow vs the first user interaction** (#2043). Unchanged by
   this doc, but the follow runs in the worker.
3. **Streaming draw cap while the camera is idle** (§7.1): 4 Hz? Tied to
   batch arrival?
4. **ViewCube**: stay on main (lags under load) or move into the render
   worker as a second viewport.
5. **Occurrence tables on main** (sync, extra memory) vs async lookups
   through the worker (§6.6).
6. **GLB writer preparation**: in the render worker's idle time, or ship the
   batch arrays to the GLB writer worker (a copy, ~model geometry size).
7. **FBX/USDZ textures**: a worker `TextureLoader` shim, or parse those two
   on main and transfer.
8. **Should the engine keep a geometry copy** after transfer (faster crash
   recovery and re-extraction; costs memory), or rely on the OPFS GLB cache
   and re-extraction?


## 10. Evidence status

- **Read from code** at `86f9908`: every §2 row, the three/camera-controls/
  postprocessing/Spark source lines cited in §2–3.
- **From MDN browser-compat-data** (read 2026-11-03): §3.1's version table.
  caniuse.com and bugs.webkit.org were unreachable from the container; the
  Ventura caveat comes from search results that quote WebKit bug 183720's
  comments, and is **unverified** here.
- **Measured**: §5's spike, on SwiftShader. Ratios only.
- **Not measured**: real-GPU frame cost; context loss on Safari/Firefox
  workers; Spark in a worker; iOS memory with a worker-held scene; postMessage
  cost for a full pump stream (it's a transfer, so expected small).

# Per-model engine worker — one Conway engine per model, in its own Web Worker (open-205)

**Status:** decided 2026-11-03 (§8). Steps 1–6 and 9 have landed: IFC
and STEP both load in the worker, a worker load writes the GLB artifact
(step 5, #2081), and the worker is on by default since #2083 merged
(2026-11-07), with `?feature=disableEngineWorker` as the kill switch. Steps
7–8 were not started; they moved to #2031. Their design (`EngineHost`:
the cap, close, eviction and rehydrate) was refreshed on 2026-11-19 for
Phase 1a, #2011 decision 6 and the source policy (§5.2–§5.5, §7 step 8,
§8.1), and again on 2026-11-23 for the six layers (#2011 decision 8): the
host hands out leases and never sees a session, and the layer map, the
seams and the slice plan are in [layering.md](../tracks/open-t200/layering.md). On 2026-11-24
the owner named the engine (#2011 decision 10): `Engine` is the one
interface a lease exposes, `WorkerEngine` is `EngineSession` renamed, and
`ConwayEngine` is the main-thread path behind the same interface.
**Epic:** `open-205` (#2011). Story: #2053 (closed 2026-11-18). Steps 7–8
(sessions own their worker; close and eviction) are #2031's: with an engine
in a worker, terminating the worker *is* the eviction.
**Related:** #2019 (per-model sessions), #2030 (no blocking calls), #2037
(interactive at index, `indexedModel` / `selectReadModel`), #2043
(interactive at first mesh), #2023 (memory E2E), #1756 (geometry worker
pool, draft), conway#540 (no Worker branch in `isWebPlatform`), conway#541
(`OpenModelFromIndex`, landed), conway#390 (M1 "parse still on the main
thread"), Share#1610 / #2047 (MT wasm; not used here).
**Parallel work:** OffscreenCanvas rendering (story #2055, scoped in
[offscreen-rendering.md](offscreen-rendering.md); §9 says where the two
meet, and that doc's §6.4 is the render side of the same seam).

Read on code at `origin/main` `86f9908`, conway pinned at
`1.1632.753-g409bb50d` (read from `node_modules/@bldrs-ai/conway/compiled`,
which is the pin). §10 says what was measured and what was only read.


## 1. Conclusion first

- **It works without a Conway change.** The pinned conway instantiates,
  opens PSB windowed from OPFS and pumps its geometry inside a plain module
  worker. Nothing it does needs cross-origin isolation. The one shim is conway#540
  (`isWebPlatform()` has no Worker branch): the worker declares
  `process.env.PLATFORM = 'web'` before importing the engine, as #1756
  already does. `OpenModelFromIndex` (conway#541) is on the pin, which
  makes a cheap re-open after eviction possible later.
- **What it buys, measured (§3):** on PSB the engine alone blocks the main
  thread for 40.6 s of a 51.4 s load (254 long tasks, up to 0.96 s). In a
  worker that drops to 0–3 long tasks of at most 70 ms. `terminate()`
  returns all 2.2 GB, and the renderer's RSS is back at baseline within
  10 s. With an OPFS sync access handle, which only a worker can open, the
  worker load is also **20 % faster** than today's main thread (40.9 s
  against 51.4 s), because source I/O drops from 12.6 s to 3.2 s.
- **What it costs:** ~45 MB and 0.4–0.6 s per worker (module eval plus a
  cold wasm compile; a second instance compiles no faster). With a Blob
  store, ~5 % wall clock. Each geometry is copied out of the wasm heap once
  and transferred: 337 MB on PSB, 4.5 s of copying in the worker, and 9 ms
  on the page to receive it all.
- **The Share work is a boundary, not a rewrite.** Of the 46 rows in the
  §2.1 audit, 15 are already async, 19 are trivial (they move into the
  worker wholesale, become one field of a reply, or are fire-and-forget),
  and 12 need a design change. The three hard ones (§2.4) are geometry resolution (G1), the GLB
  writer's property capture (G2) and the load report's engine-side signals
  (G3).
- **The worker is the document session.** The protocol in §4 is the
  headless session the MVC-core review asks for (`reviews/2026-10-29-…` §7):
  Conway, no Three, no Zustand, answering by expressID and the `e`/`o` refs.
  The same handler is meant to run in Node for a CLI or MCP; that is not yet
  tried (MVC-core follow-up review, 2026-11-18, §4). More exactly, the worker
  is the document's **read layer**: one engine per model, shared by every tab
  and user session that uses it and never holding edits. Each user session
  keeps its own op logs and resolves refs
  ([workspace-sessions.md](workspace-sessions.md) §3, §6).


## 2. Audit — what assumes the engine is on the main thread

Classes:

- **async** — already returns a Promise to an awaiting caller; an RPC behind
  the same signature changes nothing for the caller.
- **trivial** — sync today, but either the whole function moves into the
  worker (so the call stays sync, worker-side), or the value is computed
  once and travels in a reply, or the result is unused (fire-and-forget).
- **design** — a sync read the caller depends on, or an N-calls loop that
  must become one worker-side job.

### 2.1 Share

| # | Where | What | Class |
|---|---|---|---|
| 1 | `viewer/ifc/ShareIfc.js:141` | `new IfcAPI()` per viewer, even for GLB cache hits (Init is lazy) | trivial: the worker owns construction; a cache hit spawns nothing |
| 2 | `viewer/ShareViewer.js:259, 268` | `ShareIfc` + `ShareIfcLoader({ifcAPI})` share one engine per viewer | design: the engine belongs to the session (#2019), not the viewer |
| 3 | `loader/conwayDirectIfcLoader.js:134` | lazy `ifcAPI.Init()` on first parse | trivial (worker `init`) |
| 4 | `conwayDirectIfcLoader.js:140, 903` | `getConwayVersion`, `SetLogLevel` | trivial (reply field / init arg) |
| 5 | `conwayDirectIfcLoader.js:218, 230, 235` | `OpenModelStream` / `OpenModelStreamed` (deferred path) | async; moves into worker |
| 6 | `conwayDirectIfcLoader.js:549–568` | classic opens incl. sync `OpenModel` | trivial: worker-side; the flag path keeps only the deferred open |
| 7 | `conwayDirectIfcLoader.js:373, 379` | `ExtractGeometryBatch(Async)` pump | async; worker-side loop |
| 8 | `conwayDirectIfcLoader.js:512–576, 715` | `StreamAllMeshes(Async)` + `recapture()` for degraded readers | design: `recapture` re-streams every mesh into main-side readers; under the worker it is a worker job that re-emits the batch stream, or the fallbacks go |
| 9 | `ShareIfcLoader.js:485` → `incrementalBatchedBuilder.js:643, 658, 660` | **G1** builder resolves every placement with sync `GetGeometry` + `GetVertexArray` / `GetIndexArray` into the wasm heap | **design** (§2.4) |
| 10 | `flatMeshToBatchedModel.js:572–594`, `flatMeshToBufferGeometry.js:142, 248–250` | same sync heap reads on the end-of-load and preview fallbacks | design (same fix as 9) |
| 11 | `IfcItemsMap.js:320, 362`, `IfcInstanceMap.js:910` | sync heap reads in the `ifcItemsMapParity` probe only | trivial: run in the worker or drop under the flag |
| 12 | `ShareIfcLoader.js:71–76` → `flatMeshToInstancedModel.js:194` | instancing stats probe, forced on when `batchedMesh` is on; calls `recapture()` | trivial: worker-side stats, or drop |
| 13 | `ShareIfcLoader.js:452` `payloadToPreviewMesh` | preview payloads are already self-contained copies | trivial: transfer as-is |
| 14 | `ShareIfcLoader.js:299` | `GetAppliedCoordinationMatrix` (sync) | trivial: `done` reply field |
| 15 | `ShareIfcLoader.js:592` | `GetCoordinationMatrix` (awaited) | async; `done` field |
| 16 | `ShareIfcLoader.js:638–676` | `getStatistics(modelID)` object, read through getters | trivial: plain-object `done` field |
| 17 | `ShareIfcLoader.js:720` | `GetLinearScalingFactor` | trivial: `done` field |
| 18 | `buildBatchedConwayModel.js:188, 216`; `conwayDirectIfcLoader.js:872–880, 1083–1154` | `makeConwayDirectIfcManager`, `attachConwayDirectModelMethods`, `makeIndexedModelHandle` bind closures over `ifcAPI` | trivial: same surface, closures over the session client |
| 19 | `conwayDirectIfcLoader.js:1153` | `getIfcType` identity | trivial |
| 20 | `engine/unsupportedSchema.js:166, 194, 223, 263` | **G3** `beginOpenAttempt` / `conwayRefusedSchema` / `conwayOpenFailure` read the engine's per-attempt statistics synchronously after a failed open | **design**: the worker classifies and returns `failed{kind, …}` |
| 21 | `loader/loadProgress.js:14, 23, 195` | **G3** `LoadLogAccumulator` and conway's static `Logger`, tallied through `installDefectProxy`; the report's heap column is main-thread `performance.memory` | **design**: the worker's Logger is a different module instance; it forwards severity deltas and its wasm/heap bytes as events |
| 22 | `loader/Loader.js:159` | `canOpenFromStore` feature-detects `ifcAPI.OpenModelStream` | trivial: capability from `init` |
| 23 | `Loader.js:881` | `viewer.IFC.loader.ifcManager.state.models.push(model)` | trivial |
| 24 | `Loader.js:994–1001` → `glbExport.js:482, 494, 499` | GLB writer reads `ifcManager` at run time for capture | design: bound to the session (#2019 already asks this) |
| 25 | `loader/bldrsElementProperties.js:550` | **G2** sync `RootExpressIDs(modelID)` iterator | **design** (§2.4) |
| 26 | `bldrsElementProperties.js:838, 878` | **G2** `getPropertySets` / `getItemProperties` per root record | **design**: one worker-side capture job, not one RPC per record |
| 27 | `engine/bldrsFaceIds.js:422` | **G2** `getItemProperties` per face id | design (same job) |
| 28 | `engine/bldrsSpatialTree.js:220, 222` | one `getSpatialStructure` | async |
| 29 | `Loader.js:1020` → `opfsSourceByteStore.js:94, 99` | `IsModelOpen` + `SpillModelSource(makeBlobByteStore(file))` | trivial: worker-side, after the capture job; ordering is load-bearing (a sync read of a non-resident range throws) |
| 30 | `Loader.js:1032` | `ReleaseModelGeometry` | trivial: worker-side, same point |
| 31 | `Containers/CadView.jsx:1209–1213` | `ReleaseEntityCache(0)` gated on `IsModelOpen(0)` | trivial: fire-and-forget message |
| 32 | `CadView.jsx:1276, 1278` | tree read, `getSpatialStructure(0, 'names')` | async |
| 33 | `CadView.jsx:1334, 2421, 2424, 2441` | root and selected element properties | async |
| 34 | `viewer/ifc/ShareIfc.js:204–213` | `getProperties` (+ psets) | async |
| 35 | `ShareIfc.js:225–241` | `dispose` → `CloseModel` every model | trivial: `terminate()` replaces it |
| 36 | `engine/ShareIfcManager.js:118–177` | manager methods over `ifcAPI.properties` | async, except `getIfcType` (37) |
| 37 | `ShareIfcManager.js:160`, `ShareViewer.js:741`, `Components/Properties/itemProperties.jsx:81–82` | sync `getIfcType(code)` | trivial: it is conway's static `IfcTypesMap` (`compat/web-ifc/properties.js:6`); import the table main-side |
| 38 | `itemProperties.jsx:118` (`webIfcFor`) | entity-ref `deref` calls `model.ifcManager.ifcAPI.properties.getItemProperties` | async, but needs the facade to expose a `properties` proxy, not the raw `IfcAPI` |
| 39 | `ShareViewer.js:729, 756, 837` | `getSelectedElementsProps`, `getByFloor`, `getProperties` | async |
| 40 | `viewer/three/IfcIsolator.js:340, 342` | `getSpatialStructure(0, false)` | async |
| 41 | `Components/Properties/Properties.jsx:81, 221` | `getItemProperties`, `getPropertySets` | async |
| 42 | `utils/geometryLabels.js:83` | `getItemProperties` | async |
| 43 | `tools/viewTools.js:460, 492, 503` | assistant `model.*` reads | async |
| 44 | `Components/Bot/BotChat.jsx:162, 328–330` | legacy `?feature=bot` evals model-written code against `viewer.IFC.loader.ifcManager` | async (`idsByType`, `getItemProperties`); retiring with the bot port (ai-workspace.md §13) |
| 45 | `Infrastructure/IfcElementsStyleManager.js:84–90`, `ViewRulesCompiler.js:31–34` | `?view=` rules: `GetLineIDsWithType`, `GetLine`, GUID mapping | design, or delete (viewer-replacement.md §8.1 already drops `IfcViewsManager`). **Deleted, open-t200 slice V (#2318)** |
| 46 | `loader/ProgressiveLoadSession.js:298` | `abort()` has no caller outside the loader's error path | design: `abort` message + terminate (§5.4) |

**Not engine calls, and unaffected** (they read main-side tables built from
the stream): picking through `IfcInstanceMap` (`CadView.jsx:1535, 1539`),
the BVH, `batchedEdit.js` (every mutator acts on the main-side
`BatchedMesh`; model-edit.md §6), `#d:` / `#sel:` / element-path permalinks
(`tools/refs.js:157`, `Components/Residency/visibilityHash.js:168,
270`, `Containers/selectionHash.js`), `SearchIndex`, NavTree (renders
`rootElement`), and every `selectReadModel` consumer (`TabbedPanels`,
`NavTreeAndVersionsDrawer`, `TopBar`, `viewContext.js`), which already go
through async reads.

**Counts, by row:** async 15 (5, 7, 15, 28, 32–34, 36, 38–44); trivial 19
(1, 3, 4, 6, 11–14, 16–19, 22, 23, 29–31, 35, 37); design 12 (2, 8, 9, 10,
20, 21, 24–27, 45, 46). Rows 25–27 are one job (G2).

### 2.2 Conway

- **DOM / `window`.** The compat engine touches `window` in exactly three
  places, all guarded by `typeof window !== 'undefined'`:
  `conway_geometry.js#isWebPlatform` (wasm build selection),
  `#pThreadsAllowed` (`window.crossOriginIsolated`), and `IfcAPI.Init`'s
  module-prefix branch (`compat/web-ifc/ifc_api.js:128`).
  `utilities/environment.js:15` only logs. `rendering/threejs/*` uses the DOM
  and is not imported by the compat surface.
- **The blocker that isn't.** In a worker both arms of `isWebPlatform()`
  are false (no `window`, no `process`), so conway picks the Node build and
  `Init()` dies on `Dynamic require of "../Dist/ConwayGeomWasmNode.js"`
  (conway#540, still open). A one-line prelude that sets
  `globalThis.process = {env: {PLATFORM: 'web'}}` before the engine module
  is imported fixes it (#1756 does the same). A bundler `define` does not,
  because the guard is `typeof process`. The real fix is conway#540's
  `WorkerGlobalScope` check.
- **`pThreadsAllowed()` in a worker.** On prod (no isolation) there is no
  `SharedArrayBuffer`, so it returns false before reaching `window`. In an
  isolated context it would reach `window.crossOriginIsolated` and throw a
  `ReferenceError`; the prototype sets `FORCE_SINGLE_THREAD` for that reason.
  Conway#540 should read `self.crossOriginIsolated`.
- **The wasm is inline.** `ConwayGeomWasmWeb.js` is an Emscripten
  single-file build: `findWasmBinary()` decodes an embedded binary, and
  there is no `.wasm` fetch. Every engine instance therefore compiles from
  bytes, with no streaming compile and no code cache. §3 measures what
  that costs per spawn (0.4–0.6 s, 22 MB of it the decoded glue). A
  separate `.wasm` would let Share compile once and post the compiled
  `WebAssembly.Module` to each new worker (Emscripten's `instantiateWasm`
  hook); that is a conway-geom build option, not needed to start.
- **Timers.** The engine yields through `yieldToEventLoop`
  (`core/progress.js`: `scheduler.yield` / `MessageChannel`) and the preview
  channel uses `setTimeout`. All exist in workers. Inside a worker the
  yields are no longer needed for responsiveness; they only cost a little.
- **How the windowed source gets its bytes today.** Share wraps the OPFS
  `File` as a `StepExternalByteStore` (`engine/opfsSourceByteStore.js:40`):
  each `read(offset, length)` is `blob.slice().arrayBuffer()`, an async
  round-trip through the browser's blob machinery. Conway's
  `WindowedStepBufferProvider` pages 4 MiB windows through it and serves
  sync `acquire` from resident windows, with `ensureResident` awaited before
  any sync extraction (`step/step_buffer_provider.d.ts`). The store contract
  is async (`read → Promise<Uint8Array>`), so an OPFS
  `FileSystemSyncAccessHandle` store fits it unchanged: it answers a resolved
  promise instead of an I/O round-trip. Sync handles exist only in workers.
- **`compat/web-ifc` in a worker, unchanged:** yes, with the prelude. The
  prototype runs `Init`, `OpenModelStream` (Blob store and sync-handle
  store), `properties.getSpatialStructure(…, 'names')`,
  `getItemProperties`, `getPropertySets` and `ExtractGeometryBatchAsync` on
  the pinned build.
- **What crosses the boundary.**
  - *Meshes:* `FlatMesh` / `PlacedGeometry` are Embind-backed views into the
    worker's heap and cannot cross. The worker copies each geometry out once
    (dedupe by `geometryExpressID`) into `Float32Array` / `Uint32Array`
    and transfers them; placements travel as columns (parents, geometry ids,
    `Float64Array` transforms, colours) — #1756's encoding. STEP adds an
    occurrence-path column (offsets + ids).
  - *Preview stream:* `ON_PREVIEW_MESH` payloads are already copies
    (`vertexData`, `indexData`, colour, transform); transfer them as they are.
  - *Progress log:* `ON_PROGRESS` events and `ON_MODEL_INFO` are plain
    objects and clone as-is. Conway's `Logger` is module-static, so the
    worker's Logger is not the one `loadProgress.installDefectProxy`
    proxies; the worker forwards severity deltas.
  - *Reads:* property records and the `'names'` spatial tree are plain
    objects and structured-clone (checked in the prototype, §3).
  - *Source:* a `File` structured-clones by reference (no copy); an
    `ArrayBuffer` transfers. OPFS paths need nothing at all.

### 2.3 STEP and the other loaders

- **STEP / AP214 takes the same path.** It goes through
  `ShareIfcLoader#parse` → `parseIfcWithConway` and the same compat
  `IfcAPI` (`ifc_api_proxy_ap214.js`). Two differences: the store-backed
  windowed open needs a store that reads synchronously for STEP (conway#757;
  before it, `OpenModelStream` refused STEP outright and a STEP crossed as a
  transferred `ArrayBuffer`, resident in the worker), which the worker's
  stores are and the main-thread engine's is not; and STEP
  placements carry `occurrencePath` (`incrementalBatchedBuilder.js`,
  `flatMeshToBatchedModel.js`) and the tree uses `includeSolids`. Both are
  data, not engine calls. **Recommendation: IFC and STEP move together**, in
  one worker type with one protocol. The STEP-only parts are a column and a
  flag. (A windowed STEP open is a Conway ask, not a blocker.) Done in §7
  step 6: one worker load (`engine/engineModelLoad.js`) serves both.
- **GLB, glTF, OBJ, STL, PLY, PDB, XYZ, splats, USD, 3DM, ADF/MTS, FBX** use
  three.js or Share's own JS decoders on the main thread. They have no wasm
  engine and no retained heap that only a terminate can free: their whole
  footprint is the scene, which drops like any object. **They stay on the
  main thread for now.** Their sessions get the same session shape, with
  `engine: null`; eviction for them is a scene drop (§5.3). A later "mesh
  worker" for the large synchronous parsers (STL, OBJ) is separate work.
- **GLB cache hits** never touch Conway (properties come from the
  `BLDRS_element_properties` reader, `Loader.js:1868–1920`), so a cache hit
  spawns no worker. This is the cheapest state a model can be in, and §5.3
  uses it as the eviction fallback.

### 2.4 The three hard ones

- **G1 — geometry resolution (rows 9, 10).** `IncrementalBatchedBuilder`
  calls `api.GetGeometry` and copies vertices out of the wasm heap per new
  geometry, synchronously, on the main thread. The fix is #1756's: the
  worker copies each geometry out once and transfers it; a main-side
  `workerGeometryApi` serves the same four methods (`GetGeometry`,
  `GetVertexArray`, `GetIndexArray`, sizes) from the received payloads, so
  the builder does not change. The end-of-load fallbacks that call
  `recapture()` either become a worker job that re-emits the stream or are
  dropped under the flag.
- **G2 — the GLB writer's capture (rows 24–27).** `bldrsElementProperties`
  walks every IfcRoot record (`RootExpressIDs`, sync iterator) and awaits
  `getItemProperties` / `getPropertySets` per record. PSB has ~9.7 M
  records, of which the roots are about 4 %. An RPC per record would be
  hundreds of thousands of messages. The capture moves into the worker as
  one job: the worker runs the same capture code and returns the packed
  `ElementPropertiesContainerWriter` bytes and the spatial tree as
  transferables. The writer's `.finally` ordering (capture → spill →
  release, `Loader.js:1005–1035`) moves with it.
- **G3 — the load report's engine-side signals (rows 20, 21).** The
  refused-schema and open-failure classification reads the engine's
  per-attempt statistics synchronously after the open fails, and the defect
  tally proxies conway's static `Logger`. Under a worker both live in
  another module instance. The worker classifies its own failure and
  returns `failed{kind: 'refusedSchema' | 'openFailure' | 'oom' | 'crash',
  statistics, schema}`; it forwards Logger severity deltas as `log` events;
  and it reports its own wasm bytes, because the report's heap column (main
  `performance.memory`) can no longer see the engine (#1756 hit the same
  thing and added `wasmHeapMb=`).


## 3. Measurements

**Method.** A throwaway prototype, not product code: a module worker that
imports the pinned conway's compat `IfcAPI` (bundled with esbuild, the
conway#540 prelude first), and a page that drives it with Playwright's
Chromium (headless, 4-vCPU container, other agents serialised through the
shared bench lock). The model is staged into OPFS first. The worker then
runs Share's open settings (`DEFER_GEOMETRY`, `GEOMETRY_BUDGET_MB: 64`,
`STREAMING_CONSUMER`, preview channel on), `OpenModelStream` over the OPFS
file, the `'names'` tree, one leaf's properties and psets, and
`ExtractGeometryBatchAsync` at batch size 8. It copies each geometry out
once and transfers it, using #1756's encoding. The **main-thread baseline**
runs the same module on the page itself.

- There is no render loop and no Share-side assembly (builder, BVH, GLB
  writer), so the numbers isolate the engine. That is equivalent to the
  frozen render loop in browser-load-measurement.md, and it is why the
  main-thread baseline is *better* than Share's own: Share adds its assembly
  on top.
- Main-thread blocking is a 1 ms `setTimeout` heartbeat. Gaps over 50 ms are
  counted.
- Memory is `performance.measureUserAgentSpecificMemory()`, which breaks
  memory down per worker. It needs cross-origin isolation, so **the
  measurement page was isolated (COOP/COEP) and the engine forced
  single-threaded**. Prod is not isolated; the isolation affects only the
  measurement. RSS is the renderer process (workers are threads in it).
- One run per cell. Read the ratios more than the absolutes.
- The page was garbage-collected over CDP before each sample; the worker
  isolates were not, so worker figures are an upper bound. The Blob and
  sync-handle runs end at the same 2,249 MB on PSB although their read
  garbage differs, which suggests little of it is uncollected.

**Per-worker floor and startup**

| State | Worker memory | Renderer RSS | Time |
|---|---|---|---|
| Empty worker | 0.3 MB | +0–6 MB | 17 ms to ready |
| Engine bundle evaluated, no `Init` | 22.5 MB | +16 MB | 270–425 ms (module eval) |
| `Init` done (empty instance, wasm 16 MB) | 45.5 MB | +30–40 MB | 94–148 ms |
| 2nd and 3rd instance in the same page | +45 MB each | +36–40 MB each | `Init` 121 / 148 ms: **no warm compile** |
| SEESTRASSE at its index | 81 MB | +71 MB | — |
| PSB at its index (wasm still 16 MB) | **1,625 MB** | +1.66 GB | — |
| All workers terminated | back to 0.9 MB (page only) | back to baseline | — |

- **A worker costs ~45 MB and ~0.4–0.6 s to stand up** (module eval + `Init`).
  The wasm is inline in the glue (§2.2), so each spawn decodes and compiles
  it again; a second instance compiles no faster than the first.
- **The index is JS heap, not wasm.** PSB at its index holds 1.6 GB in the
  worker with only 16 MB of wasm. Either way it lives in the worker and is
  freed with it.

**SEESTRASSE (24 MB) and PSB (860 MB), full load**

| | SEESTRASSE main thread | SEESTRASSE worker, Blob store | SEESTRASSE worker, sync handle | PSB main thread | PSB worker, Blob store | PSB worker, sync handle |
|---|---|---|---|---|---|---|
| Open (index) | 1.08 s | 1.07 s | 0.83 s | 16.6 s | 16.8 s | **13.2 s** |
| `'names'` tree | 65 ms | 85 ms | 55 ms | 2.04 s | 2.94 s | **0.66 s** |
| Geometry pump | 2.49 s | 3.08 s | 2.98 s | 30.4 s | 31.6 s | **26.3 s** |
| Total | 3.78 s | 4.28 s | 3.93 s | 51.4 s | 54.2 s | **40.9 s** |
| Source I/O time (store `read`s) | 0.33 s | 0.28 s | 0.05 s | 12.6 s | 15.2 s | **3.2 s** |
| **Main-thread blocks > 50 ms** | **6** (max 202 ms, 0.86 s total) | **0** | **0** | **254** (max 962 ms, **40.6 s total**) | 3 (max 70 ms) | **0** |
| Worker memory at the end (wasm) | — | 191 MB (100) | 191 MB (100) | — | 2,249 MB (899) | 2,249 MB (899) |
| Page memory at the end | 190 MB, held | 0.7 MB | 0.7 MB | **2,247 MB, held** | 0.7 MB | 0.7 MB |
| After `terminate()` | — | 0.9 MB | 0.9 MB | — | 0.9 MB; RSS back to baseline within 10 s | same |

- **The main thread goes quiet.** On PSB the main-thread engine blocks for
  40.6 s of a 51.4 s load (79 %, before any of Share's own work), in 254
  long tasks up to 0.96 s. In a worker that drops to 0–3 long tasks. The 3
  in the Blob run are at most 70 ms (GC and message dispatch); the
  page-side handler for every message totalled 9 ms.
- **`terminate()` returns everything.** The measured worker memory goes to
  zero at once, and the renderer's RSS returns to its pre-load baseline
  within 10 s (330 MB at 1 s, 135 MB at 10 s on PSB). On the main thread the
  2.2 GB stays.
- **A worker with a Blob store costs ~5 % wall clock** (PSB 54.2 s against
  51.4 s; SEESTRASSE 4.3 s against 3.8 s, which includes 0.4 s of spawn).
- **A sync access handle makes the worker faster than today's main thread**:
  PSB 40.9 s against 51.4 s (−20 %). The store's I/O time drops from
  12.6–15.2 s to 3.2 s, the tree from 2–3 s to 0.66 s, and the open by
  3.5 s. It needs `createSyncAccessHandle({mode: 'read-only'})`, which only
  workers have. The saving is larger than the ~2.3 s that Share's own PSB
  profile attributed to the windowed buffer provider, because every window
  miss in the open, the tree walk and the pump pays the Blob round-trip.
- **Reads cross cheaply.** PSB's `'names'` tree (7,872 nodes) clones in
  11–12 ms; a property record in 0.1 ms. Property records and psets
  structured-clone without error.
- **Mesh transfer.** PSB streams 337 MB of geometry: 20,178 geometries and
  23,454 placements in 987 batches. Copying out of the wasm heap costs
  4.4–4.6 s, in the worker, off the main thread. That copy is not new:
  Share's builder pays the same one today, on the main thread (4.7 s in the
  baseline column). All `postMessage` calls
  together cost 0.17–0.21 s worker-side, and the page receives them for
  9 ms. The preview stream is 484 payloads, 4 MB, 47 ms to post.
  SEESTRASSE: 21 MB, 10,675 geometries, 0.4 s copy-out, 86–98 ms of posts.
- **Not caused by the worker, noticed in passing:** the first leaf
  `getItemProperties` + `getPropertySets` on windowed PSB took ~3.3 s and
  read ~1.9 GB of windows (with the Blob store). The pset lookup paged in
  most of the file. **Fixed in conway 1.1635.762** (conway#762, closing
  conway#755 and #761; pinned by Share#2062), with numbers in §3.1.


### 3.1 Property reads on a windowed open (conway#755, #761)

Property reads go through the same windowed source in either arm, so the
fix lands in conway and serves the worker and the main-thread engine alike.
This is the record of what changed and what it measured, for whoever next
reads properties off a store-backed model, whether that is the panel, the
worker facade or a CLI/MCP `model.*` tool.

**What was wrong.** Two separate bugs, in the same place: conway's
`ifc_properties.ts` paged records one `ensureLine` at a time.

- **Every pset read scanned every relationship.** `getPropertySets`,
  `getTypeProperties` and `getMaterialsProperties` read *every*
  relationship record of their kind on *every* call, to find the few that
  name the element. Each record's window was paged in and never released.
  - PSB's 23.5 k `IfcRelDefinesByProperties` hold 1.2 MB between them, but
    they sit in all 215 of its 4 MiB windows.
  - So every read, first or later, paged the whole 860 MB file: 4–5 s
    each in conway's Node probe.
  - The views it kept pinned evicted windows, and arrayBuffers grew to
    1.27 GB.
- **A recursive read threw.** A recursive (flattened) read paged in only
  the seed record. A set whose `IfcPropertySingleValue`s sat in an evicted
  window threw `StepBufferNotResidentError`: 109 of 299 sampled elements on
  sp-231MB, and 5 of 30 on PSB.

**What conway does now.**

1. **A lazy element → relating-IDs index, one per relationship kind**
   (`IfcProperties.relatedIndex`).
   - It is sorted `Uint32Array` pairs, 8 B each (188 KB on PSB), and a read
     is a binary search.
   - It is built on the first property read of that kind, not at index
     time. A load that never reads properties never pays for it, and the
     index build and the sidecar are unchanged.
   - The build reads the relationship records as coalesced **record
     spans**, straight from the store in file order
     (`StepBufferProvider.readSpan`, `visitRecordBytesInFileOrder`). The
     spans merge across gaps of up to 64 KiB, are capped at 1 MiB, and go
     four in flight. They don't page whole windows; on PSB that is ~1,080
     reads and 20 MB instead of the whole file.
   - No window is paged in or reordered in the LRU.
2. **A recursive read pins the record's `#ref` closure before it
   flattens** (`IfcApiProxyIfc.getLineResident`).
   - It reuses the closure walk geometry extraction uses.
   - Afterwards it unpins, drops the captured window views, and trims the
     window back to its cap.
   - A non-recursive read holds its record's pin across its await, so
     another read's eviction can't drop it before the synchronous read.
3. **Behaviour change: a recursive property read leaves geometry
   representations as `{type: 5, value}` handles by default.**
   - This covers `IfcProductRepresentation` (a product's `Representation`)
     and `IfcRepresentationMap` (a type's `RepresentationMaps`). The walk
     doesn't page them in.
   - A product's representation is its whole shape graph. PSB's largest
     sampled product reached 9,659 records and 1.18 MB of flattened JSON;
     with the default it is 3 KB, read in 1 ms.
   - `{includeRepresentations: true}`, a new optional last argument to the
     `properties.*` reads, restores web-ifc's full flatten for
     head-to-heads. `IfcAPI.GetLine(…, true)` is unchanged.
   - Share makes no recursive property reads, so neither the panel nor the
     worker facade sees the change.
   - Conway documents the rule in its `design/new/web-ifc-compat-surface.md`.

**Node probe** (conway's harness, windowed `OpenModelStream`, 4 MiB
windows, `getPropertySets(…, true)`, ~300 sampled elements per model; the
before rows on PSB cover the first 30 reads, as each one paid a full sweep):

| model | first read: before → after | later reads, median: before → after | throws: before → after |
|---|---|---|---|
| PSB 860 MB | 4.79 s, 856 MB → **0.41 s, 20 MB** | 5.26 s, 860 MB → **0.6 ms, 0 reads** | 5/30 → 0/297 |
| sp-231MB | 48 ms, 4.0 MB → 58 ms, 0.2 MB | 10.0 ms → 0.1 ms | 109/299 → 0/299 |
| SEESTRASSE 24 MB | 122 ms, 20.2 MB → 101 ms, 16.3 MB | 14.9 ms → 0.4 ms | 0/292 → 0/292 |

- Open time and RSS after open are unchanged on all three.
- Per-element results are identical for every read that didn't throw
  before.

**In Share** (local PSB through OPFS, `OpenModelStream`, main-thread
engine; headless Chromium in the 4-vCPU container, the Playwright build of
Share at the pin):

- **Rendering paused** (`pauseViewerRendering`'s seam):
  - The first `getPropertySets` took **1.07 s and 739 store reads**. Later
    reads took 0–1 ms.
  - The Properties panel showed the column's three psets 1.8 s after its
    button was clicked.
- **`?feature=engineWorker`, windowed (`windowed=yes`), rendering paused:**
  - The first `getPropertySets` through the worker facade took **1.59 s**.
    Later reads took ~1 ms.
  - The panel showed the same three psets 1.9 s after the click.
  - A second run, with a buffered open (`windowed=no`) after its OPFS
    staging failed, took 0.75 s for the first read and 1–3 ms after.
- **Known measurement artifact: rendering live in SwiftShader,
  main-thread engine.**
  - The same first read had not finished after 240 s. In this GPU-less
    container each frame costs seconds, and each Blob `read` resolved only
    between frames: ~10 s per read. It is also why the PSB load takes
    ~170 s here.
  - It is not a measurement of a real GPU browser. What carries over: on a
    busy main thread, the index build is bound by *store round trips*, not
    bytes. It makes ~740–1,080 span reads, four in flight, against the 215
    window reads of the old per-call sweep.
  - Follow-up options, if it shows up on real hardware:
    - more reads in flight;
    - coarser spans when the store is slow;
    - building the index in the engine worker, whose reads don't queue
      behind frames.
  - Not filed as an issue. It was not reproduced with the worker: the
    live-render worker run lost its OPFS staging and opened buffered, so
    it measured nothing windowed.

## 4. Protocol

One worker per model session, one `MessagePort` (the worker's own). Every
message carries `v` (`ENGINE_PROTOCOL_VERSION`, 2 since step 5) and the
session's `epoch` (bumped on every respawn, so a late message from a
terminated or replaced worker is dropped by construction, not by a guard).

**Version or capability.** The version goes up when the page starts to
*need* an op an older worker lacks: `hello` then names the old version, the
page refuses the stale cached `Engine.worker.js` before it instantiates its
wasm, and the load runs in process (§8 item 6). v2 added `capture` and
`spill`. They are not capabilities, because the main thread holds no engine
to capture with: a worker without `capture` could never write a worker
load's GLB artifact (Codex on #2081). An op the page can do without is an
`init` capability instead, such as `propertyTables`, whose tables the page
otherwise resolves itself.

**Requests** (main → worker) get one reply `{re: id, ok, result | error}`:

| op | args | result |
|---|---|---|
| `init` | `logLevel`, engine-flag snapshot (`demandGeometry`, `disableStreamOpen`, budget) | `conwayVersion`, `capabilities` (`openStream`, `openFromIndex`, `asyncPump`), `wasmBytes`, `initMs` |
| `open` | `source`: `{opfs: path}` \| `{file: File}` \| `{bytes: ArrayBuffer}` (transferred); `format`; `stream: {previews, batchSize, sink?: MessagePort}`; `sidecar?` | `{modelID, windowed, modelInfo}` once the index exists — then events |
| `pump` | `{mode: 'run' \| 'throttle' \| 'pause'}` | ack |
| `tree` | `{mode: 'names' \| true, includeSolids}` | the spatial tree (structured clone) |
| `props` | `{ids, recursive, psets}` | records, in `ids` order (batched: one message for N ids) |
| `propertyTables` | `{tables: [{record, isPset}]}` | the Properties panel's tables, resolved next to the engine by `propertyTable.js` and cut to what renders (#2070, §7.1); offered only when `init`'s `capabilities.propertyTables` says so |
| `itemsOfType` | `{type, verbose}` | ids |
| `capture` | `{geometryExpressIds}` (the STEP merged layout's ids, else null) | `{spatialTree, elementProperties, geometryItemIdentities, captureMs, wasmBytes}`; the properties container transferred (§7 step 5) |
| `spill` | `{file}`: the OPFS File the model was parsed from | `{spilled, reason, source}`; `reason: 'windowed'` for a store-backed open, which has nothing resident to release. A spill through a sync access handle takes the entry's lock, so `EngineSession#close` waits for a spill still in flight before it decides whether to close politely (Codex on #2081) |
| `release` | `{entityCache} \| {geometry: true}` | bool |
| `abort` | — | ack; the pump stops at the next batch boundary |
| `stats` | — | `wasmBytes`, resident window bytes, I/O counters |

**Events** (worker → main, or to `stream.sink`), each with a sequence number:

| event | payload | transfer |
|---|---|---|
| `progress` | conway `ProgressEvent`, plus the worker's current `wasmBytes` | — |
| `modelInfo` | `ON_MODEL_INFO` object | — |
| `log` | severity deltas, warning lines | — |
| `preview` | preview payload | vertex / index buffers |
| `indexed` | `modelID` | — |
| `batch` | placement columns + new geometries + `{done, total}`, plus the worker's current `wasmBytes` | all buffers |
| `done` | summary: statistics, coordination matrix, applied matrix, linear scaling factor, build-relevant counts, `wasmBytes` | — |
| `failed` | `{kind, message, statistics?, schema?}` | — |
| `account` | only when batches go to a `stream.sink`: `{seq, wasmBytes, batchBytes}` per batch, on the control port (§9) | — |

`stream.sink` is a `MessagePort` the caller may pass so geometry goes
straight to whoever builds the scene: the main thread today, a render
worker later (§9). Without it, events go to the worker's own port. With
it, the host's budget accounting still runs on the control port (§9).

**Not in v2:** document writes (the op log, model-edit.md L1). They slot
in as more ops without changing the shape. The index-sidecar export
(conway#756) needs no op: the worker writes the sidecar itself after a
load's first parse (§5.3, "Rehydrate"), not at eviction.


## 5. Main-thread API, cap, and lifecycle

### 5.1 The async read surface

`EngineSession` is the client half of one worker. It is renamed
**`WorkerEngine`** in slice 1a (owner, 2026-11-24: "bc it's on a Worker
thread"). After it no class is a bare session: `ModelSession` is one
open model and `WorkspaceSession` the user's document (owner, 2026-11-24;
[layering.md](../tracks/open-t200/layering.md) §4.1 "Session names"). The
block below is today's surface, as built. The format-neutral
**`Engine`** interface is [layering.md](../tracks/open-t200/layering.md) §4.1's: this surface with
`open`, `pump`, `abort` and `stats`, the events, the geometry source and
`capabilities`. A `ConwayEngine` (Conway's `IfcAPI` on the page, today's
kill-switch path) implements it too, and it is all a lease exposes
(`lease.engine`). This doc keeps today's name where it describes what is
built:

```js
session.indexed           // Promise, resolves at the index
session.tree({mode})      // → Promise<Node>
session.properties(id, {recursive, psets})
session.propertiesMany(ids, opts)
session.propertySets(id)
session.propertyTables(tables)  // the panel's tables, one request (§7.1, #2070)
session.itemsOfType(type)
session.typeName(code)    // sync: conway's static IfcTypesMap, imported main-side
session.capture(opts)     // GLB writer's engine captures, one job
session.spill(file)       // release a resident source to OPFS windows
session.close()           // abort + terminate
```

`makeWorkerModelHandle(session)` returns exactly today's model surface —
`getSpatialStructure`, `getItemProperties`, `getPropertySets`,
`getIfcType`, and `ifcManager.{getSpatialStructure, getItemProperties,
getPropertySets, getIfcType, idsByType}` plus an `ifcManager.ifcAPI` that
exposes only `properties.*` (where the Properties panel finds
`resolvePropertyTables`, §7.1). It replaces `makeIndexedModelHandle` and
`makeConwayDirectIfcManager`, so every async consumer in §2.1 keeps its code. Nothing on the main thread can reach
a sync engine method, because there is no `IfcAPI` object there to reach.

Reads go to the first source that can answer: the live worker; a
respawned worker (§5.3); the GLB artifact's `BLDRS_element_properties`
reader, which already serves cache hits without an engine.

### 5.2 Engine host: live-worker cap and LRU

**As of 2026-11-19 (main @ `0af98b3e`).** This section and §5.3–§5.5 were
written on 2026-11-03, before four things that change them. They are
refreshed here for #2031; what moved, and why:

- **Phase 1a shipped a switch that is a close** (#2222, on by default;
  in-app-model-switch.md §4.5a, §4.8). CadView owns each load through a
  per-run `AbortController` (`utils/loadAbort.js`), a switch terminates the
  left load's worker (`engineModelLoad.js#abort`), `ShareIfc#dispose`
  aborts the loads still parsing into it, and `forgetLoadedModelState`
  resets the store. The close path in §5.3 is therefore built, for one
  model at a time. What is not built is everything that keeps a second
  engine alive.
- **Decision 6 (#2011, 2026-11-19): background sessions only under
  `?feature=workspace`.** Outside it the host holds **one** live model,
  which is today's switch = close. Under it the host holds N within a
  budget. `disableBackgroundSessions` forces the cap back to 1 even under
  `workspace`. The 2026-11-03 text assumed N everywhere.
- **The source policy (§5.6, Share#2139)** made most opens buffered: the
  worker holds the whole file from the open to the GLB writer's spill. And
  the retainer fix in that PR changed what an engine costs once the load is
  done. The estimate below is re-fitted to those numbers; the 2026-11-03
  constant over-counted a finished PSB engine by 2.2× and under-counted
  STEP.
- **Per-model sessions (#2019, step 1 of Phase 1b) come first**, behaviour
  neutral, with one live session. The host sits on top of that session
  object. #2247 built it; what the host needs of it, and what is not built
  yet, is below ("What the host needs of a session").
- **One viewer for the page (owner, 2026-11-19).** #2247 found that the
  scene is the viewer's, built per open and per theme rebuild, so no
  session can keep its scene across a switch. That step is §5.2a, slices
  2a–2e of the plan, between `EngineHost` at cap 1 and cap N.
- **Six layers (owner, 2026-11-23, #2011 decision 8).** The engine is the
  lowest of them, and the session sits three above it, outside the engine
  layer. So the host cannot take a session, as the 2026-11-19 text had it
  (`host.spawnFor(session)`, `host.leave(session)`, `session.onEngineEvicted`).
  It hands out a **lease** and is told what it needs through it. A session
  holds zero, one or several leases, and can go through several in its
  life. [layering.md](../tracks/open-t200/layering.md) §4.2 is the source for the lease, and
  §7 there for the slices; this section keeps what the host does inside.

What did not change: one engine per model in its own worker, `terminate()`
as the way memory comes back (§3), backpressure before eviction, the LRU
tiers, the sidecar written after the first load rather than at eviction
(§8 item 4), and the main-side session keeping its scene and refs (§5.5).

**Naming.** "Session" means three things in nearby docs. Here: the
*engine* is `EngineSession`, to be `WorkerEngine` (one engine's client,
over a worker or, as the fallback, the same handler in process); the
*model session* is #2019's per-model session (load, leases, state,
selection); the user's *workspace session* is
[workspace-sessions.md](workspace-sessions.md)'s, named `WorkspaceSession`
in code. That doc proposed `ModelEngine` for the first, and layering.md
first proposed `EngineConnection`; the owner chose `WorkerEngine` on
2026-11-24, with `Engine` as the interface it and `ConwayEngine`
implement, and the same day `WorkspaceSession` for the third, so no
class is a bare `Session` (layering.md §4.1). A bare "session" in prose
and UI copy is the user's document.

#### The cap: one predicate

Whether a switch keeps the left model alive is one decision, in one module,
shaped like `utils/spaModelNavMode.js` and `viewer/three/renderOnDemandMode.js`.
It is `utils/backgroundSessionsMode.js`: a flag predicate, in the base
layer beside `spaModelNavMode.js`, because the engine layer reads it for
its limits and the session layer for a session that has no engine.

```js
export const SingleModelReason = Object.freeze({
  ROLLBACK: 'rollback',          // `disableBackgroundSessions` isActive in FeatureFlags.js
  PAGE_LOADS: 'pageLoads',       // modelPageLoadReason() !== null: every open is a page load
  NO_SINGLE_VIEWER: 'noSingleViewer',  // a viewer per open (utils/singleViewerMode.js): no scene outlives a switch (§5.2a)
  NO_WORKSPACE: 'noWorkspace',   // `workspace` off: no surface to return to a left model (decision 6)
  KILL_SWITCH: 'disableBackgroundSessions',  // ?feature=disableBackgroundSessions
})
export function singleModelReason()       // → a SingleModelReason, or null for background sessions
export function isBackgroundSessionsOn()  // singleModelReason() === null
export function backgroundSessionsMode()  // 'on' | 'off:<reason>', for a Sentry tag or a GA param
```

- **The rollback is read first, from the static flag alone**, so it beats
  every URL, including a link that names `?feature=workspace`. That is the
  shape `spaModelNavMode.js#modelPageLoadReason` and
  `engineRoute.js#mainThreadEngineReason` already have, for the same reason:
  `isFeatureEnabled` ORs a static flag with the URL, so turning
  `workspace` off statically would not stop a `?feature=workspace` link.
- **`PAGE_LOADS` comes before `NO_WORKSPACE`.** With the in-app switch
  rolled back, a switch reloads the page, and nothing survives it to keep.
  `NO_SINGLE_VIEWER` likewise: with a viewer per open (§5.2a), the left
  model's scene is disposed with its viewer, so there is nothing to keep
  either, and `disableSingleViewer` forces cap 1 too.
- **Read at each acquire**, like `spaModelNavMode.js`: the query rides
  from one open to the next (`withCurrentSearch`), so a page and the opens
  it makes agree.
- **Per engine, not per page: an in-process engine is never kept in the
  background** (decided, owner, 2026-11-19). On the main-thread engine (`?feature=disableEngineWorker`,
  the rollback, the in-process fallback after a worker failed to
  start) memory comes back only when the whole `IfcAPI` is collected
  (in-app-model-switch.md §4.5), which nothing on the page can force. So a
  switch away from an owner any of whose leases is of kind `inProcess` or
  `mainThread` closes it, whatever the predicate says. A test pins it.

The host and the session host read the predicate; nothing else does. The
session host asks `host.mayKeepInBackground(owner)` what a switch does,
and the host's own limits come from the same call, so the two cannot
disagree.

#### What an engine costs, measured

Two numbers decide the budget: what one engine holds **during its load**,
and what it holds **once the load is done** (after the GLB writer's spill).
Both from the source-policy matrix
([source-policy-measurements.md](source-policy-measurements.md) §Tables and
§"Source policy as built", headless Chromium, the worker path). *At rest* is
wasm (the Total line's `engineWasmMb`, which never shrinks) plus the
worker's ArrayBuffer backing store and JS heap, both GC'd 2 s after the
spill. *During* is wasm plus the un-GC'd backing-store peak on the buffered
arm, which is what the policy runs for every file under its cap; it is an
upper bound.

| Model | Format | MiB | wasm | at rest | at rest ÷ size | during, buffered |
|---|---|---|---|---|---|---|
| duplex | IFC | 2.3 | 19 | 45 | — (floor) | 37 |
| SEESTRASSE | IFC | 13.6 | 69 | 111 | 8.2× | 101 |
| MB-Khaya | IFC | 31.4 | 100 | 140 | 4.5× | 171 |
| Arty_Z7 | STEP | 55.5 | 515 | 865 † | 15.6× | 636 |
| DSA2 | STEP | 105.7 | 83 | 430 | 4.1× | 288 |
| D3D | IFC | 213.6 | 611 | 979 | 4.6× | 1,268 |
| sp-231MB | IFC | 231.4 | 515 | 645 | 2.8× | 892 |
| BLSN_007 | STEP | 268.6 | 429 | 1,127 | 4.2× | 849 |
| DOWA | IFC | 398.4 | 429 | 623 | 1.6× | 1,348 ‡ |
| PSB | IFC | 860.7 | 899 | 1,158 | 1.3× | 2,288 ‡ |

MiB throughout. † the windowed arm's backing store; the policy's was not
measured on Arty_Z7. ‡ `policyDefault`'s own peak (§"Source policy as built"
(b)); the other rows use the plain buffered arm, which holds the same file.

- **A worker's floor is ~45 MiB and 0.4–0.6 s to stand up** (§3); duplex
  at rest is exactly that.
- **At rest, wasm dominates IFC; STEP carries a large JS heap besides.**
  The non-wasm part at rest is 0.3–0.6× the file on the large IFCs (PSB
  259 MiB, sp-231MB 130, DOWA 194), with D3D the outlier at 1.7×. On STEP
  it is 2.6–6.3× (BLSN_007 698 MiB, of which 612 is JS heap). That is a
  format difference that has to stay data (CLAUDE.md "IFC and STEP
  converge"): one allowance per format, below.
- **During a buffered load the worker also holds the file** until the
  spill, by design (§5.6): PSB 1,093 MiB of backing store at Total + 3 s
  against 293 windowed. The spill comes after the GLB writer, 17–21 s after
  Total on PSB.
- **The main-side scene is not in these numbers** and eviction does not
  free it. Page heap after a worker load: PSB 522 MB, a 58 MB STEP 148 MB
  (§7.1, step 5's row); GPU memory unmeasured. It is bounded separately
  (the scene tier, §5.3).

#### The estimate

The host recomputes each live engine's estimate on every event that
carries `wasmBytes` (every `progress`, `batch`, `log`, and the `open`,
`capture`, `spill` and `stats` replies already do, `EngineSession#receive`
keeps the last in `lastWasmBytes`), and on every change to the session's
queued geometry:

```
estimate = max(ENGINE_FLOOR_BYTES,
               wasmBytes + heldSourceBytes + ENGINE_BASE_JS_BYTES
               + ENGINE_JS_BYTES_PER_SOURCE_BYTE[format] × sourceBytes)
           + queuedBytes
```

- `ENGINE_FLOOR_BYTES` = 45 MiB (§3's `Init`ed worker).
- `wasmBytes`: live, from the worker. PSB goes 16 → 899 MB during the pump.
- `heldSourceBytes`: **new, reported by the worker**: the whole-file buffer
  a buffered open holds (`takeWhole()`), or the Blob store's held copy,
  until the spill releases it; 0 for a windowed open. The handler knows it
  exactly. Today `stats` returns only `{wasmBytes, modelID}`
  (`engineHandler.js` `Op.STATS`); the field is added to `stats`, `open`,
  `spill` and `done`, an additive change that needs no protocol bump (§4,
  "Version or capability").
- `ENGINE_BASE_JS_BYTES` = 30 MiB, unchanged (the `Init`ed worker less its
  wasm).
- `ENGINE_JS_BYTES_PER_SOURCE_BYTE` = **0.6 for IFC, 3.0 for STEP**,
  replacing the single 1.9 of 2026-11-03, which was PSB's index-time JS heap
  in the prototype, before the conway property-index fixes (§3.1) and the
  retainer fix (§5.6). Against the at-rest column: PSB 1,445 MiB estimated
  for 1,158 (+25 %), DOWA +12 %, sp-231MB +6 %, MB-Khaya +6 %, SEESTRASSE
  −4 %, DSA2 0 %, BLSN_007 +12 %; under on D3D (−21 %) and Arty_Z7 (−18 %),
  both of whose wasm is measured live, so the miss is the JS allowance only.
  The old constant read PSB at rest as 2,564 MiB and DOWA as 1,216.
- `queuedBytes`: transferred batch buffers a background session holds
  main-side unassembled (§5.3). PSB streams 337 MB of geometry (§3). The
  host takes it through `lease.update({queuedBytes})`; with a render worker
  the drain acks of §9 feed the same call, so §9 does not change.
- **Constants, each with its source measurement in a comment beside it**,
  in `src/engine/engineBudget.js`. Slice 6 (§7 step 8) re-fits them.

#### Caps and budget (decided 2026-11-19, owner)

| | outside `workspace`, or `disableBackgroundSessions` | `workspace`, desktop | `workspace`, phone |
|---|---|---|---|
| `maxLiveEngines` | **1** (switch = close) | **3** | **2** |
| engine byte budget | not used | ½ `deviceMemory`, at most 4 GiB; 4 GiB when absent | ½ `deviceMemory`, at most 1 GiB; 1 GiB when absent |
| sessions keeping a scene | 1 | 3 (= `maxLiveEngines`) | 2 |

- **Desktop 3 engines, ½ `deviceMemory` up to 4 GiB** is §8 item 2's
  decision, which workspace-sessions.md §8 decision 5 shares; kept by the
  owner on 2026-11-19 until slice 6 measures.
- **Phones: 2, not "budget only".** §8 item 2 left phones with no fixed
  count. With the at-rest numbers above, a 1 GiB phone budget fits two
  SEESTRASSE-sized engines (111 MiB each) with room for a third, while one
  sp-231MB (645 MiB) leaves room for a small model and nothing large. A count of 2 keeps
  the drawer's promise ("come back to it") for one model besides the
  active one, and the budget still decides for large ones. P1.0's "one large
  model resident" on phones (in-app-model-switch.md §4.5) is what the budget
  enforces. Decided (owner, 2026-11-19), with the 1 GiB cap below.
- **Phones are capped at 1 GiB even where `deviceMemory` says more.**
  Chrome on Android reports 4 or 8 on most current phones, and half of that
  is past what a mobile tab survives (P1.0: one 231 MB model already exceeds
  typical tab limits). iOS Safari has no `deviceMemory` and takes the
  1 GiB branch. The form factor is the repo's one rule, `MOBILE_WIDTH`, as
  `spawnEngine.js#engineDeviceSnapshot` reads it for the source policy.
- **Sessions keeping a scene equals the engine count** (decided, owner,
  2026-11-19). Eviction
  keeps the scene (§5.5), so a byte-budget eviction leaves a session with
  a scene and no engine. But a count beyond N goes to the *scene tier*
  (§5.3) rather than keeping every scene: without that, ten switches would
  hold ten scenes, and scene memory (main-side and GPU) is not measured.
  Keeping more scenes than engines waits for slice 6's scene measurement.
  **This host does not enforce the number.** It sees leases, and a scene
  can outlive its engine (a byte eviction) or never have had one (a mesh
  model). The session host holds it, in `ModelSessionHost#open`
  ([layering.md](../tracks/open-t200/layering.md) §4.5, "The scene count is the session host's").
- **A test-only override** of all three numbers, installed only outside
  production builds (like `utils/gc.fixture.js`), for the eviction E2Es.

#### Admission, backpressure, LRU

On every acquire (a new open, or a rehydrate) and on every estimate change,
while the total of live estimates plus the incoming open's is over the byte
budget, or the live count would exceed `maxLiveEngines`:

1. **Open the incoming load windowed instead of buffered.** A buffered open
   holds the whole file until the spill (PSB +860 MiB, §5.6). When the
   incoming open's `sourceBytes` would not fit buffered but would windowed,
   the lease carries `sourceOverride: {windowed: true}`, the per-open
   override `engineModelLoad.js#parse` already has for its out-of-memory
   retry. This
   is §5.6's "live admission budget" follow-up. The report says
   `Engine source: windowed (budget)`, a new reason in the policy's list.
2. **Pause background pumps** (`pump {mode: 'pause'}`). A paused worker
   stops at its next batch boundary and keeps its engine and its place in
   the stream. Paused is not cancelled. It resumes (`pump {mode: 'run'}`)
   when the total falls back under the budget by a hysteresis margin
   (10 %), or when it is foregrounded.
3. **Evict, by LRU on `lastForegroundAt` within tiers**, least loss
   first. Tiers, the count and the LRU are per *owner* (a model session):
   a `.bld` assembly's engines go together. Bytes are per lease.
   1. ready, with its GLB artifact written. Properties fall back to the
      artifact (§5.5);
   2. ready, without an artifact (no cache key, the write failed, or a
      model the writer skips);
   3. ready, with its GLB writer's capture still running. Evicting it
      skips the artifact (a capture that rejects writes nothing, §7
      step 5), so it waits for the tiers above. PSB's capture is 7.6 s;
   4. still loading in the background. Evicting it **cancels the load**:
      the session goes to *paused — will resume* (§5.3).
4. **Never evicted:** the foreground owner, even when it alone is over
   the budget; and a lease acquired to rehydrate, until its first
   `update({phase: 'ready'})`.

**Under cap 1 there is no LRU.** The session host closes the left session
before B's load acquires (§5.3, "Switch"), which is Phase 1a's behaviour
exactly. Should a second owner ever hold a lease at cap 1, admission
evicts it, and a session evicted at cap 1 closes itself.

**How this squares with #2031 and in-app-model-switch.md §4.0.** Close and
eviction stay the only paths that cancel a load. With the engine in a
worker most evictions cancel nothing: they terminate an idle engine whose
geometry is in the scene. Only tier 4 cancels, and only when tiers 1–3 are
empty.

#### The host's API

One `EngineHost` per page (`src/engine/EngineHost.js`). It owns every
engine: each `WorkerEngine`, in a worker or in process, and each
`ConwayEngine`, which wraps the main-thread `IfcAPI` that
`viewer/ifc/ShareIfc.js:142` constructs today. It replaces
`spawnEngine.js`'s module-level `liveSessions` set and
`closeAllEngineSessions` (`spawnEngine.js:181, 200`), and the engine half
of `ShareIfc#dispose`. Nothing else holds an engine.

**Its API is the lease**, and [layering.md](../tracks/open-t200/layering.md) §4.2 is the
source for it: `host.acquire(meta) → lease`,
`host.acquireMainThread(owner)` (synchronous, for a `ConwayEngine`),
`lease.engine` (the `Engine`, the only way to reach one), `lease.update(…)`,
`lease.onEvict(cb)`, `lease.release()`, `host.mayKeepInBackground(owner)`,
`host.whenEntryFree(entryKey)`, `host.closeAll()`, `host.limits()`,
`host.snapshot()`. In short:

- **Acquire** is where admission runs (above). The load passes it to
  `createEngineModelLoad({format, acquire})` in place of today's `spawn`
  (`engineModelLoad.js:256`), so a load, its out-of-memory retry on a
  fresh engine, and a rehydrate are all admitted and counted.
- **Focus, phase, artifact and queued bytes** reach the host through
  `lease.update`. The host stamps `lastForegroundAt` itself. It reads the
  OPFS entry a lease holds from the engine's `open` reply.
- **Accounting** needs no call: the worker's `wasmBytes` and
  `heldSourceBytes` arrive on the engine's own events, and the host
  subscribes when it spawns it.
- **The host never calls up.** It knows an `owner` id, not a session. What
  the 2026-11-19 text gave it as `host.leave(session)`,
  `host.foreground(session)`, `host.rehydrate(session)` and
  `session.onEngineEvicted` are now, in order: the session host asking
  `mayKeepInBackground`, `lease.update({isForeground})`, the session
  acquiring with `purpose: 'rehydrate'`, and `lease.onEvict`.
- **The lease's state is the host's**, one of `live`, `paused`,
  `evicted`, `released`. A session with no lease (a mesh format, a GLB
  cache hit, an evicted model) has no row in the host. The session's
  *load* state (`loading`, `ready`, `failed`) stays the session's. The
  drawer (Phase 1b step 3) shows the pair: loading + paused is "paused",
  loading + no lease after an eviction is "paused — will resume".
- **Who owns the cap decision:** the host, through
  `utils/backgroundSessionsMode.js`, per acquire.

#### What the host needs, and where it comes from

The model session is built (`src/session/modelSession.js`, #2247): a
`ModelSessionHost` per CadView whose active `ModelSession` is `{id,
modelKey, loadState, job, engine, windowHandlers}`, with a `LoadJob` that
owns the run's `AbortController` and gates every store write on
`isCurrent()`. The 2026-11-19 table listed fields the host would read off
it. Under the lease the host reads none of them; each is either lease
meta, something the worker already reports, or the session's own business.

| The host needs | Comes from |
|---|---|
| who holds the engine, as an id | `meta.owner` (the session's `id`, built) |
| one engine per model per owner: a new run supersedes the last one's | `meta.modelKey` (built: the dedupe identity) |
| the OPFS entry a lease is about to open, before the `open` reply | `meta.entryHint` |
| the estimate's allowance | `meta.format`, `meta.sourceBytes` |
| the LRU tiers | `lease.update({phase, hasArtifact})`: `loading`, `capturing`, `ready` |
| who is on screen | `lease.update({isForeground})` |
| queued, unassembled geometry | `lease.update({queuedBytes})` |
| the OPFS entry the engine holds, for `whenEntryFree` | the engine's `open` reply (`entryPath`) |
| ending an engine | `lease.release()`. `ModelSession#close()` stays synchronous (as built) and does not await it; `whenEntryFree` is what waits |

What a session needs that is not the host's:

| The session needs | State |
|---|---|
| a set of leases, not one `engine`, and an engine port for its loads | not built: `session.engine` is bound after the load, to the top model's connection only (`modelSession.js#bindEngine`). A `.bld` assembly's child engines are closed only by the viewer's dispose. Slice 1b |
| `rehydrateSource`: the OPFS `File`, an in-memory upload's `File` (`inMemoryUploads`, #1906), or null | not built. Returned by the load (`LoadResult`, layering.md §4.3). Slice 4 |
| `root` and `viewState`, attached and detached by the viewer | not built: **the scene is the viewer's** (below). Slices 2a, 2b |
| a load that touches no module-level per-load state | not built (below). Slices R, 2a, 3a |
| its own per-model state, which a background load writes | not built: the job writes into the store or nowhere. Slice 3a |
| to outlive a CadView | not built: the session host is per CadView and closes at unmount (`useModelSessionHost.js`). Slice 3a |

- **The scene.** A viewer is built per open and per theme or
  view-settings rebuild (`Containers/viewer.js#initViewer`, called from
  CadView's `onModelPath` → `initViewerCb`), and `disposeViewer`
  traverses the whole scene and disposes every geometry, material and
  texture. So a model's scene lives and dies with a viewer, and nothing can
  detach it and re-attach it later. §5.2a makes the scene a session's.
- **Module-level per-load state**, which keeps loads one at a time:
  1. the load reporter: `loader/loadProgress.js`'s `activeReporter` and
     `loadSerial` (`:80, 83`), the report lines, and the stall watchdog;
  2. the artifact generation: `loader/glbArtifactPublish.js`'s `generation`;
  3. the streaming selection: `model/streamingBatchPick.js`, one per scene,
     kept on the viewer's `scene.userData`;
  4. the GLB writer's in-flight owner: `Loader.js#cacheWriteOwner`;
  5. the loading UI's owner and the page's host: `modelSession.js`'s
     `loadingUiOwner` and `pageHost`.

  Each becomes the session's: a reporter per load job (slice R), the
  streaming selection on `session.root.userData` (2a), and the rest fall
  away when a run that is not current can write nothing (3a).
- **Background state.** A session's job writes the session's own state,
  and the store shows the bound session's (layering.md §4.5). Slice 3a.

How CadView itself divides between the view and the session is the
CadView split plan (in-app-model-switch.md §4.10, #2250); this doc names
only what the host and the viewer need of it.

### 5.2a One viewer for the page

**Decided (owner, 2026-11-19):** one viewer for the page, with models
attached to it, as its own step between `EngineHost` at cap 1 and cap N
(slices 2a–2e). Why: cap N keeps a left model's scene, and today
nothing can, because the scene belongs to a viewer that is built per open
and per theme rebuild and disposed with it (§5.2, "What the host needs, and
where it comes from"). The engine side of a background session is the
host's; this is its scene side.

**Since 2026-11-23 (#2011 decision 8)** the viewer is a layer above the
session and owns no engines. Three things here changed with that, and
[layering.md](../tracks/open-t200/layering.md) §4.6 is the source for the seam:
- the viewer attaches a **root**, not a session
  (`viewer.attach(root, {viewState, statePort})`), and the binder in the UI
  makes the call;
- the page's `IfcAPI` leaves `ShareIfc` for a host lease (§5.2), so the
  main-thread engine route no longer needs a viewer of its own ("The
  paths");
- the load reaches the viewer through events on its root, not through the
  viewer's camera and `RenderDemand`.

**Today** (main @ `0af98b3e`, unchanged by #2247):
- `Containers/viewer.js#initViewer` calls `disposeViewer()` and then builds
  a `ShareViewer`. CadView calls it from `onModelPath`'s `initViewerCb`, on
  every model change and on every theme change (it is the theme's change
  listener). The `[modelPath, customViewSettings]` effect reloaded the same
  route into a fresh viewer for a Widget API view-settings change, until
  slice V (#2318) deleted the `?view=` stack; the effect is `[modelPath]`
  now.
- `disposeViewer` traverses the whole scene, disposes every geometry,
  material and texture, disposes the renderer and forces context loss,
  then `ShareViewer#dispose`, whose `ShareIfc#dispose` closes the
  registered models' engines and aborts the tracked loads.
- Each `ShareViewer` builds its own `ShareIfc`, whose `IfcAPI` is the
  main-thread engine's (§2.1 rows 1–2), and its own `IfcIsolator`,
  `Clipper` (a `MeshClipper` per `setModel`), `IfcHighlighter`, post
  processor, `MotionAO`, ground plane and IBL environment. PlaceMark is
  rebuilt per viewer context (#2017, `MarkerControl.jsx`).

So "one viewer" is less a new viewer than a split of `ShareViewer` into
what lives for the page and what lives for one model.

#### What the viewer owns, and what a session owns

| The viewer (one per page) | The session (one per open model) |
|---|---|
| the canvas, the renderer and its WebGL context | `session.root`: one `Group` holding everything the load added (the model object or `BatchedMesh`es, the load-preview group, its streaming batches) |
| `ThreeContext`: the scene's top level, the camera object, camera-controls, the render loop, render-on-demand, the raycaster | `session.viewState.camera`: the camera's pose and target, saved at detach, restored at attach (the `#c:` term's content) |
| the lights, the IBL environment, the look, the post processor, AO and `MotionAO`, the ground-plane object | the materials the look converted (`applyLookToModel` runs once per root, `root.userData.look` records which look) |
| the `Clipper` facade | `viewState.planes`: the cut planes (the `#cp:` term's content); its `MeshClipper` is built at attach and dropped at detach |
| the `IfcIsolator` and `IfcHighlighter` machinery, the hover picker and hover overlay, the window mouse handlers | hidden and isolated sets, display overrides, the selection and its highlight ids (#2019's per-model state) |
| one `PlaceMark` for the page (#2017's rebinding becomes a no-op) | the notes' markers and their selection, re-placed at attach |
| the `ResidencyControl` and `MotionResidency` UI, bound to the camera | the `ResidencyController` over `session.root` (already one per model object, #2189); its motion driver is started at attach and stopped at detach |
| `ShareIfc`'s registry of attached models (no `IfcAPI`: that is the host's) | its leases (the host's engines), the instance maps and BVHs on its meshes, the streaming selection on `root.userData` |

**The rule that makes it hold:** everything a load adds to the scene goes
under its session's root, never into the viewer's scene directly. Today the
loaders add to `viewer.context.getScene()` (the end-of-load add in
CadView, the preview group in `ProgressiveLoadSession`, the mesh loaders'
results). Under one viewer they add to `session.root`, so a background
load's previews and batches never show in another model's view. A unit test
pins it: after a load, the scene's children are the viewer's own objects
and exactly one root.

#### Attach, detach, rebuild, dispose

- **Attach** (`viewer.attach(root, {viewState, statePort})`, called by the
  binder for the session it binds): add `session.root` to the scene;
  register its models for picking (`context.items.ifcModels`, which the
  loader fills today);
  `isolator.setModel` and the highlighter over its model; build its
  `MeshClipper` and recreate `viewState.planes`; re-apply its hidden,
  isolated and selected sets; restore its camera, or fit to frame on its
  first attach as today; refit the ground plane (`groundModel`); apply the
  look if `root.userData.look` differs; start its motion-residency driver;
  re-place its markers; `requestPaint`. The isolator and highlighter read
  the session's hidden, isolated and selected sets through `statePort`,
  not the store (`IfcIsolator.js` has 20 `useStore` calls today).
- **Detach** (`viewer.detach(root)`, which returns the `viewState`): save
  the camera and planes; drop its `MeshClipper`, stop its motion driver, clear the
  highlighter's and the hover overlay's references to it, `isolator.setModel(null)`;
  remove `session.root` from the scene. **Nothing is disposed.**
- **A switch.** Cap 1: detach A, `A.close()` (which now also disposes
  A's root, below), attach B. Cap N: detach A, attach B; A keeps its root.
  Either way the viewer, the renderer and the context stay.
- **A theme change** sets the scene's background colour and re-applies the
  look in place (`viewer.setBackground(color)`; `applyLook` already runs on
  the live viewer). No viewer is built, no load is aborted, no model is
  reloaded. in-app-model-switch.md §5.2's "a theme rebuild is not an open"
  becomes true by construction.
- **A view-settings change** (Widget API `customViewSettings`) reloaded
  the route, to apply settings that colour nothing. Slice V (#2318)
  deleted the `?view=` stack: there is no `viewer.setCustomViewSettings`
  and nothing to apply or reload, and the handler answers success.
- **What close disposes, and when.** `session.close()` (synchronous, as
  #2247 built it) first emits `closing`, on which the binder detaches the
  root if it is attached: the session is below the viewer and does not
  call it (layering.md §4.6). Then it disposes the
  root's tree and nothing else: geometries (with their BVHs, and any
  deferred BVH build cancelled, `deferredBatchedBvh.js`), materials,
  textures, and any per-format resource a loader registered on the root
  (below). That is `disposeViewer`'s scene traversal, moved from the whole
  scene to one root (`model/disposeRoot.js#disposeModelRoot(root)`, in the
  model layer, so a session can call it). The scene tier's
  `dropScene()` is the same call without the engine close.
- **What viewer dispose frees, and when.** Only the page's things: the
  renderer and its context, the environment, the post processor, the ground
  plane, the handlers. It never disposes a session's root. It runs when
  the last view goes: a CadView unmount that no mount follows within a
  microtask (an in-app open across route families remounts CadView, and
  the next view takes the same viewer). It also runs as the fallback
  after a context loss that does not restore (below). Until 2d it also
  runs per open, as today.
- **WebGL context loss.** The roots are CPU-side objects; three re-uploads
  their buffers on the first paint after a restore. Today the next open
  builds a fresh viewer anyway, which hides a lost context. Under one
  viewer it has to recover in place. three restores its own state
  (`WebGLRenderer.js#onContextRestore`), and `renderDemandHooks.js:285`
  already paints on `webglcontextrestored`; what Share adds on top (the
  PMREM environment, the composer's targets, N8AO, the hover overlay's
  cached frame) is not known to come back, and slice 2d finds out
  (layering.md §8). The fallback is to rebuild the viewer and re-attach
  the active root, which keeps every session's root, and past that today's
  error path (`isWebGLUnavailableError`).

#### The paths

- **IFC and STEP, worker engine.** One path for both: the root holds the
  `BatchedMesh`es and the preview group; the session holds the engine
  (§5.2). STEP's occurrence paths and IFC's express IDs are on the instance
  tables, under the root, so selection restore at attach needs nothing
  format-specific.
- **The main-thread engine uses the one viewer too** (decided by the
  owner on 2026-11-24). On that route (`engineRoute.js#mainThreadEngineReason`:
  `?feature=disableEngineWorker`, the rollback) the engine is a bare
  `IfcAPI`, collected only when everything lets go of it. The 2026-11-19
  text kept a viewer per open there, so the `IfcAPI` could stay in the
  viewer's `ShareIfc`. It is now a `ConwayEngine` on a host lease,
  acquired by the load (layering.md §4.1), so nothing ties it to a viewer.
  It is still cap 1 (§5.2). `modelSwitchMemory.spec.ts`'s `IfcAPI`
  collection check is the gate and must stay green unchanged; if it
  cannot, this route goes back to a viewer per open.
- **Mesh loaders** (GLB, glTF, OBJ, STL, PLY, PDB, XYZ, USD, 3DM, ADF, FBX,
  splats, volumes) have no engine. Their root is the loaded object.
  Formats that hold more than geometry, materials and textures register
  their view resources on `root.userData.view = {attach, detach,
  dispose}`: the splat renderer and sorter, a volume's `Data3DTexture` and
  clip uniforms. A GLB cache hit is a mesh load with
  IFC/STEP refs.

#### How memory is checked

- `modelSwitchMemory.spec.ts`'s assertion is unchanged and still the gate: a
  closed session's model `WeakRef` is cleared after a forced GC, on both
  form factors. It becomes harder to pass, because the viewer and its
  helpers now outlive the model: an isolator, a clipper, a highlighter, a
  hover-overlay cache, a ground fit, a PlaceMark or a residency driver that
  keeps a reference to A's model is a leak that a per-open viewer used to
  hide. #2189's retainer paths are the list to re-check.
- **A new exact check, not a heap number:** the renderer's resource counts
  (`renderer.info.memory.geometries` and `.textures`) after A → B equal
  those of a fresh page showing B alone, in the same build. A root that was
  detached but not disposed fails it.
- On the main-thread route the `IfcAPI` check is unchanged, and the
  resource count applies too.

#### Its slices (2c–2e)

[layering.md](../tracks/open-t200/layering.md) §7 is the plan: its 2a (session roots, the
load adds under `ctx.root`) and 2b (attach and detach) are behaviour
neutral, and replace the single "2a" this section had. The three below
are its 2c, 2d and 2e, and this is where their E2Es are. They are behind
`singleViewer`, off by default until its burn-in, then on with
`disableSingleViewer` as the kill switch and the static prod rollback,
read by one predicate, `utils/singleViewerMode.js`, shaped like
`spaModelNavMode.js`.

- **2c. Theme in place** (under `singleViewer`). A theme change no longer
  builds a viewer. (A view-settings change does nothing to apply once the
  `?view=` stack is gone, layering.md §7 slice V.)
  - *E2E:* with a model loaded, toggle the theme: the canvas element and the
    viewer are the same objects, no engine worker closes, no "Opening model"
    line, the clear colour is the new theme's and the look is kept. With the
    flag off, the toggle rebuilds the viewer as today.
  - *Rollback:* `disableSingleViewer`.
- **2d. One viewer across switches** (under `singleViewer`, cap 1). A
  switch detaches and closes A and attaches B into the same viewer, on
  every engine route. The main-thread lease moves from the viewer build to
  the load here.
  - *E2E,* A → B → C: the same canvas and viewer throughout; A's and B's
    model `WeakRef`s cleared after GC; the renderer's resource counts equal
    a fresh page's C; C framed by its own fit, not A's camera; a cut plane
    and an isolation made in A absent in C; C's markers only. Context loss
    (`WEBGL_lose_context`): lose and restore, and C still draws (a pixel
    probe) and picks. Each shown red with one detach step reverted (the
    isolator keeping A, a root left undisposed).
  - *Rollback:* `disableSingleViewer` (static first).
- **2e. On by default**, after a burn-in of the whole suite with the flag
  on, as `spaModelNav` had (in-app-model-switch.md §4.8). Cap N (slice 3b)
  needs it: `backgroundSessionsMode.js` returns `SingleModelReason.NO_SINGLE_VIEWER`
  while one viewer is off, so `disableSingleViewer` also forces cap 1.

**Not designed here:** how CadView divides between the view and the
session, which is the CadView split plan (in-app-model-switch.md §4.10,
#2250). This section names the viewer's and the session's halves; that
plan says where in CadView each call is made.
**Meets §9:** a render worker would own the viewer half of the table above;
the session half and the attach contract do not change.

### 5.3 Switch, background load, eviction, close

- **Switch A → B, cap 1** (outside `workspace`, `disableBackgroundSessions`,
  or A's engine in process). `host.mayKeepInBackground(A)` answers no, and
  the session host closes A before B's load acquires. That is Phase 1a as built
  (in-app-model-switch.md §4.5a): A's load is aborted, its worker
  terminated, its state dropped. Slice 1b moves the call sites into the host
  without changing the behaviour. With one viewer (§5.2a, slice 2d) the
  viewer stays: A is detached and its root disposed, and B is attached.
- **Switch A → B, cap N.** `host.mayKeepInBackground(A)` answers yes, A's
  leases get `update({isForeground: false})`, and the binder detaches A's
  root (§5.2a). A keeps its worker, its load and its scene
  root; nothing is disposed. B's engine is
  admitted (§5.2): it spawns at once if it fits; otherwise the host opens B
  windowed, pauses background pumps, then evicts by tier. If A is still
  loading and B still does not fit, A is cancelled into an explicit,
  user-visible **paused — will resume** state. It is not silently dropped:
  the drawer says so, and when A is foregrounded again its load resumes
  from the OPFS-staged source, through the sidecar if its first parse
  finished and wrote one (§8 item 4), else by a re-parse. A paused-will-
  resume load does not restart on its own when memory frees; only a
  foreground does (decided, owner, 2026-11-19). So in-app-model-switch.md §4.0's
  "come back to a finished load" is **a finished background load when the
  budget allows; otherwise paused — will resume**.
- **Switch back B → A.** A's leases get `update({isForeground: true})`. A
  live A rebinds at once,
  with its tree, selection and camera (#2019's selection restore). Its
  queued batches are assembled first. An evicted A rebinds its scene
  (still there) and reads from its artifact until a read needs the engine
  ("Rehydrate"). A dormant A (the scene tier) reopens through its GLB
  cache hit. Each return is an open for the meter and analytics, by #2011
  decision 1.
- **Background load.** A's parse and pump run in A's worker and cost the
  foreground nothing there. What would land on the main thread is
  *assembling* A's batches (builder appends, the end-of-load BVH). Decided
  (§8 item 1, confirmed under decision 6 by the owner on 2026-11-19): A
  keeps pumping, and its batches queue main-side
  unassembled; they are transferred buffers, so queuing costs no copy.
  They are assembled when A is foregrounded, or in idle slices before then
  (`requestIdleCallback`, one batch per slice, the same per-batch cost the
  foreground load pays). Queued bytes count against the budget, and a
  session's queue past `BACKGROUND_QUEUE_MAX_BYTES` (256 MiB
  desktop, 64 MiB phone) pauses its own pump until idle slices drain it,
  so one large background load cannot fill the budget with geometry the
  user has not looked at. With a render worker, assembly moves off the main
  thread (§9) and the idle-slice limit goes.
- **Eviction** is `worker.terminate()` and nothing else. It frees the
  whole engine (wasm heap, held source, parse buffers, resident windows) at
  once (§3). No export, no write: at eviction memory and CPU are probably
  under load, which is why it is happening. The session keeps everything
  main-side (§5.5). For a sync-handle engine the terminate is
  `EngineSession#close()`'s polite path: `close` sent, its reply awaited at
  most `ENGINE_CLOSE_TIMEOUT_MS` (1 s), so the OPFS entry's lock is
  released before anything re-stages it (§7 step 4).
- **The OPFS ordering rule** (§7 step 4, "A requirement on step 7"),
  enforced in one place. Every OPFS write, remove or re-stage of an entry
  (a newer version of A downloaded while A's evicted engine is closing,
  the stale-commit remove, a delete, Clear cache) first awaits
  `host.whenEntryFree(entryKey)`, which settles once every engine holding
  that entry has closed or timed out. The one place is the mutators of
  `OPFS/utils.js`, through a gate the host registers, so OPFS imports
  nothing from the engine (layering.md §4.7). Nothing that starts an
  engine waits for another's close, as today: an `acquire` for a model
  its owner already holds an engine for releases that one, and a
  rehydrate follows an eviction, whose engine is long terminated. Reads
  do not wait either: read-only handles on one entry coexist
  (`engineSources.js:359–362`).
- **Rehydrate, lazily.** The first read the artifact cannot answer (an
  entity-ref `deref`, a recursive read, any read on a session without an
  artifact, later a document op or a workspace-session job) calls
  `session.ensureEngine()`, which acquires a lease with `purpose:
  'rehydrate'`. The host spawns a worker through admission, and the
  session opens the
  model **index-only** from `rehydrateSource`: the handler finds the
  sidecar the first load saved (`engineSidecars.js`, Share#2085), the
  source policy opens it windowed (§5.6 rule 2), and the page never sends
  `pump`, because the geometry is already in the scene. So a rehydrated
  engine holds no buffered copy of the file, and is smaller than the one
  evicted. What it costs, from the sidecar-reopen rows (the Index column,
  timed from the end of the download, so the worker's spawn is in it; a
  rehydrate has no download): SEESTRASSE 0.74 s, MB-Khaya 0.79 s,
  DSA2 1.58 s, BLSN_007 1.44 s, sp-231MB 2.40 s, DOWA 3.41 s, PSB 4.38 s,
  D3D 5.60 s. Fallback: a re-parse (no pump) when the sidecar is missing
  (the first load never finished, the write failed, `disableEngineSidecar`)
  or stale (size and modification time, then conway's full source hash),
  or the engine lacks `openFromIndex`. A session whose source is gone
  (`rehydrateSource` null: not staged in OPFS and not an in-memory upload,
  or the entry was cleared) cannot rehydrate; its reads stay the artifact's,
  as on a GLB cache hit today, where a reference outside the captured
  records shows as `#id` (§7.1, #2066).
  **Eager, not lazy, in one case:** a session without an artifact
  rehydrates when it is foregrounded, because its Properties panel would
  otherwise have nothing to read (decided, owner, 2026-11-19).
- **Close** = abort the load (`utils/loadAbort.js`), drop or cancel the
  idle GLB writer, release every lease (`lease.release()`, the engine's
  close, polite for a sync handle; not awaited by the synchronous
  `session.close()`), then dispose the root and drop the session's state. Built for cap 1 by Phase 1a; under cap N it
  is the drawer's close, and slice 1b makes the switch's close the same
  call. **An evicted or closed model reopens like any other**: through its
  GLB cache hit where one exists (0.1–0.7 s up to 106 MiB, 2.0–3.9 s on the
  IFCs from 214 MiB; source-policy-measurements.md §(d)).
- **The scene tier.** A session past "sessions keeping a scene" (§5.2)
  becomes *dormant*: it drops its scene after its engine. **The session
  host decides it, not this host, and it is not an eviction.** In
  `ModelSessionHost#open`, before the incoming load acquires, the
  session host counts the sessions holding a scene and calls
  `session.dropScene()` on the least-loss background one, by the tiers
  of §5.2 and then LRU ([layering.md](../tracks/open-t200/layering.md) §4.5). `dropScene()` releases
  the session's leases, then disposes its root. An eviction is this host
  terminating an engine, for bytes or for the engine count, and it
  always leaves the scene: `lease.onEvict` never drops one. Because the
  session host goes first and the two counts are equal, releasing the
  dormant session's leases is what makes room for the incoming engine.
  It keeps its
  per-model state and selection, which are small and are refs, not batch
  ids (§5.5). Foregrounding it is a GLB cache-hit open plus a selection
  restore from those refs; without an artifact, a cold load from OPFS.
  The 2026-11-03 text left this tier undesigned. It is now needed, because
  under cap N a switch keeps scenes by default.

### 5.4 Failure isolation

- An exception, a wasm trap or a wasm `RangeError` on memory growth inside a
  worker is caught there and reported as `failed{kind}`. Only that session
  shows the alert; other sessions do not see it.
- **A background session that fails** keeps its failure until it is
  foregrounded: the drawer marks it failed, and its alert shows when the
  user returns to it, not over the model they are looking at. It is
  captured to Sentry once, when it fails (not on return), from the page,
  with the usual load-failure tags plus `session_focus: background`
  (§5.5 "Reported conditions").
- A worker that dies without a message (`error` / `messageerror`) or goes
  silent past the load report's stall watchdog is terminated and marked
  `failed`, with a retry.
- **The out-of-memory retry** (§5.6) releases the failed lease and
  acquires a fresh one (`purpose: 'retry'`), so it is admitted and counted
  like any other, and the two heaps never overlap, as today.
- **What it does not isolate:** dedicated workers are threads in the page's
  renderer process. A process-level out-of-memory still takes the tab and
  every worker down. The budget in §5.2 is what prevents that; the worker
  only makes the memory *returnable*. Under cap N the budget is the only
  thing between three PSB-sized loads and the tab.
- A replaced or terminated worker's late messages carry an old `epoch` and
  are dropped.

### 5.5 What survives an eviction

| Survives (main-side) | Lost until rehydrate (engine-side) |
|---|---|
| scene, `BatchedMesh`, instance maps, BVH (until the scene tier drops them) | psets and records the artifact did not capture |
| `rootElement`, `elementsById`, search index | entity-ref `deref`, recursive reads |
| selection, hidden / isolated sets, display overrides, notes | STEP sub-solid reads beyond the tree |
| `e` / `o` / `n` / `g` refs and every permalink (`#sel:`, element path, `#d:`, `#c:`) | (later) document-op application and workspace-session jobs |
| the GLB artifact, the staged OPFS source and its index sidecar | `modelID` (a new instance starts at 0) |
| the session's load report and `loadResult` | the held source and resident windows (freed, which is the point) |

Refs survive because they are pure strings keyed on expressIDs and STEP
occurrence paths, which are the source file's own `#id`s and come back
identical from a re-parse or a sidecar reopen of the same bytes.
model-edit.md §5 already forbids storing a `batchId` or any per-load id,
and the scene's batch ids are not re-minted by an engine respawn because
the scene is not rebuilt. The same argument is what lets the scene tier
restore a selection after a GLB cache-hit reopen.

**What the user sees on return to an evicted model.** The scene, tree and
selection at once, with no load report. The Properties panel answers from
the artifact's `BLDRS_element_properties` reader, as a cache hit does
(the session's read model swaps to an artifact-backed handle in
`lease.onEvict`, and back to the engine's at rehydrate; `Properties.jsx`'s `isStale` guard
already drops an answer for a read model that is no longer current, §7.1).
A read the artifact cannot answer shows the panel's loading state while the
engine rehydrates (the times in §5.3), then answers. The load report gains
one line, `Engine: rehydrated from the index sidecar (…)` or `… re-parsed
(…)`, so a slow return can be told apart from a slow load.

**Reported conditions** (CLAUDE.md "Reported Conditions"). Eviction and
backpressure are expected and self-healing, so they go to GA through
`gtagEvent`, never Sentry. A failed rehydrate is actionable. Every param is
a closed enum or a bucket; no event carries a file name, URL or path, and
the worker replies with structured fields only (it has no Sentry).
`size_class` is the one `engine_source_fallback` already sends.

| Condition | User sees | Sentry | GA | Why |
|---|---|---|---|---|
| Engine evicted (tiers 1–3) | nothing until a read needs the engine | — | `engine_evicted {reason: 'count' \| 'bytes', tier: 'artifact' \| 'noArtifact' \| 'capturing', format, size_class, live_engines}` | expected; volume tells whether the defaults are right |
| Background engine evicted because its OPFS entry is being replaced or removed (layering.md §4.7) | nothing; a re-parse on its next rehydrate | — | `engine_evicted {reason: 'restage', tier, format, size_class, live_engines}` | expected and rare: a newer version of a model that is open in the background |
| Background load cancelled by eviction (tier 4) | the drawer's "paused — will resume" | — | `engine_evicted {tier: 'loading', …}`; not also `model_load_aborted` (one condition, one event) | expected under memory pressure; a high rate means the budget is too small |
| Background pump paused by backpressure | the drawer's "paused" | — | `engine_backpressure {format, size_class, live_engines}`, once per load | self-healing; volume only |
| Open admitted windowed for the budget | nothing (`Engine source: windowed (budget)` in the report) | — | `engine_source_fallback {failure: 'budget', …}`, after the load succeeds | a recovered fallback, reported once on success, as §5.6's are |
| Session dropped to the scene tier (over the scene count; §5.3) | a reopen from cache on return | — | `engine_evicted {reason: 'count', scene: 'dropped', tier, format, size_class, live_engines}`, sent by the session host at `dropScene()`. Its leases are released, not evicted, so this host sends no event of its own; a mesh session with no engine sends it too | expected; volume tells whether the scene count is right |
| Rehydrate fell back to a re-parse | a slower answer | — | `engine_rehydrated {via: 'reparse', why: 'missing' \| 'stale' \| 'noCapability', format, size_class, ms_bucket}`, on success | recovered; after the fact |
| Rehydrate succeeded from the sidecar | the answer | — | `engine_rehydrated {via: 'sidecar', …}` | volume and latency of returns |
| Rehydrate impossible (no source) | `#id` for references outside the artifact, as on a cache hit | — | `engine_rehydrate_unavailable {why: 'noSource' \| 'entryGone'}` | expected for unstaged sources |
| **Rehydrate failed** (both paths) | Properties keeps the artifact's answers; a note that the model's engine could not be reopened, with Reload | `error`, fingerprint `['engine-rehydrate-failed', <failed.kind>]`, tags `engine_rehydrate` (`sidecar` \| `reparse`), `engine_failure` (kind), `engine_source`, `model_open`, `model_nav`, `background_sessions`; captured in `ModelSession#ensureEngine`'s catch, on the page | the shadow `reported_condition` only | actionable: a sidecar or re-parse that fails on a model that loaded once is a bug |
| Polite close timed out before an OPFS write | none (the write meets the lock and the load falls back to the network, as today, §7 step 4) | — | `engine_close_timeout {op: 'evict' \| 'close' \| 'restage'}` | self-healing; a rising rate means a wedged engine |
| Background load failed | its alert on return | as a foreground load failure today (CadView's `captureException`), plus tag `session_focus: background`; once | `load_failed` with `open_kind`, as today | the same failure, reported once, from where it is today |
| Active session alone over the budget | nothing | — | `engine_over_budget {format, size_class}`, once per page | says how often the budget is wrong for the user's model |

Every Sentry event also carries `background_sessions`
(`backgroundSessionsMode()`, `on` or `off:<reason>`), set at the start of
each load beside `model_nav` and `model_open` (`utils/reportModelOpen.js`),
so a report can be read against the mode its page was in. GA's
`real_model_open` gains `resume: 'none' | 'live' | 'evicted' | 'dormant'`
beside `open_kind`, so a return to a live background session can be told
from a new load.


### 5.6 Source policy: buffer for the parse, window at rest

One decision per open, for IFC and STEP alike: does conway read the model
**buffered** (the whole file in the worker for the parse and the geometry
pump) or **windowed** (paged through a byte store from the start)? It is
`engine/sourcePolicy.js#chooseSourceMode`, a pure function the handler
(`engineHandler.js#openModel`) calls once it knows its store and whether a
sidecar was found (Share#2139, Share#2092).

**The rule, in order.**
0. No store (a `{bytes}` source, not staged in OPFS; `?feature=disableStreamOpen`;
   an engine without the store open): buffered, there being nothing to
   window over. Not a choice, and `disableStreamOpen` keeps its meaning.
1. **Kill switch** `disableBufferedSource`: windowed, wherever a windowed
   open is possible. That is the behaviour before the policy.
2. **Index-only reopen** (a sidecar was found): windowed. The reopen pages
   from the store, unchanged.
3. **Blob store** (Firefox and Safari, which have no read-only sync access
   handles; also in process): buffered over the bytes the store already
   holds (`holdResident`), whenever it holds them; windowed over the Blob
   when it does not (over `RESIDENT_SOURCE_MAX_BYTES`, an allocation
   failure, `disableEngineResidentSource`, a File not in OPFS).
4. **Sync access handle** (Chromium): buffered when the file is within the
   cap, else windowed.

Rule 3 is bounded by the Blob store's own whole-file ceiling
(`RESIDENT_SOURCE_MAX_BYTES`, 1 GiB), not by the device cap below: on a
browser without a sync handle the small-device ceiling does not apply. That
is unchanged from main, where that path held the file for its windowed open
too.

**Why.** The measurements
([source-policy-measurements.md](source-policy-measurements.md)): buffered
is faster than windowed on every IFC measured from 2.3 MiB up, and on STEP
within noise up to ~56 MiB and faster above; never slower. Windowing over
the Blob store's held copy costs the same time as the sync-handle arm and
is the highest-memory arm from 100 MiB up, so rule 3 buffers there
regardless of size: the memory is already paid. Windowing did not save peak
worker memory on the medium IFCs either. What windowing buys is memory *at
rest*, after the parse, and the spill gets that for a buffered open too:
the GLB writer's SPILL (or the no-writer spill, Loader.js#load, which now
falls back to the open's own File) releases the buffered source to windows
over a fresh store. That release did not happen before Share#2139: the
handler's `settings` callbacks, which conway keeps for the session, shared
a V8 context with the source bytes (fixed; the measurements doc has the
heap snapshot and the after-fix numbers).

**The cap.** `BUFFERED_SOURCE_BYTES_PER_DEVICE_GIB` = 128 MiB ×
`navigator.deviceMemory`, never above `BUFFERED_SOURCE_MAX_BYTES`, 1 GiB, the
largest size anything has been measured buffered at (`deviceMemory` is not
capped at 8: headless Chromium 153 on a 17 GB machine reports 16). On a
device reporting 4 GiB or less it is also never above
`SMALL_DEVICE_BUFFERED_SOURCE_MAX_BYTES`, 256 MiB. That value was set when
conway's windowed provider's adaptive residency ceiling
(`ADAPTIVE_MAX_RESIDENT_BYTES`) was also 256 MiB, so a buffered open never
held more source than a windowed one. Conway#789 lowered the ceiling to
160 MiB; the cap is kept as is, so a buffered open on a small device may now
hold up to 96 MiB more than a windowed one. No device that small has been
measured. The caps: 0.25 GiB → 32 MiB, 0.5 →
64, 1 → 128, 2 → 256, 4 → 256, 8 and up → 1 GiB (8 GiB buffers PSB at
860.7 MiB). Without `deviceMemory`, 1 GiB on a desktop and 256 MiB on a
phone (the repo's form factor rule, `MOBILE_WIDTH`); that branch is only
consulted when `deviceMemory` is absent, which today means never on a
browser with sync access handles (Chromium has it), so the phone value is
a backstop, not a measured choice. The page snapshots both
(`spawnEngine.js#engineDeviceSnapshot`), since the worker has no window.
**Provisional:** it is static per device, and the PSB renderer peak with it
is in the measurements doc's §"Source policy as built".

**The windowed pump's closure walks and prefetch (conway#787, #798).** Over
a store that reads synchronously (the sync access handle, the held Blob), a
windowed pump does no per-product closure walk (#787), and since conway#798
its aggregate pass runs no relationship prefetch either: nothing is gained
by reading ahead from bytes that are one synchronous read away. Windowed
geometry is faster and its worker peak lower on the IFC models that page
most (D3D, one authoring tool's 309 MB IFC2X3 file); first mesh is
unchanged. Numbers in the measurements doc's §"Windowed aggregate pass
without prefetch (conway#798)". The preview-adapter walk skip was measured
too and showed no effect, so it stays.

**How the bytes are read.** `store.takeWhole()` (engineSources.js): on the
sync access handle one read of the whole file into one buffer; on the Blob
store the held copy, handed over. Neither store keeps a reference, so the
spill can free the bytes. The buffered open keeps `RECORD_SOURCE_HASH`, so
a buffered parse still exports its sidecar (`sidecarState`), and the next
open after an eviction or with the artifact gone comes up from the index,
windowed (rule 2). The sync access handle is closed once the open has run.

**Fallback.** Two memory failures, two places:
- **The whole-file buffer cannot be allocated** (`takeWhole()` throws a
  RangeError: `isAllocationFailure` in engineHandler.js, asked of that call
  only, so a corrupt file's bounds error or a stack overflow is never read as
  memory). The engine has not been touched, so the same worker opens
  windowed over the same store: `Engine source: windowed (buffered open
  failed: RangeError)`.
- **The buffered open runs out of memory.** conway does not throw for it
  (1.1645.781: `fromStreamed` catches the parse's error and falls back to
  the classic open, `fromAsync` catches again and calls
  `recordOpenFailure`, status `OPEN_FAIL` with the error's message, or
  `String(error)` for a non-Error, as the reason, and the open returns -1),
  and an Emscripten abort leaves the wasm unusable. So the handler only
  reports it: the `FAILED` packet and the open's `engineFailure` carry the
  `sourceMode`. The page (`engineModelLoad.js#parse`,
  `retryableBufferedFailure`) retries ONCE, on a NEW engine (the failed
  worker is terminated before the new one is spawned), with a per-open
  override that makes that open windowed, holds no whole-file copy on the
  Blob store, and forbids openDeferred's buffered fall-through
  (`bufferedFallback: false`). It retries only the policy's own buffered
  open (`POLICY_BUFFERED_REASONS`), never a schema refusal, and only for a
  recorded reason that looks like a heap exhaustion **from this
  conway-geom build** (`ConwayGeomWasmWeb.js`: heap growth on,
  `_emscripten_resize_heap` returns false, no `abortOnCannotGrowMemory`,
  so the ASSERTIONS-only `Aborted(OOM)` and "Cannot enlarge memory" are
  never produced):
  - `[object Object]`: a non-Error thrown out of wasm, which is how a failed
    malloc's `std::bad_alloc` (`CppException`) arrives; code
    `engineException`;
  - `Aborted(…`: an Emscripten `abort()`; code `engineAbort`;
  - `wasm _malloc returned an unusable address…`: conway's own guard
    (`core/wasm_heap.js`), and anything `utils/oom.js` matches (V8's
    "Array buffer allocation failed", Firefox's and Safari's "out of
    memory", "WebAssembly.Memory(): could not allocate memory"); code
    `outOfMemory`.

  A C++ exception or abort that is not memory costs one wasted windowed
  attempt, bounded to one, and then fails as before. A rebuild of
  conway-geom can change these strings (they are constants in
  `engineModelLoad.js`, with the glue as provenance). A schema refusal or
  an ordinary error (a corrupt file) is never retried. The report says
  `Engine retry: buffered open failed (<code>); retrying windowed on a fresh
  engine`, then `Engine source: windowed (buffered open failed: <code>)`.
  If the retry fails too, its failure is the load's, reported once.
  **None of these has been produced for real**; the retry has run only
  against doubles. Plain JS-heap exhaustion of the renderer kills the tab
  and is not covered at all.
  Costs and edges:
  - **On the Blob store the retry holds no copy of the file**: its windowed
    reads are Blob round trips, slower, which is the price on a device that
    just ran out.
  - The classic open conway falls back to re-parses the same bytes, so the
    recorded reason is that second parse's; if it fails some other way, no
    retry happens.
  - **Previews:** the failed attempt's preview meshes stay in the preview
    group and the retry adds its own, so preview memory roughly doubles
    during the retry, until the durable model replaces them all.
    `ProgressiveLoadSession` has no way to clear its preview group short of
    finishing or aborting the session, and `parse` does not hold the
    session, so this is left.
  - **Engine log:** the failed attempt's warnings and errors ("Streamed open
    failed…", "Error loading model…") stay in the load's tally; the `Engine
    retry:` line, printed before the retry's lines, is what explains them.
  - **In process** (no module worker), a STEP over the Blob store cannot
    open windowed at all: the retry's windowed open fails with
    `STORE_NOT_SYNCHRONOUS`, and that is the load's failure, not the
    original out-of-memory one.
- **Not covered:** an out-of-memory in the geometry pump, after a
  successful open, has no fallback; it fails the load as before.

Either fallback sends one GA `engine_source_fallback {format, store,
failure, size_class}` event once the load succeeded
(Loader.js#reportLoadDiagnostics). A failed open's Sentry event carries
`engine_source` (`buffered` | `windowed`) and `engine_source_reason` as tags
(engineOpenFailure.js#engineSourceTags), so a failed buffered open can be
told from any other.

**The spill with no File.** A load with no GLB writer sends SPILL with no
File (Loader.js#load); for the policy's buffered open the handler spills
onto the open's own File. Only for that open: a `disableStreamOpen` or
fall-through buffered open still answers `unsupported` and keeps its
source, as before the policy.

**Reported.** `Engine source: <mode> (<why>)`, before `Engine source I/O:`
(load-log-format.md). A buffered open the policy chose is the default path
and is not counted as `engine_source_buffered`, which keeps counting the
opens that could not window.

**Rolling back.** Prod-wide: set `disableBufferedSource` to `isActive: true`
in `FeatureFlags.js`; `engineFlagSnapshot` reads the static value first.
One session: `?feature=disableBufferedSource`.

**Deliberately not done (follow-ups).**
- Buffered geometry over a sidecar index: a sidecar reopen with the artifact
  absent pages geometry windowed and is slower than a cold buffered load on
  the medium IFCs. Needs a conway API (open from the index, then adopt a
  buffered source).
- The page's sliced cache-key hash (+0.6 s before first pixels on PSB
  against hashing one ArrayBuffer).
- A live admission budget (§5.2, steps 7–8): the cap here is static per
  device; once the engine host exists it should admit buffered opens
  against live usage across workers. Designed in §5.2 ("Admission,
  backpressure, LRU", item 1): an open that would not fit buffered is
  admitted windowed, `Engine source: windowed (budget)`.
- Whether Firefox and Safari should stop holding the file at all above some
  size. Neither browser has been measured with the policy.
- **A windowed open that fails falls through to buffered, even over the
  cap.** conwayOpen.js#openDeferred buffers the whole file after any
  non-schema store-open failure; this pre-dates the policy, and the report
  now names it (`Engine source: buffered (…, windowed open failed)`, reason
  `windowedFailed`, distinct from in-process STEP's `windowedRefused`). On
  an over-cap file it buffers more than the cap. The page's OOM retry turns
  it off for its own open.

## 6. The one-worker-per-model choice, against the alternatives

- **One shared engine worker for all models** would need Conway to close a
  model without `freeGeometryProcessor()` and would still never return wasm
  pages to the browser; eviction could not free anything. Rejected for the
  same reason in-app-model-switch.md §7 chose one `IfcAPI` per model.
- **#1756's pool (N workers per model, sharded geometry)** is orthogonal.
  It is a parallelism change *within* one model; this is an isolation change
  *between* models. With an engine worker in place, the pool becomes "the
  session's worker plus N−1 helpers fed `OpenModelFromIndex`", and the main
  thread no longer has to hold its own engine. It stays behind its flag and
  conway#541's numbers.
- **MT wasm (pthreads)** needs cross-origin isolation, which breaks the
  Google and GitHub sign-in popups (Share#1610, #2047). Not used.


## 7. Migration plan

### Resume here (2026-11-18)

Picking `open-205` back up after a break? The release goal of this doc,
step 9, shipped: #2083 merged on 2026-11-07, and #2053 closed on
2026-11-18 with steps 1–6 and 9. What is left of this plan is steps 7–8,
now tracked on #2031, and they come with in-app model switching (#2011):

- **#2011 Phase 1a** switches models in-app, on by default since step F
  (`app/navigate.js#navigateToModel`; kill switch
  `?feature=disableSpaModelNav`, prod rollback `disableSpaModelNav`,
  in-app-model-switch.md §4.8). A switch is a close, one model at a time:
  a load the user leaves is aborted and its worker terminated (step A,
  with the close path of #2031; §4.5a there), the old viewer's dispose
  closes its registered model's session, and `modelSwitchMemory.spec.ts`
  checks that the old worker is terminated and the old model collected.
  What comes next is Phase 1b (switch is not close: sessions, `EngineHost`,
  eviction); #2011's body has the step list.
- **Phase 1b step 1, per-model sessions (#2019), is built** with one live
  session (in-app-model-switch.md §4.9, `session/modelSession.js`); it
  lists where it differs from §5.2's assumed session interface and the
  module-level per-load state that must move before cap N.
- **Slice 1a (#2319) put both engines behind one `Engine`**
  (`engine/Engine.js`): `EngineSession` is `WorkerEngine`, the kill-switch
  path is `ConwayEngine`, `ShareIfcLoader#parse` has one path, a model's
  read handle is `model.engine` (`model.ifcManager.ifcAPI` an alias until
  slice N), and `@bldrs-ai/conway/web-ifc` is imported only in `src/engine`.
- **Next is #2031, and its plan is [layering.md](../tracks/open-t200/layering.md) §7**
  (2026-11-23), tracked as Track `open-t200` (#2315), one sub-issue per
  slice ([snapshot](../tracks/open-t200/README.md)): the mechanical move and the lint rule first (M1, M2),
  then one `Engine` interface over both engines (1a) and `EngineHost` at
  cap 1 with the lease (1b). §5.2–§5.5 here are
  the engine layer's side of it.
- **Step 4's requirement on step 7 still stands:** an in-app switch must
  await `close()` before it evicts or re-stages the previous model's OPFS
  entry. The switch does not re-stage anything yet.
- **The source policy** (§5.6, Share#2139, 2026-11-11): a worker open is
  buffered under a device cap (or over the Blob store's held copy) and
  released to windows at the spill; windowed is the over-cap, sidecar-reopen
  and kill-switch path. Whether the cap is right is the open question
  (the measurements doc's §"Source policy as built").
- **STEP convergence** (§11), #2077 and #2078 (priority residency), then
  #2076, as before.

**Merged.**
- Steps 0–4: this doc (#2056), conway#540 (conway#759), protocol and
  client (#2057), IFC load in the worker (#2058), the sync-access-handle
  source (#2072).
- Step 6, STEP in the worker (#2067), with the one part-21 list
  (`engine/part21Formats.js`).
- #2065, the Properties panel crash fix (not a worker bug).
- #2074: one worker request per Properties table, and cache-hit refs.
  Closes #2070 and #2066.
- #2073 (#2038): GLB export capture through conway's file-order readers.
- #2079 (#2075).
- #2080: the conway `1.1636.766` pin, together with #2069.
- Step 5, the GLB capture in the worker (#2081): a worker load writes the
  same artifact, byte for byte, as a main-thread one (PSB checked whole,
  §7.1). Protocol v2 (§4). This was the last code blocker for the flip.
- The windowed STEP open and the index sidecar reopen, for both formats
  (conway#757 via conway#769, in conway `1.1639.773`; Share#2085; §7.1, §11). A STEP
  in OPFS now opens windowed in the worker. A worker load saves the
  model's index sidecar, and the next open of the same file comes up from
  it without a parse.
- Step 9, the flip (#2083, 2026-11-07).

How each step landed is in §7.1 and in the steps below.

1. **conway: recognise a worker** (conway#540): `WorkerGlobalScope` in
   `isWebPlatform`, `self.crossOriginIsolated` in `pThreadsAllowed`. Small;
   Share carries the prelude until it is pinned.
2. **Share: `src/engine/` protocol, worker entry, client.** The worker
   module, its esbuild entry (like `GlbWriter.worker.js`), `EngineSession`,
   and an in-process transport so Jest drives the same handler without a
   real Worker. `init` / `open` (index only) / `tree` / `props`. No product
   wiring.
3. **IFC load in the worker.** `ShareIfcLoader#parse` drives the session
   instead of `parseIfcWithConway`: previews, `indexed` → the worker-backed
   handle in `indexedModel`, the batch stream through `workerGeometryApi`,
   the `done` packet, `failed` classification and the forwarded log tally
   and wasm bytes. The GLB cache write is skipped under the flag in this PR.
   E2E: `navTreeAtIndex.spec.ts` and `conwayDirect.spec.ts` under the flag.
4. **Sync-access-handle source store.** In the worker,
   `createSyncAccessHandle({mode: 'read-only'})` backs the
   `StepExternalByteStore` (§3: PSB −20 % total, I/O 12.6 s → 3.2 s). It
   needs `OPFS.worker.js` not to hold a read-write handle on the same file
   while the engine reads it, and a Blob-store fallback where read-only
   handles are missing (Safari and Firefox not checked).
   *As built:*
   - The engine worker finds the File's OPFS entry itself
     (`engine/engineSources.js#findOpfsEntry`). It walks
     `navigator.storage.getDirectory()` for an entry with the File's
     `name` (`getFile()` names the File after its entry), `size` and
     `lastModified`. Nothing about the entry is sent from the page:
     WebKit cannot structured-clone a FileSystemHandle (bug 256712), so
     `OPFS.worker.js`'s replies keep their old shape. A File that did not
     come from OPFS (an upload kept in memory, an inflated `.gz`) matches
     nothing and gets the Blob store.
   - `openSourceStore` opens `createSyncAccessHandle({mode: 'read-only'})`
     on that entry. It keeps the handle only if the handle reports
     `mode === 'read-only'`: a browser that ignores the option opens an
     exclusive `readwrite` handle, which is closed at once. With the
     handle open, which freezes the entry, it checks `size` and
     `lastModified` against the snapshot again. Otherwise it falls back
     to the Blob store and gives the reason on the load report's
     `Engine source I/O:` line.
   - **The lock.** Even read-only, the handle holds a shared lock on the
     entry for the session, so the entry can't be removed, moved or
     written while the model is open (`NoModificationAllowedError`). A
     File snapshot locked nothing. So:
     - *Clear cache* closes every engine session first
       (`spawnEngine.js#closeAllEngineSessions`).
     - `OPFS.worker.js#deleteAllEntries` skips a locked entry and
       reports it, rather than aborting the clear partway.
     - The stale-commit remove in `downloadModelToOPFS` and
       `deleteModelFromOPFS` both answer with an explicit error for a
       locked entry. The first was an unguarded throw, the second an
       unhandled rejection behind a `deleted` reply. The page then loads
       from the network, as on any OPFS error.
     - Another tab re-staging or evicting a model this tab has open hits
       the same lock, and is handled the same way.
   - **Release.** When a sync-handle session's open has replied,
     `EngineSession#close()` sends `close` and waits for the reply, at
     most `ENGINE_CLOSE_TIMEOUT_MS` (1 s), before `terminate()`. The
     handler releases the handle after `CloseModel`. Any other session,
     including one still opening, is terminated at once, and its lock
     goes a little after `terminate()` returns. An open that doesn't
     adopt the store (buffered fallback, failed or refused open, a throw,
     a close that came first) closes it in a `finally`.
   - *Clear cache* therefore clears twice if it has to. `clearOPFSCache`
     resolves with what it skipped, and `ProfileControl` clears again
     once after `CACHE_CLEAR_RETRY_MS` (0.5 s). If entries are still held
     (another tab), it says so in the app's alert dialog
     (`cacheClearSkipped`) and keeps the local recents. It reloads only
     once the user dismisses the dialog. The startup sweep
     (`pruneLocalRecents.js`) drops the recents whose entries went.
   - **A requirement on step 7:** an in-app switch must await
     `close()` before it evicts or re-stages the previous model's entry.
     Today's switch reloads the page, so it doesn't need to; none of the
     existing callers await it, apart from `closeAllEngineSessions`.
   - Kill switch: `?feature=disableEngineSyncHandle`.
   - **The Blob store holds the whole file for the load** (Share#2092).
     Firefox and Safari have no read-only handles (`mode` is ignored, the
     handle comes back `readwrite`, and is closed), so their engine always
     reads through the Blob store. conway's windowed source reads PSB about
     4.7× over, and each Blob read is slow there (Firefox: 11 s of I/O). So
     over an OPFS entry, an open's Blob store reads the whole file once
     (`engineSources.js#makeBlobStore` `holdResident`, awaited before the
     parse) and copies every read out of that. The GLB writer's spill, the
     load's last sweep, releases the copy, and later property reads page
     windows from the File again. A load that schedules no writer (a GLB
     cache lookup that failed, a source with no cache key) sends the same
     spill, with no File, as soon as the parse resolves after `done`
     (`Loader.js#load`), so the copy never outlives the load either way,
     and is released exactly once (codex review of Share#2095). The copy is not taken off OPFS (a File
     already in memory reads cheaply), for a spill, or above
     `RESIDENT_SOURCE_MAX_BYTES` (1 GiB). A buffered fallback lets it go
     before it reads the file for itself. The `Engine source I/O:` line
     says `whole file held, N reads from memory`, or why not. Kill switch:
     `?feature=disableEngineResidentSource`. Numbers in §7.1, "Blob store".
5. **GLB writer capture in the worker.** The `capture` job (properties,
   spatial tree, face ids), then spill and release worker-side, then the
   flag's cache write turns on. E2E: `batchedGlbCache.spec.ts` under the
   flag (cache hit after a worker load opens with properties).
   *As built* (#2053 step 5, for IFC and STEP alike):
   - **One capture job, one copy of the code.** The writer's engine
     captures — the spatial tree with its names, the element-properties
     container, and STEP's geometry-identity table — are
     `engine/glbEngineCapture.js#captureEngineExtensions`. A main-thread
     load runs it over `viewer.IFC.loader.ifcManager`, as before. A worker
     load runs it inside the worker, as the `capture` op, over the worker's
     own engine (`ifcManagerOver(api)`), and gets the result back in one
     reply with the container transferred. `glbExport.js#exportAndCacheGlb`
     takes it as its `capture` argument. Everything else in the artifact
     (geometry, instance tables, title, coordination frame) comes from the
     main-side scene, which a worker load builds the same way, so the
     writer did not otherwise change.
   - **The split it needed.** The capture used to live in
     `bldrsElementProperties.js` with the GLTFLoader reader, which imports
     the store (for its legacy-format alert); the store touches `window` at
     import, which would kill the worker at evaluation. The capture and the
     wire format moved to `bldrsElementPropertiesCapture.js`; the reader
     stayed. `engine/engineWorkerImports.test.js` asks esbuild for the
     worker bundle's real import graph and fails on any store, React, MUI,
     three or `.jsx` module in it.
   - **Yield.** In the worker the element-properties sweep gives the event
     loop a turn with the handler's own tick (`yieldToEventLoop`), not
     `scheduler.yield()`, whose continuation would go ahead of the page's
     queued requests and hold a Properties read until the sweep ended.
   - **Spill.** The writer's `finally` sends `spill {file}` with the OPFS
     File the model came from, as a main-thread load calls
     `spillModelSource`. A windowed open (an OPFS IFC) already reads through
     its store and answers `windowed`. A buffered one (every STEP, and an
     IFC whose windowed open fell back) is released to windows over a store
     the worker opens on that File through `openSourceStore`: the read-only
     sync access handle where it can be had, so it takes the same OPFS lock
     as step 4's windowed open, and `EngineSession#spill` records the kind
     so `close()` releases it politely.
   - **Release.** The worker's native geometry is still released at load
     end, not in the writer's `finally`: the writer reads geometry from the
     scene, and the engine only for properties.
   - **A failed capture writes nothing.** If the `capture` request rejects
     (the session closed under the idle writer), the write is skipped: an
     artifact without its properties would serve an empty Properties panel
     to every later cache hit. Each capture's own soft failure is still a
     null, as on the main thread.
   - **The colour column is float64.** Comparing the two engines'
     artifacts for PSB byte for byte found the captured extensions
     identical (`BLDRS_spatial_tree`, and the 7,458,553 B
     `BLDRS_element_properties` container, which is also main's resident
     capture). The one difference was colour: the batch encoder
     (`engineStream.js`) sent placement colours as float32, while the
     main-thread engine hands conway's doubles to the builder as they are,
     so a worker load's materials and instance tables differed in the 8th
     digit (`0.21586050010324417` vs `0.21586052771560016`; 4 B on 86 MB).
     The column is now float64, which costs 16 B per placement (about
     375 KB on PSB).
   - **#2038 first.** The capture's sync `getLine` dropped every record
     outside the resident windows of a windowed source, and every worker IFC
     load is windowed. #2073 fixed that first, for both engines.
   - **Memory.** The `capture` reply carries `wasmBytes`, like every reply
     the budget reads (§5.2). The capture's own transient JS heap is not
     part of the estimate; it is measured below.
   E2E: `engine/engineGlbCapture.spec.ts`, desktop and mobile, IFC and
   STEP. It loads the model on the main-thread engine and keeps its
   artifact, then clears OPFS and loads it in the worker
   (`watchEngineWorker`), and requires the same artifact byte for byte.
   It then exports it as Pro and checks that the file carries the tree and
   the properties, and reloads it as a cache hit whose Properties come from
   the artifact. The cache hit's reference rows rendering `null` (#2066) is
   a known issue there, not asserted.

6. **STEP in the worker.** Buffered source transfer, the occurrence-path
   column, `includeSolids`. E2E: `indexStepLogo`, `stepVisibility` under the
   flag.
   **Landed** (2026-11-04) as a generalisation, not a twin:
   `engine/engineIfcLoad.js` became `engine/engineModelLoad.js`
   (`createEngineModelLoad({format})`), and `ShareIfcLoader#isEngineWorkerLoad`
   takes every loader type `engineFormatOf` maps (`ifc`, `ifczip`, `step`,
   `stp`). That list is now the ONE part-21 list
   (`engine/part21Formats.js`), which `Loader.js`, `modelArchive.js` and
   `ShareModel.js` also read instead of three copies of their own. No STEP
   branch was needed: step 3 had already put the occurrence-path column in
   the batch encoding and forwarded `includeSolids` through
   `EngineSession#propertiesApi`, and conway's compat `IfcAPI` routes AP214
   behind the same calls. Two fixes to shared code came out of it, both
   about STEP's data:
   - **An empty occurrence path survives the boundary.** A root-level
     instance's path is `[]`, which the root-pick and root-row logic tell
     from "no path" (#1901, #1909). The encoder sent a zero-length run, and
     no columns at all when every path was empty, so the page saw "no path".
     A per-placement `pathPresent` column now keeps the two apart
     (step-occurrence-selection.md has the details).
   - **Bytes are transferred, not copied first.** A STEP is always buffered,
     so the copy held the whole file twice on the page for the length of the
     open. Only a failed open's message reads the source again, and it needs
     only the header and size (`openFailureSource`).
   `format` crosses as a label only: the `open` request, the `done` packet,
   and the `engine worker pump: format=… (by suffix)` line. It decides
   nothing, because a suffix is no evidence of the schema. The Loader's
   header sniff (`Loader.js#canOpenFromStore`) already picks the source
   kind: a File for a real IFC, bytes for a STEP. The worker opens whichever
   it is handed.
   E2E: `engineModelLoad.spec.ts` (STEP load, per-occurrence tree and scene
   selection, properties), worker legs in `navTreeAtIndex.spec.ts`,
   `indexStepLogo.spec.ts` (colour, world space) and
   `stepVisibility.spec.ts` (eye, Isolate and its reopened link, scene
   pick) and `assistTools.spec.ts` (isolate in a root-only file, which needs
   the empty path), desktop and mobile.
   Left for later: the GLB cache write for both formats (step 5, since
   landed in #2081). For STEP only, a windowed open and an index sidecar
   were left too, and have since landed (conway#757, Share#2085; §7.1).
   Measured on four STEP models from 4 to 111 MB, with the loop frozen:
   - main-thread long tasks during the load fall from 5.8–36 s to 3–4.5 s;
     what is left is page boot and the end-of-load assembly;
   - Geometry is unchanged within the spread;
   - a small model's index comes about 1 s later, from the worker's spawn
     and cold compile;
   - the page heap is 30–73 % lower.
   The table is on #2067.
7. **Sessions own their worker.** Now #2019 (Phase 1b step 1), and
   behaviour neutral there: the engine moves from the viewer to the model
   session, with one live session, so a switch still closes. Keeping the
   old worker on a switch, and the background batch policy (§8 item 1),
   moved into step 8's item 3 (slice 3b), under `workspace` (#2011
   decision 6).
8. **`EngineHost`: close, cap, eviction, rehydrate** (#2031; refreshed
   2026-11-19, §5.2–§5.5; re-sliced 2026-11-23 for the six layers).
   **[layering.md](../tracks/open-t200/layering.md) §7 is the slice plan**: thirteen slices,
   each green on its own. Each is behaviour neutral or behind a flag with
   a kill switch, but V and 1a, which have no flag and say what they
   change. In order:

   | Slice | What |
   |---|---|
   | M1, M2 | the mechanical move (the model out of `viewer/`, the engine's helpers down into `engine/`, `viewer/tools/` up to the UI) and the lint rule that holds the layers |
   | V | delete the `?view=` rules stack (§8 item 7) |
   | 1a | the `Engine` interface; `EngineSession` → `WorkerEngine`; `ConwayEngine` (the kill-switch path behind the interface); the Conway import rule |
   | 1b | `EngineHost` at cap 1 and the lease, replacing today's close |
   | N | the `ifcAPI` identifier out of everything but `src/engine` |
   | R | a reporter per load |
   | 2a, 2b | session roots; attach and detach |
   | 2c–2e | one viewer for the page (§5.2a) |
   | 3a | session state, the store as its projection, `load(source, ctx)` |
   | 3b | cap N under `workspace` (item 3 below) |
   | 4 | eviction that keeps the session; rehydrate (item 4 below) |
   | 5, 6 | the drawer; budget tuning (items 5 and 6 below) |

   What stays here is the engine side of 3b and 4, and 5 and 6. Every E2E
   below is `describeMobileAndDesktop`, Chromium (CDP), and asserts what
   was terminated or collected, never a heap number (STYLE.md §"Assertions
   must be able to fail"): a worker's Playwright `close` event, and a
   `WeakRef` to the model cleared after `HeapProfiler.collectGarbage`
   (`utils/gc.fixture.js`, as `modelSwitchMemory.spec.ts` does today). Each
   is shown red with the step it tests reverted, in its PR's break-it
   table. Each runs on cap 1 and on cap N: cap 1 is a plain link and
   `?feature=workspace,disableBackgroundSessions`; cap N is
   `?feature=workspace`. (Items 1 and 2 of the 2026-11-19 list, `EngineHost`
   at cap 1 and one viewer, are layering.md's slices 1b and 2a–2e.)

   3. **Cap N under `workspace`, with the kill switch** (slice 3b). The
      predicate goes live; `host.mayKeepInBackground` answers yes under it.
      Background
      loads keep pumping; batches queue and are assembled on foreground or
      in idle slices; the per-session queue cap; admission with the live
      estimate (the `heldSourceBytes` field added to the engine's replies),
      windowed-for-budget, then backpressure. **Past the count or the
      budget, the LRU background session is closed, not evicted**: the
      scene drops with the engine, so nothing needs a rehydrate yet, and an
      over-cap session reopens through its GLB cache hit. Two callers
      close: past the scene count, the session host in `open()`, before
      the incoming load acquires, which also covers a mesh model with no
      lease; past the byte budget, this host evicts the lease and the
      session closes itself in `onEvict` (layering.md §4.5 and §7, 3b,
      which has the scene-count tests). Selection restore
      on return (#2019's deferred acceptance). A detached root's batches
      are assembled with paint requests suppressed, because the
      render-on-demand hooks are page-wide (layering.md §7, 3b). Its
      prerequisites are earlier slices now: one viewer on by default (2e),
      since `NO_SINGLE_VIEWER` keeps cap 1 while it is off; no module-level
      per-load state (R, 2a, 3a); the session's own state (3a).
      - *Unit (`EngineHost.test.js`, a fake `Engine`):* cap N keeps
        A's lease on a switch; the fourth owner closes the least recently
        foregrounded by tier; the foreground owner is never chosen, even
        alone over the budget; queued bytes count, and reaching the budget
        pauses the background pump before anything is closed (red with
        `update({queuedBytes})` ignored); an owner with an in-process
        lease is closed on a switch under cap N.
      - *E2E, #2023's first case:* A → B → C leaves three live engine
        workers; closing A and B (through the dev hook until the drawer,
        Phase 1b step 3, has a close) terminates their workers and clears
        their model `WeakRef`s, leaving C's. On cap 1 the same walk leaves
        one at each step.
      - *E2E, #2019's deferred acceptance:* background finish: A held at its
        pump (`__bldrsTestHoldGeometryPump`), switch to B, release A; A's
        worker stays (no `close` event) and A's session reaches ready; back
        to A, A is complete with no new worker and no "Opening model" line.
        On cap 1, A's worker closes at the switch (step A's assertion).
        Selection restore: select in A, switch to B, select there, back to
        A; A's selection and its `#sel:` term are A's, and B's is untouched.
        On cap 1 the return is a reopen and asserts today's behaviour.
      - *E2E, the count cap:* with the test override `maxLiveEngines: 2`,
        opening C closes A (worker `close`, `WeakRef` cleared) and B and C
        stay live.
      - *E2E, backpressure:* with a lowered byte budget, B's open pauses A's
        background pump (A's worker stays, its batch count stops), and
        foregrounding A completes its load.
      - *Rollback:* `disableBackgroundSessions` `isActive: true` in
        `FeatureFlags.js` (the static read beats every URL); one session:
        `?feature=disableBackgroundSessions`. Both leave the drawer.
   4. **Eviction keeps the session; lazy index-only rehydrate** (slice 4).
      Past the budget, tiers 1–3 are evicted (`terminate()`, then
      `lease.onEvict`: the scene kept, the read model swapped to the
      artifact's) and tier 4 goes to "paused — will resume"; past the
      scene count, the session host's step in `open()` changes from a
      close to `session.dropScene()`, and that session is dormant (the
      scene tier, §5.3; its tests are layering.md §7, 4).
      `session.ensureEngine()` through `host.acquire`, from the sidecar
      (§5.3), re-parse fallback, eager on foreground for a session without
      an artifact. The Reported Conditions of §5.5 land here.
      - *Unit:* evicting terminates the worker and keeps the scene, tree,
        selection and refs; a property read after eviction answers from
        the artifact; a `deref` rehydrates once, however many reads ask at
        once; a missing sidecar re-parses; a failed rehydrate is one Sentry
        event and the panel keeps the artifact's answers.
      - *E2E, #2023's eviction case:* a lowered byte budget makes opening C
        evict A (tier 1). A's worker `close` fires; B and C stay live; A's
        model `WeakRef` is *not* cleared (its scene is kept, the assertion
        that tells eviction from close). Back to A: no "Opening model"
        line, the selected element's psets answer from the artifact with no
        new worker; a nested reference then spawns one worker whose report
        line is `Engine: rehydrated from the index sidecar`.
      - *E2E, paused — will resume:* a budget too low for A's background
        load: A's worker closes, A's session reads paused — will resume, and
        foregrounding A completes it from the sidecar or a re-parse.
      - *Rollback:* as slice 3b; and one session can keep slice 3b's
        close-past-cap with `?feature=disableSessionEviction`, for a bug
        that looks like an evicted model answering wrong.
   5. **The ProjectsDrawer shows the states** (#2011 Phase 1b step 3; not
      #2031's, listed for the order): live, loading, paused, paused — will
      resume, evicted, dormant, failed; and the drawer's close. The E2Es of
      slices 3b and 4 move from the dev hook to the drawer.
   6. **Budget tuning.** Re-fit the estimate's constants and confirm the
      defaults, with the bench (`tools/bench/sourceModes/`), which already
      records every input except two: (a) two and three engines loading at
      once in one page (not measured, §10), and (b) the main-side scene's
      bytes per model, the scene tier's input, beside its GPU memory on the
      owner's hardware. Then the phone numbers on a real phone. A change of
      constant needs its measurement in the PR body; no behaviour flag.
9. **Default on**, after steps 2–6 have merged. Steps 7–8 are only needed
   for in-app model switching (#2011), so they do not gate it. The in-process transport
   stays as the fallback for browsers without module workers, and
   `?feature=disableEngineWorker` is the kill switch. Before it: delete the
   `?view=` rules stack (§8 item 7).


### 7.1 Progress and known issues

Kept current by every code PR in the chain. Numbers are the PRs' own, with
`RAF_THROTTLE_MS=3600000`.

| Step | State |
|---|---|
| 0 — this doc | merged (#2056) |
| 1 — conway#540 | merged (conway#759, published `1.1633.540`) |
| 2 — protocol, worker entry, client | merged (#2057) |
| 3 — IFC load in the worker | merged (#2058). PSB, n=3, flag off → on: main-thread long tasks over 50 ms 418 → 23, time blocked 63 → 12 s, Geometry 48.3 → 40.6 s, Total 94.8 → 83.3 s, page heap after load 2130 → 889 MB (the worker's own JS heap 65 MB). Buffered tree-at-index: SEESTRASSE 8.05 → 4.60 s, sp-231MB 37.4 → 11.9 s |
| 4 — sync-access-handle source | merged (#2072). Measured flag on, Blob store vs read-only sync handle, at medians: PSB (n=3) source I/O 19.1 → 3.8 s, Parsing 28.3 → 20.2 s, time to index 44.2 → 35.8 s, Total 96.5 → 82.9 s; sp-231MB (n=2) I/O 8.5 → 2.1 s, Parsing 14.0 → 9.9 s, Total 64.8 → 60.1 s; SEESTRASSE (n=1) I/O 0.32 → 0.07 s, Total flat. Geometry, main-thread long tasks and page heap unchanged. Every leg was windowed, checked by its `Engine source I/O:` line, in a persistent profile. Caveat: the Blob store's per-read time includes event-loop wait as well as I/O (each read is an async round trip), so the I/O figures are not pure I/O. The wall-clock stages (Parsing, time to index, Total) carry the claim |
| 6 — STEP in the worker | merged (#2067). Since conway#757 (Share#2085) a STEP staged in OPFS opens windowed in the worker through step 4's sync access handle, as an IFC does; conway faults AP214's synchronous reads in through the store's `readSync`. Measured: in the reopen table under §11 ("Measured, conway#757") |
| 5 — GLB capture in the worker | merged (#2081), after #2073 (#2038: the capture dropped every record a windowed source did not have resident). n=1 each, flag off → on, `RAF_THROTTLE_MS=3600000`, persistent profile. PSB: time to artifact 171.6 → 118.9 s; the writer 38.1 → 31.0 s, of which the worker's capture is 7.6 s; main-thread long tasks before ready 536 (81.6 s) → 35 (13.7 s), and during the write 71 (7.85 s, max 624 ms) → 4 (0.43 s, max 208 ms); page heap (`performance.memory`) at the end 1,127 → 522 MB, sampled peak 1,766 → 848 MB; the worker's JS heap peaked at 140 MB, beside 899 MB of wasm. 58 MB STEP: time to artifact 47.6 → 43.2 s; writer 7.6 → 6.8 s, capture 2.5 s; long tasks before ready 292 (35.8 s) → 10 (3.6 s), during the write 4 (0.35 s) → 1 (0.07 s); page heap at the end 688 → 148 MB; worker JS heap peak 322 MB beside 515 MB of wasm. **Byte identity:** after the batch colour column became float64 (step 5 above), the two engines' whole PSB artifacts are identical, 86,341,686 B each with one SHA-256 (re-measured 2026-11-06, n=1 per side, on a less loaded machine: time to artifact 68.6 → 58.9 s, long tasks before ready 222 (27.8 s) → 13 (6.7 s)). Review fixes: protocol v2, so a stale cached worker without `capture` is refused at hello and the load runs in process (§4); `close()` waits for a spill still in flight before it decides whether to close politely |
| 8 (part) — index sidecar reopen | Share#2085: a worker load from an OPFS entry saves conway's index sidecar, and the next open of the same entry opens from it instead of parsing, IFC and STEP alike (`engine/engineSidecars.js`). It is written after the first load, not at eviction (§5.3). Since Share#2093 a browser without `createWritable` (Safari before 26) writes it through a read-write sync access handle, and a failed save says why on the `Engine index:` line. Eviction itself is still deferred. The reopen runs conway's full source check, which the owner chose over the sampled one. Measured with it: on the 58 and 106 MB STEP models, Parsing goes from 1.3–1.8 s and 2.6–2.8 s to 0.31–0.39 s and 0.65–0.70 s, and the tree arrives 2.1–3.3 s and 2.9–3.7 s sooner (§11) |
| 7 | merged (#2247, 2026-11-23): per-model sessions with one live session (in-app-model-switch.md §4.9) |
| 8 | not started. #2031, designed in §5.2–§5.5 (refreshed 2026-11-19, and for the six layers on 2026-11-23) and sliced in [layering.md](../tracks/open-t200/layering.md) §7 |
| 9 | in flight (#2083, draft): default on, the kill switch and rollback, the main-thread routes. #2061 explained (below). Waits on the real-GPU, Safari and Firefox checks |

**Picking during the pump (#2084).** The durable batches are pickable from
the row they are written, on both engines (§11, "Pick during the pump").
Time to first pickable, cold load, render loop throttled, n=2, ms:

| model | engine | before | after |
|---|---|---|---|
| Arty_Z7 (58 MB STEP) | worker | 18241 / 18828 (at ready) | 3470 / 3664 (first durable row) |
| Arty_Z7 | main thread | 18956 / 19278 | 19211 / 19143 (the pump blocks the page) |
| PSB (IFC) | worker | 7852 / 7696 (preview) | 7653 / 7692 (preview) |
| PSB | main thread | 15240 / 7467 (preview) | 7650 / 7385 (preview) |

On PSB the first pickable thing was already its preview; the durable
batches are now pickable from ~19–24 s instead of at ready (~46–56 s). On
the main-thread engine a STEP pump holds the page from its first batch to
ready, so the gain needs the worker (step 9).

**Blob store (Share#2092).** Firefox and Safari read the source through
the Blob store (step 4). The owner's check of the flip had PSB's
`Engine source I/O` at 738 reads, 3374 MB, 11.09 s in Firefox (Parsing
41.4 s, against 30.8 s on prod's main-thread engine) and 900 reads,
4022 MB, 2.94 s in Safari. Where the reads come from, from a trace of every
store read on one Chromium load: the parse sweeps the file once (~8 MiB
reads). At its end comes a burst of ~540 reads, 2.2 GB in ~4 s: two
interleaved whole-file sweeps about ten 4 MiB chunks apart, whose reuse
distance (~20 chunks) is just over conway's 16-chunk window, plus several
sparse passes over the same hot chunks. Then the pump re-reads ~1.2 GB in
file order. Replaying that trace against a store-side cache: an LRU of
256 MB still reads 3.3× the file, 512 MB 3.0×, and a never-evicting 512 MB
cache 2.6×. Only the whole file reads 1×, because the passes are cyclic
sweeps longer than any partial cache. So the store holds the whole file for
the load. Measured in headless Chromium with the Blob store forced
(`disableEngineSyncHandle`), PSB, persistent profile, render loop frozen,
n=3 interleaved, medians:

| PSB, cold (parse) | Blob store, windowed (before) | Blob store, whole file held | sync access handle |
|---|---|---|---|
| `Engine source I/O` | 892 reads, 3990 MB, 7.17 s | 1 read, 861 MB, 0.69 s (+ ~927 copies from memory) | 926 reads, 4126 MB, 2.24 s |
| Parsing | 16.7 s | 14.0 s | 14.0 s |
| Geometry | 24.9 s | 23.1 s | 22.8 s |
| Total | 48.9 s | 45.1 s | 44.0 s |

The reopen from the sidecar (n=1) gives the same picture: the windowed Blob
store read 973 reads, 3874 MB, 7.36 s (Parsing 5.9 s, Total 37.8 s), the
held file 0.68 s (Parsing 3.2 s, Total 33.0 s), and the sync handle 2.15 s
(Parsing 3.2 s, Total 32.4 s). Starting the whole-file read in the
background instead of awaiting it was worse: it contended with the parse's
own reads (n=3: Parsing 15.6 s, Total 47.1 s), against ~0.7 s of
"Opening model" it saved. The cost is memory: the worker holds the file
(861 MB on PSB) beside the engine from the open to the GLB writer's spill
(or to the end of the parse, when no writer runs),
which is what prod's buffered main-thread open held for every model. Not
yet measured: Firefox and Safari themselves, which the deploy preview's
A/B (`?feature=disableEngineResidentSource`) settles. What belongs in
conway: the amplification itself, which costs every store (the sync handle
also reads 4.7×). The post-parse double sweep and sparse passes could be
fused or narrowed, and the adaptive window grows too late for the burst
(its 4,096-request interval; it reached 252 MB only in the pump). No conway
change is made here.

**Known issues.**

- **#2061: worker JS heap on sp-231MB. Explained: a measurement
  artifact.** The 350 MB was the heap before a collection took effect,
  not live data. Measured again on #2081's merge and on #2058's own
  commit (b0feb246), with `HeapProfiler.collectGarbage` awaited before
  each `Runtime.getHeapUsage`:
  - after an sp-231MB load the worker holds **56.5 MB** of live JS heap,
    at 0.3, 3, 10 and 30 s after ready, on the sync handle and on the
    Blob store alike;
  - the un-collected heap sampled during the load peaks at 343–361 MB,
    which is the old figure.
  A heap snapshot after the load (sp-231MB, 2.0M nodes) holds 727 MB in
  all, of which 662 MB is ArrayBuffer backing stores, outside
  `usedSize`. That is 515 MB of wasm memory plus the conway model's
  typed-array columns. The model retains 186 MB:
  - the windowed provider's 64 MB of resident chunks;
  - about 40 MB of record-index columns (2.6M records);
  - a 20.7 MB express-ID map;
  - 16 MB of `demandAggregates_` still held after the pump ends, the one
    part that looks droppable (a conway ask);
  - a 4.4 MB type index.
  So `ENGINE_JS_BYTES_PER_SOURCE_BYTE` (§5.2) needs no outlier allowance
  for IFC. STEP is the exception. Measured before #2085, when a STEP was
  still opened buffered and resident: its worker held 286 MB of live JS
  heap after a 111 MB STEP load (229 MB at ready). The same state sat on
  the page with the flag off (page heap at the end 327 MB), so it moved
  rather than grew. #2085 has since made the STEP open windowed. Its peak
  is unchanged (#2085's measurement), and the heap after load has not
  been measured again.
- **#2070: each engine round trip waits behind a main-thread frame. Fixed
  for the Properties panel (#2074); the general cost stays.** A worker
  reply is a main-thread task, so with the render loop running it waits
  for the frame in progress. The engine itself answers a read in under
  1 ms inside the worker. In headless Chromium (software GL) the round
  trip measured 127–217 ms, and 0.34 ms with rAF frozen. On a GPU the cost
  is up to a frame per round trip. That makes sequential reads
  frame-bound, and the Properties panel made one per top-level reference
  (ifclib's `deref`) and one per property of each property set.
  - *The fix.* The panel's tables are resolved next to the engine:
    `engine/propertyTable.js`, behind the `propertyTables`
    op (§4), one request per table, and one for all of an element's
    property sets. The reply holds only what renders: past
    `MAX_NESTED_TABLE_DEPTH` an entity is its `#id TYPE`, past
    `MAX_ARRAY_MEMBERS` an array is `… and N more` and its other members
    are never read, and an all-primitive array arrives joined. A reference
    to a rooted entity is read shallow (its name is all that shows), and
    nothing under a key no table shows (`Representation`,
    `ObjectPlacement`, …) is resolved, which also bounds how long one
    `propertyTables` op holds the worker's pump, `pause`, `abort` and
    `close`. Checked against the old renderer on seven conway dumps (18.5k
    records): identical HTML from the old renderer, the page and the
    session, but for the intended `null` → `#id`. The same
    module resolves on the page for every model without an engine session
    (the main-thread engine, a GLB cache hit), and `itemProperties.jsx`
    renders either result, so the table cannot depend on where it was
    resolved. Format-neutral: a STEP element's table takes the same op.
    The page finds the op as `properties.resolvePropertyTables`, present
    only when `init`'s `capabilities.propertyTables` says the engine
    serves it, so a stale worker bundle keeps the per-read path.
  - *Measured* (headless Chromium, SwiftShader, persistent profile, render
    loop running, every worker leg on the sync access handle): time from
    selecting the IfcGrid, with the Properties panel open, to its table
    showing every axis.

    | | main-thread engine, before → after | worker, before → after |
    |---|---|---|
    | grid-axes.ifc (2 axes), n=3, median | 133 → 254 ms | 958 → 814 ms |
    | PSB grid #9414151 (42 axes), n=2 | 17.9 / 25.7 → 20.6 / 24.3 s | 282 / 220 → 15.3 / 17.2 s |

    On PSB a SwiftShader frame of the 8.8M-vertex scene is seconds long,
    so 40+ sequential round trips took minutes; the worker now matches the
    main-thread engine. The main-thread engine is unchanged within the
    spread on PSB. On grid-axes both columns are within a frame or two,
    which is the measurement's resolution there (3 round trips before, 2
    after). The user's check of the deploy preview on PSB agreed: the grid's
    table "loaded quickly".
  - *Left.* Any other sequential per-id read loop through the facade still
    pays a frame per read. And the page still paints every frame while
    idle. `renderDemand.js` (#2052) paints on demand only during a load, on
    purpose: after it, cut planes, isolation, looks, hover and splat
    sorting change the picture without asking for a paint. Making idle
    rendering on demand means each of those has to ask. That is its own
    change (follow-up), and it would help the whole page, not only the
    worker.
- **#2066: on a GLB cache hit every reference row read `null`. Fixed
  (#2074).** The panel resolved references through
  `model.ifcManager.ifcAPI`, which on a cache hit is the viewer's engine,
  with no model open. `propertyTable.js` reads through the model's own
  `getItemProperties` instead: on a live model the same engine call as
  before, and on a cache hit its `BLDRS_element_properties` records. A
  reference outside those records shows as `#id`.
- **#2063: the Properties panel took the app down. Fixed, and not a worker
  bug.** Selecting an `IfcGrid` with the panel open replaced the page with
  "Oh no!" on both engines. ifclib's `deref` resolves a reference to an
  entity with no GlobalId (an `IfcGridAxis`) into the whole entity object,
  and the panel handed an *array* of those to React, which throws #31. It
  surfaced under the flag because that was where a large model was being
  burned in. The panel now renders every resolved value safely, derefs a
  copy (deref rewrites in place), and has its own ErrorBoundary.
- **The properties hand-off at load end.** The panel reads through
  `selectReadModel`: the indexed model's worker facade while geometry
  streams, then the finished model. At the swap, the panel's effect re-runs
  and reads the selection again, while answers to earlier selections can
  still be in flight from the worker. `Properties.jsx`'s `isStale` guard
  drops any answer for a selection or model that is no longer current.
  Its test is a unit test: a slow earlier answer arrives after the current
  one, and the test fails with the guard removed.
  `PropertiesNestedRefs.spec.ts` is only a smoke test of the same
  hand-off: rapid NavTree clicks under the worker, with the geometry
  released mid-burst. It passes even with every isStale check removed.
  The worker answers in order, so in practice nothing arrives out of
  order.

  The panel's ErrorBoundary is not keyed on the selection, so the panel
  stays mounted. It resets itself when the selection or the read model
  changes, so a failure at the indexed model is retried with the finished
  one. No crash was traced to this race; #2063 is a different bug.

### 7.2 Step 9 (default on): the criteria

Every item needs either a merged PR or a measurement in a PR body.

1. **Steps 2–6 merged**, each behind the flag, each with its desktop and
   mobile E2E. Met: step 5 merged last (#2081). Steps 7–8 are deferred (they serve
   in-app switching, not the flip), so the memory-after-evict check in
   item 5 waits with them.
2. **The `?view=` rules stack: settled by routing, not deleted (#2083); since deleted, slice V (#2318).**
   A load whose URL names a known `?view=` rule set runs on the
   main-thread engine (`engine/engineRoute.js`), where IfcViewsManager
   reads it, and the report says so (`Engine: main thread (?view= rules
   need the main-thread engine)`). Legacy `?feature=bot` routed the same
   way until #1675 deleted its eval; it now loads in the worker. Deleting the stack (§8 item 7, WidgetApi's
   `ChangeViewSettingsEventHandler` first) is now a cleanup, not a gate.
   **Superseded on 2026-11-24 (owner): the stack is deleted, with no
   replacement and no flag** (layering.md §7, slice V; "it was old client
   work that never went anywhere"). And the sentence above is wrong about
   what the routing bought. IfcViewsManager reads nothing on the
   main-thread engine either: it only sets fields on `ShareIfcManager`'s
   empty `parser` object (`ShareIfcManager.js:70–77`), which no parse
   reads, and both engines parse through Conway directly. So since the
   Conway-direct path became the default, a `?view=` link has coloured
   nothing; the routing only made it load on the slower engine. With the
   stack gone, `MainThreadReason.VIEW_RULES` goes, a `?view=` link loads
   in the worker, and the Widget API's `ChangeViewSettings` answers
   success and does nothing. **Done in slice V (#2318).**
3. **#2061 explained. Met:** a measurement artifact, 56.5 MB live after
   GC (§7.1).
4. **#2070 fixed. Met, by #2074.** One round trip per Properties table: a
   `propertyTables` op that runs in the worker, applying the depth limit
   and `MAX_ARRAY_MEMBERS` there so it returns only what renders. What
   stays is the general cost of a frame-bound round trip for any other
   sequential read (§7.1); it does not gate the flip.
5. **No load regressions, flag off vs on.** PSB n≥3, plus SEESTRASSE and
   sp-231MB, at `RAF_THROTTLE_MS=3600000`. *Measured on #2083* (flag off
   = `?feature=disableEngineWorker`, n=2, PSB n=1, every IFC leg
   windowed): main-thread long tasks fall on every model, and Total
   improves from sp-231MB up (SEESTRASSE is +0.2 s, the worker's spawn).
   Peak renderer memory is equal or lower on large models, and
   higher by the worker's floor (45–85 MB, §3) on small ones. Memory after
   load is equal, not lower, until steps 7–8 can terminate a worker. The
   table is on #2083.
   - main-thread long tasks over 50 ms, time to index, Geometry, Total;
   - memory after evict (the #2023 E2E; with step 8);
   - each windowed leg checked to have actually run windowed (its
     `Engine source I/O:` line present), with a persistent profile, since
     an incognito-like context's small OPFS quota silently falls back to
     a buffered open.
6. **The kill switches work in a real browser.** Met in headless
   Chromium (`engine/engineRoute.spec.ts`, desktop and mobile); the human's
   browser check is item 7:
   - `?feature=disableEngineWorker` puts the main-thread engine back;
   - the in-process fallback runs when a worker cannot start (unit-tested
     since #2058; the E2E stubs `Worker` to throw for `Engine.worker.js`);
   - `disableEngineSyncHandle` puts the Blob store back (step 4).
7. **Other browsers checked by hand.** Safari and Firefox: module workers,
   `createSyncAccessHandle({mode: 'read-only'})` or its Blob fallback, and
   one model opening end to end with properties. Recorded in the step-9
   PR.
8. **The flag-on E2E suite green** as the default. Met locally on #2083
   (477 passed). The few failures were flakes, an environment issue, and a
   pre-existing previewInteraction flake on both engines; #2083 lists them:
   - navTreeAtIndex, previewInteraction, engineIfcLoad, engineSyncHandle;
   - PropertiesNestedRefs, the STEP specs from step 6;
   - batchedGlbCache, the cache hit after a worker load (step 5).

**Rolling back** (since step 9, #2083). Where a load's engine runs is one
decision, `engine/engineRoute.js#mainThreadEngineReason`.
- *Prod-wide:* set `disableEngineWorker` to `isActive: true` in
  `FeatureFlags.js` and deploy. The route reads that static value before any
  URL flag, so every load goes to the main-thread engine, including links
  that still carry `?feature=engineWorker`. Its report line says
  `Engine: main thread (the engine worker is rolled back: …)`.
- *Not* `engineWorker: false`. `isFeatureEnabled` ORs a static flag with
  the URL, so that would leave every `?feature=engineWorker` link in the
  worker (Codex review on #2083).
- *One session:* `?feature=disableEngineWorker`.
- Nothing else routes to the main-thread engine. `?view=` rule sets did,
  until slice V (#2318) deleted them, and the legacy bot chat did, until the
  Assist port (#1675) replaced its eval with the tool registry, which reads
  either engine.

## 8. Decisions (2026-11-03)

These were the open questions of the scope. The user decided each one.

1. **Background geometry: (b).** A background model keeps pumping in its
   worker. Its batches queue main-side unassembled, and are assembled when
   it is foregrounded or the main thread is idle. Rejected: (a) assembling
   while hidden, which costs foreground frames; (c) stopping at the index,
   which loses the "come back to a finished load" promise of
   in-app-model-switch.md §4.0.
2. **Caps and budget: the recommended defaults** (§5.2), as named
   constants with their reasoning in a comment: 3 live engines on desktop;
   half of `navigator.deviceMemory`, else 4 GiB or 1 GiB. Two refinements
   from review, both provisional and revisable:
   - Queued, unassembled background geometry counts against the budget, and
     reaching the budget pauses background pumps (backpressure) before
     anything is evicted.
   - Phones have no fixed engine count; the budget governs them. On every
     platform a switch may run another engine while the total fits. When
     it does not, the still-loading background model goes into a
     user-visible "paused — will resume" state and resumes from OPFS when
     foregrounded. A finished background load is promised when the budget
     allows, and otherwise it is paused, will resume (§5.3).
   - The estimate is live: wasm bytes ride on every `progress` and `batch`
     event, plus a calibrated non-wasm allowance (§5.2). Step 7 re-measures
     the two allowance constants against real loads.
3. **Eviction order: as recommended.** An idle, artifact-backed engine goes
   before a background load is cancelled. §5.2 reconciles this with
   #2031's "eviction cancels".
4. **Rehydrate: an index-sidecar export** from the open model (conway#756),
   consumed by `OpenModelFromIndex`. Written after the first load, not at
   eviction, so an eviction stays a bare `terminate()` (§5.3). A re-parse is the fallback when the
   sidecar is missing or stale. If conway#756 has not landed by step 8,
   step 8 ships the re-parse and keeps the sidecar consumer behind its
   capability check.
5. **Sync access handles: adopt them** (step 4), with lock coordination
   with `OPFS.worker.js` and the Blob store as the fallback where read-only
   handles are missing.
6. **Main-thread fallback: keep it permanently**, for browsers without
   module workers and as a kill switch. Both paths share the new code: one
   protocol and session API, with an in-process transport.
7. **Legacy sync consumers.**
   - **Delete** the `?view=` rules stack, as viewer-replacement.md §8.1
     planned: `IfcViewsManager`, ShareViewer's `view=ch.sia380-1.heatmap`
     branch, `IfcElementsStyleManager`, `ViewRulesCompiler`, `IfcColor` and
     `ColorHelperFunctions`. First, migrate the WidgetApi
     `ChangeViewSettingsEventHandler` off `IfcCustomViewSettings`.
   - **Leave** the legacy `?feature=bot` `new Function` path on the
     main-thread engine. It is off by default and retires with the
     `?feature=assist` port (ai-workspace.md §13). Under
     `?feature=engineWorker` it fails with a clear message, not a crash.
     *Retired by #1675:* the eval is deleted and `?feature=bot` is an alias
     of `assist`, whose tools read either engine.
   - **No synchronous proxy** over the worker: without `SharedArrayBuffer`
     it cannot be built.
8. **Topology: separate workers.** One engine worker per model, and later
   one render worker per canvas. Geometry flows through
   `open({stream: {sink}})` (§9). The render worker is not part of this
   chain. It is revisited after the chain lands, and is gated on real-GPU
   numbers.


### 8.1 Since 2026-11-03 (owner, 2026-11-19)

- **#2011 decision 6** narrows items 1–3 to `?feature=workspace`. Outside it
  the host holds one live model and a switch is a close;
  `disableBackgroundSessions` forces that under `workspace` too (§5.2, "The
  cap: one predicate").
- **Item 2's estimate is re-fitted** to the source-policy numbers: wasm plus
  a held-source term the worker reports, plus a per-format JS allowance (IFC
  0.6, STEP 3.0 per source byte) instead of one 1.9 (§5.2, "The estimate").
  The constants are provisional until slice 6; the defaults below are
  settled.

The seven questions of the design pass (#2244), each answered yes by the
owner on 2026-11-19:

1. **Phones under `workspace`: 2 live engines, at most 1 GiB**, even where
   `deviceMemory` reports more (§5.2, "Caps and budget").
2. **Desktop: 3 live engines, ½ `deviceMemory` up to 4 GiB** (4 GiB where it
   is absent), kept until slice 6 measures.
3. **Scenes are kept for as many sessions as there are live engines** (3 on
   desktop, 2 on phones); a session past that is dormant: its scene is
   dropped and it comes back through its GLB cache hit (§5.3, "The scene
   tier").
4. **A background load cancelled to "paused — will resume" resumes only
   when foregrounded**, never on its own when memory frees (§5.3).
5. **Rehydrate is lazy**, on the first read the artifact cannot answer,
   **and eager on foreground for a session without an artifact** (§5.3).
6. **A background parse keeps pumping** (item 1 (b), confirmed under
   decision 6), with idle-slice assembly and a per-session queue cap of
   256 MiB on desktop and 64 MiB on phones that pauses its own pump (§5.3).
7. **An in-process engine is always closed on a switch**, under `workspace`
   too (§5.2).

Also decided that day:

8. **One viewer for the page** (§5.2a), as its own slices (2a–2e)
   between `EngineHost` at cap 1 and cap N. #2247 found the scene is the
   viewer's, built per open and per theme rebuild, so no session could keep
   one.

Decided on 2026-11-23 (#2011 decision 8, in-app-model-switch.md §0):

9. **Six layers, each importing only from those below it:** engine,
   model, loader, session, viewer, UI. `EngineHost` is in the engine layer
   and is the one owner of every engine; the session is outside it and
   holds a lease; the viewer owns no engines; the store is a projection of
   the active session. `EngineSession` is renamed, the boundaries are
   linted from the first slice with an allowlist that only shrinks, and
   the cleanups ride in the `EngineHost` slices plus one mechanical move.
   Designed in [layering.md](../tracks/open-t200/layering.md). What it changed here: the
   host's API (§5.2, a lease in place of session-taking calls), the
   predicate's home (`utils/`), the main-thread route under one viewer
   (§5.2a), and the slice plan (§7 step 8).

Decided on 2026-11-24 (#2011 decision 9; the owner's answers to
layering.md §9):

10. **One viewer on the main-thread engine route too** (§5.2a). The
    viewer-per-open exception is dropped; it comes back only if the
    `IfcAPI` collection check cannot be kept green.
11. **The `?view=` rules stack is deleted, with no replacement and no
    flag** (§7.2 item 2; layering.md slice V). This closes item 7's first
    bullet: there is no migration of the Widget API handler, which keeps
    answering success.
12. **`src/tools/` and `src/app/`** as top-level directories; the
    allowlist check in the `build` job; a background load's page-side
    console lines left out of its diagnostics until the console cleanup.

Decided later on 2026-11-24 (#2011 decision 10; [layering.md](../tracks/open-t200/layering.md) §4.1):

13. **The engine's names.** `Engine` is the format-neutral interface:
    `open`, `tree`, `properties`, `propertiesMany`, `propertyTables`,
    `propertySets`, `itemsOfType`, `typeName`, `pump`, `capture`,
    `spill`, `stats`, `abort`, `close`, with the three members a load
    needs: `on` (events), `geometry` (the builder's synchronous reads)
    and `capabilities`. A lease exposes it as `lease.engine`, and nothing
    else; `lease.kind` is the host's bookkeeping, and a caller that must
    vary asks `engine.capabilities`, never the kind.
    - **`WorkerEngine`** is `EngineSession` renamed ("bc it's on a Worker
      thread"). The in-process fallback stays a `WorkerEngine` on an
      in-process transport, `kind: 'inProcess'`: it runs the worker's
      handler and protocol, and it is what a worker that failed to start
      falls back to.
    - **`ConwayEngine`** is Conway's `IfcAPI` on the page, IFC and STEP,
      behind `Engine`: the raw main-thread path (`kind: 'mainThread'`).
      It is a real change on the kill-switch path (item 6's permanent
      fallback), which today calls `parseIfcWithConway` and reads the
      `IfcAPI` synchronously. Slice 1a, with a contract test run against
      both engines.
    - **`MeshEngine`** is the follow-up: the three.js-loaded formats
      answering the same reads from the scene. Not built.
    - **`IfcAPI` stays Conway's name** and is named only inside
      `src/engine`. A `no-restricted-imports` rule on
      `@bldrs-ai/conway/web-ifc` holds it.

    §5.1's `makeWorkerModelHandle` and the facade over a worker
    (`engineModelLoad.js#makeEngineIfcApi`) are how a `WorkerEngine`
    serves the model surface and the builder's geometry reads today;
    under `Engine` the first is `model.engine` and the second is
    `engine.geometry`.

## 9. Where this meets OffscreenCanvas rendering

The engine worker and a render worker meet at the geometry stream and at
picking. The render side of this seam, the render worker's migration plan
(its `attachEngine(modelKey, port)` and drain acks, steps 7.2–7.6) and its
inventory of what moves, are in [offscreen-rendering.md](offscreen-rendering.md)
§6.4 and §7; this section is the source for the engine side. Note the sink is
protocol only at `9759fd8`: nothing in `src/engine/` passes one yet.

- **Geometry goes engine → render directly.** `open`'s `stream.sink`
  accepts a `MessagePort`. With a render worker, the main thread creates a
  `MessageChannel`, gives one end to each worker, and preview and batch
  buffers flow from the engine to the scene builder without the main thread
  ever touching them. Without one, the sink is the main thread. Nothing in
  the engine protocol changes between the two.
- **A sink keeps the host's accounting.** The budget (§5.2) is recomputed
  from each batch's `wasmBytes` and from the bytes still queued
  unassembled, and a sink would take both away from the host. So when
  batches go to a sink, the engine also posts a small `account` event on
  its control port for each one (`wasmBytes`, the batch's byte size,
  `seq`). The sink's owner, the render worker, posts drain acks back to the
  host (`{session, seq, assembledBytes}`) as it assembles. Queued bytes are
  sent minus acked, and backpressure (`pump` pause/resume) stays the host's
  decision.
- **One worker per model for both?** Not recommended. The render worker is
  one per canvas and holds every visible model's scene (multi-model, #1251);
  the engine worker is one per model and is terminated on eviction. Fusing
  them would make evicting an engine tear down a scene that is still shown.
  Keep them separate and connect them with a port.
- **Picking stays where the scene is.** Instance maps and the BVH live with
  the scene (main today, render worker later). A pick resolves to an
  expressID there; properties are then an engine read from the main thread.
- **Assembly moves with the scene.** The background-assembly cost in §5.3
  disappears from the main thread once the scene builder runs in a render
  worker, which would make option (a) of §8 item 1 free of main-thread cost.
- **The load report** aggregates memory from both workers; neither is
  visible to main-thread `performance.memory`.


## 10. Evidence status

**Read from code** (at the cited lines): every row of §2.1; conway's
`window` uses, `isWebPlatform`, `pThreadsAllowed`, the inline wasm, the
`StepExternalByteStore` contract, `OpenModelFromIndex`, `IfcTypesMap`.

**Measured** (§3, one run per cell, prototype, headless Chromium in a
4-vCPU container, measurement page cross-origin isolated): the per-worker
floor and startup; the index-only and full-load memory of SEESTRASSE and
PSB in a worker; what `terminate()` frees (measured memory and RSS);
main-thread long tasks with the engine on the main thread versus in a
worker; Blob-store versus sync-handle I/O; tree, property and mesh transfer
costs.

**Measured, §3.1:** property reads on a windowed open before and after
conway#762, in conway's Node probe (three models) and in Share with the
main-thread engine and in the engine worker (rendering paused). **Not
measured, §3.1:** the live-render case on a real GPU, and the live-render
case in the worker.

**Not measured:** real-GPU frames; Safari and Firefox (module workers and
`createSyncAccessHandle({mode: 'read-only'})` support differ); two
concurrent engine workers loading large models at once; the main-side cost
of assembling a background session's batches; the main-side scene's bytes
and GPU memory per model, which the scene tier needs (§5.3); any phone. A
respawn with a sidecar has since been measured as the bench's sidecar
reopen (source-policy-measurements.md), which an index-only rehydrate
(§5.3) is minus its pump; the rehydrate itself is not.


## 11. IFC and STEP, stage by stage

AGENTS.md says the two Conway pipelines converge: one seam per stage, with
a format difference kept as data and explained where it is kept. This is
the map of where they stand after §7 step 6 (STEP in the worker), read on
code at `origin/main` with conway `1.1635.762`. "Shared" means one code
path serves both formats; "data" means the same code with a different
value; "differs" means a separate code path, or a capability one format has
and the other lacks.

| Stage | Shared seam | IFC | STEP / AP214 | Status |
|---|---|---|---|---|
| Route | `Loader.js#findLoader`: one arm for `ifc`/`ifczip`/`step`/`stp` → `ShareIfcLoader`; one list of the part-21 types, `engine/part21Formats.js` (#2067), read by the Loader, `modelArchive.js`, `ShareModel.js` and the engine-worker routing | `.ifczip` unwrapped first (`Loader#load`) | — | shared |
| Engine | conway's compat `IfcAPI` (`@bldrs-ai/conway/web-ifc`); it routes AP214 to `IfcApiProxyAP214` behind the same calls | `IfcApiProxyIfc` | `IfcApiProxyAP214` | shared surface; conway owns the split |
| Source kind | `Loader.js#canOpenFromStore`: conway's own detector over the 64 KiB prefix, never the suffix, and conway's table of what the store open needs of the store (`storeOpenRequirementOf`, conway#757): IFC any store, STEP one that reads synchronously | a `File`, opened windowed from a `StepExternalByteStore` (in the worker, over a read-only sync access handle: `engineSources.js`, #2072) | the same `File` and the same stores in the worker (both offer `readSync`); on the main-thread engine, whose Blob store cannot read synchronously, an `ArrayBuffer`, buffered | **data**: one predicate; AP214's extraction reads synchronously, so conway faults its windows in and needs `readSync` (conway `streaming-federated-loader.md` §"STEP windowed: synchronous fault-in") |
| Open | `engine/conwayOpen.js#openDeferred`, in both engines (main thread and worker): from the index sidecar when the worker has one, else windowed, else buffered; a schema refusal is final. In the worker the source policy (§5.6, `engine/sourcePolicy.js`) decides first, one rule for both formats: buffered under the device cap or over the Blob store's held copy, windowed over the cap, on a sidecar reopen and under `disableBufferedSource` | `OpenModelFromIndex`, then `OpenModelStream`, then `OpenModelStreamed` | the same calls (`IfcApiProxyAP214.createFromIndex` / `createFromStore`, conway#757); `OpenModelStreamed` on the main-thread engine | shared |
| Open failure | `classifyOpenFailure` → `unsupportedSchema.js#openModelFailure`, classified where the statistics are (§2.4 G3) | — | — | shared |
| Engine | one `Engine` interface (`engine/Engine.js`, layering.md §4.1, slice 1a #2319) over both engines: a `WorkerEngine` (`WorkerEngine.js` + `engineHandler.js`, with the remembered in-process fallback, `spawnEngine.js`) or, on the kill-switch route, the viewer's `ConwayEngine` (`ConwayEngine.js`); `engineModelLoad.js` runs one load over either, and `ShareIfcLoader#parse` has one path; `format` is a label; `engineContract.test.js` holds the two to the same events, placements, reads and GLB bytes on `index.ifc` and `index.step` | — | — | shared (§7 steps 3, 6; 1a) |
| Index | `onIndexed` → `makeIndexedModelHandle` (`indexedModel`, #2037), started beside the pump | the deferred index | the AP214 assembly tree, built at open | shared |
| Reopen without a re-parse | `engine/engineSidecars.js`: a worker load from an OPFS entry saves conway's sidecar (`ExportIndexSidecar`, v3, schema-stamped) after its first load's pump, through `createWritable` or, where that is missing (Safari before 26, Share#2093), a read-write sync access handle, under `engine-index-sidecars/`, one per entry path (an envelope records which version of the entry it describes; sidecars of entries that are gone are swept after each save), and the next open of the entry tries `OpenModelFromIndex` with the full source check (`VERIFY_INDEX_SOURCE_HASH: true`, one hashing pass over the file) before parsing; the load report's `Engine index:` line says which (`engineModelLoad.js#indexLine`); kill switch `?feature=disableEngineSidecar` | conway#756 | conway#757 | shared |
| Tree | `engine.tree({mode: 'names', includeSolids: true})`, through the indexed handle (`model/engineModelReads.js`) | `includeSolids` ignored | multibody sub-solids as ephemeral `solid` nodes | shared call; data |
| Ids and refs | `e` / `o` / `n` refs (`tools/refs.js`); selection joins on whichever key both sides carry | express IDs; tree id = geometry parent | tree id = the NAUO, geometry parent = the shared `product_definition_shape`; the join key is the occurrence path (step-occurrence-selection.md) | **data**: an assembly's reuse has no IFC equivalent, so the key differs, not the code |
| Properties | `getItemProperties` / `getPropertySets`; the panel's tables through `propertyTable.js`, behind the worker's `propertyTables` op or on the page (§7.1, #2070) | IFC entities and psets | AP214 records | shared |
| Preview | `ON_PREVIEW_MESH` → `payloadToPreviewMesh` → `ProgressiveLoadSession`; picking via `previewSelection.js` (#2052) | `StreamedPreviewChannel` with the IFC adapter on the buffered open and `windowedIfcPreviewAdapter` on the windowed one (conway#777 retired `StorePreviewChannel`) | `StreamedPreviewChannel` with `ap214PreviewAdapter`, on the buffered and the windowed open (conway#772) | shared, one channel for all four opens. Every open caps at 4096 units, and the channel's parse-time work is bounded at a share of the parse's wall clock (`PREVIEW_PARSE_SHARE`, 0.2, 100 ms floor), while the windowed open's parse-end flush keeps its own 100 ms clock (conway#778: bounded by the share too, Momentum.ifc showed 7–9 preview meshes at the index instead of 31); the windowed IFC open used to stop at 512, which froze PSB's build-up at 484 meshes by 75 % of the parse (conway#777's measurements). `windowedPreview.spec.ts` checks the windowed IFC open's preview on both form factors. The worker re-posts each payload field by field (`engineStream.js#previewMessage`), so a new payload field has to be copied there too, as `occurrencePath` and `solid` are. A STEP payload carries its durable placement's `occurrencePath` (`[]` at the root), and a pick on it selects the occurrence (`previewOccurrencePickOf`), painted by that path alone. At the root, where the path names no shell and every root shell shares the owner, the pick carries the mesh's geometry (`selectedRootGeometryId`): the preview and the streaming rows paint that shell alone, and it narrows to the shell's durable instance once that has streamed in, at the latest at the end-of-load repaint (#2089). `stepPreviewPick.spec.ts` checks it on both engines and form factors, with the parked tick turned on by a test-only seam (`__bldrsTestStepPreviewFinishParse`, `pumpTestSeams.js`). **No STEP model on the corpus shows a parse-time preview**: the parse-end tick that would put one on screen is off (`PREVIEW_FINISH_PARSE`), because its first unit pays the throwaway generation's prep before the index (+0.5 s on Arty_Z7, +0.3 s on DSA2), and under the share bound the parse-time units don't run on DSA2, Arty or pinball. conway#775 stage 2 replaces the tick with the durable pump in priority order. Picking during the pump (the next row) covers early interactivity meanwhile |
| Geometry pump | `ExtractGeometryBatchAsync` → the engine's `batch` event → `IncrementalBatchedBuilder`: conway's FlatMeshes by reference from a `ConwayEngine`, the batch columns decoded by the `WorkerEngine` (`decodePlacements`) from a worker; a model the pump could not stream is delivered as batches by both (the one-shot fallback) | — | `PlacedGeometry.occurrencePath`, the batch's path columns, where a present-but-empty path (a root-level instance) stays `[]` (#2067) | shared; data |
| Pick during the pump | `streamingBatchPick.js`: the incremental builder offers its rows as it writes them (`root.userData.streamingBatches`, withdrawn at `finalize`); CadView's double-click raycasts the preview group and the streaming batches, nearest first, and a row goes through `selectFromInstancePick` as on the finished model; the highlight is the rows' instance colours (`ShareViewer#setPreviewSelection`) | element id + instance | occurrence path (`[]` at the root) + instance | shared, both engines (a worker load's batches feed the same builder). Before it nothing durable answered a pick until `finalize`: on Arty_Z7 from ~7 s to ~38 s |
| Assembly and decoration | `assembleBatchedModel`, `model/engineModelReads.js` (`model.engine` and its reads), `stampAppliedCoordination` | — | per-occurrence tables carried onto the rebuilt instance map | shared |
| Hide / isolate / `#d:` | `IfcIsolator.js`, `Residency/visibilityHash.js` | `e` refs | `o` refs (occurrence paths) | shared; data |
| GLB writer capture | `glbEngineCapture.js#captureEngineExtensions` (`bldrsElementPropertiesCapture` / `bldrsSpatialTree` / the geometry-identity table), run next to whichever engine loaded the model: the page's, or the worker's as the `capture` op (§7 step 5) | `RootExpressIDs` fast path | full record scan (no IfcRoot); occurrence-path table beside the face ids | shared: one job for both formats and both engines |
| Cache hit | the `BLDRS_*` GLB reader; spawns no engine | — | restores the occurrence and geometry-id tables | shared |
| Load report | `loadProgress.js`; the worker forwards its Logger and console, and `engineWasmMb=` on the Total line | `ifcVersion` = the IFC schema | the AP schema | shared |

**What is left to converge, in order of value:**

1. STEP previews (conway): the occurrence path on the payload landed
   (conway#772, wired to the preview pick), as did the channel on the
   windowed open, and both formats now run one bounded channel (conway#775
   stage 1, conway#777). Under the bound no STEP model on the corpus gets a
   parse-time preview, and the parse-end tick stays parked
   (`PREVIEW_FINISH_PARSE`). STEP's early meshes come with conway#775 stage
   2, the priority-ordered durable pump, which deletes that tick. Early
   picking on STEP comes from the durable batches (#2084).
2. ~~§7 step 5 (the capture job) for both formats at once, including
   STEP's occurrence-path table.~~ Done in #2081: one job, run next to
   either engine.
3. STEP on the main-thread engine stays buffered: its Blob store cannot
   read synchronously. That goes away with the flag flip (§7 step 9), not
   with more conway work.

Done since this section was written: the windowed STEP open and the STEP
index sidecar (conway#757; Share#2085). The sidecar reopen serves IFC too, so
§7 step 8's index-only rehydrate now has the file it reads.

**Measured, conway#757** (2026-11-07). Headless Chromium on a shared 4-vCPU container, test-flows build, `?feature=engineWorker`, a persistent profile, n=2 per leg. Each run loads the model, waits for the GLB writer, removes the `.glb` artifact (#2081: a reload that finds it spawns no engine), and reloads in the same profile; the reload is the reopen, and every one was a GLB cache miss. The reopen runs conway's **full** source check (`VERIFY_INDEX_SOURCE_HASH: true`): one hashing pass over the whole file against the digest the parse recorded. The owner chose it over `'sampled'` (about 0.5 MB read) on Share#2085, because a sampled match can miss an edit between samples.

| | 58 MB STEP: first open | 58 MB STEP: reopen | 106 MB STEP: first open | 106 MB STEP: reopen |
|---|---|---|---|---|
| `Engine index:` | parsed; sidecar saved (15.8 MB) | from sidecar, no parse | parsed; sidecar saved (37.8 MB) | from sidecar, no parse |
| Parsing | 1.78 / 1.32 s | **0.39 / 0.31 s** | 2.78 / 2.56 s | **0.65 / 0.70 s** |
| Tree at (navigation → `rootElement`) | 6.99 / 5.24 s | **3.73 / 3.12 s** | 7.05 / 6.15 s | **3.36 / 3.30 s** |
| Total | 24.1 / 20.4 s | 21.5 / 19.1 s | 12.4 / 10.1 s | 8.0 / 8.3 s |
| `Engine source I/O:` | sync handle, 132 reads, 135 MB, 0.22 s | sync handle, 30 reads, 111 MB, 0.12 s | sync handle, 318 reads, 525 MB, 0.51 s | sync handle, 131 reads, 509 MB, 0.36 s |

- The machine was busier than for the sampled run below: first opens parsed 1.3–1.9× slower. Within this run the reopen's Parsing is 3.7–4.6× under the parse.
- **Full against sampled.** An earlier run with the sampled check, before the GLB cache, read: reopen Parsing 0.12 / 0.11 s on 58 MB and 0.40 / 0.39 s on 106 MB, against first-open parses of 0.95 / 0.94 s and 2.35 / 2.17 s. So the full check costs about 1.7–3× the sampled reopen, some of it the busier machine, and it is still not a re-parse. The extra cost is the hashing pass: the 58 MB reopen now reads the whole file, 111 MB in 30 reads, where the sampled one read 56 MB.
- Geometry is the same in both legs, so the reopen saves the parse and little else: 1.0–2.1 s off Parsing here, and 2.1–3.7 s off the time to a tree.
- A first open records the source digests for the export (conway's `RECORD_SOURCE_HASH`, about 12 % of the index build) and writes the sidecar after the pump.
- **The digest is native SHA-256 (Share#2092, conway#783).** The first open also sets `SOURCE_HASH_ALGORITHM: 'sha256Blocks'` (`engineHandler.js#openModel`), so the source hash is the platform's SHA-256 over 4 MiB blocks instead of conway's per-byte FNV loop in JavaScript. On Firefox that loop was about 10 s of an 860 MB model's 40 s parse (Parsing 40.7 s with the hash, 30.8 s without); on Chromium the measured gain is small (Node: about 0.4 to 0.5 s of a 9 to 10 s parse). The sidecar records which algorithm ran (`hashAlgorithm` 2), and the reopen's full check runs whichever algorithm the sidecar names, so FNV sidecars already in users' OPFS keep verifying and no sidecar format bump was needed. A native sidecar read where WebCrypto is unavailable, or by an older conway, comes back `INDEX_STALE` under `VERIFY_INDEX_SOURCE_HASH: true` and Share reparses. Kill switch: `?feature=disableNativeSourceHash` for one session; `isActive: true` in `FeatureFlags.js` is the prod rollback (`spawnEngine.js#engineFlagSnapshot` reads the static value first). With it on conway records FNV as before; native sidecars already written stay valid. The `Engine index:` line names the digest (`sidecar saved (143.8 MB, sha256)`, `from sidecar (143.8 MB, fnv), no parse`), read from the sidecar header with conway's `readSidecarSourceIdentity` (`engineSidecars.js#sidecarHashName`); a reopen reports the digest the sidecar was saved with. `engineSidecar.spec.ts` checks the reopen across the flag in both directions.
- The 106 MB model reads 4.8× its size through the windows: conway's adaptive window grows on AP214's access pattern. Over the sync handle this costs 0.3–0.5 s.
- Windowing does not lower the worker's peak memory on these models. The window grows to most of the file, and geometry dominates (conway#769's description has the Node numbers).

**Against the buffered worker open** (the sampled run, before the GLB cache). I ran the same build, the same models and the same profile handling with `?feature=engineWorker,disableStreamOpen`: a STEP buffered in the worker as before this change, with no sidecar, so its reload parses again.
- **First open:** the windowed open matches the buffered one within the spread.
  - Parsing: 0.95 vs 1.02 s on 58 MB, 2.26 vs 2.28 s on 106 MB.
  - Tree: 4.6 vs 4.6 s, and 6.0 vs 5.8 s.
  - Total: 18.2 vs 18.4 s, and 9.9 vs 9.5 s.
- **Reopen, sidecar against re-parse:**
  - 58 MB: Parsing 0.12 vs 0.92 s, tree 2.83 vs 3.40 s, Total 17.0 vs 17.2 s.
  - 106 MB: Parsing 0.39 vs 2.26 s, tree 3.00 vs 4.56 s, Total 7.3 vs 8.7 s.

**Measured** (2026-11-04, §7 step 6 as first pushed in #2067):
- `RAF_THROTTLE_MS=3600000`, one cold load per run, n=2 except the largest (n=1), medians, in a shared 4-vCPU container.
- Four STEP models, 4 to 111 MB, flag off versus on. The full table is on #2067.
- *Main-thread long tasks:* 5.8–36 s → 3–4.5 s in total. On the 58 MB model the count drops from 290 to 13. What remains in worker mode is page boot (before the load, the same in both modes) and the end-of-load assembly on the page (0.4–2.0 s). That assembly is the next main-thread cost, for IFC worker loads too.
- *Engine time:* Geometry is unchanged within the spread. The worker's fixed cost is about +0.7 s in *Opening model* (spawn plus a cold wasm compile, as §3 measured), so the index and Total of a small model come 1–1.5 s later. From 58 MB up the difference is noise or a gain.
- *Page heap at ready:* 30–73 % lower. The engine's JS heap (24–229 MB) is in the worker now.

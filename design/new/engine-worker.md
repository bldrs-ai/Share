# Per-model engine worker — one Conway engine per model, in its own Web Worker (open-205)

**Status:** decided 2026-11-03 (§8); being built behind
`?feature=engineWorker` in the §7 order. Steps 1–3 and 6 have landed: IFC
and STEP both load in the worker.
**Epic:** `open-205` (#2011). Story: #2053. Absorbs #2031 (close and
eviction): with an engine in a worker, terminating the worker *is* the
eviction.
**Related:** #2019 (per-model sessions), #2030 (no blocking calls), #2037
(interactive at index, `indexedModel` / `selectReadModel`), #2043
(interactive at first mesh), #2023 (memory E2E), #1756 (geometry worker
pool, draft), conway#540 (no Worker branch in `isWebPlatform`), conway#541
(`OpenModelFromIndex`, landed), conway#390 (M1 "parse still on the main
thread"), Share#1610 / #2047 (MT wasm; not used here).
**Parallel work:** OffscreenCanvas rendering is being scoped separately (§9
says where the two meet).

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
  The same handler runs in Node for a CLI or MCP.


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
| 3 | `viewer/ifc/conwayDirectIfcLoader.js:134` | lazy `ifcAPI.Init()` on first parse | trivial (worker `init`) |
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
| 20 | `loader/unsupportedSchema.js:166, 194, 223, 263` | **G3** `beginOpenAttempt` / `conwayRefusedSchema` / `conwayOpenFailure` read the engine's per-attempt statistics synchronously after a failed open | **design**: the worker classifies and returns `failed{kind, …}` |
| 21 | `loader/loadProgress.js:14, 23, 195` | **G3** `LoadLogAccumulator` and conway's static `Logger`, tallied through `installDefectProxy`; the report's heap column is main-thread `performance.memory` | **design**: the worker's Logger is a different module instance; it forwards severity deltas and its wasm/heap bytes as events |
| 22 | `loader/Loader.js:159` | `canOpenFromStore` feature-detects `ifcAPI.OpenModelStream` | trivial: capability from `init` |
| 23 | `Loader.js:881` | `viewer.IFC.loader.ifcManager.state.models.push(model)` | trivial |
| 24 | `Loader.js:994–1001` → `glbExport.js:482, 494, 499` | GLB writer reads `ifcManager` at run time for capture | design: bound to the session (#2019 already asks this) |
| 25 | `loader/bldrsElementProperties.js:550` | **G2** sync `RootExpressIDs(modelID)` iterator | **design** (§2.4) |
| 26 | `bldrsElementProperties.js:838, 878` | **G2** `getPropertySets` / `getItemProperties` per root record | **design**: one worker-side capture job, not one RPC per record |
| 27 | `loader/bldrsFaceIds.js:422` | **G2** `getItemProperties` per face id | design (same job) |
| 28 | `loader/bldrsSpatialTree.js:220, 222` | one `getSpatialStructure` | async |
| 29 | `Loader.js:1020` → `opfsSourceByteStore.js:94, 99` | `IsModelOpen` + `SpillModelSource(makeBlobByteStore(file))` | trivial: worker-side, after the capture job; ordering is load-bearing (a sync read of a non-resident range throws) |
| 30 | `Loader.js:1032` | `ReleaseModelGeometry` | trivial: worker-side, same point |
| 31 | `Containers/CadView.jsx:1209–1213` | `ReleaseEntityCache(0)` gated on `IsModelOpen(0)` | trivial: fire-and-forget message |
| 32 | `CadView.jsx:1276, 1278` | tree read, `getSpatialStructure(0, 'names')` | async |
| 33 | `CadView.jsx:1334, 2421, 2424, 2441` | root and selected element properties | async |
| 34 | `viewer/ifc/ShareIfc.js:204–213` | `getProperties` (+ psets) | async |
| 35 | `ShareIfc.js:225–241` | `dispose` → `CloseModel` every model | trivial: `terminate()` replaces it |
| 36 | `viewer/ifc/ShareIfcManager.js:118–177` | manager methods over `ifcAPI.properties` | async, except `getIfcType` (37) |
| 37 | `ShareIfcManager.js:160`, `ShareViewer.js:741`, `Components/Properties/itemProperties.jsx:81–82` | sync `getIfcType(code)` | trivial: it is conway's static `IfcTypesMap` (`compat/web-ifc/properties.js:6`); import the table main-side |
| 38 | `itemProperties.jsx:118` (`webIfcFor`) | entity-ref `deref` calls `model.ifcManager.ifcAPI.properties.getItemProperties` | async, but needs the facade to expose a `properties` proxy, not the raw `IfcAPI` |
| 39 | `ShareViewer.js:729, 756, 837` | `getSelectedElementsProps`, `getByFloor`, `getProperties` | async |
| 40 | `viewer/three/IfcIsolator.js:340, 342` | `getSpatialStructure(0, false)` | async |
| 41 | `Components/Properties/Properties.jsx:81, 221` | `getItemProperties`, `getPropertySets` | async |
| 42 | `utils/geometryLabels.js:83` | `getItemProperties` | async |
| 43 | `viewer/tools/viewTools.js:460, 492, 503` | assistant `model.*` reads | async |
| 44 | `Components/Bot/BotChat.jsx:162, 328–330` | legacy `?feature=bot` evals model-written code against `viewer.IFC.loader.ifcManager` | async (`idsByType`, `getItemProperties`); retiring with the bot port (ai-workspace.md §13) |
| 45 | `Infrastructure/IfcElementsStyleManager.js:84–90`, `ViewRulesCompiler.js:31–34` | `?view=` rules: `GetLineIDsWithType`, `GetLine`, GUID mapping | design, or delete (viewer-replacement.md §8.1 already drops `IfcViewsManager`) |
| 46 | `viewer/ProgressiveLoadSession.js:298` | `abort()` has no caller outside the loader's error path | design: `abort` message + terminate (§5.4) |

**Not engine calls, and unaffected** (they read main-side tables built from
the stream): picking through `IfcInstanceMap` (`CadView.jsx:1535, 1539`),
the BVH, `batchedEdit.js` (every mutator acts on the main-side
`BatchedMesh`; model-edit.md §6), `#d:` / `#sel:` / element-path permalinks
(`viewer/tools/refs.js:157`, `Components/Residency/visibilityHash.js:168,
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
  `File` as a `StepExternalByteStore` (`loader/opfsSourceByteStore.js:40`):
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
  windowed open is IFC-only (`OpenModelStream` refuses STEP and Share falls
  back to a buffered `OpenModelStreamed`), so a STEP source crosses as a
  transferred `ArrayBuffer` and lives resident in the worker; and STEP
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
message carries `v: 1` and the session's `epoch` (bumped on every respawn,
so a late message from a terminated or replaced worker is dropped by
construction, not by a guard).

**Requests** (main → worker) get one reply `{re: id, ok, result | error}`:

| op | args | result |
|---|---|---|
| `init` | `logLevel`, engine-flag snapshot (`demandGeometry`, `disableStreamOpen`, budget) | `conwayVersion`, `capabilities` (`openStream`, `openFromIndex`, `asyncPump`), `wasmBytes`, `initMs` |
| `open` | `source`: `{opfs: path}` \| `{file: File}` \| `{bytes: ArrayBuffer}` (transferred); `format`; `stream: {previews, batchSize, sink?: MessagePort}`; `sidecar?` | `{modelID, windowed, modelInfo}` once the index exists — then events |
| `pump` | `{mode: 'run' \| 'throttle' \| 'pause'}` | ack |
| `tree` | `{mode: 'names' \| true, includeSolids}` | the spatial tree (structured clone) |
| `props` | `{ids, recursive, psets}` | records, in `ids` order (batched: one message for N ids) |
| `itemsOfType` | `{type, verbose}` | ids |
| `capture` | `{geometryIds, properties, spatialTree, faceIds}` | packed containers, transferred |
| `release` | `{entityCache} \| {spill: true} \| {geometry: true}` | bool |
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

**Not in v1:** document writes (the op log, model-edit.md L1). They slot
in as more ops without changing the shape. The index-sidecar export
(conway#756) arrives with eviction (§7 step 8) as an `exportIndex` op.


## 5. Main-thread API, cap, and lifecycle

### 5.1 The async read surface

`EngineSession` is the client half of one worker:

```js
session.indexed           // Promise, resolves at the index
session.tree({mode})      // → Promise<Node>
session.properties(id, {recursive, psets})
session.propertiesMany(ids, opts)
session.propertySets(id)
session.itemsOfType(type)
session.typeName(code)    // sync: conway's static IfcTypesMap, imported main-side
session.capture(opts)     // GLB writer job
session.close()           // abort + terminate
```

`makeWorkerModelHandle(session)` returns exactly today's model surface —
`getSpatialStructure`, `getItemProperties`, `getPropertySets`,
`getIfcType`, and `ifcManager.{getSpatialStructure, getItemProperties,
getPropertySets, getIfcType, idsByType}` plus an `ifcManager.ifcAPI` that
exposes only `properties.*` (for `itemProperties.jsx`'s `deref`). It
replaces `makeIndexedModelHandle` and `makeConwayDirectIfcManager`, so every
async consumer in §2.1 keeps its code. Nothing on the main thread can reach
a sync engine method, because there is no `IfcAPI` object there to reach.

Reads go to the first source that can answer: the live worker; a
respawned worker (§5.3); the GLB artifact's `BLDRS_element_properties`
reader, which already serves cache hits without an engine.

### 5.2 Engine host: live-worker cap and LRU

One `EngineHost` per page owns every session's worker.

- **Budget per session** = max(45 MB, the engine's own estimate). The
  engine is the whole worker (wasm plus its JS heap), and §3 puts it at
  ~7.9× file size for SEESTRASSE (191 MB) and ~2.6× for PSB (2.25 GB) once
  geometry is done; an index-only engine is 81 MB and 1.6 GB. The scene
  stays main-side and is budgeted separately; P1.0's 6× covered both.
- **Caps** (decided, §8 item 2; named constants in `src/engine/`):
  - at most 3 live engines on desktop. Phones have no fixed count: the
    budget alone governs them (§8 item 2, revisable);
  - a total engine budget of half of `navigator.deviceMemory` where it
    exists (Chrome reports at most 8 GiB, so at most 4 GiB), and 4 GiB on
    desktop or 1 GiB on phones where it does not;
  - a session's estimate is **live wasm + a non-wasm allowance + its
    queued geometry**, with a 45 MB floor (§3's empty `Init`ed worker):
    - *live wasm* is the worker's `memory.buffer.byteLength`. Every
      `progress` and `batch` event carries it (§4), because it is cheap to
      read and it grows during the pump: PSB goes from 16 MB at its index
      to 899 MB at the end (§3). An estimate taken only at `init` and
      `done` would miss all of that growth.
    - *the non-wasm allowance* is the worker's JS heap, which §3 shows is
      most of an engine (PSB holds 1,625 MB at its index with 16 MB of
      wasm). Two named constants, each with its source measurement next to
      it: `ENGINE_BASE_JS_BYTES` = 30 MB, which is the `Init`ed worker's
      45.5 MB less its 16 MB of wasm; and `ENGINE_JS_BYTES_PER_SOURCE_BYTE`
      = 1.9, which is PSB's index-only JS heap over its file size
      (1,609 MB / 860 MB). Against §3, that gives SEESTRASSE 92 MB at its
      index (81 measured) and 176 MB at the end (191 measured); and PSB
      1,680 MB at its index (1,625 measured) and 2,563 MB at the end
      (2,249 measured). It under-counts small models by about 10 % and
      over-counts PSB by about 14 %.
    - *queued geometry* is the transferred batch buffers that a background
      session holds main-side unassembled (§5.3). It is not small: PSB
      streams 337 MB of geometry (§3).
  - **Admission and backpressure use this live figure.** It is recomputed
    on every event, not at fixed points.
  - **If Share is ever cross-origin isolated**,
    `performance.measureUserAgentSpecificMemory()` breaks memory down per
    worker (§3 used it). It would replace the estimate with a measurement,
    and the two constants would go. It is unavailable today because prod is
    not isolated (§6).
  The active session is never evicted, even when it alone exceeds the
  budget.
- **Backpressure before eviction.** When the total reaches the budget, the
  host first pauses every background pump (`pump {mode: 'pause'}`). A
  paused worker stops at its next batch boundary and keeps its engine and
  its place in the stream. It is resumed (`pump {mode: 'run'}`) as its
  queue drains, which happens when it is foregrounded or assembled in idle
  slices. **A paused background load is not an eviction:** nothing is
  terminated or cancelled, and the load completes once it runs again.
- **LRU by last-foreground time.** Among the rest, evict in this order:
  1. *ready, with its GLB artifact written* — it loses least, because
     properties fall back to the artifact;
  2. *ready, without an artifact*;
  3. *still loading in the background* — which cancels that load, and is
     last on purpose.
- **How this squares with #2031.** in-app-model-switch.md §4.0 says close
  and eviction are the only paths that cancel a load. That stays true: they
  are the only ones. But with the engine in a worker most evictions cancel
  nothing, because they terminate an idle engine whose geometry is already
  in the scene. Only the third tier cancels, and only when the first two are
  empty.

### 5.3 Switch, background load, eviction, close

- **Switch A → B.** B's session spawns its worker at once if the total
  still fits the budget; A's keeps its worker and its load. Nothing is
  disposed. This is the common case.
- **Switch A → B when B does not fit.** One budget-governed rule on every
  platform. It is most likely on a phone, but two still-loading PSB-sized
  models (~2.5 GB each, §5.2) reach it on a 4 GiB desktop too. The host
  pauses background pumps first, then evicts idle engines (§5.2). If A is
  still loading and B still does not fit, A is cancelled into an explicit,
  user-visible **paused — will resume** state. It is not silently dropped:
  A's tab says so, and when A is foregrounded again its load resumes from
  the OPFS-staged source, through the sidecar if one was written (§8 item
  4) and otherwise by a re-parse. So in-app-model-switch.md §4.0's "come
  back to a finished load" becomes **a finished background load when the
  budget allows; otherwise paused — will resume**. This is a provisional
  call, revisable (§8 item 2).
- **Background load.** A's parse and pump run on A's worker thread and cost
  the foreground nothing there. What still lands on the main thread is
  *assembling* A's batches into A's scene (builder appends, the end-of-load
  BVH), which runs at a frame cost even when A is not shown. Decided (§8
  item 1): A keeps pumping in its worker, and its batches queue main-side
  unassembled (they are transferred buffers, so queuing is cheap). They are
  assembled when A is foregrounded, or in idle slices before then.
- **Eviction** is `worker.terminate()`. It frees the whole engine — wasm
  heap, parse buffers, resident windows — at once (§3 measures it). The
  session keeps everything main-side: the scene, the instance maps and BVH,
  the tree, `elementsById`, the search index, the selection, hidden and
  isolated sets, display overrides and notes. Its `engine` state becomes
  `evicted`.
- **Rehydrate, lazily.** The first read that the artifact cannot answer
  (an entity-ref `deref`, a recursive read, a model without an artifact,
  later a document op) spawns a worker and re-opens the model **index-only**
  from the OPFS-staged source: `DEFER_GEOMETRY` and no pump, because the
  geometry is already in the scene. Cost (§3): ~0.5 s to stand the worker
  up, then the open — ~1 s for SEESTRASSE, 13–17 s for PSB — and the engine
  comes back smaller than it left (PSB 1.6 GB index-only against 2.25 GB
  after geometry). Decided (§8 item 4): before eviction the worker exports
  an index sidecar (conway#756) into OPFS beside the staged source, and the
  respawn opens with `OpenModelFromIndex`, skipping the parse. It falls
  back to the re-parse when the sidecar is missing, or stale against the
  source's size and modification time, or when the engine lacks the export
  (a capability from `init`). A source that is not in OPFS (the no-OPFS
  in-memory upload, #1906) re-opens from the `File` that `inMemoryUploads`
  already holds.
- **Close** = `abort`, `terminate`, drop the scene and the session's state.
  It is eviction plus a scene drop.
- **Scene eviction** is a second, separate tier (GPU and main-side memory),
  re-entered through a GLB cache hit. It is not designed here; the engine
  tier does not depend on it.

### 5.4 Failure isolation

- An exception, a wasm trap or a wasm `RangeError` on memory growth inside a
  worker is caught there and reported as `failed{kind}`. Only that session
  shows the alert; other sessions do not see it.
- A worker that dies without a message (`error` / `messageerror`) or goes
  silent past the load report's stall watchdog is terminated and marked
  `failed`, with a retry.
- **What it does not isolate:** dedicated workers are threads in the page's
  renderer process. A process-level out-of-memory still takes the tab and
  every worker down. The budget in §5.2 is what prevents that; the worker
  only makes the memory *returnable*.
- A replaced or terminated worker's late messages carry an old `epoch` and
  are dropped.

### 5.5 What survives an eviction

| Survives (main-side) | Lost until rehydrate (engine-side) |
|---|---|
| scene, `BatchedMesh`, instance maps, BVH | psets and records the artifact did not capture |
| `rootElement`, `elementsById`, search index | entity-ref `deref`, recursive reads |
| selection, hidden / isolated sets, display overrides, notes | STEP sub-solid reads beyond the tree |
| `e` / `o` / `n` / `g` refs and every permalink (`#sel:`, element path, `#d:`, `#c:`) | (later) document-op application |
| the GLB artifact and the staged OPFS source | `modelID` (a new instance starts at 0) |

Refs survive because they are pure strings keyed on expressIDs and STEP
occurrence paths, which are the source file's own `#id`s and come back
identical from a re-parse of the same bytes. model-edit.md §5 already
forbids storing a `batchId` or any per-load id, and the scene's batch ids
are not re-minted by an engine respawn because the scene is not rebuilt.


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

Every PR is behind `?feature=engineWorker` (off), keeps the main-thread
engine as the default and fallback, and carries desktop + mobile E2E per
the UI rule. The main-thread engine stays permanently (§8 item 6), but as
the same protocol and session API over an in-process transport, not as a
second, divergent path.

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
5. **GLB writer capture in the worker.** The `capture` job (properties,
   spatial tree, face ids), then spill and release worker-side, then the
   flag's cache write turns on. E2E: `batchedGlbCache.spec.ts` under the
   flag (cache hit after a worker load opens with properties).
6. **STEP in the worker.** Buffered source transfer, the occurrence-path
   column, `includeSolids`. E2E: `indexStepLogo`, `stepVisibility` under the
   flag.
   **Landed** (2026-11-04) as a generalisation, not a twin:
   `engine/engineIfcLoad.js` became `engine/engineModelLoad.js`
   (`createEngineModelLoad({format})`), and `ShareIfcLoader#isEngineWorkerLoad`
   takes every loader type `engineFormatOf` maps (`ifc`, `ifczip`, `step`,
   `stp`). That list is now the ONE part-21 list
   (`loader/part21Formats.js`), which `Loader.js`, `modelArchive.js` and
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
   Left for later, for both formats: the GLB cache write (step 5; a STEP
   worker load writes none either), and for STEP only a windowed open
   (conway's store-backed open is IFC-only) and an index sidecar
   (conway#757), so a STEP is resident in its worker and re-parses on
   reopen.
   Measured on four STEP models from 4 to 111 MB, with the loop frozen:
   - main-thread long tasks during the load fall from 5.8–36 s to 3–4.5 s;
     what is left is page boot and the end-of-load assembly;
   - Geometry is unchanged within the spread;
   - a small model's index comes about 1 s later, from the worker's spawn
     and cold compile;
   - the page heap is 30–73 % lower.
   The table is on #2067.
7. **Sessions own their worker** (with #2019). The engine moves from the
   viewer to the session; a switch keeps the old worker; the background
   batch policy (§8 item 1). Tests, each shown failing on revert: queued
   geometry bytes count against the budget, and reaching it pauses the
   background pump rather than evicting it (a unit on `EngineHost` with a
   lowered budget); and a `describeMobileAndDesktop` E2E where, on both
   form factors, a lowered budget puts the background load into "paused —
   will resume" and foregrounding it completes the load.
8. **Close and eviction** (#2031, absorbed). `EngineHost`, the budget and
   LRU, `terminate`, the artifact fallback, lazy index-only rehydrate
   through the conway#756 sidecar (re-parse fallback). E2E:
   #2023's memory spec, asserting the evicted worker's memory is gone
   (`measureUserAgentSpecificMemory` breakdown in an isolated test server,
   or the renderer's RSS) and that properties still answer.
9. **Default on**, after steps 2–8 have merged. The in-process transport
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
| 4 — sync-access-handle source | in review. Measured flag on, Blob store vs read-only sync handle, at medians: PSB (n=3) source I/O 19.1 → 3.8 s, Parsing 28.3 → 20.2 s, time to index 44.2 → 35.8 s, Total 96.5 → 82.9 s; sp-231MB (n=2) I/O 8.5 → 2.1 s, Parsing 14.0 → 9.9 s, Total 64.8 → 60.1 s; SEESTRASSE (n=1) I/O 0.32 → 0.07 s, Total flat. Geometry, main-thread long tasks and page heap unchanged. Every leg was windowed, checked by its `Engine source I/O:` line, in a persistent profile. Caveat: the Blob store's per-read time includes event-loop wait as well as I/O (each read is an async round trip), so the I/O figures are not pure I/O. The wall-clock stages (Parsing, time to index, Total) carry the claim |
| 6 — STEP in the worker | merged (#2067). A STEP is opened buffered (conway's store-backed open is IFC-only), so step 4's source store does not apply to it |
| 5, 7, 8, 9 | not started; 9 is gated on #2061 and #2070 |

**Known issues.**

- **#2061: worker JS heap on sp-231MB.** The engine worker holds about
  350 MB of live JS heap after an sp-231MB load, against 65 MB for PSB.
  This is unexplained (it needs a heap snapshot) and gates step 9.
- **#2070: each engine round trip waits behind a main-thread frame.** A
  worker reply is a main-thread task, so with the render loop running it
  waits for the frame in progress. The engine itself answers a read in
  under 1 ms inside the worker. In headless Chromium (software GL) the
  round trip measured 127–217 ms, and 0.34 ms with rAF frozen. On a GPU
  the cost is up to a frame per round trip. That makes sequential reads
  frame-bound: the Properties panel's deref does one read per top-level
  reference. The likely fixes are batching or not rendering while idle.
  It gates step 9.
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
   consumed by `OpenModelFromIndex`. A re-parse is the fallback when the
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
   - **No synchronous proxy** over the worker: without `SharedArrayBuffer`
     it cannot be built.
8. **Topology: separate workers.** One engine worker per model, and later
   one render worker per canvas. Geometry flows through
   `open({stream: {sink}})` (§9). The render worker is not part of this
   chain. It is revisited after the chain lands, and is gated on real-GPU
   numbers.


## 9. Where this meets OffscreenCanvas rendering

The engine worker and a render worker meet at the geometry stream and at
picking:

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
concurrent engine workers loading large models at once; a respawn with a
sidecar; the main-side cost of assembling a background session's batches.

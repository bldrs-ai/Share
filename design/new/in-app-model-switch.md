# In-app model switching — open a model without a page reload (open-205)

**Status:** Phase 0 landed (#2026). Phase 1 re-planned 2026-11-02 (§4);
P1.0 measured (§4.1); Phase 2 planned.
**Epic:** `open-205` (#2011). Stories: Phase 0 #2012 (tasks #2013–#2018,
closed; #2017 moved to Phase 1), Phase 1 #2028 (measure), #2029
(interactive at index), #2019 (sessions), #2030 (no blocking calls), #2031
(close and eviction), #2017, #2021–#2023, Phase 2 #2024. #2020 folded into
#2019.
**Related:** #1251 (`open-210`, multi-model overlay), #1657 (`assist-300`,
workspace shell, `?feature=workspace`), #1906 / #1957 (the no-OPFS in-memory
open — the first in-app switch), #91 (the `modelID = 0` hack), #1776 (burned
model handles).

Opening a model has always been a full page load: `navigateToModel`
(`src/utils/navigate.js:158`) ends in `window.location.assign`, "to free
memory". That kept the page and model lifecycles identical, so per-model
state never had to be reset — the page was. The workspace shell switches
models from the ProjectsDrawer and multi-model sessions keep several open;
neither fits a page load per open.

This doc records what the reload frees today, what goes stale without it,
and the phased plan to drop it. It is based on reading the code at
`7b6355f` with conway pinned at `1.1626.740-g64c84fc2`; §8 says which claims
were checked by reading and which are unmeasured.


## 1. Conclusion first

For **one model at a time**, the engine needs no Conway change. Each viewer
already gets its own Conway WASM instance, and a dropped instance is
ordinary garbage. The work is in Share: give each model a session that owns
its engine, load and state, so switching away leaves a load running in its
own session instead of writing into the next model's, and free a session's
engine only when the model is closed or evicted (decided 2026-11-02, §4).

For **multi-model**, start with one engine per model (decided
2026-11-01, §7). That needs no Conway change; it costs one WASM baseline per
model. A shared engine would need Conway to close a model without killing
the engine, and we ask for that only if the per-instance overhead turns out
to matter.


## 2. What the reload frees today

### 2.1 The in-app path already exists

A route change sets `modelPath` (`src/Share.jsx:100-108`), and CadView's
`[modelPath]` effect runs `onModelPath` (`src/Containers/CadView.jsx:1931`),
which builds a new viewer; `initViewer` disposes the previous one first
(`src/Containers/viewer.js:125`). Two paths take it already:

- the no-OPFS in-memory open (`navigateToInMemoryModel`, #1906), whose File
  can't survive a page load;
- every theme toggle — `theme.addThemeChangeListener(initViewerCb)`
  (`CadView.jsx:333`) re-creates the viewer and the `[viewer]` effect
  reloads the model into it.

So the dispose path runs in production today; what's missing is everything
the page load was quietly covering.

### 2.2 One engine per viewer

- `new ShareViewer` builds `new ShareIfc` (`src/viewer/ShareViewer.js:259`),
  whose constructor creates `new IfcAPI()` (`src/viewer/ifc/ShareIfc.js:141`);
  the loader shares that instance (`ShareViewer.js:268`).
- The first parse calls `ifcAPI.Init()` (`src/viewer/ifc/conwayDirectIfcLoader.js:122-124`),
  which instantiates a fresh Conway geometry module — a new
  `WebAssembly.Memory` — per `IfcAPI`
  (`node_modules/@bldrs-ai/conway/compiled/dependencies/conway-geom/interface/conway_geometry.js:299`).
  GLB cache hits never call it.
- Production is **single-threaded**. Pthreads need `SharedArrayBuffer`
  (`pThreadsAllowed`, same file), which needs cross-origin isolation, and
  `netlify.toml:115` sets COEP to `unsafe-none` (the Drive picker's CORP
  rules out `require-corp`; `tools/esbuild/proxy.js:113-117` matches for
  dev). No pthread pool exists to leak. If COEP ever changes, each `Init`
  would start a worker pool that nothing terminates — revisit then.

### 2.3 `CloseModel` frees almost nothing

`ShareViewer.dispose` (`:630`, async, **not awaited** by `disposeViewer`,
`viewer.js:103`) calls `ShareIfc.dispose` (`ShareIfc.js:225-241`), which
`CloseModel`s every open model and nulls `loader`, `selector`, `context`.
In the pinned conway, `CloseModel` (`compat/web-ifc/ifc_api.js:755-763`)
is:

```js
this.models.delete(modelID);
this.conwaywasm.destroy();   // → wasmModule.freeGeometryProcessor()
```

It frees no model-specific native memory — geometry, parse buffers and the
resident source copy stay in that instance's heap — and it tears down the
geometry processor for the whole `IfcAPI`, so the API is unusable after any
close. Conway's own `ifc_api.smoke.test.js` avoids closing for that reason.

The per-model frees that do exist run from the idle GLB writer, not from
dispose: `SpillModelSource` and `ReleaseModelGeometry` (`src/loader/Loader.js:1011-1029`,
cache-miss only, the latter gated on `demandGeometry`).

### 2.4 What keeps the old engine reachable

The heap comes back only when every JS reference to the old `IfcAPI` is gone:

- **The model.** `decorateConwayDirectIfcModel` sets
  `ifcModel.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)`
  (`conwayDirectIfcLoader.js:878`). The store's `model`
  (`src/store/IFCSlice.js:97`) — plus `rootElement`, `elementTypesMap` — is
  replaced only when the *next* load succeeds (`CadView.jsx:838`). Peak
  memory during a switch is therefore old engine + new engine; a failed next
  load keeps the old one indefinitely.
- **A load still running.** `Loader.load` has no cancellation; see §4.
- **The idle GLB writer**, whose closure holds `model` and `viewer`
  (`Loader.js:989-1033`).
- **`elementsById`** (`CadView.jsx:268`), never cleared (§3.4).
- **PlaceMark**, bound to the first viewer's scene (§3.5).

Both theme toggles and the no-OPFS path already pay this today.


## 3. Phase 0 — bugs the reload hides (#2012)

Six small fixes, one PR. "Latent" means reachable only once something
switches models in-app; "reachable" means a current flow hits it.

### 3.1 Model identity ignores Drive and URL routes — latent (#2013)

`Share.jsx:100-108` calls `setModelPath` only when `filepath`, `gitpath` or
`isUploadedFile` differ. Drive routes (`src/routes/google.ts:40-46`) and
URL routes carry neither path field, so Drive A → Drive B in-app never
loads B. Compare with `modelIdentity` (`src/routes/modelIdentity.ts`) —
which keys on `downloadUrl`, present on every route — keeping the
`isUploadedFile` check, which `modelIdentity` doesn't cover.

### 3.2 Cut-plane reset is a no-op — possibly reachable (#2014)

`CadView.jsx:1450` calls `resetCutPlaneState(location, viewer, …)`; the
function (`src/Components/CutPlane/CutPlaneMenu.jsx:229`) takes
`(viewer, setCutPlaneDirections, setIsCutPlaneActive)`. `location.clipper`
is undefined, the guard fails, nothing resets. Besides every model switch,
`deselectItems` (`CadView.jsx:1459`, ElementsControl's clear button) runs
it after deleting the clipper planes itself, which would leave the store
reporting an active cut plane — not yet reproduced in the UI.

### 3.3 `isViewerLoaded` is never cleared — latent (#2015)

Set at `CadView.jsx:614`, never reset. The auth/OPFS retry effect
(`:1911-1925`) is guarded by `!isViewerLoaded`, so after the first
successful model it never retries later ones. Clear it on model-identity
change only; same-model re-runs (theme, view settings) must keep today's
dedupe (`:183-192`).

### 3.4 `elementsById` is never cleared — latent (#2016)

`useState({})` at `CadView.jsx:268`, filled per load by
`setupLookupAndParentLinks` (`src/utils/TreeUtils.js:96`). A's ids resolve
in B, and A's tree stays reachable.

### 3.5 PlaceMark is bound to the first viewer — possibly reachable (#2017)

`MarkerControl.jsx:100-118` creates the store's `placeMark` once (`if
(placeMark) return`), with an empty cleanup. `PlaceMark`'s constructor
captures the context's DOM element, camera and scene
(`src/Infrastructure/PlaceMark.js:28-45`), and `onRender` reschedules itself
with `requestAnimationFrame` forever (`:304-311`); `MarkerControl.jsx:115`
starts a second chain. A theme toggle after Notes has opened would leave
markers on the disposed scene. Module-level `placeMarkGroupMap` /
`prevSynchSidebar` (`MarkerControl.jsx:457-458`) carry svgGroups across.

### 3.6 The Drive blob URL is never revoked — reachable (#2018)

`CadView.jsx:782` does `URL.createObjectURL(download.blob)` for every OAuth
Drive download and never revokes it. Each theme toggle on a Drive model
downloads and pins another copy. Before revoking, confirm nothing reads the
URL after `load` resolves.


## 4. Phase 1 — in-app switching, one model at a time

### 4.0 Decided 2026-11-02: switching away is not closing

The first Phase 1 plan cancelled the old load on every model change. That
is the wrong default: a user who opens a large model, starts an AI session
on it and moves to another model while the repo scripts run expects to come
back to a finished load, not a cancelled one. So:

- **Switch away → the load keeps running** in the background, in its own
  model's session.
- **Close, or eviction under memory pressure, → cancel.** This is the only
  cancel path (§4.5, #2031), and both are rare and explicit.
- **Interactive at the index.** A model becomes usable — tree, properties,
  search, the assistant's `model.*` reads — once its index and spatial tree
  exist; geometry streams in after (§4.2, #2029).
- **Avoid blocking calls**, and make async the ones we need (§4.4, #2030).
- **Stale writes are solved by structure, not guards.** Each load writes
  into its own session's state, never the global store, so a load that
  finishes after the user moved on has nothing shared to corrupt (§4.3,
  #2019).
  This retires Phase 0's identity guard and replay-time clear
  (`forgetLoadedModel`, `CadView.jsx:394, 419`) rather than adding more.

**What sessions + close must cover** — the four problems a page load used to
solve for free, which the cancellation plan was meant to cover:

1. **Waiting behind the old load.** `onViewer`'s in-flight guard queues B
   and replays it only after A ends (`isViewerReloadPendingRef`,
   `CadView.jsx:367`). Sessions remove the queue: B's session starts at
   once, A's keeps going.
2. **Peak memory.** A running load holds its engine's whole WASM heap.
   Under sessions that's intended for an open model; close and eviction
   (§4.5) are what bound it.
3. **Stale writes.** `setModel`, `rootElement`, search, analytics and
   metering, alerts and Sentry, the GLB writer — the inventory on #2019.
   Session-scoped state makes each write land on its own model.
4. **Freeing the processor mid-parse.** Disposing a viewer calls
   `CloseModel`, which frees the geometry processor (§2.3) while a parse
   may still run against it (read from code, not reproduced). Under
   sessions a switch disposes nothing; close does, after aborting the load.

### 4.1 P1.0 Measured 2026-11-02 (#2028)

**Method.**
- **Engine:** a Node harness against the pinned conway (`1.1626.740`). Single-threaded WASM, as in prod, with a cold compile per process. It drives the calls `parseIfcWithConway` makes on the `demandGeometry` path, with the same open settings (`DEFER_GEOMETRY`, `GEOMETRY_BUDGET_MB: 64`, `STREAMING_CONSUMER`). It covers both source modes: buffered (`OpenModelStreamed`) and windowed (`OpenModelStream` over a Blob, which is what OPFS-staged loads use). A 1 ms heartbeat measures event-loop blocking. Each model ran 3 times; medians are shown.
- **Browser:** Share's own Playwright build of `c6006e7`, served locally. Each run used a fresh context, so there was no OPFS cache and no GLB cache hit. Each run recorded the load report, `rootElement` arrival, `PerformanceObserver('longtask')` and memory at `isModelReady`. CPU profiles were taken over CDP and resolved through the source map.
- **Where:** a 4-vCPU cloud container with no GPU. Deployed Share (prod and deploy previews) was blocked by the environment's network policy.

**Environment-dependent; read the ratios, not the absolutes.** The container's Chromium renders through SwiftShader, a software WebGL that runs on the CPU, on the main thread. At full frame rate, the render loop dominated every browser number. SEESTRASSE took 21.3 s at full rate, 4.7 s with frames throttled to 1 Hz, and sp-231MB failed to finish in 900 s. Browser numbers below were taken with rendering removed. In that mode the browser's engine time matches Node to within about 20%. Real-GPU frame cost was not measured.

**Models:**

| Model | Size | Products | Tree nodes |
|---|---|---|---|
| `index.ifc` | 0.02 MB | 13 | 11 |
| Sculpture | 0.31 MB | 519 | 273 |
| Momentum | 5.6 MB | 80 | 69 |
| SEESTRASSE | 24.2 MB | 2,794 | 2,442 |
| sp-231MB (`bldrs-ai/test-models`) | 231 MB | 38,683 | 4,432 |

**The tree is ready well before the geometry** (Node, windowed path, median of 3). "Index" means open plus `getSpatialStructure` called right after the deferred open, before any geometry is extracted.

| Model | Index | All geometry | Ratio |
|---|---|---|---|
| Momentum | 0.25 s | 0.65 s | 2.6× |
| SEESTRASSE | 0.85 s | 2.7 s | 3.1× |
| sp-231MB | 6.7 s | 27.4 s | 4.1× |

- At that point the tree is complete: it has the same node count as after geometry.
- `getItemProperties` answers before geometry in 0.3–0.7 ms, and mid-stream as well (about 10 ms windowed on sp-231MB).
- In the browser today the tree waits for `load()`. For sp-231MB with rendering removed, Conway's parsing ended at +7.6 s from "Opening model", but `rootElement` arrived only at +42.5 s.
- The first mesh already arrives early (+0.6–1.0 s) through the progressive preview.

**Main-thread blocking.**
- **Conway yields during the open,** in 50–130 ms slices on large files. The exception is one stretch at its end: `prepareDemandExtraction` → `prepareExtractionMaps_` → `populateStyledItemsMap` (73%) and `populateRelVoidsMap`. On 231 MB it takes about 1.0 s in Node and 0.6–0.7 s in the browser; on 24 MB about 130 ms. Conway's own comments mark this stretch as deliberately synchronous.
- **The 'names' tree** is one synchronous call of about 200 ms at 231 MB on a buffered open. On a windowed open it pages and yields.
- **Geometry-pump batches** block for at most about 250 ms at batch size 8.
- **Share's own code blocks longer.** These are long tasks in the browser on sp-231MB, with rendering removed, source-mapped:

| Long task | Duration | Where |
|---|---|---|
| GLB cache writer, main-thread part | **6.0 s**, one task | `Loader.js:1033` idle work → `exportAndCacheGlb` → `exportBatchedModelAsInstancedGlb`: `collectInstanceGroups`, `bakeCollapsedBin`, `glbSlim`, gltf-transform `writeBinary` |
| End-of-load assembly | **2.2–2.4 s** | `ShareIfcLoader.parse` → `assembleBatchedModel` → `decorateBatchMeshes`: three-mesh-bvh `computeBatchedBoundsTree` (45%), `robustBoundsFor` (16%), `computeBoundingSphere` |
| Tree build | 0.8–1.0 s | `getSpatialStructure` → `getChildren`, about 99% GC |
| Conway `prepareDemandExtraction` | 0.6–0.7 s | `populateStyledItemsMap` |

**Memory** is the WASM `Memory` plus the JS heap at `isModelReady`, minus the pre-load heap. It covers Share's whole pipeline: the BatchedMesh, BVH and GLB-writer state.

| Model | Memory at ready | ÷ file size |
|---|---|---|
| ≤ 0.3 MB | about 65 MB | — |
| Momentum, 5.6 MB | about 125 MB | 22× |
| SEESTRASSE, 24 MB | 350–390 MB | 15× |
| sp-231MB | 1.25–1.4 GB (WASM 515 MB) | 5.4–6× |

- **WASM `Memory` never shrinks.** `ReleaseModelGeometry` leaves it unchanged (144 MB stays 144 MB in Node).
- **Each new `IfcAPI` pays a cold instantiate** of 190–550 ms.
- **Browser WASM `Memory` is 2–3.5× Node's** for the same model (515 MB vs 144 MB). This is not explained yet.

**Not measured:**
- deployed Share, because the network policy blocks it;
- real-GPU frame cost and GPU memory;
- a warm compile for a second `IfcAPI` in a live page;
- two concurrent loads in one page;
- memory after the GLB writer and the source spill settle.

### 4.2 Interactive at the index (#2029)

Today `onModel` asks for the spatial structure only after the whole load
resolves (`await onModel(...)`, `CadView.jsx:639`, after
`loadModelWithAuthRetry` at `:507`). Ask for it as soon as the engine has
the index, and enable the NavTree, properties, search and the assistant's
reads then; geometry keeps streaming through `ProgressiveLoadSession`. This
helps with or without the page reload, so it can land before sessions.

**P1.0 says it's feasible and worth it.**
- The engine returns the full tree right after the deferred open, and `getItemProperties` answers before and during streaming (§4.1).
- On the windowed path the index is ready about 3–4× sooner than all the geometry: 0.85 s vs 2.7 s on 24 MB, and 6.7 s vs 27.4 s on 231 MB.
- In the browser, sp-231MB's tree is ready to fetch at about +7.6 s but arrives at +42.5 s, so about 35 s of waiting is pure ordering.

Mid-stream property reads worked in the Node harness. Concurrent reads against Share's own batch pump in the browser still need a test as part of this work.

### 4.3 Per-model sessions (#2019)

Each open model gets a session that owns:

- its engine (`IfcAPI`) and loaded scene object;
- its load job — download, parse, `ProgressiveLoadSession`, the idle GLB
  writer bound to *this* session's `ifcAPI` rather than read from
  `viewer?.IFC?.loader?.ifcManager` at run time (`Loader.js:994`);
- its per-model state — the inventory from the earlier `resetModelState()`
  plan (#2020, now folded in here): `model`, `rootElement`, `elementTypesMap`,
  `searchIndex`, `preselectedElementIds`, NavTree expansion, isolation
  (incl. `isTempIsolationModeOn`), `displayOverrides`, notes/markers and
  their selection ids, `versions`/`activeVersion`, `opfsFile`,
  `isCacheWriteInFlight`, `elementsById`, hidden elements (already keyed per
  model by `claimHiddenElementsForModel`);
- its window-handler bindings (`window.ondblclick`, `setKeydownListeners`).

The view binds to the active session; switching rebinds the view, it does
not reset or dispose the session. Viewer rebinding includes PlaceMark
(#2017). This pulls Phase 2's per-model store shape (§7) forward. Each
slice owns its session-scoped fields, so a new per-model field gets one by
construction.

### 4.4 No blocking calls (#2030)

Conway runs on the main thread — the only workers are OPFS
(`src/OPFS/OPFSService.js:54`) and the GLB writer
(`src/loader/GlbWriterService.js:43`). Two loads at once therefore share
one thread, and a background parse stutters the foreground model unless it
yields often.

The suspect was a long synchronous initial parse, and P1.0 cleared it: Conway already yields (§4.1). The long blocks are mostly Share's own. In priority order:

1. **The GLB cache writer's main-thread preparation: a single 6.0 s task on 231 MB.**
   - Path: `exportBatchedModelAsInstancedGlb`, `src/loader/glbBatchedExport.js:264` → `collectInstanceGroups` `:111`, `bakeCollapsedBin` (`src/loader/glbCollapse.js:227`), `glbSlim` (`collectBufferViewHolders`, `src/loader/glbSlim.js:157`).
   - It is scheduled as idle work (`Loader.js:1033`), but one idle callback runs it all at once.
   - It already blocks every large cold load today, and it would land in the middle of the foreground model's interaction when a background load finishes.
   - Fix: chunk it, or move the preparation into the existing GLB writer worker.
2. **End-of-load assembly: 2.2–2.4 s.**
   - Path: `assembleBatchedModel` (`src/viewer/ifc/buildBatchedConwayModel.js:165`) → `decorateBatchMeshes` `:81` → `computeBoundsTree` per batch (`:140`, three-mesh-bvh `computeBatchedBoundsTree`).
   - `robustBoundsFor` (`src/viewer/three/robustBounds.js:204`) shows up in the same task.
   - Fix: slice it across batches, or build the BVH lazily.
3. **Conway's `prepareDemandExtraction` → `populateStyledItemsMap`: about 1 s on 231 MB in Node, 0.6–0.7 s in the browser.** It needs a Conway issue asking for it to be sliced.
4. **A worker for the engine: deferred.**
   - Even after 1–3, every 50–130 ms parse slice is a long task, so a background parse still drops some foreground frames.
   - A worker is needed only if background loads must not drop foreground frames at all.
   - Decide once there are two-concurrent-load numbers and real-GPU frame numbers; neither was measurable in the container.

Items 1 and 2 are worth doing even before in-app switching: they are main-thread blocks of several seconds on every large cold load.

### 4.5 Close and eviction — the only cancel path (#2031)

On an explicit close, or an LRU eviction when the memory budget is
exceeded (phones first).

**Budget, from P1.0 (§4.1).**
- Count about 6× file size per open large model, with a floor of 100–150 MB per open model, measured as WASM plus JS heap at ready. That's 1.25–1.4 GB for 231 MB, 350–390 MB for 24 MB, and about 65–125 MB for small models.
- These figures exclude GPU memory, and they were measured in software WebGL.
- On phones, a single 231 MB model already exceeds typical tab limits. The practical mobile policy is one large model resident.

**WASM `Memory` never shrinks.** `ReleaseModelGeometry` reclaims none of it, so eviction must drop the whole `IfcAPI`. Releasing geometry inside a live engine doesn't make room for the next model. The steps:

1. abort the download and the parse — an `AbortSignal` through
   `Loader.load` to `ProgressiveLoadSession.abort()`
   (`src/viewer/ProgressiveLoadSession.js:298`) and the batch pump;
2. drop or cancel the session's idle GLB writer;
3. release every reference to the session's `IfcAPI` so the whole
   instance is collectable (§2.4), then `CloseModel` — never before the
   parse has stopped. `ReleaseModelGeometry` alone reclaims nothing (§4.1).

An evicted model reopens like any other (its GLB cache hit makes that
cheap where one exists).

### 4.6 `navigateToModel` in-app, behind a flag (#2021)

`navigate()` instead of `location.assign`, keeping `withCurrentSearch`;
`navigateToInMemoryModel` folds in.

**Decided 2026-11-01: its own flag, `?feature=spaModelNav`, not
`?feature=workspace`.** That way the switch can burn in and roll back
without touching the workspace shell. Also:
disarm the `beforeunload` guard on switch (armed for uploads at
`Loader.js:278`, `src/utils/event.js`; today only navigation helpers
disarm it), check Back/Forward through `Share.jsx`'s route effect (needs
§3.1), and revisit the ProjectsDrawer capture's reload-shaped reasoning
(`src/store/WorkspaceSlice.js:165-170`, `src/workspace/persistence.ts:140-143`,
`src/Containers/ProjectsDrawer.jsx:197-203`).

### 4.7 Open risks

- **Main-thread contention between concurrent loads (§4.4).**
  - Conway yields in 50–130 ms slices, so every slice is a long task, and a background parse will drop some foreground frames.
  - Share's 6 s writer task and 2.3 s assembly task are the big blocks, and they're fixable.
  - Two concurrent loads have not been measured.
- **Memory is the sum of the open models,** one WASM instance each, at about 6× file size for large models (§4.1). The budget and eviction (§4.5) are what keep phones alive.
- **Each new `IfcAPI` pays a cold instantiate of 190–550 ms.** Whether a second instance in a live page compiles warm is unmeasured. It affects reopen cost after eviction.
- **Unexplained: browser WASM `Memory` is 2–3.5× Node's** for the same model.
- **Resolved by P1.0:** the initial parse is *not* one long synchronous call; it yields, except for `populateStyledItemsMap` (§4.4 item 3).


## 5. "Once per page load" needs a per-open answer (#2022)

### 5.1 Decided 2026-11-01: a return to A is a new open

In-app A → B → A counts the return to A as a **new open**, for the quota
meter and for analytics alike.

- **The direct-link meter *is* the quota metric.** `useDirectLinkQuota`
  (`src/quota/useDirectLinkQuota.js:80-135`) calls `record-load`. That is
  the rolling 7-day count of private-model loads, and it shares its slots
  with free GLB exports (`quotas.md` §"Direct links: soft gate", §"Exports
  use the same slots").
- **Counting again costs no slot.** `record-load`'s ledger dedupes by key,
  so a key the user already holds comes back `alreadyCounted`
  (`netlify/functions/record-load.js:32`).
- **What it does cost:**
  - one extra `record-load` call per return;
  - `quota_soft_limit_exceeded` fires again on each revisit while the user
    is over the limit.
- **Phase 1 change:** `meteredKeysRef` (`useDirectLinkQuota.js:129`)
  currently dedupes per page. It becomes per open, keeping the dedupe
  *within* one open (theme re-init, StrictMode's double effect).
- **Engagement already behaves this way:** `lastCountedModelKey`
  (`src/privacy/engagementTracking.js:60, 141`) counts A → B → A as two
  opens, because B clears the key.

### 5.2 Still to decide

| Behaviour | Where | Decision needed |
|---|---|---|
| Fresh-claims refresh | `src/BaseRoutes.jsx:70-74` | Pro status across many in-app opens |
| `?view=` | `src/viewer/ShareViewer.js:157` (module load) | Ignored on an in-app open |
| `?feature=perf` | `src/utils/PerfMonitor.js:40-46` (module load) | Likely fine (dev flag) |
| Workspace capture | `src/workspace/persistence.ts:140-143` | Keep or simplify |


## 6. Verification (#2023)

A heap-size number can't fail reliably, so the test asserts **collection**:

- A dev/test-only hook registers each `IfcAPI` (or its `WebAssembly.Memory`)
  in a `FinalizationRegistry` and exposes the live count.
- A `describeMobileAndDesktop` Playwright spec opens A → B → C in-app, forces
  GC over CDP (`HeapProfiler.collectGarbage`), waits for the registry
  callbacks, and asserts exactly one live engine.
- A mid-load case switches while A is still parsing.
- A background session's engine stays live across a switch, and is
  collected once that model is closed or evicted (§4.5).
- Shown red with one teardown fix reverted (e.g. `model` left in the store
  until B resolves).

Chromium-only (CDP); the mobile project is a Chromium viewport, so both form
factors are covered. Today's coverage: `noOpfsUpload.spec.ts` loads twice
in one page but asserts only URL/title/no alert, and `viewer.test.js` checks
dispose calls against a mocked ShareViewer.


## 7. Phase 2 — multi-model (#2024) and open questions

- **Model id 0 is hard-coded.** `CadView.jsx:837` pins `modelID = 0`; its
  #91 comment's cause is stale — the counter is per `IfcAPI`
  (`ifc_api.js:87`) and only exceeds 0 within one, via burned handles
  (#1776, `Loader.js:125-136`) or `.bld` children. Literal-0 call sites:
  CadView `:1039, 1041, 1062, 1086-1088, 1827, 1967, 2028, 2050, 2075`;
  ShareViewer `:726, 756` and `_modelById` (`:1600`); IfcIsolator
  `:340, 342, 544, 1009, 1117, 1128, 1300, 1304, 1458`.
- **Engine: one `IfcAPI` per model first (decided 2026-11-01).** This works
  today: dropping a model means dropping its instance, at the cost of one
  WASM baseline each. A shared engine would need Conway to close a model
  in a way that frees its native geometry, parse buffers and source copy
  *without* calling `freeGeometryProcessor()`. We ask Conway for that only
  if measurement shows the per-instance overhead matters. It does not
  block anything.
- **Store shape.** Selection, isolation, NavTree, properties and display
  overrides are single-model. Their per-model shape moves to Phase 1's
  sessions (§4.3, decided 2026-11-02); what remains here is showing more
  than one session at once — keyed per model, or one active model with
  read-only overlays, which may be enough for #1251's first cut.


## 8. Evidence status

**Checked by reading the code** (at the cited lines): §2.2–2.4, every
Phase 0 defect, the Phase 1 inventories, the writer's run-time `ifcManager`
read, the literal-0 sites, `CloseModel`'s body and the smoke test's note,
COEP and `pThreadsAllowed`.

**Decisions** (from the user): 2026-11-01 — §4.6 flag, §5.1
return-is-a-new-open, §7 engine per model; 2026-11-02 — §4.0 switching away
is not closing (background loads, sessions, interactive at index, cancel
only on close/eviction).

**Measured (P1.0, 2026-11-02, §4.1):**
- stage times, index vs all geometry;
- main-thread blocking, with the long tasks attributed;
- per-model memory, and the fact that WASM `Memory` never shrinks.

These were measured in a cloud container with software WebGL, so the absolute browser times are environment-dependent; the ratios and the attributions carry over.

**Not measured or reproduced:** real-GPU frame cost and GPU memory; two concurrent loads; a warm second `IfcAPI` compile; memory after the GLB writer and source spill settle; why browser WASM `Memory` is 2–3.5× Node's; that an unreferenced single-threaded
Emscripten instance's memory is reclaimed promptly in practice (§6 is how
we find out); the UI repro of §3.2 via the clear button and of §3.5 via a
theme toggle; the per-instance WASM baseline (§7).

**Plausible, unverified, not filed:** `loadProgress`'s `console.warn` tee
(`src/loader/loadProgress.js:227, 320`) and the GLB writer's warning
silencer (`src/loader/glbExport.js:154-166`) each save and restore
`console.warn`; a writer spanning the next load's begin/end could restore
them out of order. Lower priority, page-bounded: the GLB writer worker is
never terminated (`terminateGlbWriterWorker`, `src/loader/GlbWriterService.js:134`,
has no production caller despite its doc), and `inMemoryUploads` holds every
no-OPFS upload for the page's life by design.

**Unrelated, noticed in passing:** `setBranches` writes `issues`
(`src/store/RepositorySlice.js:44`).

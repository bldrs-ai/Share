# Layering: engine, model, loader, session, viewer, UI (open-205)

**Status:** design, 2026-11-23. Nothing here is built. The owner decided
the six layers on 2026-11-23 (decision 8 on #2011,
[in-app-model-switch.md](in-app-model-switch.md) §0); this doc turns that
decision into a layer map, the seams between the layers, a lint rule that
holds them, and a slice plan. On 2026-11-24 the owner answered this
doc's six questions (decisions 9 and 10, §9). The last of them named the
engine: one format-neutral `Engine` interface on the lease, implemented
by `WorkerEngine` and `ConwayEngine` (§4.1).
**Epic:** `open-205` (#2011). Stories #2021 (done) and #2265. This is the
design of #2031 (`EngineHost`) and of the cleanup that comes with it.
**Related:** #2019 (per-model sessions, #2247), #2023 (memory E2E), #2250
(CadView split), #2024 (multi-model).
**Reads with:** [engine-worker.md](engine-worker.md) §5.2–§5.5, which keeps
the engine layer's internals (the cap, what an engine costs, the estimate,
admission, eviction, rehydrate, Reported Conditions) and §5.2a (one viewer
for the page). This doc is the source for the layers, the seams and the
slice plan; engine-worker.md points here for them.

Read on code at `origin/main` `7cbc995d`, which has #2247's per-model
sessions. §10 says what was read, what was run and what was not checked.


## 0. Decision 8, as given

Six layers. Each may import only from the layers below it.

1. **engine**: the worker protocol, the per-worker connection (named
   `WorkerEngine` on 2026-11-24, §4.1), sources, sidecars, and
   `EngineHost`, the one owner of every engine.
2. **model**: the in-memory model: `ShareModel`, element subsets, the
   batched-mesh builders, the instance tables.
3. **loader**: fetch, sniff, cache and convert into a model, given a load
   context instead of `(viewer, useStore)`.
4. **session**: `ModelSession`. It holds an engine *lease* from the host,
   and can have none.
5. **viewer**: one per page, `attach(root)` / `detach(root)`. It owns no
   engines.
6. **UI**: React and the store. The store is a projection of the active
   session, written by one binder.

Also decided: rename `EngineSession`; lint the boundaries from the first
slice, with an allowlist that only shrinks; bundle the cleanups into the
`EngineHost` slices, plus one standalone mechanical move; nothing below
the UI touches the DOM, with how far to go left open (§6).


## 1. Conclusion first

- **The move does most of it.** Counted on production imports (§3),
  the tree holds **79 upward imports in 37 files** under the six layers
  as the directories stand. Moving 89 files to where they belong,
  changing no logic, leaves **19 in 15 files**. The loader ↔ viewer cycle is two things in one directory: the
  model representation (39 files of `viewer/` that `loader/` imports) and
  three Conway load files that sit in `viewer/ifc/`.
- **The other 19 are real seams**, and each is removed by the slice that
  builds its seam: the reporter (6), the session's scene root and attach
  (4), the store projection (6), the dead `?view=` stack (2), and one
  that is not this redesign's (§3).
- **Three ownership faults no import shows**, each fixed by slice 1b:
  - a viewer owns engines (`viewer/ifc/ShareIfc.js:142, 161, 247`);
  - `engine/spawnEngine.js:181` keeps a second, partial list of them;
  - a `.bld` assembly's child engines are closed by the viewer's dispose
    and by nothing else.
- **The lease replaces the session-shaped host API.** #2244's host took
  model sessions (`host.spawnFor(session)`, `host.leave(session)`), which
  made the engine layer import the session layer. `host.acquire(meta)`
  returns a lease; the host never sees a session (§4.2).
- **One engine interface.** A lease exposes `lease.engine`, an `Engine`:
  the reads, the pump and the events, the same for IFC and STEP, in a
  worker or on the page. `WorkerEngine` (today's `EngineSession`) and
  `ConwayEngine` (the kill-switch path's raw `IfcAPI`) implement it.
  Conway's `IfcAPI` is named only inside `src/engine`, and a lint rule
  holds that (§4.1).
- **One load path.** `load(source, ctx)` with five things in `ctx`: a
  signal, a reporter, an engine port, a scene root and a state writer
  (§4.3). IFC and STEP ask the port for a lease. Mesh formats never do.
  Nothing else differs.
- **`Loader.js` (3,172 lines) is not rewritten.** Its 33 lines that use
  `viewer` and its store writes go behind a context built from today's
  arguments, in a neutral change; each later slice changes where one
  field comes from (§4.3, "Getting there").
- **The lint rule works today.** `import/no-restricted-paths` with
  generated per-file exceptions, run on the repo's eslint 8.22 and
  eslint-plugin-import 2.26 over all of `src` (§5).
- **Headless:** the session layer can be shown to run under Node, by a
  Jest test in the node environment that loads `public/index.ifc` and
  `public/index.step` through a `ModelSession` with no DOM. It goes green
  with the slice that removes the store from the loader (§6).
- **Thirteen slices**, each neutral or flagged but two that say what
  they change (V and 1a, §7). The first is the mechanical move, which
  also lands the lint rule.


## 2. The layers

```
6  ui        Components, Containers, pages, hooks, store, tools, export, connections,
             quota, WidgetApi, Auth0, Infrastructure, theme, layouts, index, workspace, …
5  viewer    src/viewer/     one per page: canvas, renderer, camera, picking, look, clipping
4  session   src/session/    ModelSession, LoadJob, ModelSessionHost, per-model state
3  loader    src/loader/     fetch, sniff, cache, parse into a model; the GLB artifact
2  model     src/model/      ShareModel, batched meshes, instance tables, subsets, refs
1  engine    src/engine/     Engine (WorkerEngine, ConwayEngine), protocol, sources, sidecars, EngineHost
0  base      src/utils/, src/privacy/, src/routes/, src/net/, src/OPFS/, src/search/,
             src/FeatureFlags.js, src/Filetype.js
```

A file may import its own layer, any layer below it, and npm packages.

| Layer | Owns | Exports upward | Must not |
|---|---|---|---|
| 0 base | pure helpers, flags, the reporting sinks (GA, Sentry redaction), route and URL parsing, HTTP, OPFS storage, the search index | functions and constants | import any layer above; touch the DOM at module scope (§6) |
| 1 engine | every engine: its worker, its client, its budget, its OPFS entry lock, the capture job that runs beside it. The only place Conway's `IfcAPI` is named | `getEngineHost()`, `EngineLease`, the `Engine` interface, the part-21 format list, failure classes | know what a session, a scene or a store is |
| 2 model | the `Object3D` tree a model is, and everything that mutates it (`batchedEdit.js`), picks in it, or disposes it | builders, `decorateShareModel`, refs (`e`/`o`/`n`), `disposeModelRoot`, the load events a root emits | import a renderer, a camera rig or a canvas. A camera it needs is handed in (`ResidencyController`'s `getCamera`) |
| 3 loader | one load: download, OPFS staging, format sniff, parse, cache hit, the idle GLB writer, the load report | `load(source, ctx)`, `LoadReporter`, the artifact codecs | see a viewer or a store |
| 4 session | one open model for the life of its tab entry: its load job, its leases, its root, its per-model state, its selection, its reporter | `ModelSession`, `ModelSessionHost`, the per-model state fields | see a viewer or a store; touch the DOM |
| 5 viewer | the page's canvas and WebGL context, camera, render loop, look, picking machinery, clip planes | `ShareViewer#attach(root)` / `#detach(root)`, view state | own an engine, a model's lifetime, or per-model state |
| 6 ui | React, the zustand store, routing, the binder, analytics wiring, the assistant's tools | — | — |

### 2.1 The base leaves

`utils/`, `FeatureFlags.js`, `Filetype.js`, `privacy/`, `routes/`, `net/`,
`OPFS/` and `search/` are one level, below the engine. Any layer imports
them. They import nothing above.

- **`FeatureFlags` is a leaf, not injected.** It is read from every layer
  (9 files in `viewer/`, 3 in `loader/`, 2 in `engine/`), it imports
  nothing, and `isFeatureEnabled` already answers from the static table
  when there is no `window` (`FeatureFlags.js:529`), so it is safe in a
  worker and under Node. Injecting a flags object would thread it through
  about 40 call sites to remove an import that breaks nothing. Two rules
  keep it honest: a flag is read where the decision is made, never at
  module scope (a module-scope read freezes the flag at import; the
  MVC-core review §3.4 names `scene.js` and `lookMaterial.js`), and a
  worker gets a snapshot (`spawnEngine.js#engineFlagSnapshot`), because it
  has no URL.
- **`privacy/` is the reporting sinks**: `gtagEvent`, the Sentry redaction
  helpers. A lower layer may call them. Reporting *policy* for a load
  (which condition, once per load) belongs to the reporter (§4.4).
- **`routes/`, `net/`** are parsing and HTTP, already leaves.
- **`OPFS/`** is storage. The engine layer does not import it (the worker
  reaches OPFS through the browser API, `engine/engineSources.js`); the
  loader does. The ordering contract between the two is §4.7.
- **`search/`** holds `SearchIndex`, which becomes per session (§4.5), so
  it has to sit below the session.
- **Eight app-level files sit in leaf directories today** and import
  upward: `utils/dragAndDrop.js`, `utils/loader.js`, `utils/navigate.js`,
  `utils/shortcutKeys.js`, `utils/modelDisplayName.js`,
  `privacy/modelActionTracking.js`, `privacy/subscriptionTracking.js` and
  `OPFS/uploadLedger.js` (16 upward imports between them). They move to
  the UI layer in the second mechanical PR (§7, M2). No lower layer
  imports any of them.

### 2.2 Where every file goes

Production files only. Tests move with their subject.

**`src/engine/` (15 files today)**

| To | Files |
|---|---|
| stays (13) | `Engine.worker.js`, `EngineSession.js` (renamed `WorkerEngine.js`, §4.1), `engineHandler.js`, `engineModelLoad.js`, `engineRoute.js`, `engineSidecars.js`, `engineSources.js`, `engineStream.js`, `engineThreading.js`, `protocol.js`, `sourcePolicy.js`, `spawnEngine.js`, `transports.js` |
| ui (2) | `engineDevHook.js` (installs `window.__bldrsEngine`), `useLegacyViewRulesNotice.js` (a React hook) |
| in, from `loader/` (11) and `viewer/` (5) | listed in the two tables below |
| in, from the UI (1) | `Components/Properties/propertyTable.js`: the worker's `propertyTables` op runs it (`engineHandler.js:28`); the Properties panel imports it downward |
| new | `Engine.js` (the interface), `ConwayEngine.js`, `EngineHost.js`, `engineBudget.js` (§4.1) |

**`src/loader/` (69 files today)**

| To | Files |
|---|---|
| engine (11) | `conwayOpen.js`, `openAttempt.js`, `glbEngineCapture.js`, `bldrsElementPropertiesCapture.js`, `bldrsFaceIds.js`, `bldrsSpatialTree.js` (the capture job the worker runs, `engineHandler.js`'s imports; the reader halves ride along and the loader imports them downward), `part21Formats.js`, `opfsSourceByteStore.js`, `stepFormat.js`, `unsupportedSchema.js`, `engineOpenFailure.js` |
| model (1) | `bldrsInstanceTables.js` (the codec of the model's own tables; `instancedGlbToBatchedModel.js` reads it) |
| base (1) | `glbLog.js` → `utils/glbLog.js` (a log sink over `FeatureFlags` and `utils/logSink.js`; the worker, the model and the loader all use it) |
| stays (56) | `Loader.js`, `BLDLoader.js`, `loadProgress.js`, `loadAnalytics.js`, `loadCaptureContext.js`, `reportLoadDiagnostics.js`, `reportRendererLimits.js`, `urls.js`, `notFoundError.js`, `inMemoryUploads.js`, `matcher.js`, `formatGuidance.js`, `unrecognizedFormat.js`, `opfsSourceHealth.js`, `modelArchive.js`, `zipArchive.js`, `gzipEnvelope.js`, `contentKey.js`, `sourceCacheKey.js`, the GLB artifact (`glbArtifactHealth.js`, `glbArtifactPublish.js`, `glbArtifactSize.js`, `glbBatchedBuild.js`, `glbBatchedExport.js`, `glbBatchedSnapshot.js`, `glbCacheKey.js`, `glbCollapse.js`, `glbCompress.js`, `glbContainer.js`, `glbExport.js`, `glbSlim.js`, `glbStrip.js`, `injectGlbExtensions.js`, `bldrsElementProperties.js`, `ExtBldrsPropertiesPayload.js`, `GlbWriter.worker.js`, `GlbWriterService.js`), and the format front-ends (`glb.js`, `obj.js`, `stl.js`, `pdb.js`, `xyz.js`, `splats.js`, `nrrd.js`, `dicom.js`, `adf.js`, `adf/*` (3), `mts/*` (7)) |
| in, from `viewer/` (3) | `ifc/ShareIfcLoader.js`, `ifc/conwayDirectIfcLoader.js`, `ProgressiveLoadSession.js` |
| in, from `export/` (1) | `glbGzip.js` (three loader files import it; the MVC-core review §3.5 item 4) |

**`src/viewer/` (122 files today)**

| To | Files |
|---|---|
| model (39) | `ShareModel.js`, `visibilityRefs.js`, `lookMaterial.js`, `lookMode.js`, `looks.js`, `previewSelection.js`, `streamingBatchPick.js`, `residency/ResidencyController.js`, `three/elementSubsets.js`, `three/subsetMaterialGroups.js`, `three/robustBounds.js`, `three/sceneGraphVisibility.js`, and from `ifc/`: `IfcInstanceMap.js`, `IfcItemsMap.js`, `appliedCoordination.js`, the twelve `batched*.js`, `buildBatchedConwayModel.js`, `buildConwayIfcModel.js`, `bvhBuild.js`, `deferredBatchedBvh.js`, the three `flatMeshTo*.js`, `ifcItemsMapParity.js`, `incrementalBatchedBuilder.js`, `instancedGlbToBatchedModel.js`, `parsePreviewMesh.js`, `productPalette.js` |
| engine (5) | `ifc/ShareIfcManager.js` (the accessor facade over Conway's `IfcAPI`), `ifc/conwayDirectLog.js`, `ifc/conwayVector.js`, `ifc/pumpTestSeams.js`, `legacyViewRules.js` |
| loader (3) | as above |
| ui (16) | all of `tools/` → `src/tools/` (below) |
| stays (59) | `ShareViewer.js`, `ifc/ShareIfc.js` (the registry of attached models; it loses its engine, §4.1), `debugPanels.js`, `hoverPick.js`, `motionAO.js`, `webglUnavailable.js`, `display/*` (7), `residency/MotionResidency.js`, `autoResidency.js`, `gpuFrameTimer.js`, and the rest of `three/` (43, the vendored `context/` among them) |

Two splits, both cut and paste:

- **`viewer/three/renderDemand.js`.** The asks (`requestPaint`,
  `requestOverlayPaint`, `requestBackgroundPaint`, `runPaint`, the
  `liveDemands` registry at `:167`, `USER_CAMERA_EVENT`) go to
  `utils/paintRequest.js`. The `RenderDemand` class stays and re-exports
  them, so no viewer caller changes. The model has to ask for a paint
  when it changes what is drawn (`ResidencyController`,
  `sceneGraphVisibility.js`); it must not import the scheduler that
  answers.
- **`viewer/ifc/ShareIfc.js:68–87`.** The six prototype assignments that
  install three-mesh-bvh (`computeBoundsTree`, `raycast`, …) go to
  `model/bvhPatch.js#installBvhPatches`, which returns a function that
  restores the originals. `ShareIfc.js` calls it at module load exactly
  as now. The model's builders call `geometry.computeBoundsTree()`, which
  today works only because a viewer module was imported first.
  **Nothing in the model or the session installs it on import.** It is
  installed by whoever composes the app: `ShareIfc.js` on the page, and
  the headless test for itself (§6). Jest mocks `ShareIfc` so that tests
  run on unpatched three on purpose (`ShareIfc.js:61–63`), and
  `deferredBatchedBvh.js:164` skips its work when the patch is absent. A
  session module that patched three's prototypes when imported would
  change what every later test in that Jest file exercises.

**`viewer/tools/` is a UI surface.** Its 16 files are the assistant's
tool providers. Eight of them import the UI (the store, the
selection-hash writer, `Components/Camera`, `Components/Residency`,
`Components/Share`, Assist, `export/`): they drive the app, not the
renderer. They move whole to `src/tools/`, which
the `apps-t300` track ([design/tracks/apps-t300.md](../tracks/apps-t300.md))
already treats as one registry. The four pure measurement files
(`elementBounds.js`, `elementPieces.js`, `meshMeasure.js`,
`ifcQuantities.js`) can go down to the model later, when a headless tool
surface wants them; that is `apps-t300`'s call, not this redesign's.

### 2.3 The DOM

Layers 0–4 do not touch the DOM. The viewer is the one layer below the UI
that owns DOM objects: its canvas, its WebGL context, its window
listeners. Decision 8's "nothing below the UI layer touches the DOM" is
read here as "nothing below the viewer, and the viewer only its canvas":
a WebGL viewer cannot be DOM-free, and the sentence that follows it in the
decision ("the session layer should be DOM-free apart from its scene
root") says where the line is. The scene root is a three `Group`, which
is plain data until a renderer draws it.

What breaks that today, below the viewer:

| Where | What | Goes |
|---|---|---|
| `utils/location.js:9` | assigns `window.onhashchange` at import; `Loader.js` and `ShareIfcLoader.js` import the module | the loader stops importing it: the GitHub path parse and the camera-hash test come through the load context's `source` and the viewer (§4.3, §4.6) |
| `Loader.js:155` | `window.requestIdleCallback` for the idle GLB writer | already guarded (`typeof window`); falls back to `setTimeout` |
| `Loader.js:1884` | `window.location` for an upload's blob path | the load context's `source` |
| `loader/glbCompress.js:416–484` | Draco loaded by a `<script>` tag | stays; guarded, and only the export path reaches it |
| `Loader.js:427` → `utils/event.js:3` | an upload's load arms the page-reload guard (`window.addEventListener('beforeunload', …)`). It is also page-wide: a background session's load would arm it for the model on screen | the UI arms and disarms it for the bound session (the binder), from `LoadResult`; the loader stops calling it |
| `privacy/analytics.js:56` | `gtagEvent` reads `window.location` unguarded | one `typeof window` guard |
| `Containers/modelSession.js:306` | `window[name] = handler` for `ondblclick` / `onkeydown`; `useStore` (`:121–206`) | the binder binds and unbinds window handlers at attach and detach (§4.6); state is §4.5 |
| `engine/engineDevHook.js` | `window.__bldrsEngine` | moves to the UI |


## 3. The import graph today

**Method.** Every `import`, `export … from`, dynamic `import()`,
`require` and `new URL('…', import.meta.url)` in `src/**/*.{js,jsx,ts,tsx,mjs}`,
read with TypeScript's `preProcessFile` and resolved to a file. Tests,
specs, fixtures, mocks and `src/tests/` are left out on both ends: 634
production files, 1,878 production edges. An edge is one file importing
one file. Counted on `main` `7cbc995d`. Two kinds of specifier are not
edges here: imports of `package.json`, and one that names no source file
(`viewer/tools/assistRuntime.js`'s `./assist/runtime.js`, a URL relative
to the built bundle). Counting that one, as the review's own resolver
did, makes the first number 80.

**As the directories stand** (`src/viewer` counted as the viewer layer,
so the model inside it is not yet a layer, and `modelSession.js` counted
where it is, in the UI): **79 upward imports in 37 files.**

| From → to | Count | What |
|---|---|---|
| loader → viewer | 17 | `Loader.js` (6), `glbExport.js` (4), `glbBatchedSnapshot.js` (4), `glbBatchedExport.js`, `splats.js`, `stl.js`: the model representation, and `ShareIfcLoader#isEngineWorkerLoad` |
| viewer → ui | 24 | `tools/*` (20), `ShareViewer.js` → `Infrastructure/` (2), `IfcIsolator.js` → the store, `ShareIfcLoader.js` → `Components/Camera/hashState.js` |
| engine → loader | 5 | `engineHandler.js` → `glbEngineCapture.js`, `conwayOpen.js`; `engineModelLoad.js` → `loadProgress.js`, `unsupportedSchema.js`, `part21Formats.js` |
| engine → viewer | 5 | `pumpTestSeams.js` (2), `conwayDirectLog.js`, `conwayVector.js`, `legacyViewRules.js` |
| engine → ui | 1 | `engineHandler.js` → `Components/Properties/propertyTable.js` |
| loader → ui | 8 | the store (4: `Loader.js`, `loadProgress.js`, `glbArtifactPublish.js`, `bldrsElementProperties.js`), `export/glbGzip.js` (3), `connections/persistence.ts` |
| base → loader | 10 | `utils/dragAndDrop.js` (4), `utils/loader.js` (4), `OPFS/reportOpfsSourceCondition.js` (2) |
| base → ui | 9 | the eight app-level files of §2.1, and `privacy/analytics.js` → `quota/quota.js` |

The other half of the cycle, `viewer → loader` (12 edges), is downward in
this order and so is not in the table: five are `loadProgress.js`, three
are the Conway loader reaching its own siblings.

The survey this started from said `closeAllEngineSessions()` is called at
sign-out. It is called by Clear cache only
(`ProfileControl.jsx:416`, `clearLocalCacheReleasingEngines`).

**After the mechanical move** (§7): **55 in 31 files** after M1, **19 in
15 files** after M2. The 19 are the allowlist the plan works off. The
last column is the slice that deletes the entry. Entries 15 and 16 are
not among today's 79: moving `modelSession.js` into its layer is what
makes its store imports upward.

| # | From → to | Import | Removed by |
|---|---|---|---|
| 1 | engine → loader | `engineModelLoad.js` → `loadProgress.js` | R |
| 2 | model → loader | `bvhBuild.js` → `loadProgress.js` | R |
| 3 | model → loader | `deferredBatchedBvh.js` → `loadProgress.js` | R |
| 4 | base → loader | `OPFS/reportOpfsSourceCondition.js` → `loadProgress.js` | R |
| 5 | base → loader | `OPFS/reportOpfsSourceCondition.js` → `loadCaptureContext.js` | R |
| 6 | loader → ui | `loadProgress.js` → `store/useStore.js` | R |
| 7 | model → loader | `buildBatchedConwayModel.js` → `conwayDirectIfcLoader.js` | 1a |
| 8 | loader → viewer | `ProgressiveLoadSession.js` → `three/cameraLimits.js` | 2a |
| 9 | loader → ui | `ShareIfcLoader.js` → `Components/Camera/hashState.js` | 2a |
| 10 | viewer → ui | `three/IfcIsolator.js` → `store/useStore.js` | 2b |
| 11 | loader → ui | `Loader.js` → `store/useStore.js` | 3a |
| 12 | loader → ui | `glbArtifactPublish.js` → `store/useStore.js` | 3a |
| 13 | loader → ui | `bldrsElementProperties.js` → `store/useStore.js` | 3a |
| 14 | loader → ui | `Loader.js` → `connections/persistence.ts` | 3a |
| 15 | session → ui | `modelSession.js` → `store/useStore.js` | 3a |
| 16 | session → ui | `modelSession.js` → `store/IFCSlice.js` | 3a |
| 17 | viewer → ui | `ShareViewer.js` → `Infrastructure/IfcElementsStyleManager.js` | V |
| 18 | viewer → ui | `ShareViewer.js` → `Infrastructure/IfcCustomViewSettings.js` | V |
| 19 | base → ui | `privacy/analytics.js` → `quota/quota.js` | not this redesign: `getTier` for the GA `tier` param. Follow-up: pass the tier in |

Without M1's two splits (§2.2) and one moved helper (`sizeClass`, a pure
function `unsupportedSchema.js` takes from `reportLoadDiagnostics.js`)
the count after M2 is 24 in 19.

**What the count does not show.** Three violations are ownership, not
imports, and a static test pins each once it is fixed (§7, slice 1b):

- **The viewer owns engines.** `ShareIfc` constructs the page's `IfcAPI`
  (`ShareIfc.js:142`), tracks engine loads parsing into it (`:161`,
  `trackEngineLoad`), and its `dispose` (`:247`) closes every registered
  model's engine, aborts the tracked loads and calls `CloseModel`.
- **Two partial owners.** `spawnEngine.js:181` keeps `liveSessions`, a
  set used only by Clear cache. A `ModelSession` holds `session.engine`,
  bound only once a load has put its model in the store
  (`modelSession.js#bindEngine`), and only the top model's. Neither knows
  every engine.
- **Module-level per-load state**, which keeps loads one at a time:
  `loadProgress.js:80, 83` (`activeReporter`, `loadSerial`),
  `glbArtifactPublish.js:38` (`generation`), `Loader.js`'s
  `cacheWriteOwner` (`:126`), the streaming selection on the viewer's
  `scene.userData` (`streamingBatchPick.js:65, 154`), and
  `modelSession.js`'s `loadingUiOwner` and `pageHost` (`:55, 63`).


## 4. The seams

### 4.1 `Engine`, its implementations, and `EngineHost`

Decided by the owner on 2026-11-24 (decision 10). A first version of
this section proposed `EngineConnection` for the renamed `EngineSession`
and gave the lease two fields, `connection` and `api`. Both are replaced.

**The interface.** `Engine` (`engine/Engine.js`, a typedef and the event
names) is one open model's engine, whatever the format and wherever it
runs:

```js
/** @typedef {object} Engine */
engine.open(source, {format, stream, sourceOverride}) → Promise<{windowed, modelInfo, entryPath}>
engine.pump(mode)                   // 'run' | 'throttle' | 'pause'
engine.abort()
engine.tree({mode, includeSolids}) → Promise<Node>
engine.properties(id, {recursive}) → Promise<object>
engine.propertiesMany(ids, opts) / propertySets(id, opts) / propertyTables(tables)
engine.itemsOfType(type, {verbose}) → Promise<Array<number>>
engine.typeName(code)               // synchronous: a static table
engine.capture({geometryExpressIds}) / spill(file) / stats()
engine.close() → Promise            // idempotent; resolves when the engine has let go of OPFS

// What a load needs and a reader does not:
engine.on(event, cb)                // progress, modelInfo, log, preview, indexed, batch, done, failed
engine.geometry                     // GeometrySource: the synchronous reads the batch builder makes
engine.capabilities                 // {openStream, openFromIndex, asyncPump, propertyTables, recapture}
```

- **It is today's `EngineSession` surface**
  (`engine/EngineSession.js:106–554`), which the session, the tools and
  the loader already use for a worker load. Nothing is added for its own
  sake. It is the owner's list (`open`, `tree`, `properties`,
  `propertiesMany`, `propertyTables`, `propertySets`, `itemsOfType`,
  `typeName`, `pump`, `capture`, `spill`, `stats`, `abort`, `close`) plus
  the three members a load cannot do without:
  - `on`: geometry, previews, progress and the `done` summary arrive as
    events (engine-worker.md §4);
  - `geometry`: the batch builder reads each new geometry synchronously
    (`GetGeometry`, `GetVertexArray`, `GetIndexArray`,
    `incrementalBatchedBuilder.js`). On a `WorkerEngine` those reads are
    served from the transferred payloads (`engineModelLoad.js#makeEngineIfcApi`,
    today); on a `ConwayEngine`, from the wasm heap. The builder does not
    know which;
  - `capabilities`: how a caller varies what it does. A caller asks what
    an engine can do, never what kind it is.
- **One model per engine**, so no call takes a `modelID`. That retires
  the literal `0` at every read site (in-app-model-switch.md §7) as those
  sites move onto `Engine`.
- **A caller never branches on kind.** `lease.kind` is the host's
  bookkeeping, for the budget and the tiers.

**The implementations.**

| Class | What | `kind` | Freed by |
|---|---|---|---|
| `WorkerEngine` | today's `EngineSession`, renamed: the client of the engine handler over a transport. By default the transport is a module worker (`Engine.worker.js`) | `worker` | `terminate()`, politely first when it holds a sync access handle (`close()`, ≤ `ENGINE_CLOSE_TIMEOUT_MS`, 1 s) |
| `WorkerEngine`, in-process transport | the same class, handler and protocol on the main thread: no module workers, or a worker failed to start on this page (`spawnEngine.js:121–165`) | `inProcess` | `handler.dispose()`, then garbage collection |
| `ConwayEngine` | Conway's `IfcAPI` on the page, IFC and STEP, adapted to `Engine`. It is today's raw main-thread path: `engineRoute.js#mainThreadEngineReason` (the rollback, the kill switch) | `mainThread` | `CloseModel` and dropping every reference, then garbage collection |
| `MeshEngine` | **future, not built.** The three.js-loaded formats (GLB, OBJ, STL, PLY, PDB, XYZ, …) answering the same reads from the parsed scene: a tree from node names, no properties | — | its scene |

**The rename.** `EngineSession` → **`WorkerEngine`**
(`engine/WorkerEngine.js`). The owner's reason: "bc it's on a Worker
thread". After it, "session" in code means `ModelSession` only.

- It touches 14 production files, 21 test files and 7 docs, 178 mentions.
  `spawnEngineSession` → `spawnWorkerEngine`; `SESSION_CLOSED` →
  `ENGINE_CLOSED`; the model handle's `ifcAPI.engineSession` becomes
  `model.engine`. The protocol's `epoch` and every message are unchanged,
  so a cached `Engine.worker.js` from before the rename still works.

**The in-process fallback stays a `WorkerEngine`.** It is a worker engine
without the thread, and `kind: 'inProcess'` is what records where it
runs. The other choice was to make it a `ConwayEngine`. Three reasons
against that:

- **It is the worker's code.** The in-process transport runs
  `createEngineHandler`, the same handler the worker runs, behind the
  same protocol, and clones and transfers each message as a real worker
  boundary would (`transports.js:79–137`). That is why Jest drives it,
  and why a payload that could not cross to a worker fails there too.
- **It is the fallback for a worker that did not start**: a stale cached
  script, a protocol mismatch, an init timeout. The page then needs the
  same engine by other means, not another pipeline. A `ConwayEngine`
  would move those users onto the kill-switch path's code: geometry read
  from the heap in place of the batch columns, its own capture, no
  sidecar.
- **`ConwayEngine` stays one thing**: the raw `IfcAPI`, there so that a
  bug in the handler, the protocol or the stream encoding has a path
  that shares none of them.

The cost is a name that reads oddly for one case. The class is named for
the code it runs; `kind` says where.

**`ConwayEngine`, and what it costs.** Today the kill-switch path is not
behind any interface. `ShareIfcLoader#parse` forks on `engineLoad !==
null` in 16 places, and its main-thread arm calls
`parseIfcWithConway(buffer, ifcAPI, …)` (`conwayDirectIfcLoader.js:131–590`)
with callbacks, then reads the `IfcAPI` directly, some of it
synchronously: `GetAppliedCoordinationMatrix`, the statistics getters,
`GetLinearScalingFactor`, and `recapture()`, which re-streams every mesh
for the end-of-load fallbacks. Putting that behind an asynchronous
`Engine` is a real change on the path whose job is to be the safe one:

- `parseIfcWithConway`'s open and pump become `ConwayEngine#open` and
  `#pump`; what it handed to callbacks arrives as the same events a
  `WorkerEngine` sends. A `ConwayEngine` calls its listeners in the same
  tick, by reference, with no column encoding and no copy, so the parse
  does the work it does today in the order it does it. The contract for
  consumers is that an event may arrive in the same tick or a later one;
- the synchronous reads move into the `done` summary, as the worker's
  already are (engine-worker.md §4);
- `recapture` is a capability only a `ConwayEngine` has. The end-of-load
  fallbacks, the items-map parity probe and the instancing stats ask
  `engine.capabilities.recapture`, where today they ask `engineLoad ===
  null`;
- `ShareIfcLoader#parse` then has one path, which is the point: the
  forks are where the two engines drift apart.

It lands in slice 1a with its own contract test (§7).

**Conway's name is confined.** `IfcAPI` stays Conway's export:
`@bldrs-ai/conway/web-ifc` mirrors web-ifc, and Conway is not asked to
rename it. Share names it only inside the engine's adapters:
`ConwayEngine` and the worker's handler.

- **A lint rule holds the import.** `no-restricted-imports`, for every
  production file under `src` outside `src/engine`, on
  `@bldrs-ai/conway/web-ifc` and on the deep paths of the same surface
  (`@bldrs-ai/conway/src/compat/web-ifc/*`). Run on virtual files through
  the repo's eslint (§10): a viewer file importing `IfcAPI` is an error,
  a UI file importing a type code is an error, an engine file and a test
  are not, and neither is the loader's import of Conway's logger, which
  is not this surface.
- **The rule does not see a dynamic `import()`.** The two that exist are
  in `src/engine` (`Engine.worker.js:25`, `spawnEngine.js:124`). A static
  test greps for `import('@bldrs-ai/conway` outside it.
- **The constants need neither an allowlist nor a re-export**, because
  every importer outside `src/engine` today is leaving:

  | Importer today | What it imports | Where it goes |
  |---|---|---|
  | `viewer/ifc/ShareIfc.js:45` | `IfcAPI` | slice 1a: `ShareIfc` holds a `ConwayEngine` |
  | `Infrastructure/IfcElementsStyleManager.js:2`, `ViewRulesCompiler.js:3` | IFC type codes | deleted by slice V |
  | `loader/bldrsElementPropertiesCapture.js:77` | `IFCRELDEFINESBYPROPERTIES` | the file moves into `src/engine` in M1 (it is the capture job) |
  | `Components/Properties/propertyTable.js:36`, `viewer/ifc/pumpTestSeams.js:1`, `loader/stepFormat.js:6` | the compat surface by deep path | each moves into `src/engine` in M1 |

  So the rule lands in slice 1a with no exception. Later, UI code that
  needs an IFC type code gets it from a re-export in `src/engine`
  (`engine/ifcTypes.js`), never from an allowlist entry: a second place
  that names Conway's package is what the rule is there to prevent.
- **The identifier is a separate sweep.** The import rule does not
  rename `ifcAPI`, the parameter and property name that 250 production
  lines in 21 files carry (19 of the files outside `src/engine`): the
  model's builders take it as their geometry source, and
  `model.ifcManager.ifcAPI` is the read handle. Slice 1a adds
  `model.engine` and keeps the old handle as an alias; slice N renames
  the rest and adds a static guard (§7).

**The main-thread lease.** The decision's "a session can have no engine …
or the main-thread path, which has an `IfcAPI` and no worker" is read as:
on that path the session holds no *worker*. The engine still needs one
owner, and it cannot be the viewer (layer 5 owns no engines) or the
session alongside the host (two owners again). So a `ConwayEngine` is
leased like any other, with `kind: 'mainThread'`, never kept in the
background (engine-worker.md §8.1 item 7). The owner agreed on
2026-11-24.

A `mainThread` lease is outside the count and the byte budget: the host
can neither measure it nor free it. It exists so that there is one owner
and one release path. `host.acquireMainThread(owner)` is synchronous for
that reason, with no admission to wait for.

- **Until slice 2d** the viewer is built per open, and every viewer has
  one idle `IfcAPI`, on the worker route too. That object is load-bearing
  today: `Loader.js:213` probes it for `OpenModelStream`, and a mesh
  model's `ifcManager` shim is the viewer's (`:2261`). So until then
  there is one idle `ConwayEngine` per viewer build, which
  `Containers/viewer.js` acquires in `initViewer` and releases in
  `disposeViewer`: the same lifetime as today's `IfcAPI`. The probe
  reads `engine.capabilities.openStream`.
- **From slice 2d** the viewer lives for the page, and the load acquires
  the lease, only on the main-thread route. A worker-route page then has
  no `IfcAPI` object at all, which is engine-worker.md §5.1's aim. A mesh
  model gets a manager of its own, with no engine. Its own, because the
  shim today writes the model's `getSpatialStructure` onto the viewer's
  one shared manager (`Loader.js:2261–2264`); under one viewer a second
  mesh model's load would overwrite the first one's. `MeshEngine` is the
  better form of that shim, and the convergence follow-up: a mesh model's
  reads through `Engine`, from its own scene (§4.8).

**Host ↔ engine.**

```js
// engine/spawnEngine.js: imported by EngineHost.js only (a static test)
spawnWorkerEngine({inProcess, makeWorker, loadIfcAPI, initTimeoutMs}) → Promise<WorkerEngine>

// What the host reads off an engine it made, beyond the Engine interface:
engine.kind                         // 'worker' | 'inProcess' | 'mainThread'
engine.lastWasmBytes                // kept from every event and reply that carries it (built, for a WorkerEngine)
engine.heldSourceBytes              // new: the whole-file buffer or held Blob copy, 0 once spilled
```

- **Spawn:** only the host calls `spawnWorkerEngine` or constructs a
  `ConwayEngine`. It keeps the worker-then-in-process fallback and the
  page's remembered worker failure.
- **Account:** the host subscribes to the engine it made. Every
  `progress`, `batch`, `log` and reply already carries `wasmBytes`; the
  worker adds `heldSourceBytes` to `open`, `spill`, `done` and `stats`,
  which needs no protocol bump (engine-worker.md §4). The estimate is
  engine-worker.md §5.2's. A `ConwayEngine` reports its wasm bytes the
  same way and is not budgeted.
- **Terminate:** `engine.close()`. Above the host, only a lease's
  `release()` reaches it.

### 4.2 The lease: `EngineHost` ↔ session

```js
// engine/EngineHost.js
const host = getEngineHost()                    // one per page

host.acquire({
  owner,          // opaque id of the holder (a model session's id). Leases are grouped by owner
  entryHint,      // the OPFS path prefix the load is about to open, or null (§4.7)
  modelKey,       // one engine per model per owner: an earlier lease with the same owner
                  //   and modelKey is released by this call (not awaited)
  format,         // 'ifc' | 'step': the estimate's per-format allowance. Data, not a branch
  sourceBytes,    // the estimate, and windowed-for-budget
  purpose,        // 'load' | 'retry' | 'rehydrate'
  isForeground,   // at acquire; later through lease.update
  signal,         // gives up while waiting for admission or for the spawn
}) → Promise<EngineLease>

lease.id, lease.owner
lease.engine                     // the Engine (§4.1): a WorkerEngine or a ConwayEngine. The only way in
lease.kind                       // 'worker' | 'inProcess' | 'mainThread': the host's bookkeeping
                                 //   for the budget and the tiers. A caller does not branch on it
lease.sourceOverride             // {windowed: true} when admission chose windowed for the budget; else null
lease.state                      // 'live' | 'paused' | 'evicted' | 'released'
lease.update({isForeground, phase, hasArtifact, queuedBytes})
                                 // phase: 'loading' | 'capturing' | 'ready'
lease.onEvict(cb)                // cb({reason: 'count' | 'bytes' | 'restage', tier}), after the engine is gone
lease.onPause(cb) / lease.onResume(cb)          // backpressure (engine-worker.md §5.2)
lease.release() → Promise<void>  // idempotent; settles when the engine has let go of its OPFS entry

host.acquireMainThread(owner) → EngineLease     // synchronous; kind 'mainThread' (§4.1)
host.mayKeepInBackground(owner) → boolean       // what a switch does to the owner's engines
host.whenEntryFree(entryKey) → Promise<void>    // §4.7
host.closeAll() → Promise<number>               // Clear cache
host.limits()                    // {maxLiveOwners, budgetBytes, mode}
host.snapshot()                  // live and paused leases: [{leaseId, owner, kind, state, phase, estimate, lastForegroundAt}]
```

**What `meta` is for.** Everything the host needs to choose a victim, and
nothing that would let it call up:

| The host needs | From |
|---|---|
| is the holder the one on screen | `isForeground`, at acquire and through `update` |
| when it was last on screen | the host stamps `lastForegroundAt` when `isForeground` turns true |
| does a GLB artifact back it | `update({hasArtifact})` |
| is a load or a capture running in it | `update({phase})` |
| bytes queued main-side, unassembled | `update({queuedBytes})` |
| which OPFS entry it holds open | `meta.entryHint` from the moment of acquire, narrowed to the engine's `open` reply (`entryPath`, `engineSources.js#openSourceStore`): the entry the worker actually opened |

**Rules of ownership and lifetime.**

- **The host owns the engine. A lease is the only thing a session
  holds.** A model's read handle keeps `lease.engine` to answer reads;
  after an eviction those reject with `ENGINE_CLOSED` and the session
  has already swapped its read model (engine-worker.md §5.5).
- **A lease ends once**, by `release()` (the holder is done) or by
  eviction (the host needs the memory). Both are final. `onEvict` runs
  after the terminate. A session that wants an engine again acquires a
  new lease.
- **An ended lease holds nothing.** `release()` and eviction null
  `lease.engine` and take the lease out of the host's
  table once its close has settled; until then the host keeps only the
  closing promise and the entry key. `snapshot()` lists live and paused
  leases. This matters for the main-thread engine, which is freed only by
  being unreachable: `modelSwitchMemory.spec.ts:102–106` holds a `WeakRef`
  to `model.ifcManager.ifcAPI`, and a host that remembered released
  leases would keep it alive.
- **A session holds a set of leases, usually zero or one.**
  - Zero: a mesh format, a GLB cache hit, an evicted session.
  - One: an IFC or a STEP.
  - More: a `.bld` assembly, whose children each parse in their own
    engine (`BLDLoader.js:53` calls `load()` per child). Today only the
    viewer's dispose finds those engines.
- **Count and tiers are per owner; bytes are per lease.** "One live
  model" at cap 1 means one owner, however many engines its `.bld` holds.
  An owner is evicted as a unit.
- **Several engines in one session's life**, each a new `acquire`:

  | Event | What happens |
  |---|---|
  | Out-of-memory retry (`engineModelLoad.js#parse`, engine-worker.md §5.6) | the loader releases the failed lease (not awaited, as today), then acquires with `purpose: 'retry'`; admission answers `sourceOverride: {windowed: true}` |
  | Eviction | the host terminates and calls `onEvict`; the session drops the lease and keeps everything else |
  | Rehydrate | `session.ensureEngine()` acquires with `purpose: 'rehydrate'` and opens index-only from the sidecar (engine-worker.md §5.3). A rehydrating lease is not evicted until its first `update({phase: 'ready'})` |
  | Sidecar reopen | an ordinary `load` acquire; the worker finds the sidecar itself (`engineSidecars.js`) |

- **What an eviction or a close interrupts.**

  | In flight | What happens |
  |---|---|
  | `acquire`, waiting for admission or the spawn, and its `signal` aborts | it rejects with `LoadAbortedError`. A spawn that lands afterwards is closed by the host, as `engineModelLoad.js` does today for a spawn that outlives its abort |
  | a background load, evicted (tier 4) | the run ends as *paused*, not failed and not aborted: no alert, no Sentry, one GA `engine_evicted {tier: 'loading'}` (engine-worker.md §5.5). `LoadState` gains `paused` in slice 4 |
  | a GLB capture, evicted (tier 3) | the capture rejects and no artifact is written, as a failed capture today (engine-worker.md §7 step 5) |
  | a read (`properties`, `propertyTables`, `tree`), evicted | it rejects with `ENGINE_CLOSED`. The session's read facade retries it once on the read model it swapped to in `onEvict`, so the panel sees an answer or the artifact's gap, never the rejection |
  | a rehydrate | not evicted until its first `update({phase: 'ready'})` |
  | `session.close()` while its lease's polite close is still running | `close()` returns at once; the host keeps the closing lease until it settles, and `whenEntryFree` (§4.7) is what waits for it |

- **`acquire` waits for admission, and for no close.** Today nothing
  that starts an engine awaits the previous one's close: a switch
  terminates the left engine and spawns the next, and the out-of-memory
  retry closes the failed engine and respawns (`engineModelLoad.js:405,
  427`). Read-only sync access handles on one entry coexist. Awaiting a
  polite close would add up to 1 s (`ENGINE_CLOSE_TIMEOUT_MS`) to every
  such step when the engine is busy in a long wasm call. So `acquire`
  awaits no close.
- **A new run supersedes the last one's engine, and says so in two
  places.** Until slice 2c a theme change rebuilds the viewer and reloads
  the model into the *same* session (`CadView.jsx:338–352`,
  `modelSession.js:390–393`), and so does the authed retry. Today the old
  run's engine is freed by the old viewer's dispose (`ShareIfc.js:247–258`),
  which slice 1b takes away. So:
  1. `ModelSession#beginLoad` releases every lease of the previous run
     before the new run starts;
  2. the host is the net under it: an `acquire` for an owner and
     `modelKey` that already has a lease releases that lease itself (it
     does not wait for someone to). Without one of these the old engine
     would leak for as long as the session lived.

  A `.bld` child acquires under its own key (`ctx.child({root,
  modelKey})`), so siblings do not supersede each other. What must never
  overlap a handle is an OPFS *write*, and that is §4.7.
- **The cap is asked, not read.** The session layer calls
  `host.mayKeepInBackground(owner)`: false when
  `utils/backgroundSessionsMode.js` says single model
  (engine-worker.md §5.2), or when any of the owner's leases is
  `inProcess` or `mainThread` (the host reading its own `kind`). `host.limits()` is derived from the same
  predicate, so the two cannot disagree. A session with no lease is kept
  or closed by the predicate alone.

### 4.3 The load context

```js
// loader/Loader.js
load(source, ctx) → Promise<LoadResult>

/**
 * @typedef {object} LoadContext
 * @property {AbortSignal} [signal]   the run was given up (utils/loadAbort.js)
 * @property {LoadReporter} report    this run's own reporter (§4.4)
 * @property {EnginePort} engine      acquire and release leases for this session
 * @property {Group} root             everything the load adds to a scene goes under it
 * @property {StateWriter} state      set(partial) into this session's per-model state
 * @property {LoadEnv} env            what the page provides: OPFS availability, the recents ledger
 * @property {object} [hooks]         {onIndexed(handle), onFirstMesh()}
 */

/** @typedef {object} EnginePort
 * @property {function({format, sourceBytes, purpose}): Promise<EngineLease>} acquire
 * @property {function(EngineLease): Promise<void>} release */

/** @typedef {object} StateWriter
 * @property {function(object): boolean} set   false, and nothing written, once the run is not current
 * @property {function(string): *} get */
```

- **`source`** is what to open, already resolved by the UI from the
  route: `{url, kind, displayName, accessToken, isUploadedRoute,
  githubPath}`. Auth (the Auth0 token, the Drive download, the authed
  retry) stays in the UI, which calls `session.load(source)` again with a
  token. The loader no longer parses `window.location`.
- **`LoadResult`** is `{model, format, capabilities, sourceBytes,
  entryKey, hasArtifact, rehydrateSource}`. `model` is the object under
  `ctx.root`. The last three are what a session needs for eviction and
  rehydrate (engine-worker.md §5.2); they replace reading the model's
  internals afterwards.
- **Errors** are today's classes, unchanged: `LoadAbortedError`,
  `NotFoundError`, `UnsupportedSchemaError`, `UploadNotInBrowserError`,
  `EvictedOpfsSourceError`, `ZipArchiveError`, and an out-of-memory
  failure marked by `utils/oom.js#markIfOutOfMemory`. A load that rejects
  has removed what it added under `ctx.root` and released every lease it
  acquired.
- **Abort** is `ctx.signal`, with today's contract
  (in-app-model-switch.md §4.5a): the load rejects with
  `LoadAbortedError` at its next await; work it cannot stop (a mesh
  parse) runs on and its result is dropped. The state writer and the
  reporter go quiet on their own, because the run is no longer current.
- **Who holds the leases.** The engine port is the session's. It records
  each lease on the session as it is acquired, so `session.close()`
  releases them all whatever the load was doing. The loader releases a
  lease itself only where it knows the engine is finished: a failed open,
  the retry.
- **A nested load** (`.bld`) gets `ctx.child({root: group, modelKey})`:
  the same signal and reporter, its own sub-root, an engine port that
  acquires under the child's own key, and a state writer that drops
  everything. That replaces `isNestedLoad` and the
  `NESTED_LOAD_GENERATION` sentinel (`glbArtifactPublish.js`).

**What the loader no longer gets, and what stands in.**

| Today, through `viewer` or the store | Where (`Loader.js` unless named) | Instead |
|---|---|---|
| `viewer.context.getScene()` to add previews and models | `:231, 1158, 1259` | `ctx.root` |
| `viewer.IFC.addIfcModel`, `…ifcManager.state.models.push` | `:1206, 1207` | nothing: the viewer registers a root's models at attach (§4.6) |
| `viewer.ifcLoader`, `new BLDLoader(viewer)`, `viewer.IFC.type` | `findLoader`, `swapToGlbLoader` (`:2598–2989`) | the loader constructs its own `ShareIfcLoader`; the format is `LoadResult.format` |
| `viewer.IFC.loader.ifcManager.ifcAPI` for the store-open probe and the main-thread capture | `:213, 1330` | `engine.capabilities.openStream` and `engine.capture()`: the same two calls on either engine |
| `viewer.IFC.ifcLastError` | `:2471` | the parse's own rejection |
| the camera, camera-controls and `RenderDemand` for the load's follow, and the `#c:` test | `ShareIfcLoader.js:452–472` → `ProgressiveLoadSession` | events on `ctx.root`; the viewer follows (§4.6) |
| `viewer.context.getRenderer()` for the renderer-limits report and the splat renderer | `:1220`, `splats.js:155` | the binder reports limits at attach; a format's view resources attach through `root.userData.view` (§4.6) |
| `useStore`: `isCacheWriteInFlight`, `glbArtifact`, the alert, the report lines | `:134, 147`, `glbArtifactPublish.js:61, 92`, `bldrsElementProperties.js:121`, `loadProgress.js` (6 calls) | `ctx.state.set`, `ctx.report` |
| `setOpfsFile`, `onProgress` | arguments | `ctx.state.set({opfsFile})`, `ctx.report.progress` |
| `connections/persistence` for recents | `:615, 1864` | `ctx.env.recents` |

**Getting there without a rewrite.** `Loader.js` keeps its body.

1. **The adapter (in slice 1b).** `load()` builds a `ctx` from its present
   arguments on its first line (`legacyLoadContext(viewer, onProgress,
   setOpfsFile, options)`), and the body reads `ctx.*` from then on: the
   33 lines that use `viewer` and the store calls become about eight
   accessors.
   Neutral by construction: each accessor returns what the expression it
   replaces returned.
2. **One field per slice.** Slice 1b supplies `ctx.engine` for real. R
   supplies `ctx.report`. 2a supplies `ctx.root`. 3a supplies `ctx.state`
   and `ctx.env`. Until its slice, a field is the adapter's.
3. **The signature flips last** (in 3a), when nothing reads the legacy
   arguments: a rename of the parameter list and its call sites, three in
   `CadView.jsx` and one in `BLDLoader.js`.

### 4.4 The reporter

One `LoadReporter` per load run, made by the session and passed as
`ctx.report`. It replaces the module's `activeReporter` and `loadSerial`
(`loadProgress.js:80, 83`) and the two dozen module-level functions that
write to whichever reporter is active (the name appears 60 times in the
file).

```js
// loader/loadProgress.js
new LoadReporter({fileInfo, sink, hasConsoleTee})
// sink: {lines(lines), currentLine(line), result(result)}; the session passes its state writer

report.progress(evt)                 report.line(text)
report.engineVersion(text)           report.engineLog(msg)
report.modelInfo(info)               report.geometryStats(stats)
report.cacheHit(isHit)               report.firstMesh()
report.summary(text)                 report.bvhDepthCap({trees, maxLeafTriangles, maxDepth})
report.rendererInfo(line)            report.framingExclusion(bounds)
report.pauseWatchdog() / resumeWatchdog()
report.failureInfo() / captureContext() / captureDiagnostics(…)
report.end(error, {isAborted})
```

- **Below the loader it is a plain object of callbacks.** The engine
  takes `createEngineModelLoad({format, acquire, report})`; the model's
  BVH builders take `{onDepthCap}`. Neither imports `loadProgress.js`.
  There are ten production importers today (§3), so this is threaded by
  hand, not shimmed.
- **Its output is per-model state.** `loadReportLines`,
  `currentLoadLine` and `loadResult` are already in the per-model list
  (in-app-model-switch.md §4.3). The reporter writes them through its
  sink into the session, and the binder shows the bound session's. A
  background load's report is there when the user returns.
- **Three things stay page-wide, and say so:**
  - *The console tee and the defect proxy* over conway's static `Logger`
    capture the page's console for one load. One reporter holds them at a
    time, the foreground job's (`hasConsoleTee`). A background load still
    gets its engine's own log, which arrives per engine (`Ev.LOG` →
    `report.engineLog`); it loses page-side lines (`[glb]`, the builder's
    warnings) from its diagnostics count. Only worker engines load in the
    background, so the engine's diagnostics are never the ones lost.
    Accepted by the owner on 2026-11-24 (§9, item 6) as a known gap, to be
    closed by the console cleanup that is coming anyway, not here.

    The tee needs **one owner for the page**, not a reporter's own saved
    originals. Each reporter saves `console.warn` and `console.error` when
    it installs (`loadProgress.js:260–261`) and writes them back when it
    ends (`:408–415`). That is safe today only because
    `beginLoadProgress` disposes the previous reporter before the next
    installs (`:1231–1240`). With a reporter per run, a left run that ends
    late (a mesh parse that could not be stopped, a remount) would write
    back the originals and strip the next load's tee: its warnings line
    and its diagnostics count would go missing with no error. So slice R
    adds `consoleTee.js`: it patches the console once, holds the true
    originals, and routes captured lines to whichever reporter currently
    holds it. A reporter takes it at its start and gives it up at its
    end; giving it up when another reporter has since taken it does
    nothing.
  - *Sentry's scope.* `applySentryLoadState` (`loadProgress.js:783`)
    stamps the `load.phase` tag and a `load` context on the global scope,
    for whatever is captured next. Only the foreground job's reporter
    does that. A background load's own captures carry its tags per event
    (`sentryLoadState()`, as `loadFailureCaptureContext` already does),
    so a background failure cannot carry the foreground model's phase, and
    a foreground failure cannot carry a background one's.
  - *The stall watchdog* is per reporter. A pump paused by backpressure
    is not a stall: `lease.onPause` calls `report.pauseWatchdog()`.
- **`OPFS/reportOpfsSourceCondition.js`** moves to the loader, with the
  two constants `OPFS/utils.js` takes from it moved to
  `OPFS/messages.js`.

### 4.5 Session state, and the store as its projection

```js
// session/modelState.js
class ModelState {
  constructor(defaults)             // every per-model field, from the slices' declarations
  get(key) / all()
  set(partial)                      // synchronous; notifies subscribers once per call
  subscribe(cb) → unsubscribe       // cb(partial)
}

// session/ModelSession.js
session.id, session.modelKey, session.loadState
session.state                       // ModelState: the truth for this model's fields
session.root                        // Group
session.viewState                   // {camera, planes} or null; written at detach
session.leases                      // Set<EngineLease>
session.job                         // the current LoadJob, or null
session.load(source) → Promise      // one run: makes the LoadJob, the reporter and the ctx; calls loader.load
session.ensureEngine() → Promise<EngineLease>     // rehydrate, engine-worker.md §5.3
session.on(event, cb)               // 'indexed' | 'firstMesh' | 'ready' | 'failed' | 'engineEvicted' | 'engineRehydrated' | 'closing' | 'closed'
session.dropScene()                 // the scene tier: dispose the root, keep the state
session.close()                     // emit 'closing'; abort; release every lease; dispose the root; drop everything

// session/ModelSessionHost.js: one for the page
getModelSessionHost()
host.open(modelKey) → ModelSession  // the same model → the active session; else leave the active one
host.active
host.leave(session)                 // close, or keep in the background (EngineHost#mayKeepInBackground)
```

- **The session's state is the truth.** A `LoadJob`'s `set(partial)`
  writes `session.state` when the job is its session's current run and
  was not aborted. It no longer asks whether the session is active: a
  background session's load writes its own state, which is the point of
  cap N. At cap 1 a left session is closed, so its job is not current, as
  in #2247.
- **The per-model field declarations move down.** #2247's
  `ifcModelState()`, `navTreeModelState()` and `browserModelState()` go to
  `session/modelStateFields.js`; the slices import them and spread them
  into their initial state, as now. `store/modelState.js#modelStateDefaults`
  becomes a re-export.
- **One projection** (`store/modelProjection.js`, UI layer):
  - a zustand middleware around the store's writes. A partial that names
    per-model keys is written to the bound session's `state` and to the
    store in the same call, so subscribers see one update. No slice setter
    changes. It has to wrap both ways in: the `set` handed to the slices
    *and* `api.setState`. zustand 4.0.0's `create((set, get) => …)`
    (`store/useStore.js:27`) gives a middleware the first only if it asks,
    and 21 production call sites write through `useStore.setState`, many
    with per-model keys (`IfcIsolator.js:816, 1340`,
    `SelectElementsEventHandler.js:50`, `modelSession.js:121`). The
    middleware replaces `api.setState` with the wrapped setter and keeps
    the original as the raw one;
  - `bindSession(session)`: `store.setState(session.state.all())`, then
    subscribe, so what a load writes into the bound session appears in the
    store;
  - `unbindSession()`: unsubscribe, then
    `store.setState(modelStateDefaults())`.

  Two details keep it from looping. The projection writes the store with
  the raw setter the middleware wraps, not through the middleware. And
  `ModelState#set` notifies only for keys whose value changed
  (`Object.is`). A functional `set((state) => partial)` is resolved
  first, then split.

  The selection, isolation, display overrides and the rest of
  in-app-model-switch.md §4.3's inventory become per-model keys the same
  way, which is the selection restore #2019 still owes. #2247's static
  test widens: outside `modelProjection.js` nothing calls
  `useStore.setState` with a per-model key from a load path.
- **The session host is the page's, not CadView's.** #2247 keeps a
  `ModelSessionHost` per CadView and closes its session at unmount. A
  background session has to outlive a CadView: an in-app open across
  route families (`/v/u`, `/v/g` ↔ `/v/p`) remounts it
  (in-app-model-switch.md §4.9). With one host for the page:
  - `pageHost` goes: the next view binds the same host;
  - `loadingUiOwner` goes: `isModelLoading` and `snackMessage` are the
    bound session's state;
  - a left load's unwind writes its own session's state and reporter. It
    has nothing of the next model's to reach.

  `useModelSessionHost` becomes a binding: on unmount, a microtask later
  and only if no view has bound since, it calls `host.leave(active)`.

### 4.6 Session ↔ viewer

The viewer takes a root, not a session. The binder (UI) makes the calls.

```js
// viewer/ShareViewer.js
viewer.attach(root, {viewState, statePort, isFirstAttach})
viewer.detach(root) → viewState          // {camera: {position, target, zoom, projection}, planes: […]}
viewer.attached                          // the root, or null
viewer.setBackground(color) / applyLook(look)     // a theme change, in place
viewer.dispose()                         // the page's things only; never a root

// model/disposeRoot.js
disposeModelRoot(root)                   // geometries (their BVHs, a deferred build cancelled),
                                         //   materials, textures, then root.userData.view?.dispose()
```

- **Attach** adds the root to the scene, registers its models for
  picking (`context.items.ifcModels`, which the loader fills today),
  binds the isolator, highlighter and clipper to it, restores `viewState`
  or fits on a first attach, refits the ground plane, applies the look if
  the root's differs, starts its residency motion driver, and asks for a
  paint. **Detach** is the inverse and disposes nothing.
  engine-worker.md §5.2a has the table of what each side owns.
- **`statePort`** is `{get(), set(partial), subscribe(cb)}` over the
  session's state. It is what `IfcIsolator` uses instead of its 20
  `useStore` calls (hidden, isolated and selected sets), so the isolator
  reads the attached model's state by construction.
- **The loader tells the viewer about a load through the root.** A root
  is an `Object3D`, so it dispatches events (`model/loadEvents.js`):

  | Event on the root | From | The viewer does |
  |---|---|---|
  | `loadbounds` `{box}` | `ProgressiveLoadSession`, as previews and batches arrive | the camera follow, unless a `#c:` pose pins the camera or the user took it (`cameraLimits.js`, `USER_CAMERA_EVENT`) |
  | `firstmesh` | the same | paints at once |
  | `loadstart` / `loadend` | the loader | `RenderDemand#begin` and its `end`: the load's frame budget |

  A detached root has no listener, so a background or headless load
  follows no camera and paints nothing. That is why the load context
  needs no view port.
- **A format's view resources** hang off its root:
  `root.userData.view = {attach(viewer), detach(viewer), dispose()}`.
  Splats add their `SparkRenderer` and ask to keep painting at attach
  (today `splats.js:139–169`, at load); a volume registers its
  `Data3DTexture` for dispose.
- **Window handlers** (`ondblclick`, `onkeydown`) are bound by the binder
  at attach and removed at detach, not recorded on the session.
- **A root is never disposed while attached, and the session never calls
  the viewer to make that so.** `session.close()` and `dropScene()` emit
  `closing` synchronously before anything else. The binder listens while
  a session is bound, and detaches there. Then the session disposes the
  root. `disposeModelRoot` begins with `root.removeFromParent()`, a three
  call that needs no viewer, as the net for a root some other code left
  in a scene. A load that cannot be stopped (a mesh parse) and returns
  after the close finds its run not current, adds nothing, and disposes
  what it built (§4.3).

### 4.7 `whenEntryFree`: the OPFS ordering contract

An engine reading its model through a sync access handle locks that OPFS
entry against removal and rewriting (engine-worker.md §7 step 4). The
rule: **every OPFS write, remove or re-stage of an entry first waits
until every engine holding that entry has closed.**

It spans three layers, and no layer imports upward to keep it:

```js
// OPFS/entryGate.js (base)
setEntryGate(fn)                 // fn(entryKey) → Promise<void>
entryFree(entryKey) → Promise    // resolves at once when no gate is set (tests, Node)

// engine/EngineHost.js: at construction
setEntryGate((key) => this.whenEntryFree(key))
```

- **Enforced in one place:** the mutators of `OPFS/utils.js`
  (`downloadToOPFS` and `downloadModel`, whose worker flows rename and
  remove entries, `OPFS.worker.js:887–912, 1845–1928`;
  `writeSavedGithubModelOPFS`, `writeBase64Model`, `deleteFileFromOPFS`,
  `deleteUploadFromOPFS`, `clearOPFSCache`) each await `entryFree(key)`
  before they post to the OPFS worker. A static test lists the module's
  exports and fails on a mutator that does not. Their callers (the loader, `connections/pruneLocalRecents`,
  drag and drop, Clear cache) do not change.
- **`entryKey` is a path prefix** under the OPFS root. The engine knows
  the exact path of the entry it opened (`engineSources.js#locateOpfsEntry`'s
  `path`, which `engineSidecars.js` already keys sidecars by). A mutator
  knows the owner, repo, branch and file it is about to touch, but not
  always the commit-stamped name the OPFS worker chose. So the gate
  matches every lease whose entry path starts with the key; the empty key
  is every entry (Clear cache). Waiting for one engine too many costs at
  most its close.
- **`host.whenEntryFree(key)`** does two things, in order:
  1. a lease still *live* on a matching entry is evicted (reason
     `restage`): its source is about to be replaced under it. At cap 1
     there is none, because a session releases its leases before its next
     run stages anything. Under cap N it is a background session, which
     keeps its scene and re-parses on its next rehydrate, since its
     sidecar no longer matches the file (engine-worker.md §5.3). The
     foreground owner's own lease is never evicted this way: its load is
     the one doing the staging, and it released its previous run's leases
     first;
  2. it settles when every matching lease has finished closing or timed
     out (`ENGINE_CLOSE_TIMEOUT_MS`).
- **A lease that is still opening is matched too.** The exact path comes
  back only with the `open` reply, and the window before it is exactly
  when the handle is being taken. So the load passes `entryHint` at
  `acquire`: the prefix it is about to open, which the loader knows, since
  it staged the file. The gate matches on the hint until the reply narrows
  it. A lease with no hint and no reply yet (a `File` the worker has to
  look up, `locateOpfsEntry`) matches every key. An opening lease caught
  this way is terminated rather than closed politely, and its lock goes a
  little after; `clearLocalCacheReleasingEngines` keeps its one retry for
  that (`ProfileControl.jsx:415`).
- **Reads do not wait.** Read-only handles on one entry coexist
  (`engineSources.js:359–362`), so a reopen of the same model never
  queues behind its previous engine.

### 4.8 IFC, STEP and the mesh formats: one path

| Step | IFC | STEP | Mesh (GLB, OBJ, STL, PLY, PDB, XYZ, USD, 3DM, ADF, FBX, splats, volumes) | GLB cache hit of an IFC or STEP |
|---|---|---|---|---|
| `load(source, ctx)` | the same call | the same | the same | the same |
| `ctx.engine.acquire` | yes, `format: 'ifc'` | yes, `format: 'step'` | never | never |
| the lease's engine | a `WorkerEngine` or a `ConwayEngine`, by `engineRoute.js`; the loader does not ask which | the same | — | — |
| under `ctx.root` | `BatchedMesh`es and the preview group | the same | the loaded object | the hydrated batches |
| reads | `Engine` | `Engine` | the scene graph (through a `MeshEngine`, later) | the artifact's readers; `session.ensureEngine()` for what they lack |
| refs | `e` | `o` (occurrence paths) | `n` | `e` / `o`, from the artifact's tables |
| `LoadResult.rehydrateSource` | the OPFS `File` or the in-memory upload | the same | null | the same as its format |

The differences between IFC and STEP are two values: the estimate's
allowance (0.6 against 3.0 of JS heap per source byte, engine-worker.md
§5.2) and the ref kind. Both are data the session passes down. A mesh
session is a session with an empty lease set; eviction passes it by, and
the scene tier treats it like any other.

**What is left to converge: `MeshEngine`.** `Engine` is format-neutral
so that the mesh formats can stand behind it too: `tree` from the scene
graph's node names, `properties` answering nothing, `itemsOfType` empty,
no `open` to pump. Today those reads are a shim written onto a manager
(`Loader.js:2261–2264`, `convertToShareModel`). A `MeshEngine` would
replace the shim and let the panels and the tools read every model one
way. It is not built here and no slice needs it. It would not be the
host's to lease: it holds no memory a terminate returns, and it reads
its session's own scene. Named as the follow-up, with `apps-t300`'s
headless tool surface as the first thing that would want it.

### 4.9 Who frees what, and when

| Event | Engine | Scene root | Per-model state | Viewer |
|---|---|---|---|---|
| Switch at cap 1 | every lease released (`session.close()`) | detached, then `disposeModelRoot` | dropped with the session; the store goes to defaults at unbind | kept (slice 2d); rebuilt before it |
| Switch at cap N | kept; `update({isForeground: false})` | detached, kept | kept in the session | kept |
| Eviction | the host terminates; `onEvict` | kept | kept; the read model swaps to the artifact's | untouched |
| Scene tier (dormant) | already gone | `session.dropScene()` | kept | untouched |
| Close (drawer, cap overflow) | released | disposed | dropped | untouched |
| Theme change, from slice 2c | untouched | untouched | untouched | background and look set in place |
| Theme change, before 2c (a reload into the same session) | `beginLoad` releases the previous run's leases; the new run acquires | the previous run's root content is disposed, the new run fills it | as today (`beginLoad`) | rebuilt, as today |
| Authed retry (a second run of the same session) | as the row above | as above | as above | untouched |
| CadView unmount, another view mounts | untouched | re-attached by the next view's bind | untouched | kept |
| CadView unmount, none follows | `host.leave(active)`: closed at cap 1, kept at cap N | as the row for that cap | as that row | disposed |
| StrictMode's effect replay | untouched | not detached: the unbind is deferred a microtask and cancelled by the rebind | untouched | not rebuilt (ref-counted the same way) |
| WebGL context lost and restored | untouched | kept; three re-uploads on the next paint | untouched | the context's own things rebuilt (§8) |
| Out-of-memory retry | the failed lease released, then a new one | cleared by the loader, kept | kept | untouched |
| Load aborted | the loader releases what it acquired; `session.close()` releases the rest | what the run added is removed | the run's writes stop | untouched |
| Clear cache | `host.closeAll()`, then the page reloads | — | — | — |
| Tab closed | the browser | — | — | — |


## 5. The lint rule

`import/no-restricted-paths` is already on, with two zones (the
pro-module fence and the Assist fence, `.eslintrc.cjs`). The layers are
more zones of the same rule.

**The table** (`tools/lint/layers.cjs`):

```js
// Low to high. A layer may import itself and anything listed before it.
const LAYERS = [
  ['base', ['utils', 'privacy', 'routes', 'net', 'OPFS', 'search', 'FeatureFlags.js', 'Filetype.js']],
  ['engine', ['engine']],
  ['model', ['model']],
  ['loader', ['loader']],
  ['session', ['session']],
  ['viewer', ['viewer']],
]
```

`layerZones()` emits one zone per lower-layer target. It bans all of
`./src` and excepts the layers at or below the target:

```js
{target: './src/engine', from: './src',
  except: ['./utils', './privacy', './routes', './net', './OPFS', './search',
    './FeatureFlags.js', './Filetype.js', './engine'],
  message: 'layering (design/new/layering.md): engine may import only base, engine'}
```

The UI is never listed. It is whatever is left, so a directory nobody
thought of (`src/app/`, a new feature folder, a root `.jsx`) is banned
from below by default. A first version of this design enumerated the UI
directories as `from`s, and an unlisted one would have passed.

**Where it goes in the config.** An override replaces a rule's options
(the comment at `.eslintrc.cjs:136` says why the two fences share one
rule). So the layer zones are a second override, after the fences',
matching production files only and repeating the fences' zones:

```js
{
  files: ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx'],
  excludedFiles: ['src/export/pro/**', '**/*.test.*', '**/*.spec.*', '**/*.fixture.*',
    '**/__mocks__/**', 'src/tests/**'],
  rules: {'import/no-restricted-paths': ['error', {zones: [...fenceZones, ...layerZones()]}]},
}
```

Tests are left out: a test of a lower layer may reach up for a harness
(the store, a mock viewer). The fences still cover them through the first
override.

**The allowlist** (`tools/lint/layerAllowlist.json`) is a map from a
file to the upward imports it may still make:

```json
{
  "src/engine/engineModelLoad.js": ["src/loader/loadProgress.js"],
  "src/model/bvhBuild.js": ["src/loader/loadProgress.js"]
}
```

For each key, `layerOverrides()` emits one more override, `files:
[thatFile]`, whose zone adds exactly those files to its `except`. The
exception is a pair: that file, that import. A second file importing
`loadProgress.js`, or the same file importing something else from above,
fails.

**The ratchet.** Three checks, so the list can only shrink:

1. **A stale entry fails.** `src/layerBoundary.test.js` reads the
   allowlist and asserts every pair is still an import in the source. A
   slice that removes an import must delete its entry in the same PR.
2. **A new entry fails CI.** `tools/lint/checkLayerAllowlist.mjs`, a step
   of `main.yml`'s `build` job on pull requests (decided 2026-11-24, §9
   item 5: in `build`, though drafts skip that job), compares the file with
   the merge base's and fails on any pair that was not there. It prints
   the pair and this doc's section. A new upward import therefore fails
   `bun run lint` locally, and cannot be bought with an allowlist edit.
3. **The rule is proven to fire.** The same test lints virtual files
   through the repo's real config, as `src/assist/importBoundary.test.js`
   does for the Assist fence: an engine file importing the loader is one
   error with the layering message; a model file importing the viewer is
   one; a loader file importing the model is none; an allowlisted pair is
   none; the same file importing a second upward module is one. A rule
   that silently stopped firing would otherwise look like a codebase that
   obeys it.

**Run on the repo** (§10), as a prototype on today's directories at
`7cbc995d`, where the graph has 79 upward imports in 37 files:

| Run | Result |
|---|---|
| all of `src` (1,334 files), with the 79 pairs allowlisted | 0 errors |
| the same, with an empty allowlist | 79 errors in 37 files, the graph's count exactly |
| an allowlisted pair, linted alone | 0 |
| the same file with a second upward import | 1, on that line |
| another file making the allowlisted import | 1 |
| a downward import; a test file reaching up | 0; 0 |
| the Assist fence, after the layer override | still 1 |
| `eslint src`, wall clock, shared machine (first prototype, at `dfc342b9`) | 81 s without the zones, 86 s with them and the 37 per-file overrides |

**What it does not check:** a dynamic `import()` whose path is built at
run time (none below the UI today), a global reached without an import
(`window`, §6), and a call up through an injected callback, which is how
the seams are meant to work.


## 6. Headless

**How far.** The session layer, and everything below it, can be shown to
open an IFC and a STEP model under Node: index, spatial tree, a property
read, and geometry assembled into `session.root`, with no `window` and no
`document`. That is the claim worth a test, because it is the one the
"document session" needs
([reviews/2026-11-18-mvc-core-review-followup.md](reviews/2026-11-18-mvc-core-review-followup.md)).

**The test** (`src/session/headless.test.js`, `@jest-environment node`):

- it imports `src/session/index.js` and nothing from the UI;
- it opens `public/index.ifc` and `public/index.step` through
  `getModelSessionHost().open(key)` and `session.load(source)`. The
  source is a `File` held in memory, the path a browser without OPFS
  already takes (`inMemoryUploads.js`, `Loader.js:416–438`), so there is
  no fetch and no OPFS. The engine is in process: the in-process
  transport over real Conway, as `engine/engineCapture.test.js` already
  runs it on `index.ifc`;
- it asserts, for both files: the session reaches `ready`;
  `session.state.get('rootElement')` names the file's root; one property
  read of a known element answers with that element's record (an IFC
  element's `GlobalId`; a STEP product's name, since AP214 has no
  `GlobalId`); a ref resolves (`e<id>` on the IFC, an `o` occurrence path
  on the STEP); `session.root` holds at least one `BatchedMesh` with more
  than zero instances; `session.close()` releases the lease
  (`host.snapshot()` is empty);
- it asserts `typeof window` and `typeof document` are `'undefined'` at
  the start and at the end, so a module that defines them to get by fails
  it;
- it installs the BVH patches in `beforeAll` and restores them in
  `afterAll` (`installBvhPatches`, §2.2), as `batchedModel.fixture.js:104–119`
  patches and restores per test.

It can fail: importing `utils/location.js` anywhere in the graph throws
at import (`window.onhashchange`, `:9`), and `utils/event.js`'s reload
guard and a `gtagEvent` on the load path throw at call. Those are
today's three known offenders (§2.3).

**The static guard**, from the slice that creates `src/session/`
(before the run can pass): the esbuild metafile of `src/session/index.js`,
as `engine/engineWorkerImports.test.js` does for the worker, contains no
`src/store/`, `src/Components/`, `src/Containers/`, `src/viewer/`, no
`.jsx`, and no `react`, `react-dom`, `@mui` or `zustand`. For what is
still in the graph and should not be (the store through
`modelSession.js`, `utils/location.js`, `utils/event.js`), it asserts the
**exact set**: `expect(offenders).toEqual([...])`. A new offender fails
it, and so does an entry that has gone, so the slice that removes one
must delete it from the list. A guard that only printed the list could
not fail.

**When.** The guard lands with M1. The run goes green with 3a, the slice
that takes the store and `utils/location.js` out of the loader. Until
then it is committed skipped, naming #2031 on the line above (STYLE.md
§"Assertions must be able to fail", item 2).

**What it costs.** About 15 s of Jest (a real engine init and two small
parses) and one rule for the lower layers: no DOM at module scope, and
call-time DOM use behind `typeof window`.

**What is not promised:**

- *Mesh formats under Node.* OBJ, STL, PDB and XYZ parse without a DOM.
  `GLTFLoader` needs one for textures and for Draco's script loader,
  splats need WebGL, and a GLB cache hit goes through `GLTFLoader`. The
  test covers the Conway path, which is the document.
- *The worker transport under Node.* The test runs in process.
- *A CLI or an MCP.* Not built here.

**Document session and view session.** The split stays open because the
session layer never needs a view to do its work: a `ModelSession` loaded
with no listener on its root is already the document half (engine,
state, refs, reads). A later split is `session.root` and `viewState`
moving to a view-session object; nothing below depends on a session
having a root except the loader's `ctx.root`, which a document-only load
can leave as a detached `Group` or skip by not pumping geometry
(`open` index-only, as a rehydrate does).


## 7. The slice plan

Thirteen slices. Each is green alone. Each is behaviour-neutral or
behind a flag with a kill switch and a static prod rollback, except two
that have no flag and say what they change: V and 1a. E2Es are
`describeMobileAndDesktop`, Chromium, and assert what was terminated or
collected, never a heap number: a worker's Playwright `close` event, and
a `WeakRef` cleared after `HeapProfiler.collectGarbage`
(`utils/gc.fixture.js`). Each new test is shown red in its PR's break-it
table.

| Slice | What | Allowlist | Neutral or flag | Size |
|---|---|---|---|---|
| M1 | move the model, the engine helpers and the Conway loader; the lint rule | 79 → 55 | neutral | 63 files moved, no logic lines |
| M2 | `viewer/tools/` → `src/tools/`; the eight app-level leaf files | 55 → 19 | neutral | 26 files moved |
| V | delete the `?view=` rules stack | 19 → 17 | **no flag; three stated changes** (below) | about −500 lines, tests included |
| 1a | the `Engine` interface; `EngineSession` → `WorkerEngine`; `ConwayEngine`; one parse path; the Conway import rule | 17 → 16 | **no flag; the kill-switch path changes** (below) | ~1,200 + the rename |
| 1b | `EngineHost` at cap 1; the lease; the load-context adapter | — (three ownership guards) | neutral | ~900 |
| N | the `ifcAPI` identifier out of everything but `src/engine` | — | neutral | 250 lines in 21 files, mechanical |
| R | a reporter per load | 16 → 10 | neutral | ~500 |
| 2a | session roots; the load adds under `ctx.root`; root events | 10 → 8 | neutral | ~700 |
| 2b | `attach` / `detach`, view state, `disposeModelRoot`, the isolator's state port | 8 → 7 | neutral | ~800 |
| 2c–2e | theme in place; one viewer across switches; on by default | — | `singleViewer` / `disableSingleViewer` | ~600 |
| 3a | session state, the projection, `load(source, ctx)`; the headless run | 7 → 1 | neutral | ~900 |
| 3b | cap N under `workspace` | — | `workspace` + `disableBackgroundSessions` | ~900 |
| 4 | eviction that keeps the session; rehydrate | — | `disableSessionEviction` | ~800 |

Slices 5 (the ProjectsDrawer shows the states) and 6 (budget tuning) are
engine-worker.md §7 step 8's, unchanged.

**Order.** M1 → M2 → V → 1a → 1b → 2a → 2b → 2c–2e → 3a → 3b → 4. R
needs only M1 and can go beside 1a. N needs 1a and can go at any point
after it.

### M1. The mechanical move, and the lint rule

- **Builds:** `src/model/` (39 files from `viewer/`, one from
  `loader/`); 17 files into `src/engine/` (11 from `loader/`, 5 from
  `viewer/`, and `Components/Properties/propertyTable.js`); the three
  Conway load files and `export/glbGzip.js` into `src/loader/`;
  `loader/glbLog.js` to `utils/`; `Containers/modelSession.js` to
  `src/session/`; the two splits of §2.2 and `sizeClass` to `utils/`;
  `tools/lint/layers.cjs`, the allowlist, `checkLayerAllowlist.mjs`,
  `src/layerBoundary.test.js`; the headless static guard (§6).
- **Removes:** 26 of today's 79, and exposes 2 (`modelSession.js`'s
  store imports, upward once it is in its layer): 79 → 55.
- **API changes:** none. Import paths only.
- **Proof it is neutral:** a script in the PR body: for every file that
  is not a pure rename, each changed line matches an import, an
  `export … from`, a `jest.mock(` path, a doc path, or a path string in
  one of the files that name source files by path. Those are listed in
  the PR: the static guards (`engineWorkerImports.test.js`,
  `renderOnDemandSources.test.js`, `batchedEditGuard.test.js`,
  `modelState.test.js`), the Jest setup and log-capture helpers under
  `tools/jest/`, `tools/esbuild/` (`build.js`, `vars.*.js`),
  `tools/glb/byteBudget.mjs`, and for M2 `tools/esbuild/assistEntry.js`
  and `netlify/functions/ai-chat.js`. The three splits are listed with
  the lines cut and the lines pasted. Every test passes with only its
  paths changed; no assertion changes. `bun run build-prod` and the
  Playwright suite run before the flip to ready, as for any PR.
- **Tests:** `layerBoundary.test.js` (§5). Break-it: empty the allowlist
  and `bun run lint` reports the 55; add an import of the viewer to a
  model file and it reports one.
- **Rollback:** revert. It conflicts with every open PR that touches
  `viewer/` or `loader/`, so it lands when few are in flight; git follows
  the renames in most merges.
- **Size:** 63 production files and their tests renamed; import lines
  rewritten in their importers.

### M2. The UI-level files

- **Decided (owner, 2026-11-24):** `src/tools/` and `src/app/` as new
  top-level directories.
- **Builds:** `viewer/tools/` → `src/tools/`; `utils/dragAndDrop.js`,
  `utils/loader.js`, `utils/navigate.js`, `utils/shortcutKeys.js`,
  `utils/modelDisplayName.js` → `src/app/`; `privacy/modelActionTracking.js`,
  `privacy/subscriptionTracking.js` → `src/app/`; `OPFS/uploadLedger.js`
  → `src/connections/`; `engine/engineDevHook.js` and
  `useLegacyViewRulesNotice.js` to the UI.
- **Removes:** viewer → ui 20, base → loader 8, base → ui 8: 55 → 19.
- **Proof, tests, rollback:** as M1. Split from M1 only for size:
  `navigate.js` has many importers.

### V. Delete the `?view=` rules stack

Decided on 2026-11-03 (engine-worker.md §8 item 7) and not done.
Confirmed on 2026-11-24 (§9, item 3): delete it, with no replacement and
no flag. The owner: "it was old client work that never went anywhere".
The Widget API's `ChangeViewSettings` keeps answering success.

- **Builds:** removes `IfcViewsManager`
  (`Infrastructure/IfcElementsStyleManager.js`), `ViewRulesCompiler.js`,
  `IfcColor.js`, `ColorHelperFunctions.js`, `IfcCustomViewSettings.js`,
  `engine/legacyViewRules.js`, `useLegacyViewRulesNotice.js`,
  `MainThreadReason.VIEW_RULES`, `ShareViewer#setCustomViewSettings` and
  its `viewsManager`, and CadView's `[modelPath, customViewSettings]`
  reload.
- **Why before 2c:** `ShareViewer` builds it over
  `this.IFC.loader.ifcManager.parser` at construction (`ShareViewer.js:365`),
  which ties a page-lived viewer to an `IfcAPI` (2d). And 2c's "a
  view-settings change is applied in place" needs something to apply.
  Slices 1a and 1b do not need it, but 1a's import rule needs its two
  Conway imports gone (§4.1).
- **Not neutral, and not flagged.** It removes a feature that does
  nothing, and three things a user or a report can see change with it:
  1. a `?view=` link loads in the engine worker, not on the main-thread
     engine (`engineRoute.js`, `MainThreadReason.VIEW_RULES`);
  2. the load report loses its line `Engine: main thread (?view= rules
     need the main-thread engine)` (`REASON_TEXT`), and the snackbar
     notice from `useLegacyViewRulesNotice.js` goes;
  3. a Widget API `ChangeViewSettings` no longer reloads the model.

  The PR's Reported Conditions says so. Rollback is a revert.
- **Why it does nothing today:** that `parser` is an empty object
  (`ShareIfcManager.js:70–77`: "The mutations don't affect parse
  behaviour"). `IfcElementsStyleManager` does nothing but set four fields
  on it, and no file outside `src/Infrastructure/` reads `_rules`,
  `_overrideStyles` or the two functions it replaces. Both engines parse
  through Conway directly, the main-thread one too (`parseIfcWithConway`).
  So a `?view=` link and the Widget API's `ChangeViewSettings` already
  colour nothing, on either engine, though engine-worker.md §7.2 item 2
  routes `?view=` loads to the main thread so the manager can read them.
  Read from code and confirmed by the review; not run (§10).
- **Tests:** the Widget API handler still answers success;
  the `engineRoute` tests lose the `viewRules` reason; an E2E that a
  `?view=ch.sia380-1.heatmap` link loads in a worker.
- **Rollback:** revert.

### 1a. The `Engine` interface, `WorkerEngine`, `ConwayEngine`

One interface over both engines, before anything changes hands (§4.1).

- **Builds:**
  - the rename `EngineSession` → `WorkerEngine`, as its own commit;
  - `engine/Engine.js`: the interface as a typedef, and the event names;
  - `engine/ConwayEngine.js`: Conway's `IfcAPI` behind `Engine`. It takes
    over the open and the pump of `parseIfcWithConway`
    (`conwayDirectIfcLoader.js:131–590`), `captureWholeModel` and
    `makeRecapture` (`:593–780`), and the engine log level. It emits the
    worker stream's events, in the same tick and by reference;
  - `ShareIfcLoader#parse` on one path: its 16 `engineLoad !== null`
    forks go, and the three main-thread-only extras ask
    `engine.capabilities.recapture`;
  - the model half of `conwayDirectIfcLoader.js`
    (`decorateConwayDirectIfcModel`, `makeConwayDirectIfcManager`,
    `attachConwayDirectModelMethods`, `makeIndexedModelHandle`) written
    over `Engine` and moved to the model, with `model.engine` as the read
    handle and `model.ifcManager.ifcAPI` kept as an alias for slice N;
  - `ShareIfc` constructs a `ConwayEngine` where it constructed an
    `IfcAPI` (`:142`). It is still the viewer's until 1b;
  - the `no-restricted-imports` rule on `@bldrs-ai/conway/web-ifc`
    outside `src/engine`, with no exception, and the static grep for a
    dynamic import.
- **Removes:** entry 7. And the viewer, the loader and the model stop
  importing Conway's compat surface.
- **API changes:** `Engine`; `EngineSession` is `WorkerEngine`;
  `parseIfcWithConway` is no longer exported.
- **Not neutral on the kill-switch path, and not flagged.** The default
  path changes by a rename and by losing forks it never took. The
  kill-switch path (`?feature=disableEngineWorker`, the
  `disableEngineWorker` rollback) is rebuilt behind an interface, and it
  is the rollback for the worker, so it has no rollback of its own but a
  revert. What must hold, and is tested:
  - the model it builds, the tree and the properties are the worker
    path's;
  - the GLB artifact is byte-identical to the worker path's, as
    engine-worker.md §7.1 established for the two engines;
  - the report keeps its `Engine: main thread (…)` line;
  - an abort stops the pump at its next batch and lets the open run to
    its end (in-app-model-switch.md §4.5a);
  - the `IfcAPI` is still collected after a switch.
- **Tests:**
  - *Contract, `engineContract.test.js`* (node environment, real Conway):
    one suite, run against a `ConwayEngine` and against a `WorkerEngine`
    on the in-process transport, on `public/index.ifc` and
    `public/index.step`. For each of the four: `indexed` comes before the
    first `batch` and `done` comes last; `tree`, `properties` of a known
    element, `propertySets` and `itemsOfType` are deep-equal between the
    two engines; a STEP batch carries its occurrence paths on both;
    `close()` twice closes once. Red when one engine drops a field the
    other sends (shown by removing `occurrencePath` from `ConwayEngine`'s
    batch).
  - *Artifact identity:* the GLB artifact of `index.ifc` and of
    `index.step` through each engine has one SHA-256. Today that was
    checked by hand on PSB (engine-worker.md §7.1).
  - *Static:* `ShareIfcLoader.js` has no `engineLoad` fork and names no
    `IfcAPI`; the two guards of §4.1 (the lint rule on virtual files, the
    dynamic-import grep).
  - *E2E, the kill switch on both form factors, unchanged:*
    `engineRoute.spec.ts`, the `disableEngineWorker` legs of
    `modelSwitchMemory.spec.ts` (the `IfcAPI` collected),
    `engineModelLoad.spec.ts`, `navTreeAtIndex.spec.ts` and
    `stepPreviewPick.spec.ts`, and the mid-load abort. On the default
    path, every spec unchanged but for the renamed property
    (`ifcAPI.engineSession`, `modelSwitchMemory.spec.ts:182`).
  - *Measured, in the PR:* the PSB kill-switch load before and after
    (Geometry and Total, n=3), since the events add a call per batch.
- **Rollback:** revert.

### 1b. `EngineHost` at cap 1, and the lease

- **Builds:**
  - `engine/EngineHost.js` (`acquire`, `whenEntryFree`, `closeAll`,
    `limits`, `snapshot`, `mayKeepInBackground`), `engineBudget.js`
    (constants only),
    `utils/backgroundSessionsMode.js` with `disableBackgroundSessions`
    declared and nothing widening the cap;
  - `OPFS/entryGate.js`, awaited by `OPFS/utils.js`'s mutators;
  - `ModelSession#leases` and its engine port; `beginLoad` releases the
    previous run's leases (§4.2: the theme reload and the authed retry
    run again in the same session);
  - the load-context adapter in `Loader.js` (§4.3), with `ctx.engine`
    real: `ShareIfcLoader#parse` → `createEngineModelLoad({format,
    acquire})`, whose out-of-memory retry releases and re-acquires;
  - `ShareIfc` loses `engineLoads`, `trackEngineLoad`, and the engine
    half of `dispose`. Its `ConwayEngine` is a `mainThread` lease that
    `Containers/viewer.js#initViewer` acquires and `disposeViewer`
    releases: the same lifetime as today, one per viewer build, owned by
    the host;
  - `ProfileControl.jsx`'s Clear cache calls `host.closeAll()`;
  - the dev hooks, outside production builds:
    `window.__bldrsEngineHost.snapshot()`, and `engineDevHook.js`, which
    spawns an engine of its own today (`:38`, used by
    `engine/engineSession.spec.ts`). It acquires through the host as
    owner `devHook` with `isUncounted: true`, a test-only flag that keeps
    it out of the count and the budget, so a spec's extra engine does not
    close the model on screen at cap 1.
- **Removes:** the three ownership violations of §3. No allowlist entry.
- **API changes:** `spawnWorkerEngine` is the host's alone and
  `closeAllEngineSessions` is gone; `createEngineModelLoad` takes
  `acquire` for `spawn`; `Loader.load` gains `options.engine`.
- **Neutral, with one stated difference:** an OPFS write of an entry now
  waits for an engine holding it to close. Today it meets the lock and
  the load falls back to the network (engine-worker.md §7 step 4). The
  difference is a wait of at most 1 s where there was a fallback. Nothing
  that starts an engine waits for a close, as today (§4.2).
- **Tests:**
  - *Unit, `EngineHost.test.js`* (a fake `Engine`): a lease released
    twice closes its engine once; `closeAll` resolves after every
    polite close; `whenEntryFree` waits for a sync-handle close and gives
    up at `ENGINE_CLOSE_TIMEOUT_MS` (red with the await dropped), and
    matches a lease that has an `entryHint` and no `open` reply yet (red
    with the hint ignored); `acquire` for an owner and `modelKey` that
    already hold a lease releases that lease and does not await its
    close, and leaves another owner's alone (red if it waits: the fake
    engine's close never settles; red if it releases the other
    owner's); a released lease has no `engine` and is not in
    `snapshot()`; the predicate's reasons and their order, the static
    rollback beating `?feature=workspace`.
  - *Unit, session:* a second `beginLoad` releases the first run's lease
    (red with that line removed: `snapshot()` shows two). A nested load
    of two engine-backed children holds two leases and `close()` releases
    both, over `Loader.bldNested.test.js`'s mocked assembly with a fake
    engine port (red with the port recording only the first lease, which
    is what `bindEngine` does today).
  - *Static guards:* `viewer/ifc/ShareIfc.js` constructs no engine and
    closes none; only `EngineHost.js` imports `spawnEngine.js` or
    constructs a `ConwayEngine`; no production file outside `src/engine`
    reads a lease's or an engine's `kind`.
  - *E2E:* `modelSwitchMemory.spec.ts` and the step-A mid-load cases,
    unchanged; a new leg A → B → C with exactly one
    `worker` lease in `snapshot()` (the viewer build's idle `mainThread`
    lease is the other row) and one live engine worker after each open,
    and A's and B's model `WeakRef`s cleared; **a theme toggle after a
    finished load**: one engine worker `close` event, then exactly one
    live worker and one `worker` lease, and the model drawn again (red
    without `beginLoad`'s release: two leases). No `.bld` E2E: the repo
    has no `.bld` fixture with engine-backed children, and the unit test
    above covers the ownership; one is worth adding with a fixture when
    `.bld` is next touched.
- **Rollback:** revert. The Phase 1a rollback (`disableSpaModelNav`)
  covers a regression in it.

### N. The `ifcAPI` name, out of everything but the engine

The import rule of 1a stops a file naming Conway's package. It does not
rename what Share calls the thing.

- **Builds:** the model's builders take `geometry` (a `GeometrySource`)
  where they took `ifcAPI` (`incrementalBatchedBuilder.js`, the three
  `flatMeshTo*.js`, `buildBatchedConwayModel.js`, `IfcInstanceMap.js`,
  `IfcItemsMap.js`); readers use `model.engine`; the
  `model.ifcManager.ifcAPI` alias goes; a static test fails on an
  `ifcAPI` or `IfcAPI` identifier in code outside `src/engine` (a comment
  may still cite Conway's class).
- **Size:** `ifcAPI` is on 250 production lines in 21 files, 19 of them
  outside `src/engine`.
- **Neutral:** a rename, proven as M1 is.
- **Not in it:** the wider `Ifc*` naming of things that are no longer
  IFC-only (`ShareIfc`, `IfcIsolator`, `viewer.IFC`, `ifcManager`: 134
  lines in 24 files for the last alone). §8.
- **Rollback:** revert.

### R. A reporter per load

- **Builds:** `LoadReporter` instances owned by `LoadJob`; `ctx.report`;
  the engine and the model take callbacks; `activeReporter`,
  `loadSerial`, and the module-level `report*` functions are deleted;
  the reporter's store writes go through its sink; `consoleTee.js`, the
  page's one console patch (§4.4);
  `reportOpfsSourceCondition.js` moves to the loader.
- **Removes:** entries 1–6.
- **Neutral:** the report text is unchanged (`loadProgress.test.js`,
  `tests/e2e/loadReport.test.js` unchanged). #2247's remount fix holds by
  construction instead of by an `=== activeReporter` check.
- **Tests:** two reporters at once keep their lines apart, each ending
  only itself (red with a shared instance); a left reporter that ends
  after the next has begun leaves the next one's console tee in place, so
  a `console.warn` after it still lands in the next report's warnings
  (red with each reporter restoring its own saved originals, as
  `restoreConsole` does today); the hang watchdog of a paused reporter
  does not fire; a background reporter's Sentry capture carries its own
  `load.phase` and not the foreground's.
- **Rollback:** revert.

### 2a. Session roots

- **Builds:** `session.root`; `ctx.root`, with everything a load adds
  going under it (the preview group, the streaming batches, the model);
  the streaming selection on `root.userData`; `model/loadEvents.js` and
  the viewer's follow (`viewer/loadFollow.js`), which takes the camera
  work and the `#c:` test out of `ProgressiveLoadSession` and
  `ShareIfcLoader`. The viewer is still
  built per open, and the root is added to its scene at the start of the
  load. Three things have to change with it, or the rule does not hold:
  - **`ShareIfc#addIfcModel` stops adding to the scene.** It pushes to
    the two registries and does `getScene().add(ifcMesh)`
    (`ShareIfc.js:204–208`), which would re-parent a model out of its
    root. In 2a it registers only; the model is already under the root.
    (Registering at attach, not at load, is 2b.)
  - **Every camera fit names its target.** `fitModelToFrame()` and
    `fitCameraLimitsToModel()` with no argument frame the last scene
    child (`orbit-control.js:67`, `context.js:251`), and the root, added
    at load start, is no longer last once the isolator's subsets and the
    clipper's arrows are appended (`IfcIsolator.js:379`,
    `MeshClipper.js:152`; the `TODO(#1561)` at `orbit-control.js:64` says
    as much). The load's own fits already pass the model
    (`modelPlacement.js`). The no-argument default becomes the viewer's
    current root; `ViewCube.jsx:201` is the one production caller.
  - **A splat's `SparkRenderer` stays where it is until 2b.** It is added
    straight to the scene (`splats.js:160–163`) and is a renderer helper,
    not model content. The test below allows it by name.
- **Removes:** entries 8 and 9.
- **Neutral.** What users see is unchanged.
- **Tests:**
  - *Unit:* after a load of an IFC, a STEP and a GLB, the scene's
    children are the viewer's own and exactly one root (red if the
    preview group goes to the scene; red with `addIfcModel` still adding
    to the scene); a root with no listener gets no camera call and no
    paint request (a counter on a fake `RenderDemand`); the no-argument
    fit frames the root with a subset appended after it (red on the
    last-child default).
  - *E2E, unchanged:* `modelSwitchMemory.spec.ts`,
    `markerModelSwitch.spec.ts`, `openPerOpen.spec.ts`,
    `windowedPreview.spec.ts`, `stepPreviewPick.spec.ts`, the camera-follow
    and `#c:` permalink specs.
- **Rollback:** revert.

### 2b. Attach and detach

- **Builds:** `viewer.attach` / `detach` with `viewState`;
  `disposeModelRoot` and `root.userData.view` (the splat renderer moves
  onto it); the isolator's `statePort`; `ShareIfc`'s registry filled at
  attach; window handlers bound by the caller at attach. A switch still
  builds a new viewer, then attaches the new session's root.
- **Removes:** entry 10.
- **Neutral.**
- **Tests:**
  - *Unit:* `disposeModelRoot` disposes every geometry, material and
    texture under a root and nothing outside it (a second root's stay);
    detach then attach restores the camera, planes, hidden and selected
    sets exactly; a splat root's `view.attach` runs once per attach.
  - *E2E, unchanged:* the memory, marker, cut-plane, isolation and
    splat specs.
- **Rollback:** revert.

### 2c–2e. One viewer for the page

As engine-worker.md §5.2a's 2b–2d, renumbered, with two changes:

- **The main-thread engine route uses the one viewer too** (decided,
  owner, 2026-11-24, §9 item 2). #2244 kept a
  viewer per open there so the `IfcAPI` could stay in the viewer. It is
  now a leased `ConwayEngine` (1b), and 2d moves its acquire from the viewer build
  to the load (§4.1), so nothing ties it to a viewer. It stays cap 1: an
  in-process engine is closed on every switch.
- **`viewer/singleViewerMode.js` is `utils/singleViewerMode.js`**, a flag
  predicate like `utils/spaModelNavMode.js`, so the cap predicate can
  read it from below the viewer.

2c: a theme change sets the background and the look in place, under
`singleViewer`. 2d: one viewer across switches. 2e: on by default, with
`disableSingleViewer` the kill switch and the static rollback. Their
E2Es are §5.2a's, plus: StrictMode's double mount builds one viewer and
attaches once (a counter in the dev hook); `renderer.info.memory` after
A → B equals a fresh page's B.

### 3a. Session state, the projection, `load(source, ctx)`

- **Builds:** `session/modelState.js`, `modelStateFields.js`; the
  page-level `ModelSessionHost`; `LoadJob#set` writing session state;
  `store/modelProjection.js` (the middleware and `bindSession`);
  `ctx.state` and `ctx.env`; the store out of `Loader.js`,
  `glbArtifactPublish.js` (its `generation` goes: a run that is not
  current writes nothing) and `bldrsElementProperties.js` (its alert
  becomes a `report` call the UI shows); `cacheWriteOwner`,
  `loadingUiOwner` and `pageHost` go; the signature flip; the headless
  run un-skipped.
- **Removes:** entries 11–16. The allowlist is then entry 19 alone.
- **Neutral at cap 1.** The store holds what it held, written through
  one more function.
- **Tests:**
  - *Unit:* a store `set` of a per-model key lands in the bound session's
    state and the store in one notification; with no session bound it is
    a plain `set`; `bindSession(B)` after A shows B's fields and none of
    A's (every key of `modelStateDefaults()` is checked, so a key added
    later is covered); a background session's `job.set` reaches its state
    and not the store (red with the middleware writing through).
  - *Static:* no file under `src/loader`, `src/session`, `src/model` or
    `src/engine` imports `src/store` (that is the lint rule with the
    entries gone).
  - *Headless:* §6's run.
  - *E2E, unchanged:* everything. The remount legs of
    `modelSwitchMemory.spec.ts` (`/v/u` ↔ `/v/p`) are the ones that
    exercise the page-level host.
- **Rollback:** revert.

### 3b. Cap N under `workspace`

As engine-worker.md §7 step 8's slice 3, on the lease API. Its
prerequisites are now earlier slices: per-load module state (R, 2a, 3a),
the session's own state (3a), one viewer on by default (2e).

One addition, from render-on-demand. Two page-wide things would make a
background session paint the foreground viewer, and a paint of a large
foreground model is over 33 ms (`EXPENSIVE_PAINT_MS`):

- `installSceneHooks` (`renderDemandHooks.js:72`) patches three's
  prototypes: every `Object3D#add` and every `BatchedMesh` mutator asks
  for a background paint, whichever scene the object is in;
- the model asks directly: `requestPaint()` reaches every live
  `RenderDemand` (`renderDemand.js:167, 181–185`), and
  `ResidencyController.js:658` and `sceneGraphVisibility.js:158` call it.

So the session does all work on a detached root (assembling its batches,
a residency or visibility change an assistant tool makes to a background
model) inside `utils/paintRequest.js#withoutPaintRequests(fn)`. It is a
synchronous scope with its own counter, checked by all three asks.
`runPaint`'s `paintDepth` is not enough: it silences
`requestBackgroundPaint` only (`renderDemand.js:209–215`).

- **Tests,** beside that slice's: with A in the background and held at
  its pump, releasing it assembles its batches and the foreground
  `RenderDemand` records no paint request of any of the three kinds from
  them (red without the scope; red with the scope built on `paintDepth`,
  for a `requestPaint` from A's `ResidencyController`); a selection made in A, then in B, is A's again on return, with
  A's `#sel:` term.
- **Rollback:** `disableBackgroundSessions`, static first.

### 4. Eviction and rehydrate

As engine-worker.md §7 step 8's slice 4. On the lease API:
`lease.onEvict` → the session swaps its read model;
`session.ensureEngine()` → `host.acquire({purpose: 'rehydrate'})`; a
failed rehydrate is captured in `ModelSession#ensureEngine`, on the page.


## 8. Risks and hard parts

- **`Loader.js` is 3,172 lines and stays one file.** The adapter keeps
  the diff per slice small, but it does not make the file smaller, and
  `load()` itself stays about 1,000 lines. Splitting it (download and
  staging, cache hit, parse, the writer) is worth doing and is not in
  this plan: it is a behaviour-neutral follow-up once the context is the
  only thing passed around, and #2250's CadView split is the model for
  it. The risk while it waits: a slice misses one of the 33 `viewer`
  lines. The adapter's accessors are the guard: after slice 1b, `viewer`
  appears in `Loader.js` only inside `legacyLoadContext`, and a static
  test says so.
- **`ConwayEngine`: rebuilding the kill-switch path.** It is the path
  with the least coverage and the most distinct lifetime: collected,
  never terminated. And it is the path people are sent to when the worker
  misbehaves. Slice 1a puts it behind `Engine`, which rewrites how it is
  driven (§4.1); 1b changes who constructs it; 2d changes when. Three
  things keep that honest:
  - the contract test runs one suite against both engines and both
    formats, so the two cannot drift without a red test;
  - the artifact's bytes are compared between the engines;
  - `modelSwitchMemory.spec.ts`'s `disableEngineWorker` leg, which
    asserts the `IfcAPI` is collected, stays green unchanged through all
    three. If 2d cannot keep it green, the main-thread lease stays
    acquired by `initViewer` and that route keeps a viewer per open, as
    #2244 had it.

  What is given up: the kill-switch path stops being code nobody has
  touched. It still shares nothing with the worker's handler, protocol or
  stream encoding, which is what it is a fallback from. It does share
  `ShareIfcLoader#parse` and the builder, as it already does today.
- **WebGL context loss under one viewer.** Today the next open builds a
  new viewer, which hides it. three restores a lost context in place
  (`WebGLRenderer.js#onContextRestore` re-initialises its state, and
  `renderDemandHooks.js:285` already paints on `webglcontextrestored`),
  and roots re-upload on the next paint. What is not known is whether
  everything Share adds comes back: the PMREM environment, the effect
  composer's targets, N8AO, the hover overlay's cached frame. Slice 2d
  finds out with `WEBGL_lose_context`: lose, restore, then a pixel probe
  and a pick. The fallback is to rebuild the viewer and re-attach, which
  is safe for kept roots because `renderer.dispose()` removes its
  `dispose` listeners from every tracked geometry and texture
  (three 0.187, `WebGLGeometries.js:188`, `WebGLTextures.js:391`); a unit
  test pins that, because an older three did not.
- **The memory E2E gets harder.** A viewer that outlives its models
  turns every cached reference in it into a leak: the isolator's
  `ifcModel`, the highlighter's last ids, the hover overlay's pool, the
  clipper's `MeshClipper`, the ground fit, PlaceMark, the residency
  driver, `context.items.ifcModels`. #2189's retainer paths are the list.
  Detach must clear each, and the test for each is the `WeakRef` leg with
  that one clear reverted. Expect this to be where 2d spends its time.
- **Indirection on the hot paths.**
  - *Hover:* a pick runs once per frame against the attached root's
    models. Attach binds direct references, so the pick path gains no
    lookup. The state port is read on selection changes, not per frame.
  - *The projection:* one `Set` lookup per key of each store `set`.
  - *Render-on-demand:* the page-wide hooks see detached roots (slice
    3b, above).
  - Each of 2b, 2d and 3a reruns the hover-latency A/B
    (glb-export-premium.md §1.1d, "What a hover pick costs after it") and
    the PSB cache-hit load, and puts the numbers in its PR. A slice that
    moves either outside the run-to-run spread is not neutral.
- **StrictMode.** Effects run twice in development. Nothing page-lived
  may be built or freed in an effect body without a deferred, cancellable
  release: the viewer, the bind, the session host's leave. #2247's hook
  has the pattern (`queueMicrotask`, then check the mount). A dev-only
  counter in the dev hook lets an E2E assert one build and one attach.
- **The remount across route families** (codex on #2247). #2247 fixed
  its symptoms with two page-level owners (`loadingUiOwner`, `pageHost`).
  3a removes the cause. Between slice 1b and 3a those two stay, and any
  slice that touches `modelSession.js` must keep
  `modelSwitchMemory.spec.ts`'s `/v/u` remount leg green.
- **M1 conflicts with everything in flight.** 63 renames across the two
  busiest directories. It should merge within a day of opening, with the
  other open-205 PRs rebased after it rather than before.
- **The rename touches the protocol's vocabulary.** A cached
  `Engine.worker.js` from before the rename still speaks the same wire
  protocol (no message changes), so no version bump.
- **`Engine` could grow.** It is today's `EngineSession` surface and
  three members a load needs. The pressure will be to add what one
  caller wants (a raw handle, a sync read). The rule: a new member has to
  be answerable by every implementation, `MeshEngine` included, or it is
  a capability a caller asks for by name.
- **Not practical here, and named:**
  - `MeshEngine` (§4.8): the mesh formats behind `Engine`;
  - the wider `Ifc*` naming of things that are no longer IFC-only
    (`ShareIfc`, `IfcIsolator`, `IfcHighlighter`, `viewer.IFC`,
    `ifcManager`). Slice N removes `ifcAPI` only;
  - splitting `Loader.js` (above);
  - `privacy/analytics.js` → `quota/quota.js`, entry 19;
  - the pure measurement tools down to the model (`apps-t300`);
  - `connections/persistence.ts` as a leaf: the loader reaches it through
    `ctx.env` after 3a, but `OPFS/uploadLedger.js` and
    `utils/modelDisplayName.js` are moved up rather than untangled;
  - a module-scope flag read audit (§2.1);
  - `src/export`'s 21 imports of `src/loader` are downward and fine, but
    `export/` mixes format code with hooks; the MVC-core review §3.2 has
    the detail.


## 9. The owner's answers (2026-11-24)

The design pass asked six questions. The owner answered them on
2026-11-24: items 2–6 are decision 9 of in-app-model-switch.md §0, and
item 1, answered later that day, is decision 10.

All six are settled.

1. **The engine's name: `Engine`, `WorkerEngine`, `ConwayEngine`**
   (decision 10; §4.1). The main-thread engine is a lease the host owns,
   as designed. It is not called `IfcAPI`, which covers STEP too and
   which other mesh types will probably move under.
   - `Engine` is the one format-neutral interface. A lease exposes
     `lease.engine` and nothing else to reach an engine by; `lease.kind`
     is the host's bookkeeping and callers do not branch on it.
   - `WorkerEngine` is today's `EngineSession` ("bc it's on a Worker
     thread"). It replaces the `EngineConnection` this doc first
     proposed. The in-process fallback stays a `WorkerEngine` on an
     in-process transport, with `kind: 'inProcess'` recording where it
     runs (§4.1 has the reasons).
   - `ConwayEngine` is Conway's `IfcAPI` on the page behind `Engine`:
     today's kill-switch path. It lands in slice 1a with a contract test,
     and it is a real change to that path.
   - `MeshEngine` is the convergence follow-up, not built.
   - Conway's `IfcAPI` keeps its name in Conway. Share names it only
     inside `src/engine`; a `no-restricted-imports` rule holds the
     import, and slice N removes the identifier elsewhere.
2. **One viewer on the main-thread route too.** The viewer-per-open
   exception of the 2026-11-19 design is dropped (§7, 2c–2e). The
   fallback stays only for one case: if `modelSwitchMemory.spec.ts`'s
   `IfcAPI` collection check cannot be kept green under one viewer, that
   route goes back to a viewer per open (§8).
3. **Delete the `?view=` stack, with no replacement and no flag** (§7,
   slice V). "It was old client work that never went anywhere." The
   Widget API's `ChangeViewSettings` keeps answering success. No
   replacement is filed.
4. **`src/tools/` and `src/app/`** are new top-level directories (§7, M2).
5. **The check that the allowlist only shrinks runs in the `build` job**
   (§5, check 2), as designed. Drafts skip that job; the lint rule itself
   runs in the pre-commit hook, so a new upward import still fails
   locally at once.
6. **A background load's page-side console lines are not counted in its
   diagnostics** (§4.4). Accepted as a known gap. The owner expects a
   console cleanup soon; that work closes it, and this redesign does not
   tag log lines by session.


## 10. Evidence status

**Counted** (§3): the import graph, with a script over TypeScript's
`preProcessFile`, on `7cbc995d`. The target-layer counts apply §2.2's
file list to that graph. The same script on `dfc342b9`, before #2247,
gave 78 in 37 as the directories stand and 17 in 14 after the move.

**Run:** the lint prototype of §5, on the repo's own eslint 8.22,
eslint-plugin-import 2.26 and `.eslintrc.cjs`, at `7cbc995d`, on today's
directories, in the default-deny shape §5 shows (and before that at
`dfc342b9` in a first shape that enumerated the UI's directories, with
the same counts for that commit). The zones for `src/model` and
`src/session` matched no file, since neither directory exists yet. The
prototype is not committed: the config belongs to M1, with the
directories it names.

**Reviewed:** one adversarial round by a fresh session, which rebuilt
the import graph for itself (636 production files and 1,884 edges by its
resolver) and found the same 19 after applying §2.2. Its 18 findings and
what each changed are in the PR (#2244).

**Run:** the `no-restricted-imports` rule of §4.1, on seven virtual
files through the repo's eslint: three importers of the compat surface
outside `src/engine` are one error each; an engine file, a test and the
loader's import of Conway's logger are none; a dynamic `import()` outside
`src/engine` is none, which is the gap the static grep covers.

**Read from code, at the cited lines:** every claim about `ShareIfc`,
`spawnEngine.js`, `Loader.js`, `loadProgress.js`, `modelSession.js`
(#2247), `renderDemand.js` and `renderDemandHooks.js`,
`ShareIfcManager.js`'s empty `parser`, three 0.187's `dispose` and
context-restore paths, `FeatureFlags.js:529`, `utils/location.js:9`,
`privacy/analytics.js:56`.

**Not run, and a slice has to:**

- that `ConwayEngine` can call its listeners in the same tick and keep
  the kill-switch load's timings (slice 1a measures PSB before and
  after), and that the contract test's deep-equality between the two
  engines holds on both fixtures. The byte identity of their artifacts
  was established on PSB by hand (engine-worker.md §7.1), not by a test;
- that the `?view=` stack colours nothing (slice V's E2E). The owner's
  account agrees with the reading: old client work that never went
  anywhere (§9, item 3);
- that the headless load passes once the store is out of the loader
  (3a). Conway under Jest in process is run today, on an IFC only
  (`engine/engineCapture.test.js:23`); no Node test parses a STEP in
  process, and the session layer above it has never run there;
- what survives a WebGL context restore (2d);
- that a second engine reopening an entry the first is still closing
  gets its handle: read-only handles share a file by the spec
  (`engineSources.js:359–362`), and Safari and Firefox have none, so a
  worker there reads through the Blob store and holds no lock (`:26`).
  Slice 1b's same-model reopen leg checks Chromium;
- the cost of the projection middleware and of attach on the hover and
  load numbers (2b, 2d, 3a).

**Not measured, as before:** engine-worker.md §10's list (two engines
loading at once, the main-side scene's bytes, any phone). Slice 6.

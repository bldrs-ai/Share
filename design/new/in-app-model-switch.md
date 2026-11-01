# In-app model switching — open a model without a page reload (open-205)

**Status:** Phase 0 in flight. Phases 1–2 planned.
**Epic:** `open-205` (#2011). Stories: Phase 0 #2012 (tasks #2013–#2018),
Phase 1 #2019–#2023, Phase 2 #2024.
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
ordinary garbage. The work is in Share: stop holding the old instance, cancel
work still running against it, and reset per-model state.

For **multi-model in one engine**, Conway needs a non-destructive close
(§7). One engine per model avoids that at the cost of a WASM baseline per
model.


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
- **A load still running.** `Loader.load` has no cancellation; see §4.1.
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

### 4.1 Cancellable teardown (#2019)

Order on a model change, before `initViewer`:

1. **Abort the in-flight load.** Thread an `AbortSignal` through
   `Loader.load` to `ProgressiveLoadSession.abort()`
   (`src/viewer/ProgressiveLoadSession.js:298`; today called only from the
   loader's own error path, `src/viewer/ifc/ShareIfcLoader.js:772`) and the
   parse pump. Without it, CadView's in-flight guard (`CadView.jsx:360-383`)
   only replays the new model *after* the old load ends — and the old parse
   runs on against an `IfcAPI` whose processor `CloseModel` just freed (§2.3),
   then can still `setModel` and send `real_model_open` / metering for a
   model the user left.
2. **Settle the idle GLB writer.** `runWriter` reads
   `viewer?.IFC?.loader?.ifcManager` when it *runs* (`Loader.js:994`); after
   `ShareIfc.dispose` nulls `loader` (`ShareIfc.js:239`) that is `null`, so
   the export loses its spatial tree and the spill / release calls silently
   no-op. Its `.finally` also clears `isCacheWriteInFlight` under a newer
   model's writer. Either cancel it or bind it to the `ifcAPI` it was
   scheduled for; `glbArtifactPublish.js`'s generation guard already stops a
   stale publish but not the run.
3. **`ReleaseModelGeometry`** each open model, so native geometry is freed
   even while some reference is still keeping the instance alive.

### 4.2 `resetModelState()` (#2020)

One reset on model-identity change, before the new load starts. Already
self-resetting and keyed per model: hidden elements
(`claimHiddenElementsForModel`, `CadView.jsx:450`), the load report
(`beginLoadProgress`), `glbArtifact` (`beginGlbArtifactLoad`). Not reset:

- `model`, `rootElement`, `elementTypesMap`, `searchIndex` — null them
  first so the old engine can be collected during B's load;
- `preselectedElementIds` (`IFCSlice.js:100`);
- NavTree expansion (`src/store/NavTreeSlice.js:16-26`);
- isolation, incl. `isTempIsolationModeOn`, which also hides the ViewCube
  (`src/store/IfcIsolatorSlice.js:23-27`, `CadView.jsx:2176`);
- `displayOverrides` (`src/store/DisplaySlice.js:23`; `resetDisplayOverrides`
  has no callers), which also feed the share link
  (`src/Components/Share/ShareDialog.jsx:46-70`);
- notes, markers and their selection ids (`src/store/NotesSlice.js`);
- `versions`, `activeVersion` (`src/store/VersionsSlice.js:16-24`);
- `opfsFile` — set only on `Loader.load`'s OPFS branch (`Loader.js:338-475`),
  so after a Drive or `external` load Save would save the previous file;
- `isCacheWriteInFlight` (§4.1).

Window handlers: `window.ondblclick` and `setKeydownListeners`
(`src/utils/shortcutKeys.js:8`) are rebound in `onModel` only after its
`ifcManager` check (`CadView.jsx:1000-1005`); a model without one leaves them
on the disposed viewer.

Each slice should own its reset so new per-model fields get one by
construction.

### 4.3 `navigateToModel` in-app, behind a flag (#2021)

`navigate()` instead of `location.assign`, keeping `withCurrentSearch`;
`navigateToInMemoryModel` folds in. A dedicated flag (rather than riding
`workspace`) lets the switch burn in and roll back independently. Also:
disarm the `beforeunload` guard on switch (armed for uploads at
`Loader.js:278`, `src/utils/event.js`; today only navigation helpers
disarm it), check Back/Forward through `Share.jsx`'s route effect (needs
§3.1), and revisit the ProjectsDrawer capture's reload-shaped reasoning
(`src/store/WorkspaceSlice.js:165-170`, `src/workspace/persistence.ts:140-143`,
`src/Containers/ProjectsDrawer.jsx:197-203`).


## 5. "Once per page load" needs a per-open answer (#2022)

| Behaviour | Where | Decision needed |
|---|---|---|
| Direct-link quota meter | `src/quota/useDirectLinkQuota.js:90, 126` | A → B → A in-app meters A once — intended? (`quotas.md` §"Direct links: soft gate") |
| Engagement dedupe | `src/privacy/engagementTracking.js:60, 141` | Already per consecutive key; confirm and fix `quotas.md`'s wording |
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
- **Engine per model or shared?** Per model works today; dropping a model
  is dropping its instance, at one WASM baseline each. Shared needs Conway
  to provide a close that frees the model's native geometry, parse buffers
  and source copy *without* `freeGeometryProcessor()`. Measure the
  per-instance baseline before choosing; if shared wins, the Conway change is
  part of this chain (CLAUDE.md "The chain is yours to drive").
- **Store shape.** Selection, isolation, NavTree, properties and display
  overrides are single-model. Keyed per model, or one active model with
  read-only overlays — the latter may be enough for #1251's first cut.


## 8. Evidence status

**Checked by reading the code** (at the cited lines): §2.2–2.4, every
Phase 0 defect, the Phase 1 inventories, the writer's run-time `ifcManager`
read, the literal-0 sites, `CloseModel`'s body and the smoke test's note,
COEP and `pThreadsAllowed`.

**Not measured or reproduced:** that an unreferenced single-threaded
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

# In-app model switching — open a model without a page reload (open-205)

**Status:** Phase 0 landed (#2026). Phase 1 re-planned 2026-11-02 (§4);
Phase 2 planned.
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

### 4.1 P1.0 Measure first (#2028)

Numbers decide §4.2 and §4.4; take them before building:

- per model (small, medium, large IFC): time to the index (open / parse),
  to the spatial tree when asked for right after open, to first mesh, to
  all geometry; a property lookup during and after streaming;
- the longest synchronous Conway call — is the initial parse one call or
  does it yield? — and main-thread long tasks per stage in the browser;
- engine memory per model (`WebAssembly.Memory` size after open, after all
  geometry, after `ReleaseModelGeometry`), which sizes the §4.5 budget.

Engine numbers from a Node harness against the pinned conway; browser
numbers from `browser-load-measurement.md`'s rig and the load report, cold
(no OPFS cache, fresh WASM compile). A cloud container gives ratios more
than absolutes.

### 4.2 Interactive at the index (#2029)

Today `onModel` asks for the spatial structure only after the whole load
resolves (`await onModel(...)`, `CadView.jsx:639`, after
`loadModelWithAuthRetry` at `:507`). Ask for it as soon as the engine has
the index, and enable the NavTree, properties, search and the assistant's
reads then; geometry keeps streaming through `ProgressiveLoadSession`. This
helps with or without the page reload, so it can land before sessions.
Open: whether property reads are safe between streaming batches on the same
`IfcAPI` (JS is single-threaded, so calls serialize, but the batch pump's
own state must tolerate it) — P1.0 checks.

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
yields often. The streaming pump already works in batches. If P1.0 shows a
long synchronous step (the initial parse is the suspect), the options are
chunking it in Conway or, later, moving the engine into a worker; P1.0's
numbers pick.

### 4.5 Close and eviction — the only cancel path (#2031)

On an explicit close, or an LRU eviction when the memory budget is
exceeded (phones first; budget from P1.0's per-model figure):

1. abort the download and the parse — an `AbortSignal` through
   `Loader.load` to `ProgressiveLoadSession.abort()`
   (`src/viewer/ProgressiveLoadSession.js:298`) and the batch pump;
2. drop or cancel the session's idle GLB writer;
3. `ReleaseModelGeometry` each open model in the engine;
4. release every reference to the session's `IfcAPI` so the instance is
   collectable (§2.4), then `CloseModel` — never before the parse has
   stopped.

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

- **Main-thread contention** between concurrent loads (§4.4).
- **Memory is the sum of open models**, one WASM instance each; the budget
  and eviction (§4.5) are what keep phones alive.
- **Whether Conway's initial parse is one long synchronous call** — if so,
  "interactive at index" is bounded by it, and a background parse blocks
  the foreground for that long.


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

**Not measured or reproduced:** everything P1.0 (§4.1) measures — stage
times, the longest synchronous Conway call, per-model engine memory; that an unreferenced single-threaded
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

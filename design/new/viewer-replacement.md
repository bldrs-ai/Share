# Replacing `web-ifc-viewer` / `web-ifc-three`

**Status:** proposal
**Owner:** —
**Branch:** `claude/upgrade-threejs-deps-FWmz0`
**Motivation:** Unblock the three.js upgrade (currently pinned at `0.135.0`).

---

## 1. Why we're doing this

Today's three.js version ceiling lives entirely in two dead-upstream IFC.js libs:

| Package                 | Version        | Three constraint   | Source              |
|-------------------------|----------------|--------------------|---------------------|
| `web-ifc-viewer` (fork) | 1.0.209-bldrs-7 | peer `^0.135.0`   | local `.tgz`        |
| `web-ifc-three`         | 0.0.118        | hard pin `0.135`  | nested in fork tgz  |
| `postprocessing`        | 6.29.3         | `>=0.125 <0.149`  | npm                 |
| `three-mesh-bvh`        | 0.5.24         | works (uses internals) | nested transitively |

`postprocessing` we can simply bump (own dep). `three-mesh-bvh` and `camera-controls` we can bump (or stop using). The two IFC libs are the real anchor — both upstream repositories were abandoned when the `ifcjs` org migrated to `That Open Engine`. Patching the fork has been our coping strategy since 2022 and the user explicitly does not want to repeat it.

`@bldrs-ai/conway-web-ifc-adapter` (Conway) does **not** depend on three at all. It exposes an IFC parsing API roughly compatible with `web-ifc`'s `IfcAPI` (`Init`, `OpenModel`, `LoadAllGeometry`, `GetFlatMesh`, `GetGeometry`, `GetCoordinationMatrix`, plus property/spatial-structure helpers). Today we only use it through the `web-ifc-three` → `web-ifc-viewer` → `IfcViewerAPI` chain. **The new viewer cuts that chain.**

---

## 2. What we actually use from `web-ifc-viewer` today

A grep across `src/` (excluding tests) shows ~244 call-sites against the viewer API. The actual *distinct* surface is small:

### 2a. Three.js scene plumbing (generic, not IFC-specific)
- `context.{getScene, getCamera, getRenderer, getDomElement, getClippingPlanes}`
- `context.ifcCamera.cameraControls` (a `camera-controls` instance)
- `context.ifcCamera.currentNavMode.fitModelToFrame()`
- `context.fitToFrame()`
- `context.mouse.position`
- `context.items.{ifcModels, pickableIfcModels}` (arrays driving raycasting)
- `context.castRayIfc()` (raycast against `pickableIfcModels`)
- `viewer.dispose()` and the manual GPU teardown in `Containers/viewer.js`

### 2b. Clipping
- `clipper.{active, orthogonalY, planes, deleteAllPlanes, createFromNormalAndCoplanarPoint, clickDrag}`
- For GLB/GLTF we already bypass it with our own `Infrastructure/GlbClipper.js` — useful **template** for the new clipper.

### 2c. IFC selection / highlighting
- `IFC.selector.{preselection, selection, pickIfcItemsByID, unpickIfcItems}`
- `selector.preselection.{pick, pickByID, toggleVisibility, meshes, material}`
- `selector.selection.{material, meshes, unpick}`
- These work by calling `web-ifc-three`'s `createSubset` with a hot per-selection material — the slow path that drives `IfcIsolator`.

### 2d. IFC data access (delegated straight to Conway today)
- `IFC.loader.ifcManager.{ifcAPI, getSpatialStructure, getExpressId, getItemProperties, getIfcType, idsByType, applyWebIfcConfig, setupCoordinationMatrix, parser, state.models}`
- `IFC.{loadIfcUrl, loadIfc, getProperties, addIfcModel, setWasmPath, type, ifcLastError}`
- `IFC.parse(buffer, onProgress)` — **we hot-patch this in `loader/Loader.js#newIfcLoader`** to drive Conway directly with our own progress hooks. This file is the proof that we can cut out the `web-ifc-three` middle layer with very little ceremony.

### 2e. Subsets (the part that's most coupled to `web-ifc-three`)
- `model.createSubset({modelID, scene, ids, applyBVH, removePrevious, customID, material})` in `IfcIsolator`. This is the load-bearing primitive for Hide / Isolate / Reveal-hidden modes. **This is the hardest piece to replace** because `web-ifc-three` builds it on a per-expressID `BufferAttribute` and `IFCWorker`. We have to reimplement it on top of Conway's flat-mesh output.

### 2f. Postprocessing
- `IfcHighlighter` and `IfcIsolator` both create `postprocessing.OutlineEffect` instances via our own `CustomPostProcessor`. Already a thin local wrapper — keep as-is, just bump the `postprocessing` dep.

---

## 3. Proposed architecture

Three layers, each with a sharp boundary. Anything currently buried under `web-ifc-viewer` lives in one of these now.

```
┌──────────────────────────────────────────────────────────────────────┐
│  src/Containers, src/Components                                       │
│   (existing UI; talks to ShareViewer)                                 │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  src/viewer/ShareViewer  (new)                                        │
│    • orchestrator; the thing initViewer() returns                     │
│    • exposes the same shape useStore stores today (.context, .IFC,    │
│      .clipper, .isolator, .highlighter, .postProcessor, …)            │
│    • thin facade — does no rendering itself                           │
└──────────────────────────────────────────────────────────────────────┘
        │                   │                    │
        ▼                   ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────────────┐
│ ThreeContext     │ │ IfcModelService  │ │ Plugins (clipper, picker,  │
│  (new)           │ │  (new)           │ │  postprocessor, isolator,  │
│  Scene/Camera/   │ │  Wraps Conway    │ │  highlighter)              │
│  Renderer/       │ │  IfcAPI; owns    │ │  Each is a self-contained  │
│  controls/       │ │  models, props,  │ │  module under src/viewer/  │
│  resize/dispose  │ │  spatial,        │ │  with its own dispose().   │
│                  │ │  subsets         │ │                            │
└──────────────────┘ └──────────────────┘ └────────────────────────────┘
        │                   │                    │
        └───────────────────┴────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  three (latest), camera-controls (latest), three-mesh-bvh (latest),  │
│  postprocessing (latest), @bldrs-ai/conway-web-ifc-adapter            │
└──────────────────────────────────────────────────────────────────────┘
```

### 3a. `ThreeContext`
Owns the `WebGLRenderer`, `Scene`, `PerspectiveCamera` (+ optional ortho), `CSS2DRenderer`, `camera-controls` instance, resize observer, render loop, clipping-plane registry. Public surface deliberately mirrors what we use today so call-sites barely change:
- `getScene()`, `getCamera()`, `getRenderer()`, `getDomElement()`, `getClippingPlanes()`
- `mouse.position` (Vector2 normalised −1..1), kept as a property for parity
- `ifcCamera.cameraControls` (alias to the controls instance) — keep this exact path so `CameraControl.jsx` and `CadView.jsx` don't rewrite
- `fitToFrame(object3D)` — replaces `context.fitToFrame()` and `currentNavMode.fitModelToFrame()`
- `items.pickableIfcModels` (array of `Object3D`) and `items.ifcModels` — kept by name; the picker reads them
- `dispose()` — calls `renderer.dispose()` + `forceContextLoss()` + traverses & disposes geometries/materials/textures (logic already exists in `Containers/viewer.js`)

Color management & lights: opt into the modern defaults explicitly. `renderer.outputColorSpace = SRGBColorSpace`, `renderer.toneMapping = NoToneMapping` (we don't author HDR), `useLegacyLights = false` (default in r155+). Keep `MeshLambertMaterial` everywhere we currently use it — visually identical under the new defaults for unlit-style preview.

### 3b. `IfcModelService`
Wraps `@bldrs-ai/conway-web-ifc-adapter`'s `IfcAPI`. This **replaces all of `web-ifc-three` and `IFC.loader.ifcManager`**.

Public methods (the union of what the codebase calls today):
- `init(wasmPath)` → `IfcAPI.Init(...)` (replaces `IFC.setWasmPath` + lazy init)
- `loadFromBuffer(buffer, {coordinateToOrigin, onProgress})` → returns `IfcModel`
- `getSpatialStructure(modelID, withProperties=false)` — Conway has this directly
- `getProperties(modelID, expressID, indirect=false, recursive=false)` — Conway: `properties.getItemProperties` family
- `getIfcType(modelID, expressID)`
- `idsByType(modelID, ifcTypeName)` — uses `properties.getAllItemsOfType`
- `getExpressId(geometry, faceIndex)` — reads the per-mesh `expressID` BufferAttribute we set during conversion
- `getCoordinationMatrix(modelID)` → already wired in `Loader.js`
- `dispose(modelID)` / `disposeAll()`

Internally it builds a single `Mesh` per IFC model (or `Group` of meshes if we keep per-`PlacedGeometry` instances). Geometry conversion uses Conway's `FlatMesh` + `IfcGeometry` (`GetVertexData/Size`, `GetIndexData/Size`) → `BufferGeometry`. We attach an `expressID` `BufferAttribute` per-vertex so face-index lookups still work the same way as `web-ifc-three`.

#### 3b.i. Subsets (the "subset" replacement)
The hard part. Today's `IfcIsolator.initHideOperationsSubset(includedIds)` calls `model.createSubset({ids, material, applyBVH, customID})` and pushes the result into `pickableIfcModels`. The semantics it needs:
1. Build a sub-`Mesh` containing only triangles whose `expressID` ∈ `ids`.
2. Apply a custom material (used by the Reveal-Hidden translucent overlay).
3. Be re-creatable in place ("removePrevious" → drop the old subset before adding the new one).
4. Be raycast-pickable (so we route `pickableIfcModels` through it instead of the full model).

Implementation sketch in `IfcModelService`:
```ts
class IfcModel extends Mesh {
  // pre-built lookup tables (computed once at load):
  expressIdToTriangleIndices: Map<number, Uint32Array>
  // for raycasting back to expressID:
  triangleIndexToExpressId: Uint32Array  // per-triangle

  createSubset({ids, material, customID, removePrevious}) { ... }
  removeSubset(customID) { ... }
}
```
Keeping the same `expressID` per-vertex `BufferAttribute` we already set means **no call-site change for `getPickedItemId`** (`mesh.geometry, picked.faceIndex` → expressID). `three-mesh-bvh@^0.7` provides `acceleratedRaycast` and `computeBoundsTree` we can attach for `applyBVH: true` semantics.

#### 3b.ii. The per-vertex attribute is *not* sufficient for per-instance picking

Surfaced during Phase 2b.2 picking work (#1516, see
`design/new/glb-model-sharing.md` §"Picking granularity"). The
conway → `web-ifc-three.IFCLoader` pipeline tags every vertex of
every placed geometry with `mesh.expressID` (line 226 of
`web-ifc-three/IFCLoader.js`) — but when an IFC source uses
`IfcMappedItem` to instance one `IfcRepresentationMap` across
multiple visible positions, conway's `streamAllMeshes` resolves the
per-vertex id via `model.getElementByLocalID(geometry.localID)`,
which is keyed on the *shared geometry's* localID. All visible
positions of that shared template inherit the **same** expressID at
the per-vertex level. Empirically observed on Momentum.ifc: 63
unique per-vertex IDs across 2.1M vertices for a building with
thousands of distinct elements.

The IFC source path doesn't expose this because
`web-ifc-three.SubsetCreator` builds subsets from a separate
**per-instance** structure (`state.models[modelID].items` — an
`ItemsMap` keyed by real IFC expressID, with explicit
geometry-range entries per element). The per-vertex attribute is
only used for face-index → expressID resolution at pick time;
subset construction has its own per-instance source of truth.

Implication for §3b.i: `triangleIndexToExpressId` (above) must be
populated **per-IFC-instance**, *not* by reading the per-vertex
attribute, even though the per-vertex attribute looks identical in
shape. Concretely the new `IfcModelService` should:

1. At parse / load: iterate placed geometries in order. For each
   placed geometry of IFC element `e`, append `e` to
   `triangleIndexToExpressId` for every triangle that geometry
   contributes — **regardless of whether the underlying shape is
   shared with another element via `IfcMappedItem`**. This mirrors
   what `web-ifc-three.IfcGeometryStorage` does today; conway's
   shared-geometry resolution is bypassed at this layer.
2. Build `expressIdToTriangleIndices` as the inverse.
3. The per-vertex `expressID` `BufferAttribute` can remain (kept for
   compatibility with `getExpressId(geometry, faceIndex)`) but
   **callers must read instance identity from
   `triangleIndexToExpressId`, not from the vertex attribute**.
   Specifically `getExpressId(geometry, faceIndex) =
   triangleIndexToExpressId[faceIndex]`.

For the GLB cache (`design/new/glb-model-sharing.md`): persist
`triangleIndexToExpressId` as a glTF accessor under a Bldrs
extension (provisional name `BLDRS_per_triangle_express_ids`). On
cache-hit load, the reader skips the conway-mediated parse and
restores `triangleIndexToExpressId` directly. The per-vertex
attribute can be dropped from the cache once readers depend on the
per-triangle table — saves ~4 bytes × N_vertices.

Until this lands, cache-hit picking is **granular to
shared-geometry templates**: clicking any one instance of a
mapped-item-shared geometry highlights all of them. Phase 2b PRs
explicitly note this limitation; the data the cache carries today
cannot support per-instance picking. Source-path picking is
unaffected.

### 3c. Plugins (small, replaceable, individually disposable)
Each takes a `ThreeContext` (and an `IfcModelService` if relevant) and exposes a tiny API:

- `Picker` — already exists in `src/view/Picker.js`; tighten it and move to `src/viewer/picker/`. Replaces `context.castRayIfc()`.
- `Clipper` — new. API surface matches today's: `{active, planes, createFromNormalAndCoplanarPoint(normal, point), deleteAllPlanes()}`. We already have `GlbClipper` as a working reference for arrow-handles + drag interaction; refactor it to be model-type-agnostic and merge.
- `Selection` — replaces `IFC.selector`. Manages two outline-driven highlight sets ("preselection" and "selection") plus the per-set materials and the `pickByID/pickIfcItemsByID` flow. Backed by `IfcModelService.createSubset` + `postprocessing.OutlineEffect`.
- `Postprocessor` — `src/Infrastructure/CustomPostProcessor.js` lives here unchanged after a `postprocessing@^7` bump.
- `Highlighter` — `src/Infrastructure/IfcHighlighter.js` lives here unchanged.
- `Isolator` — `src/Infrastructure/IfcIsolator.js` lives here unchanged. Only its dep on `IfcContext` from `web-ifc-viewer/dist/components` becomes `ThreeContext` (a type-only swap).

### 3d. `ShareViewer` facade
The only construct that `Containers/viewer.js#initViewer` instantiates. It composes the layers above and exposes the **same property names** the rest of the code already uses:
```js
viewer.context = ThreeContext
viewer.IFC     = IfcModelService    // shim getters: .loader.ifcManager → service, etc.
viewer.clipper = Clipper
viewer.isolator = Isolator
viewer.highlighter = Highlighter
viewer.postProcessor = Postprocessor
viewer.viewsManager = IfcViewsManager
// + existing IfcViewerAPIExtended methods: takeScreenshot, setSelection, getSelectedIds,
//   highlightIfcItem, preselectElementsByIds, getByFloor, loadIfcUrl, loadIfcFile,
//   castRayToIfcScene, getPickedItemId
```
**The point of mirroring the property paths is that `Containers/`, `Components/`, `WidgetApi/` stay untouched.** All the divergence is contained inside `src/viewer/`.

---

## 4. Migration plan (phased, each phase ships green)

Each phase ends with `yarn lint && yarn test && yarn test-flows` green and a working demo on a representative IFC + GLB.

### Phase 0 — preflight (no code change)
- Pin a baseline. Snapshot a few "golden" Playwright runs against Schependomlaan & a GLB model. These are the regression gates.
- Land this design doc.

### Phase 1 — peripheral dep bumps (still on three 0.135)
- Bump `postprocessing` to a version with broader three compat (`^6.36`). Confirm `OutlineEffect` API hasn't drifted (it hasn't in the 6.x line).
- Run tests. Commit.
- Bump `three-mesh-bvh` to `^0.7` directly (override the nested 0.5.24). The `acceleratedRaycast`/`computeBoundsTree` API is stable.

### Phase 2 — extract `ThreeContext`
- New module `src/viewer/three/ThreeContext.js`.
- `Containers/viewer.js#initViewer` uses `ThreeContext` directly for renderer/scene/camera setup, but still hands the result into `IfcViewerAPI` for IFC features. (The fork's `IfcContext` accepts an externally-provided renderer/scene path — confirm during implementation; if not, we instantiate `IfcViewerAPI` and *replace* its renderer/scene/controls with ours post-construction.)
- All "raw three.js" call-sites in `src/` keep working unchanged.
- **Exit criterion:** scene/camera/controls and dispose are sourced from us, not the fork.

### Phase 3 — `IfcModelService` next to the fork (Conway in a worker)
- New module `src/viewer/ifc/IfcModelService.js` driving Conway directly. Mirrors the methods listed in §3b.
- **Conway runs in a Worker from day one** (per §8.4 Move A). The service owns the worker; `loadFromBuffer` ships the buffer as a transferable; flat-mesh vertex/index arrays come back as transferables. The hot lookup tables (`expressIdToTriangleIndices`, `triangleIndexToExpressId`) live on the main thread because per-frame raycast needs them sync.
- Land the `ShareModel` interface (§8.2) and the deprecation shim on the fake `ifcManager` (§8.3) in this phase. Coordinate with the GLB-scene PR before starting (see §8.3 step 4).
- **Run it in parallel** with `IFC.loader.ifcManager` — load the model both ways, assert spatial-structure / property parity in a Jest test against a small fixture IFC. This is our correctness gate.
- Implement subsets last; gate behind a feature flag `useNewIfcService` so we can flip per-environment.
- Drop `IfcViewsManager` and the `view=ch.sia380-1.heatmap` branch (§8.1).
- **Exit criterion:** under the flag, all of `IfcIsolator`, `IfcViewerAPIExtended`, `Loader.js#newIfcLoader` work without touching `viewer.IFC.loader.ifcManager`, with main-thread parse time near zero.

### Phase 4 — cut over `IfcViewerAPIExtended` → `ShareViewer`
- New module `src/viewer/ShareViewer.js` exporting the facade in §3d.
- Update `Containers/viewer.js` to import `ShareViewer` instead of `IfcViewerAPIExtended`. The property surface is identical, so call-sites don't change.
- Delete `Infrastructure/IfcViewerAPIExtended.js`.

### Phase 5 — drop `web-ifc-viewer` and bump `three`
- Remove `web-ifc-viewer-1.0.209-bldrs-7.tgz` and the `web-ifc-viewer` dep.
- Remove the nested `web-ifc-three` (gone with it).
- Bump `three` to current stable. Update `@types/three` to match.
- Hand-fix the small set of API drifts in `src/`: `outputColorSpace`, raycaster signatures, `BufferGeometryUtils.mergeVertices` import path, etc. (see §6).
- Update `tools/esbuild` config — no more wasm copy from `web-ifc/`; only Conway's wasm.
- Update `__mocks__/web-ifc-viewer.js` → `__mocks__/ShareViewer.js`.

### Phase 6 — cleanup
- Remove the feature flag from Phase 3.
- Delete `src/Infrastructure/IfcIsolator.js`'s `IfcContext` import.
- Delete the §8.3 deprecation shim once the GLB-scene PR has cut over.
- Update `DESIGN.md` and `CLAUDE.md` to point at `src/viewer/`.
- Drop `web-ifc` from build scripts (`build-share-copy-wasm-webifc`, `USE_WEBIFC_SHIM`, etc. in `package.json`). The `useWebifcShim` branch can go entirely.

### Phase 7 — OffscreenCanvas render worker (separate spec, post-merge)
- Per §8.4 Move B. Becomes tractable only once the viewer is wholly under `src/viewer/`, because the worker boundary corresponds exactly to the `ShareViewer` facade. Out of scope for this doc; will get its own design.

---

## 5. New layout

```
src/viewer/
  ShareViewer.js              ← facade, replaces IfcViewerAPIExtended
  three/
    ThreeContext.js           ← replaces web-ifc-viewer/components/context
    fitToFrame.js
    dispose.js                ← extracted from Containers/viewer.js
  ifc/
    IfcModelService.js        ← replaces web-ifc-three + IFC.loader.ifcManager
    IfcModel.js               ← extends Mesh; subsets live here
    flatMeshToBufferGeometry.js
    IfcViewsManager.js        ← moved from Infrastructure
  picker/
    Picker.js                 ← moved + tightened from view/Picker.js
  selection/
    Selector.js               ← replaces IFC.selector
  clipper/
    Clipper.js                ← merges Clipper + GlbClipper into one
    CutPlaneArrowHelper.ts    ← moved from Infrastructure
  postprocess/
    Postprocessor.js          ← moved from Infrastructure/CustomPostProcessor.js
    Highlighter.js            ← moved from Infrastructure/IfcHighlighter.js
  isolator/
    Isolator.js               ← moved from Infrastructure/IfcIsolator.js
```

Tests live next to source as today.

---

## 6. Three.js API drifts (0.135 → 0.184) — empirical

> Updated from the original "what to expect" list with the actual findings
> of the r184 upgrade probe (branch `claude/three-r184-probe`, see also
> `notes/three-r184-probe.md`).

The audit of `src/` was right: we don't touch any of the truly removed
APIs (`Geometry`, `sRGBEncoding`, `outputEncoding`,
`physicallyCorrectLights`, `gammaFactor`). What did need attention split
into three groups.

### 6a. Module-resolution drift (build-time)

- **`three/examples/jsm/*` imports without `.js` extension stop resolving.**
  Modern three's `package.json#exports` maps `./examples/jsm/*` literally
  — no automatic `.js` extension fallback. Affected:
  - Our `src/`: one-off codemod, append `.js` to 11 imports
    (`Loader.js`, `obj.js`, `stl.js`, `svg.js`, `Loader.test.js`).
  - The fork (`web-ifc-viewer`, `web-ifc-three` vendored in
    `node_modules`): can't be patched in place; handled by an esbuild
    `onResolve` plugin in `tools/esbuild/plugins.js` that appends `.js`
    on any `^three/examples/jsm/[^.]+$` import.
- **`BufferGeometryUtils.mergeBufferGeometries`** was renamed to
  `mergeGeometries` in r155+. The fork still imports the old name.
  Handled by an esbuild `onLoad` plugin that appends a re-export alias
  to `BufferGeometryUtils.js`:
  `export { mergeGeometries as mergeBufferGeometries } from './BufferGeometryUtils.js'`.
- **`TransformControls`** no longer extends `Object3D` in r155+; the
  gizmo is exposed via `controls.getHelper()`. The fork's
  `IfcPlane#initializeControls` (clipping planes) does
  `controls.children[0].children[0].add(...)` — which fails silently
  until click-time and throws `Cannot read properties of undefined`. An
  esbuild `onLoad` rewrite of the fork's `planes.js` patches the five
  affected call-sites (`scene.add(controls)`, `excludedItems.add(controls)`,
  the `.children[0].children[0]` chain, `controls.visible = state`,
  `controls.removeFromParent()`) to call `getHelper()` when present.

### 6b. Color management (visual)

This is where the probe got iterative. Three independent r152+ changes
all push appearance away from the r135 baseline, and they compound. We
take all three off until Phase 5 — the upgrade ships a **legacy
visual-compat path**, not the new physically-correct path. Concretely:

| Change | r135 behavior | r184 default | Our compat setting |
|---|---|---|---|
| Auto sRGB↔linear conversion on materials / textures (r152) | off | on (`ColorManagement.enabled = true`) | **`ColorManagement.enabled = false`** at module load in `src/viewer/ShareViewer.js`, before any three object is constructed (including the fork's renderer/scene/materials inside `new IfcViewerAPI()`). |
| Output framebuffer gamma encoding (r152) | `LinearEncoding` (no encoding) | `outputColorSpace = SRGBColorSpace` (sRGB encoding) | **`renderer.outputColorSpace = LinearSRGBColorSpace`** in `ShareViewer.constructor`, set after `super()` and before `new CustomPostProcessor()`. Postprocessing's `EffectComposer.initialize` keys off this property to tag its render target — so this setting must be in place before the composer is built. |
| `useLegacyLights` / light-intensity units (r155 default flip, r157 removal) | legacy units (where `intensity=0.8` looked the way it did) | physically correct (1 unit = 1 lumen; same numeric value ~π× dimmer) | **Multiply the fork's hardcoded light intensities by `Math.PI`** via an esbuild `onLoad` rewrite of `web-ifc-viewer/.../scene.js` — `DirectionalLight(_, 0.8) → 0.8 * Math.PI`, `AmbientLight(_, 0.25) → 0.25 * Math.PI`. |

The three settings are **mutually dependent** — having any two without
the third over- or under-corrects:
- `CM=true` + `outputColorSpace=SRGB` + default lights → washed-out
  brown (the original r184 baseline). Materials get sRGB→linear→sRGB
  round-trip, lights are π× too dim.
- `CM=true` + `outputColorSpace=SRGB` + lights×π → overbright peach.
  Round-trip still washes the colors, but lights are now boosted to
  physically-correct, compounding with the output encoding.
- `CM=false` + `outputColorSpace=Linear` + default lights → way too
  dark. Output not gamma-encoded, lights still under-powered.
- `CM=false` + `outputColorSpace=Linear` + lights×π → **matches r135
  prod pixel-for-pixel.**

### 6c. Deprecations (console noise)

- **`THREE.Clock`** was deprecated in r183 with a one-time
  `console.warn` on construction. The fork instantiates `new
  Clock(true)` once. `THREE.Timer` (the recommended replacement) is not
  a drop-in — it requires explicit per-frame `update()` and lacks
  Clock's auto-start. Rather than rewire the fork's render loop, an
  esbuild `onLoad` rewrite of the fork's `context.js` strips `Clock`
  from the `three` import and inlines a tiny API-compatible class using
  `performance.now()` for `getDelta()`. (Required for the upgrade PR
  because production runs with zero console noise as a gate.)

### 6d. Build / tooling

- **`typescript`** bump from `4.9.4` → `^5.7.2`. Forced by
  `@types/three@0.184`, which uses TS5 const-type-parameter syntax
  (`<const TNodeType>`). Independent good-hygiene upgrade.
- **`tsconfig.json` `skipLibCheck: true`** — the `@types/three` node
  graph types use TS features TS<5 can't parse. Standard for modern TS
  projects.
- **`@types/three`** locked to the runtime version (`^0.184.1`) —
  formerly `0.146.0`, which was already drifted ahead of runtime
  (`0.135.0`).
- **`postprocessing`** bump from `6.29.3` → `^6.39.1`. Required because
  postprocessing's peer range tightened past 0.135 starting at
  `6.30.0`; we needed to bump three to bump postprocessing in any case.
- **`three-mesh-bvh`** via a `resolutions` field in `package.json`,
  pinned to `^0.9.10`. Same reason: the nested `0.5.x` version inside
  the fork is incompatible with modern three; the root override forces
  one version across all consumers.

### 6e. Where this is going — the migration to PBR / tone-mapping

The compat path in §6b is a **deliberate hold**, not the destination.
The fork's IFC pipeline and our material setup were tuned in 2022
against three's pre-r152 conventions. To migrate forward we need:

1. **Tag IFC material colors as sRGB** at parse / decoration time —
   today the colors come out of Conway / `web-ifc-three` as plain RGB
   triples treated as linear-space data. The new world wants
   `material.color.colorSpace = SRGBColorSpace` (or its texture
   equivalent for any GLB-baked materials). This is a one-pass change
   in the decorator path that becomes possible once `IfcModelService`
   (Phase 3) owns model construction.
2. **Re-enable `ColorManagement.enabled = true`** (the r184 default) —
   automatic sRGB ↔ linear conversion gives correct lighting math on
   the now-tagged materials.
3. **Re-enable `outputColorSpace = SRGBColorSpace`** (also the r184
   default) — final framebuffer is correctly gamma-encoded.
4. **Drop the lights × π rewrite** — the legacy light values were
   tuned visually against the broken legacy path. Pick new values
   tuned against physically-correct lighting. Likely also introduce a
   single `MeshPhysicalMaterial`-based PBR material at this point and
   add a single environment map for sane reflection/grounding.
5. **Pick a tone mapper.** `renderer.toneMapping = ACESFilmicToneMapping`
   (or `AgXToneMapping`) plus a calibrated `toneMappingExposure` will
   give the standard "filmic" look the rest of the industry expects.
   Pair with the env map from step 4.

Steps 1–3 are mechanical once Phase 3 lands (we own the model and
renderer). Step 4 needs an artistic pass — pick lighting values that
make Schependomlaan & GLB models look how we want them to look in the
new visual regime, not how they looked in r135. Step 5 is the easiest
and most impactful: a one-line `toneMapping` setter unlocks the entire
post-r152 visual quality. We should do this **before** PBR materials
land, so we have a stable reference point for material tuning.

A reasonable target sequence:

- Phase 5 (today's Phase 5 from §4): drop fork; on the same PR, take
  steps 2–3 (re-enable Managed mode + sRGB output) and step 5 (set
  `toneMapping = ACESFilmicToneMapping`). Tune one set of `ambient` +
  `directional` light values to look right against the new pipeline.
  Snapshot the new baseline in Cosmos.
- Phase 6+: step 1 (material colorSpace tagging) + step 4 (PBR + env
  map). Standalone visual-quality PR; ships against the post-Phase-5
  pipeline.

The compat-path code is a single docblock in `ShareViewer.js` + the
esbuild plugin's lights rewrite — both already commented "goes away
with Phase 5". Removing them is a four-line diff at that point.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Conway's spatial-structure / properties output isn't byte-equivalent to `web-ifc-three`'s | Medium | Breaks NavTree, Properties panel, search index | Phase 3 parity test against fixture IFCs; keep flag until parity confirmed |
| `IfcModelService` reads per-instance expressID from the conway-supplied per-vertex buffer | High | Cache-hit picking collapses to shared-geometry granularity (observed Phase 2b.2 — 63 unique IDs / 2.1M verts on Momentum.ifc); breaks per-instance Hide/Isolate/Reveal too | Per §3b.ii, build `triangleIndexToExpressId` per-instance at parse — bypass conway's `getElementByLocalID(geometry.localID)` resolution. Persist via `BLDRS_per_triangle_express_ids` extension for cache parity. |
| Subset raycasting performance regression vs `web-ifc-three`'s native worker path | Medium | Hover-pick lag on big models | Add `three-mesh-bvh@^0.7` `acceleratedRaycast` from day one; measure on a >100MB IFC |
| Outline highlight visual drift after color-management change | Low | Cosmetic | Snapshot tests in Cosmos; tune `OutlineEffect` colors if needed |
| Hidden coupling between `web-ifc-viewer.IfcContext` and `IfcManager` we missed | Medium | Phase 4 cutover stalls | Phase 3's parallel-run flag means we discover this before deletion |
| Build/Playwright still reach for `node_modules/web-ifc/*.wasm` | Low | CI breakage | Audit `tools/esbuild/build.js`, `package.json` scripts before Phase 5 |
| `camera-controls` API drift (1.x → 3.x) | Low | Camera UX regressions | Keep on 1.x for the first cut; bump as a follow-up |
| Conway worker bridge (transferables, error propagation, progress events) | Medium | Phase 3 slips | Land Move A behind the same `useNewIfcService` flag; fall back to in-thread mode if the worker fails to boot |
| Collision with in-flight GLB-optimized-scene PR | Medium | Rework or merge conflicts in `Loader.js` and the NavTree | §8.3 deprecation shim covers both merge orderings; sync on `ShareModel` shape before Phase 3 |
| Property-read async signature drift breaks a sync call-site we missed | Low | Runtime error | Static check: `properties` reads in `src/` are all already `await`-ed; grep at start of Phase 3 to confirm |

---

## 8. Resolved decisions

### 8.1 Drop `IfcViewsManager` — yes
`src/Infrastructure/IfcElementsStyleManager` and the `view=ch.sia380-1.heatmap` URL branch in `IfcViewerAPIExtended.js` are unused. Delete in Phase 2/3; revisit when type-rule recoloring comes back. `IfcModelService` will still expose a generic post-build hook (`onModelBuilt(model)`) so a future recolor pass has somewhere clean to attach.

### 8.2 `IFC.type === 'glb' | 'gltf'` — replace with capability flags on the model
Audit of what that discriminant actually gates:
- `CutPlaneMenu.jsx` (5 sites) — picks between `viewer.glbClipper` (3-axis arrow-handle clipper) and `viewer.clipper` (web-ifc clipper that integrates with `pickIfc` / `pickableIfcModels`).
- `IfcViewerAPIExtended#setSelection` — early-returns for non-IFC: "setSelection is not supported for this type of model."
- `IfcViewerAPIExtended#highlightIfcItem` — only runs `IFC.selector.preselection.pick(found)` when IFC.
- `Loader.js` — sets `viewer.IFC.type = 'glb'` and decorates the model with a fake `ifcManager` (see 8.3).

The leak: it conflates **source format** with **runtime capabilities**. After the new viewer, all loaded models share a `ShareModel` shape; whether selection / express-id picking works is a property of *that model*, not the file extension.

**Resolution:** put format/capability info on the model, not the viewer:
```ts
interface ShareModel extends Object3D {
  format: 'ifc' | 'glb' | 'gltf' | 'obj' | 'stl' | 'pdb' | 'xyz' | 'fbx' | 'bld'
  capabilities: {
    expressIdPicking: boolean    // true for IFC; false until GLB-scene PR lands
    spatialStructure: boolean    // true for IFC and the upcoming GLB-scene format
    typedProperties: boolean
    ifcSubsets: boolean          // true when backed by IfcModelService
  }
}
```
Call-sites become `if (model.capabilities.expressIdPicking)` and `if (model.capabilities.ifcSubsets)` — no `viewer.IFC.type` left anywhere. After the unified `Clipper` lands (§3c), the cut-plane branch collapses entirely. This shape is forward-compatible with the in-flight GLB-optimized-scene PR (8.3): that PR can set `capabilities.spatialStructure = true` on its loaded model and re-light the NavTree without any other viewer-side work.

### 8.3 Fake `ifcManager` on non-IFC models — deprecate gracefully
There's a parallel PR moving non-IFC content toward a GLB-based optimized scene format. We will collide with it. The careful path:

1. In Phase 2 (`ThreeContext` extract), **keep** `Loader.js#convertToShareModel` decoration verbatim. No semantic change.
2. In Phase 3, introduce the `ShareModel` interface in 8.2. Loaders return real `ShareModel` instances. Every method on the old fake `ifcManager` (`getSpatialStructure`, `getExpressId`, `getIfcType`) gets a **deprecation shim**:
   ```js
   function deprecated(name, fn) {
     let warned = false
     return (...args) => {
       if (!warned) {
         warned = true
         console.warn(
           `[deprecated] model.ifcManager.${name}() on non-IFC model — ` +
           `read from model.spatialStructure / model.capabilities instead.`,
         )
       }
       return fn(...args)
     }
   }
   ```
   Each shim has a JSDoc `@deprecated` tag pointing at the replacement. Lint rule `no-restricted-properties` warns on any new usage.
3. The GLB-scene PR (whichever lands second) updates its callers to the `ShareModel` API. Once green, the shim is deleted.
4. **Coordination touchpoint:** before starting Phase 3, sync with whoever owns the GLB-scene PR — agree on the `ShareModel` shape together so both PRs aim at the same target. Land Phase 3 *after* GLB-scene if it's close to merging, *before* if not (the deprecation shim covers both orderings).

### 8.4 Parsing in worker + OffscreenCanvas — scope this in alongside
The UI freezes on big models because Conway parse, geometry conversion, and BVH build all run on the main thread. Two independent moves; sequenced.

**Move A: Conway parsing off-main-thread (small, high ROI).**
- `@bldrs-ai/conway` already exposes a worker entry. `IfcModelService` owns the worker; `loadFromBuffer` `postMessage`s the file buffer (transferable), receives the flat-mesh stream back.
- Geometry conversion (FlatMesh → `Float32Array`/`Uint32Array` for vertices/indices) also runs in the worker. Buffers come back as transferables — zero-copy.
- Main thread does only `new BufferGeometry()` + `new BufferAttribute(transferredArray, n)` + `new Mesh()`. That's microseconds.
- **Property reads** (`getProperties`, `getSpatialStructure`, `idsByType`) become async over the worker port. Most call-sites already `await` these, so signature drift is small. The few sync uses (`getExpressId(geometry, faceIndex)`) stay sync because the lookup is a typed-array index into data already on the main thread.
- Cost: ~1 week. Risk: medium — Conway's worker entry is known-good; the integration work is plumbing.

**Move B: OffscreenCanvas (medium, big UX win, real risk).**
- `WebGLRenderer` constructed in a worker against an `OffscreenCanvas` transferred from the main thread (`canvas.transferControlToOffscreen()`).
- Render loop, raycasting, picking, BVH build all run in the render worker. Main thread stays at 60Hz for React / UI even during a heavy frame.
- DOM events on the canvas (`mousemove`, `wheel`, etc.) forwarded to the worker via `postMessage`. Camera-controls runs in the worker.
- **What we lose / what's hard:**
  - `CSS2DRenderer` doesn't work in workers (needs DOM). Today we render `PlaceMark` icons via it. Either keep one DOM overlay on the main thread reading camera state via worker messages, or move markers to in-WebGL sprites.
  - `postprocessing` lib's `OutlineEffect` does work in workers in current versions, but verify against the post-bump version.
  - DevTools experience degrades (no breakpoints inside the renderer from main-thread devtools view; needs separate worker inspector).
  - HMR for the render worker is more brittle; need a dedicated esbuild entry.
  - Firefox `OffscreenCanvas` for WebGL2 needs flag in older versions; Safari ≥17 only. Fall back to main-thread renderer behind a runtime check.
- Cost: ~2 weeks. Risk: high if we want full feature parity.

**Recommendation: do Move A inside Phase 3** (it falls naturally out of the `IfcModelService` worker boundary). **Spec Move B as a Phase 7** (post-three-bump, separate doc). Move A delivers most of the "UI doesn't freeze" win because Conway parse is the dominant blocker today.

---

## 9. What this unlocks once shipped

- `three` → `^0.171` (or whatever's current at merge)
- `postprocessing` → `^7`
- `three-mesh-bvh` → `^0.7`
- `camera-controls` → `^3` (follow-up)
- Removal of: `web-ifc-viewer-1.0.209-bldrs-7.tgz`, `web-ifc-viewer` dep, nested `web-ifc-three`, the `web-ifc` runtime wasm, `USE_WEBIFC_SHIM` build branch, `__mocks__/web-ifc-viewer`.
- A single-source IFC engine path (Conway only) — matches the AGENTS direction in `pages/share/Conway.jsx`.

---

## 10. Estimated cost

Phases 0–2 small (≤ 2 days each). Phase 3 is the big one (2–3 weeks: parity + subsets + Conway worker integration + GLB-scene-PR coordination). Phases 4–6 small once Phase 3 is green. Total: ~3–4 weeks of focused work, dominated by Conway-vs-`web-ifc-three` parity and worker plumbing. Phase 7 (OffscreenCanvas) is a separate ~2-week effort with its own design doc.

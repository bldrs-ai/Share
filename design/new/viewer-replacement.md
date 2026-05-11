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

### Phase 3 — `IfcModelService` next to the fork
- New module `src/viewer/ifc/IfcModelService.js` driving Conway directly. Mirrors the methods listed in §3b.
- **Run it in parallel** with `IFC.loader.ifcManager` — load the model both ways, assert spatial-structure / property parity in a Jest test against a small fixture IFC. This is our correctness gate.
- Implement subsets last; gate behind a feature flag `useNewIfcService` so we can flip per-environment.
- **Exit criterion:** under the flag, all of `IfcIsolator`, `IfcViewerAPIExtended`, `Loader.js#newIfcLoader` work without touching `viewer.IFC.loader.ifcManager`.

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
- Update `DESIGN.md` and `CLAUDE.md` to point at `src/viewer/`.
- Drop `web-ifc` from build scripts (`build-share-copy-wasm-webifc`, `USE_WEBIFC_SHIM`, etc. in `package.json`). The `useWebifcShim` branch can go entirely.

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

## 6. Three.js API drifts we'll hit (0.135 → current)

Audit of `src/` shows we don't touch any of the worst-affected APIs (`Geometry`, `sRGBEncoding`, `outputEncoding`, `physicallyCorrectLights`, `gammaFactor`). What does need attention:

- **Color management defaults** changed in r152. Set `renderer.outputColorSpace = SRGBColorSpace` explicitly; verify `MeshLambertMaterial` colors look the same on Schependomlaan.
- **Lights**: `useLegacyLights` removed in r157. Default is the new "physically correct" intensities. Our scene uses simple ambient + directional; re-tune intensities once after the bump.
- **`BufferGeometryUtils.mergeVertices`** import path changed from `'three/examples/jsm/utils/BufferGeometryUtils'` to `'three/addons/utils/BufferGeometryUtils.js'`. Already imported in `loader/obj.js` and `loader/stl.js`.
- **All `three/examples/jsm/loaders/*`** → `three/addons/loaders/*` (codemoddable; one find/replace).
- **`Raycaster.intersectObjects`** signature unchanged. Fine.
- **`@types/three`** must move to a version matching the chosen three release (e.g. `0.171.x` for three `0.171.x`).
- **`postprocessing@7`** drops some legacy passes. `OutlineEffect`, `EffectComposer`, `EffectPass`, `RenderPass`, `BlendFunction.SCREEN` all still exist, so our usage is safe.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Conway's spatial-structure / properties output isn't byte-equivalent to `web-ifc-three`'s | Medium | Breaks NavTree, Properties panel, search index | Phase 3 parity test against fixture IFCs; keep flag until parity confirmed |
| Subset raycasting performance regression vs `web-ifc-three`'s native worker path | Medium | Hover-pick lag on big models | Add `three-mesh-bvh@^0.7` `acceleratedRaycast` from day one; measure on a >100MB IFC |
| Outline highlight visual drift after color-management change | Low | Cosmetic | Snapshot tests in Cosmos; tune `OutlineEffect` colors if needed |
| Hidden coupling between `web-ifc-viewer.IfcContext` and `IfcManager` we missed | Medium | Phase 4 cutover stalls | Phase 3's parallel-run flag means we discover this before deletion |
| Build/Playwright still reach for `node_modules/web-ifc/*.wasm` | Low | CI breakage | Audit `tools/esbuild/build.js`, `package.json` scripts before Phase 5 |
| `camera-controls` API drift (1.x → 3.x) | Low | Camera UX regressions | Keep on 1.x for the first cut; bump as a follow-up |

---

## 8. Open questions

1. **Drop `IfcViewsManager` (`src/Infrastructure/IfcElementsStyleManager`)?** It hooks into `IFC.loader.ifcManager.parser` to re-color geometry by IFC type rule. We need an equivalent hook in `IfcModelService` (post-flat-mesh, pre-Mesh-build). Confirm whether the SIA380-1 heatmap path is still in scope.
2. **Keep `IFC.type === 'glb' | 'gltf'` discriminant** or make it a property on the model? Today `CutPlaneMenu.jsx` and `Loader.js` both branch on `viewer.IFC.type`. Cleaner is a `model.kind` field on the loaded `Object3D`.
3. **Keep `model.ifcManager` decoration in `Loader.js#convertToShareModel`** for non-IFC formats? Right now we synthesise a fake `ifcManager` so NavTree-style code doesn't crash on a glb. With the new layer we can give every model a `ShareModel` interface and drop the fake.
4. **Worker?** `web-ifc-three`'s `IFCWorker` ran parsing off-main-thread. Conway also has a worker mode (`@bldrs-ai/conway` exposes a worker entry); decide whether to wire it up in `IfcModelService` from day one or punt.

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

Phases 0–2 small (≤ 2 days each). Phase 3 is the big one (1–2 weeks: parity + subsets + worker decision). Phases 4–6 small once Phase 3 is green. Total: ~3 weeks of focused work, dominated by Conway-vs-`web-ifc-three` parity.

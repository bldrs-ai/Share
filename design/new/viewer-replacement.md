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

#### 3b.ii. Per-instance picking — what's actually true (revised)

*This section was rewritten 2026-05 after the
`ifcItemsMapParity` smoke probe — see `src/loader/Loader.js#runIfcItemsMapParityCheck`.
The previous text claimed `web-ifc-three.SubsetCreator` held a
separate "per-instance" `ItemsMap` keyed by real IFC expressID,
distinct from the per-vertex attribute. That was wrong.
`web-ifc-three`'s `ItemsMap` (IFCLoader.js:309) is built by reading
the per-vertex `expressID` attribute (line 367) — both surfaces
derive from the same Conway emission and have identical granularity.*

The real story, confirmed empirically across several models:

**Conway's `StreamAllMeshes` emits one `FlatMesh` per IFC product**
(`flatMesh.expressID` = the IFC product's expressID, e.g. `IfcWall`,
`IfcWindow`). Within each FlatMesh, `flatMesh.geometries` is a
`Vector<PlacedGeometry>` — one entry per visible instance, each
with its own `flatTransformation` (4×4 placement matrix) and a
`geometryExpressID` referencing the underlying shape.

Two distinct sub-cases live under one FlatMesh with multiple
PlacedGeometries:

1. **IfcMappedItem instances.** Multiple PlacedGeometries SHARE
   one `geometryExpressID` and differ only in `flatTransformation`.
   The IFC source uses `IfcMappedItem` / `IfcRepresentationMap` to
   instance one shape at many positions. Per-instance picking is
   the right answer here — each visible placement is logically a
   distinct selectable element. The per-vertex `expressID`
   attribute collapses them onto the parent product's id, which
   is what generates the "click one wall, highlight 42" UX.

2. **Compound representation.** PlacedGeometries have DIFFERENT
   `geometryExpressID`s — one IFC element's representation is built
   from multiple distinct geometric primitives (e.g. a window
   product = frame + glass + handle, three distinct shapes; a wall
   = N material layers). Per-instance picking would be wrong here:
   subcomponents are not independently selectable in IFC semantics.

**Empirical mix from the smoke probe** (`?feature=ifcItemsMapParity`):

| Model | Exporter | Multi-placed FlatMeshes | allShared (case 1) | allUnique (case 2) |
|---|---|---|---|---|
| Momentum | ArchiCAD | 34 of 63 | 0 | 34 |
| Schependomlaan | ArchiCAD | 731 of 3505 | 277 | 454 |
| Snowdon (IFC 2x3) | Revit | 4051 of 6023 | 2284 | 1767 |
| Snowdon (IFC 4) | Revit | 5034 of 6023 | 2280 | 2754 |

Revit emits `IfcMappedItem` heavily; ArchiCAD's usage varies per
project. Per-instance picking matters on the case-1 portion of
the data and is a no-op for case-2.

**Implication for §3b.i.** Two complementary lookup structures
under one class hierarchy:

- `IfcItemsMap` — per-IFC-product keying. Matches today's
  `web-ifc-three` semantics. One entry per FlatMesh; subsets
  highlight every visible position of that product together.
  Used for "select the wall" workflows.
- `IfcInstanceMap` — per-PlacedGeometry keying via synthetic
  instance IDs. One entry per visible position. Resolves back to
  the parent IFC product via `getParentExpressIdByInstance(id)`.
  Used for "select this specific visible placement" workflows.

Both are populated from the same Conway `StreamAllMeshes` walk
(see `src/viewer/ifc/IfcItemsMap.js#itemsMapFromFlatMeshes` and
`src/viewer/ifc/IfcInstanceMap.js#instanceMapFromFlatMeshes`) — the
extra cost of building both is one extra typed-array allocation;
the walk is shared. The `flatMeshToBufferGeometry` assembler emits
both `expressID` and `instanceID` per-vertex attributes so picking
can resolve to whichever granularity the caller asks for via the
items map / instance map respectively.

The cache-side concerns are addressed below in "Cache round-trip" —
no custom glTF extension was needed; per-vertex `instanceID` rides
through GLTFExporter's `_UPPERCASE` rename verbatim.

**Live implementation** (behind `?feature=conwayDirectIfc`, on track
to default-on once the open items in §3b.iii land):

- `src/viewer/ifc/IfcItemsMap.js` — per-IFC-product table. Three
  populators: per-vertex-attribute (fallback / cache-hit before
  Conway-direct), ordered-ranges (data-flow), Conway stream walk.

- `src/viewer/ifc/IfcInstanceMap.js` — per-PlacedGeometry table.
  Three populators mirroring `IfcItemsMap`'s set:
  - `instanceMapFromOrderedPlacedRanges(ranges, {geometry})` — data-flow
    populator. Used by the assembler hand-off.
  - `instanceMapFromGeometry(geometry)` — the BVH-safe + cache-hit
    populator. Reads the per-vertex `expressID` + `instanceID`
    attributes and the (possibly BVH-reordered) index buffer to
    derive all four lookup tables. Lives in two roles: (a)
    post-`computeBoundsTree()` rebuild on cache-miss because
    `three-mesh-bvh` permutes the index buffer in place; (b) cache-
    hit restoration from per-vertex data alone.
  - `instanceMapFromFlatMeshes(flatMeshes, api, modelID)` — Conway
    stream walk. Used by the parity probe; not on the live render
    path (the assembler's data feeds the BVH-safe populator
    instead).

- `src/viewer/ifc/flatMeshToBufferGeometry.js` — the assembler.
  Walks captured FlatMeshes, applies `flatTransformation` to
  positions and normals, bins PlacedGeometries by
  `PlacedGeometry.color` into contiguous index-buffer groups,
  emits one `MeshLambertMaterial` per bin (matching
  `web-ifc-three.IFCParser#storeGeometryByMaterial`'s shape exactly).
  Returns `{geometry, ranges, materials}`.

- `src/viewer/ifc/buildConwayIfcModel.js` — glue. Combines the
  assembler + `instanceMapFromOrderedPlacedRanges` into a
  `{mesh, instanceMap, materials, stats}` bundle.

- `src/loader/Loader.js#installConwayDirectGeometry` — on cache-
  miss IFC parse, swaps `ifcModel.geometry` / `.material` to the
  Conway-direct outputs, computes BVH (which reorders the index
  buffer), then rebuilds the `IfcInstanceMap` via
  `instanceMapFromGeometry` so the post-reorder triangle indices
  match the picking map. Flips capabilities (`ifcSubsets: false`,
  `instancePicking: true`).

- `src/viewer/ShareViewer.js` — selection + preselection routing.
  When `instancePicking` is set, both `setSelection` (parent-level)
  and `setInstanceSelection` (one-instance) traverse the model and
  build subsets via per-Mesh `instanceMap.createSubsetMesh*`. Each
  subset is parented under the source mesh's parent so the
  translucent x-ray fill renders, then handed to the OutlineEffect
  for the edge outline. Hover preselection (`highlightIfcItem`)
  takes the same path scoped to the picked Mesh only.

- `src/Containers/CadView.jsx` — click handler. When the picked
  Mesh has an `instanceMap`, resolves the (instanceId, parentExpressId)
  via `getInstanceIdByTriangle` + `getParentExpressIdByInstance`,
  writes `selectedElements` = [parentExpressId] and
  `selectedInstanceIds` = [instanceId] (or `[]` when Shift is held,
  to expand to whole element). The selection useEffect chains
  `viewer.setSelection(0, ids)` then
  `viewer.setInstanceSelection(0, instanceIds)`.

**Cache round-trip** (`?feature=conwayDirectIfc,glb`):

Per-vertex `instanceID` rides through the IFC→GLB→IFC cache
natively via GLTFExporter's `_UPPERCASE` rename — no custom glTF
extension needed. The reader side renames `_instanceid` back to
`instanceID`, `inferModelCapabilities` detects the attribute and
flips `instancePicking`, the cache-hit decoration block in
`Loader.js` walks each child Mesh (GLTFExporter splits one indexed
mesh into N glTF primitives per material group) and attaches a
per-Mesh `instanceMap` via `instanceMapFromGeometry`. ShareViewer's
traversal-based subset build naturally handles the multi-Mesh
shape — instance IDs are globally unique across the splits since
GLTFExporter preserves attribute values verbatim.

#### 3b.iii. Known limitations + follow-up slices

**Done — isolate routing.** Resolved 2026-05 (this slice).
`IfcIsolator.initHideOperationsSubset` / `initTemporaryIsolationSubset`
/ `toggleRevealHiddenElements` previously called
`this.ifcModel.createSubset(...)` expecting `web-ifc-three.SubsetCreator`'s
single-Mesh return against the *original* (pre-swap) geometry. Now
resolved by routing through `attachInstanceMapSubsets`
(`src/viewer/three/elementSubsets.js`) — a sibling of
`attachElementSubsets` that backs `model.createSubset` with each
child mesh's `IfcInstanceMap.createSubsetMeshByParent`.

The chosen design: **unify `model.createSubset` to return `Mesh[]`
on the Conway-direct paths.** Wit-three's stock single-Mesh return
stays for non-Conway models (the path is going away in Phase 5
anyway). The isolator normalises both shapes through three internal
helpers (`_subsetMeshes` / `_addSubsetToScene` /
`_removeSubsetFromScene`); the three subset-construction call sites
kept their existing shape. `pickableModels` push by-reference,
remove by `indexOf` + `splice` rather than `.pop()` — robust to
other models being pushed mid-isolation.

Visual quality follows model shape:

- **Cache-hit Conway-direct** (steady state — Group of N per-material
  child Meshes). Each child contributes one subset that inherits the
  child's single material → per-PlacedGeometry colors render
  correctly. Outline + translucent x-ray fill both work.
- **Cache-miss Conway-direct** (first load only — single Mesh with
  array material + `geometry.groups[]`). The subset inherits the
  array material without groups, so three renders all subset
  triangles with `material[0]`. Small visual regression in isolation
  mode on first load, corrects on reload (cache hit). Acceptable
  for an admittedly rare workflow.

Pickability:

- Subsets are raycast-active (`raycastInvisible: false` passed
  through to `instanceMap.createSubsetMeshByParent`) so clicks on
  isolated elements work.
- The subset does *not* carry its own `instanceMap`. Clicks fall
  through `CadView.jsx`'s `mesh.instanceMap` check to the per-vertex
  `expressID` attribute branch, which returns the parent IFC product.
  Per-instance picking on isolated elements is unavailable until
  deisolated — acceptable trade-off for the rare workflow.

`setModel` was extended to handle hierarchical models — when
`ifcModel.geometry` is undefined it traverses children and unions
the per-vertex `expressID` attribute across child Meshes.

**Other open items:**

- **Cmd/Ctrl for multi-select** on `instancePicking` models.
  Shift now means "expand to whole IFC element" (Option A from
  the per-instance UX choice — confirmed). The legacy "Shift =
  add to selection" semantic gets pushed off Shift; Cmd/Ctrl is
  the obvious slot. Not urgent — multi-select isn't on the hot
  IFC workflow path — but worth picking up alongside the
  isolate-routing slice while the click handler is open.

- **Hover preselection pooling.** `_setConwayPreselectionFromHit`
  reuses a single pooled subset Mesh to keep mouse-move costs
  flat; the same optimisation could apply to selection (clicks
  are rare so impact is lower) and could be lifted into a
  general SubsetPool the isolator + clipper consume too.

- **Per-IFC-product Mesh emission as the long-term hide / pick
  architecture.** The current assembler bins
  `PlacedGeometries` by `placedGeometry.color`, producing one
  child Mesh per color bin — which is what forces every hide /
  isolate to construct a filtered subset Mesh and what made the
  array-material `geometry.groups`-empty render-skip bug
  reachable in the first place. An alternative shape — one
  Mesh per IFC product (per `FlatMesh.expressID`) — would make
  hide trivially `mesh.visible = false`, drop the entire
  subset-construction surface for the simple case, and remove
  the multi-material monochrome regression in `buildSubsetMesh`'s
  `Array(N>1)` fallback. The cost is N draw calls instead of M
  binned ones; on Snowdon (~6k products) that's noticeable but
  recoverable with InstancedMesh batching for the
  `IfcMappedItem`-heavy portion and per-product Mesh for the
  rest. See §3b.iv — now an active effort.

**Done — BLDRS_spatial_tree slice.** Landed 2026-05 (PR #1527).
Resolves §3b.iii default-on blocker 1 below: cache-hit GLBs now
hydrate the NavTree without a live IFC parser.

- `src/loader/injectGlbExtensions.js` — GLB post-processor (parse →
  splice extensions + bufferViews → re-serialise). Chosen over a
  GLTFExporter plugin so geometry export stays untouched and the
  extension wiring lives in one well-tested seam. Returns
  `{bytes, stats}`; collision-safe (won't overwrite an existing
  entry); synthesises a BIN chunk on input with none.
- `src/loader/bldrsSpatialTree.js` — `BLDRS_spatial_tree` extension
  codec. Writer-side `captureBldrsSpatialTree(ifcManager, modelID)`
  whitelists `{expressID, type, Name, LongName, children}` (drops
  parser internals, depth-bounded via `MAX_TREE_DEPTH=100`).
  Reader-side `BldrsSpatialTreeReader` GLTFLoader plugin decompresses
  on `afterRoot`, validates shape (object + numeric expressID),
  attaches to `gltf.scene.userData.bldrsSpatialTree`. Guards on
  out-of-range bufferView index and absent default scene.
- `src/loader/Loader.js#convertToShareModel` — promotes
  `userData.bldrsSpatialTree` to a model-level
  `model.getSpatialStructure(modelID, withProperties)` closure on
  cache-hit. Live IFC parses don't ship the extension and fall
  through to the legacy `ifcManager` path.
- `src/loader/Loader.js#parseBldrsGlbContainer` — bubbles
  `gltf.scene.userData` up to the merged Group so downstream
  consumers see extension data on the returned root.
- `src/viewer/ShareModel.js#inferModelCapabilities` — flips
  `capabilities.spatialStructure: true` when the userData payload
  is present.
- `src/Containers/CadView.jsx` — NavTree path discriminates on the
  cache payload (`m.userData?.bldrsSpatialTree`). Method-existence
  check would have collided with wit-three's prototype
  `IFCModel.getSpatialStructure(): Promise<any>` (no args), silently
  dropping `withProperties=true` on live IFC parses.
- `src/loader/glbCacheKey.js` — schema bump `0.5.0` → `0.6.0` so
  older cached artifacts read as miss; next miss rewrites with the
  extension attached.

Untrusted-input validation today is shape-only (object + numeric
expressID + recursion-depth ceiling). Full validation per
`design/new/glb-model-sharing.md` §"Validation and trust" — schema-
version range, cross-reference integrity, size ceilings, HTML-strip
on rendered strings — lands with the originator-side share flow
(Phase 5+) when GLBs can arrive from arbitrary user browsers.
File-header TODO points at the spec.

**Done — BLDRS_element_properties slice.** Landed 2026-05 (this PR).
Resolves §3b.iii default-on blocker 2 below: cache-hit GLBs now
hydrate the Properties panel without a live IFC parser.

- `src/loader/bldrsElementProperties.js` — `BLDRS_element_properties`
  extension codec. Writer-side
  `captureBldrsElementProperties(ifcManager, modelID, spatialTree)`
  walks a BFS from spatial-tree expressIDs through the IFC reference
  graph (`{type: 5, value: expressID}` shape), fetching shallow item
  properties for each entity in the closure. Bounded by
  `MAX_CLOSURE_SIZE = 1_000_000` and `MAX_VALUE_DEPTH = 100` for
  defense against pathological inputs. Output shape:
  `{itemProperties: {[id]: data}, propertySets: {[productId]: [psetId, ...]}}`
  — psets are deduplicated by ID rather than inlined per product
  (typical IFCs share Pset_WallCommon etc. across every wall;
  inlining would 3-5× the payload). Reader-side
  `BldrsElementPropertiesReader` GLTFLoader plugin is **lazy** —
  `afterRoot` stores the compressed bytes + a `decode()` closure on
  `gltf.scene.userData.bldrsElementProperties` and DOES NOT
  decompress. First `model.getItemProperties` / `getPropertySets`
  call triggers a one-shot `pako.ungzip` + `JSON.parse`, cached
  internally. Loads that never open the Properties panel pay
  nothing for the extension.
- `src/loader/Loader.js#convertToShareModel` — promotes the lazy
  payload to two model-level closures:
    * `model.getItemProperties(expressID)` → `data.itemProperties[id]`
    * `model.getPropertySets(expressID)` → array of pset objects,
      built by looking up the propertySets index against the
      itemProperties map.
  Both take one arg (expressID), matching wit-three's
  `IFCModel.getItemProperties(id)` / `getPropertySets(id)` shape —
  the model's implicit modelID is baked in at write time (one IFC
  per cached GLB). Returns undefined / [] for missing IDs so
  consumer null-guards (e.g. `Properties.jsx#createPsetsList`,
  `itemProperties.jsx#unpackHelper`) trigger cleanly.
- `src/viewer/ShareModel.js#inferModelCapabilities` — flips
  `capabilities.typedProperties: true` when the userData payload
  is present.
- `src/loader/glbCacheKey.js` — schema bump `0.6.0` → `0.7.0`.
  Older artifacts read as miss; next miss rewrites with both
  extensions attached.

Consumer surface unchanged. `Components/Properties/Properties.jsx`
and `Components/Properties/itemProperties.jsx` already call
`await model.getPropertySets(id)` / `await model.getItemProperties(id)`
— the live-IFC path satisfies these via wit-three's IFCModel
prototype methods; the cache-hit path now satisfies them via the
closures attached in `convertToShareModel`. The consumer doesn't
branch on which backend it's hitting; await on a plain value works
identically to await on a Promise.

Same untrusted-input caveat as the spatial-tree slice: shape
validation is minimal today (object + nested object guards inside
`makeLazyPayload`). Full validation per
`design/new/glb-model-sharing.md` §"Validation and trust" — size
ceilings (e.g. 100MB decompressed cap), HTML-strip on user-
authored strings, cross-reference integrity — lands with
originator-side share (Phase 5+).

**Done — BLDRS_face_ids slice.** Landed 2026-05 (this PR).
Unblocks DRACO compression on IFC GLBs (74% size reduction on
Snowdon, 144MB → 48MB on disk) without corrupting picking. Meshopt
still skipped pending per-product mesh emission (see "long-term
hide/pick architecture" note above).

The problem: DRACO and Meshopt both silently corrupt per-vertex
integer attributes that distinguish elements, by different
mechanisms. **DRACO** normalises attribute values to [0, 1] then
quantises to 16 bits max; on Snowdon (expressIDs 0–1M) the
quantization step is ~15 → adjacent expressIDs collapse onto the
same quantized level → clicking element A returns element B's
triangles too. **Meshopt** preserves integer attribute values
exactly (skipping the [-1, 1] quantization range), but its `weld()`
pass merges vertices at near-identical positions for compression;
adjacent walls share corner vertices; weld picks one element's
expressID for the shared vertex; the other wall's triangles now
reference that vertex → selection subset filtering grabs both walls.

The fix: stop trusting per-vertex IDs post-compression. Store
per-triangle expressID + instanceID in a separate JSON payload that
neither compressor touches.

- `src/loader/bldrsFaceIds.js` — `BLDRS_face_ids` extension codec.
  Writer-side `capturePerTriangleIds(json, bin)` walks freshly-
  exported GLB primitives, reads the index buffer + per-vertex
  `_EXPRESSID` / `_INSTANCEID` accessors, and projects to per-
  triangle arrays by taking vertex 0 of each triangle (matches the
  Conway-direct assembler's "all 3 vertices share their parent's
  ID" emission shape). `buildFaceIdsExtensionData` packs the arrays
  as little-endian Base64 Uint32 for the JSON+gzip inject pipeline
  (raw bufferViews are a follow-up optimisation; ~25% payload
  reduction estimated). Reader-side `BldrsFaceIdsReader` GLTFLoader
  plugin decompresses + Base64-decodes on `afterRoot`, attaches to
  `gltf.scene.userData.bldrsFaceIds`. An **alignment canary**
  (`firstExpressId`) is emitted per primitive and verified on read
  — catches primitive-order divergence between writer
  (`json.meshes[].primitives[]` flat scan) and reader (GLTFLoader
  scene-graph traversal) that the length-only check could miss if
  two meshes happen to share triangle counts.
- `src/viewer/ifc/IfcInstanceMap.js#instanceMapFromTriangleIds` —
  direct twin of `instanceMapFromGeometry` minus the per-vertex
  indirection. Same output shape (`triangleIndexToInstanceId`,
  `instanceIdToTriangleIndices`, etc.) so picking code doesn't
  branch on which populator built the map.
- `src/loader/Loader.js#convertToShareModel` — cache-hit decoration
  prefers `BLDRS_face_ids` over per-vertex when present; falls back
  to per-vertex only on uncompressed artifacts (gated by
  `userData.bldrsCompressionMode`, stashed by
  `parseBldrsGlbContainer`). Compressed artifacts with no face_ids
  coverage skip picking on the affected mesh and log a warning
  rather than silently use corrupted per-vertex IDs. Per-triangle
  arrays are freed from `userData` after `IfcInstanceMap` is built
  (~22MB reclaimed on Snowdon; the map owns its own typed copies).
- `src/loader/glbCompress.js` — `preserveTriangleOrder` option
  switches DRACO from `edgebreaker` (reorders for encoder
  efficiency) to `sequential` (preserves input triangle order).
  When set, the per-triangle indices remain aligned with post-
  decompression triangle positions. Meshopt's default pipeline
  reorders triangles for vertex-cache coherency without an exposed
  off-switch — Meshopt stays skipped for IFC GLBs (the long-term
  unblock is per-product mesh emission, which would remove the
  per-vertex IDs entirely from the geometry stream).
- `src/loader/glbExport.js` — captures face_ids on raw pre-
  compression bytes (where per-vertex IDs are still intact), signals
  `preserveTriangleOrder: !!faceIds` to compressGlb, injects after
  compression. The capture path's catch block intentionally leaves
  `faceIds = null` on failure, which cascades to compressGlb
  skipping DRACO rather than running it with corrupted IDs.
- `src/viewer/ShareModel.js#inferModelCapabilities` — flips
  `instancePicking` / `expressIdPicking` from the face_ids extension
  presence (the per-vertex attrs still exist on compressed
  artifacts but aren't trustworthy; face_ids is the source of truth).
- `src/loader/glbCacheKey.js` — schema bump `0.7.0` → `0.8.0`.

**Default-on gating:** isolate routing done; spatial tree done;
element properties done; compression unblocked. **No remaining
blockers** — `conwayDirectIfc` flag flipped default-on **2026-05**.

1. ~~Portable IFC spatial hierarchy~~ — **done** (PR #1527).
2. ~~Portable IFC properties / property sets~~ — **done** (PR #1528).
3. ~~Compression-safe per-element IDs (BLDRS_face_ids)~~ — **done** (PR #1528).
4. ~~Flip the flag default-on~~ — **done** (this PR).
   Pairs with `glb` (cache writer/reader) also default-on. Together:
   first-load runs Conway-direct geometry + per-instance picking and
   schedules a post-parse GLB writer; subsequent loads of the same
   source hit the cache and bypass wit-three's IFC parser entirely.

Issues / comments can be done later (post-prod-flip).

**E2E coverage on cache-hit GLB.** This PR adds
`src/Components/Properties/Properties.cacheHit.spec.ts` — exercises
the BLDRS_element_properties round-trip end-to-end (writer populates
OPFS on first load; reader hydrates on reload; Properties panel
renders the full IFC entity). **Follow-up still owed:** a parallel
spec for **NavTree on cache-hit GLB** that asserts the spatial-tree
rendering and element selection work after a reload — the writer +
reader landed in PR #1527 but no e2e spec was added then. Same
two-`page.goto` cache-populate-then-cache-hit pattern; assertions
target the nav-tree DOM rather than the properties panel.

**Pre-public-launch (one of the last gates).** The regression-testing
framework (headless 4-angle screenshots + perf timing) will be extended
to do **GLB extract + bit-level data snapshot comparison**. Each model
in the fixture corpus gets a manually-evaluated GLB extract as the
golden artifact — schema-version-pinned, byte-stable across runs given
the same Conway + GLTFExporter versions. The harness reads the cached
artifact, decodes each `BLDRS_*` extension payload, and deep-diffs
against the golden. Catches:

- Extension-format drift (a writer change that quietly alters payload
  layout, e.g. adding a field that gets serialised even though no
  consumer reads it yet).
- Geometry/material drift through the GLB cache round-trip (the BIN
  chunk's bytes shift even when the visible scene is identical, e.g.
  Conway emits geometry in a different order between versions).
- Schema-bump bugs (a bump should invalidate everything; a bug where
  it doesn't would surface as the golden still being readable when it
  shouldn't be).

Order of operations: ship Conway-direct + extensions → bake goldens
manually → wire bit-level diff into the regression harness → flip
public-launch gate. Not on the critical path for the §3b.iii blockers
above; tracked here so it doesn't fall off.

#### 3b.iv. Instanced rendering (GPU instancing) — active

We now own the whole chain (Conway engine → `@bldrs-ai/conway/web-ifc`
→ this loader), so the long-standing "InstancedMesh batching" idea
(§3b.iii open item) becomes tractable end-to-end. The key fact, verified
against the compat surface:

**Conway already emits the instancing model; we throw it away here.**
At the compat boundary each `PlacedGeometry` carries a `geometryExpressID`
referencing a **shared, source-unit *local*-space** geometry plus its own
`flatTransformation` placement matrix. `GetGeometry(geometryExpressID)`
returns the shared buffer — and the conway #308 "port cluster" fix
(`ifc_api_proxy_ap214.ts`, the removed per-leaf `normalize()`) exists
precisely *because* AP214 instances / `IfcMappedItem`s share one geometry
buffer. So the shared-geometry + N-matrices representation survives intact
to `flatMeshToBufferGeometry`. That assembler is the *only* place it dies:
`flatMeshToBufferGeometry.js:232` bakes each matrix into a private vertex
slab and merges everything into one `BufferGeometry`, so the 6 physical
as1 bolts (or Snowdon's 2284 shared-geometry multi-placed FlatMeshes,
§3b.ii) become N full vertex copies instead of 1 shape + N matrices.
(Conway's *own* three.js renderer, `conway/src/rendering/threejs/scene_object.ts`,
already does the right thing — `BatchedMesh.addGeometry` once per shape +
`addInstance` per placement. We're the outlier.)

**Plan.** Render the case-1 (shared-`geometryExpressID`) portion with GPU
instancing; keep merged geometry for case-2 / singletons — a **hybrid**,
which `THREE.BatchedMesh` (three 0.184) models directly (many shapes +
many instances, one draw call). Don't instance everything: a model of
thousands of placed-once unique shapes would turn one draw call into
thousands. Group by `geometryExpressID`; shapes with ≥2 placements
instance, the rest merge.

- **Geometry:** one `BufferGeometry` per unique `geometryExpressID`
  (fetched once, kept in local space — *don't* apply `flatTransformation`
  to vertices).
- **Placement:** per-instance matrix from `flatTransformation`
  (`setMatrixAt` / batched instance), per-instance color via
  `instanceColor` — which retires most of the `color`-bin `groups[]` +
  array-material machinery for the instanced case.
- **Picking:** `InstancedMesh`/`BatchedMesh` raycasts return
  `instanceId`/`batchId` *natively*, replacing the triangle→instance
  lookup (`IfcInstanceMap.getInstanceIdByTriangle`). The synthetic 0-based
  `instanceID` the assembler already mints per `PlacedGeometry`
  (`flatMeshToBufferGeometry.js:278`) maps 1:1 onto it; selection still
  resolves to `parentExpressId` the same way. (Validate `three-mesh-bvh`
  accelerated raycast on instanced/batched geometry — current picking
  depends on it.)

**Why now / tie-in to STEP occurrence identity.** Instancing makes the
scalar-`expressID` collapse *structural*: `instanceId` **is** the
per-occurrence handle. Today all 6 as1 bolts resolve to one
`parentExpressId` (`CadView.jsx`), exactly the case the conway
STEP-metadata plan flags — STEP stores a compressed DAG of part *types* +
NAUO edges, so a physical part exists only as a root→leaf *path*, not a
single entity (conway `design/new/step-metadata-nist.md` §"Occurrence
identity"). The `expressID → ordered occurrence path` generalization that
plan asks of Share and the per-instance id GPU instancing needs are the
**same** identifier. Doing them together is cheaper than either alone, and
STEP assemblies are both the forcing function and the biggest beneficiary.

**Measured (PR1, 2026-06).** The grouper ran over real models.
**vtx reduction** = the share of merged vertex memory the geometry
*sharing* removes (`1 − instancedVerts/mergedVerts`). **mem saved** = that
sharing win on a uniform 24 B/vertex basis (position+normal) **minus** the
per-instance matrix+colour overhead (80 B/instance) — i.e. only what
instancing's geometry dedup buys, *not* the separate ~8 B/vertex the
batched path also saves by dropping per-vertex pick attributes (that is a
picking-model co-benefit, not sharing, so it is excluded to avoid
overstating). **naive drawCalls** = unique shapes — the *naive*
InstancedMesh-per-shape bound, **not** the target (see below).

| Model | instances | unique shapes | shared | vtx reduction | mem saved (sharing) | top shape | naive drawCalls |
|---|---|---|---|---|---|---|---|
| index.ifc | 7 | 7 | 0 | 0% | ~0 | ×1 | 7 |
| Momentum (ArchiCAD) | 439 | 425 | 7 | 1% | ~0 | ×3 | 425 |
| Schependomlaan | 6,250 | 4,697 | 667 | 34% | ~2.5 MB | ×147 | 4,697 |
| Snowdon 2x3 (Revit) | 25,587 | 9,767 | 5,230 | **60%** | **~38 MB** | ×336 | 9,767 |
| Snowdon 4 (Revit) | 28,363 | 12,251 | 5,310 | **57%** | **~38 MB** | ×336 | 12,251 |
| Arty.step | 6,769 | 5,128 | 1,285 | **26%** | **~10 MB** | ×20 | 5,128 |

Three settled conclusions:

1. **The memory win is real and large where instancing is dense** (Revit
   ~60% / ~38 MB; STEP `Arty.step` 26% / ~10 MB) and **degrades
   gracefully** to ~0 (or slightly negative — the per-instance overhead
   with no sharing) on singleton-heavy models (index, Momentum). The
   batched path additionally drops ~8 B/vertex of per-vertex pick
   attributes — a further win not counted in the column above.
2. **STEP is a first-class beneficiary**, confirming the occurrence-identity
   thesis on real data, not just `as1`.
3. **The `drawCalls` column is a warning, not a target.** Naive
   InstancedMesh-per-shape turns Snowdon's 1 merged draw call into ~10–12k —
   almost certainly a net render-perf loss. Even instancing *only* the
   shared shapes (the hybrid) is ~5k draw calls. **This is the empirical
   reason PR2 uses `BatchedMesh`** — it multi-draws the whole batch (all
   shapes + per-instance transforms) in **~1 draw call**, taking the memory
   win without the draw-call blowup. Do **not** ship InstancedMesh-per-shape.

**Slicing.**
- **PR1 (#1568) — grouper + verbose analysis.**
  `src/viewer/ifc/flatMeshToInstancedModel.js` is a pure grouper that
  dedupes the captured FlatMeshes by `geometryExpressID` and returns the
  per-shape placement lists (matrix/color/parent/instanceId) + the stats
  above. There is **no feature flag** (it is a permanent diagnostic and
  the foundation PR2 builds on); it runs **only when verbose logging is
  enabled** (`isLogEnabled(DEBUG)`), so the per-placement grouping cost is
  paid only when the analysis is actually wanted. Render is unchanged.
- **PR2 (#1571) — `BatchedMesh` render path.** Build a `BatchedMesh` from
  the grouper output (`addGeometry` once per unique shape in local space,
  `addInstance` + `setMatrixAt`/`setColorAt` per placement; one draw call
  regardless). Picking resolves on native `batchId` → `parentExpressId` via
  the per-batch tables `buildBatchedConwayModel` attaches. Behind
  `?feature=batchedMesh` with a defensive fallback to the merged path on any
  construction error. Pairs with the `expressID → occurrence path`
  identifier generalization (`batchId` is that per-occurrence handle).

  **Transparency:** opaque and blended instances can't share one material
  state, so placements are split by alpha into an opaque batch and a
  transparent batch (`depthWrite:false`, per-instance RGBA via
  `setColorAt(Vector4)`); >1 batch wraps in a `Group`. The occurrence-id
  space is global across both batches so selection is split-agnostic.

  **Interaction follow-ups — landed (this slice).**

  - *Selection + hover highlight (`src/viewer/ifc/batchedHighlight.js`).*
    **Recolor, not overlay.** The merged paths highlight by dropping a
    translucent subset Mesh into the scene coplanar with the source; that
    only renders because the subset shares the source's *exact* vertex
    buffer (pixel-identical depth, so it wins the depth test). A
    `BatchedMesh` subset must be re-baked from independent CPU math, which
    z-fights the opaque batch and vanishes — polygon-offset tuning never
    made it robust. So the batched path recolors the *actual* instances via
    `setColorAt` (the idiomatic BatchedMesh approach): two layers
    (selection = sticky, preselection = hover) painted over each instance's
    original colour, which is retained per-batch (`instanceColors`, alpha
    included so glass stays glass). Selection covers every occurrence of the
    picked product — **per-occurrence narrowing still needs `instancePicking`**
    and is the remaining follow-up.
  - *Isolate / hide (`src/viewer/ifc/batchedSubset.js`).* `IfcIsolator`
    drives the batched model unchanged through a `createSubset` /
    `removeSubset` surface that re-bakes the kept instances (`getMatrixAt` +
    the retained `instanceGeometry`) into world-aligned subset Meshes
    carrying a synthetic per-vertex `expressID` (so the isolated subset
    stays pickable). `visualElementsIds` is unioned from `instanceParents`.
  - *BVH picking.* `three-mesh-bvh` accelerated raycast validated on
    `BatchedMesh`: `ShareIfc` patches
    `BatchedMesh.prototype.{computeBoundsTree,raycast}` and each batch builds
    its per-geometry bounds trees; `acceleratedBatchedMeshRaycast` still
    emits `intersection.batchId`, so the pick path is unaffected.
  - *GLB cache.* `GLTFExporter` can't serialise a `BatchedMesh`'s packed
    buffer, and a batch carries no per-vertex `_EXPRESSID` for the
    `BLDRS_face_ids` picking capture. So before serialising, `exportAndCacheGlb`
    bakes the batched model into the *same* merged-mesh shape the merged
    Conway-direct path emits (`batchedModelToMergedMesh`): one indexed
    geometry with per-vertex `expressID`/`instanceID`, colour-binned into
    `geometry.groups[]` + `MeshLambertMaterial[]`, instance matrices baked
    into the vertices and the coordination transform kept on the node. The
    resulting GLB is **byte-compatible with a merged Conway-direct cache
    artifact**, so the reader hydrates it through the existing cache-hit path
    as an `instancePicking` model — no reader-side changes, no schema bump.
    Consequence: a reload from cache is the merged mesh, not a live
    `BatchedMesh` — the same cache-hit/cache-miss shape divergence §3b.iii
    already notes for the Conway-direct path. A batched-native GLB schema
    (EXT_mesh_gpu_instancing, preserving the instanced representation across
    the round-trip) remains future work.
  - *Fit-to-frame.* `Loader.js#readModel` hoists a Group root's first child
    geometry onto `model.geometry` ("generalize to multi-mesh" TODO). A
    `BatchedMesh`'s `.geometry` is its packed buffer — every shape in
    *un-instanced* local space — so for models whose shapes carry
    building-scale local coords (Schependomlaan) that box is the whole site
    (~830m), and `Box3.setFromObject` used it instead of recursing to the
    instance-placed children, zooming the camera miles out. Fixed by skipping
    `isBatchedMesh` children in that hoist (a batched Group has no single
    representative geometry).
  - *Always-on* flip is deferred pending smoke-test of the flagged path.

### 3c. Plugins (small, replaceable, individually disposable)
Each takes a `ThreeContext` (and an `IfcModelService` if relevant) and exposes a tiny API:

- `Picker` — already exists in `src/view/Picker.js`; tighten it and move to `src/viewer/picker/`. Replaces `context.castRayIfc()`.
- `Clipper` — new. API surface matches today's: `{active, planes, createFromNormalAndCoplanarPoint(normal, point), deleteAllPlanes()}`. We already have `GlbClipper` as a working reference for arrow-handles + drag interaction; refactor it to be model-type-agnostic and merge.
- `Selection` — replaces `IFC.selector`. Manages two outline-driven highlight sets ("preselection" and "selection") plus the per-set materials and the `pickByID/pickIfcItemsByID` flow. Backed by `IfcModelService.createSubset` + `postprocessing.OutlineEffect`.
- `Postprocessor` — `src/Infrastructure/CustomPostProcessor.js` lives here unchanged after a `postprocessing@^7` bump.
- `Highlighter` — `src/Infrastructure/IfcHighlighter.js` lives here unchanged.
- `Isolator` — `src/Infrastructure/IfcIsolator.js` lives here unchanged. Only its dep on `IfcContext` from `web-ifc-viewer/dist/components` becomes `ThreeContext` (a type-only swap).

#### 3c.iv. Plugin migration progress (2026-05)

Phase 2-3 landed five of the six plugins under a **flat** `src/viewer/three/`
namespace rather than the per-concern subdirectories sketched in §5
(`picker/`, `postprocess/`, `isolator/`, etc.). The flat layout matches
the existing co-located test convention and keeps the cross-references
between Picker / Highlighter / Isolator / Postprocessor on relative
imports without `../` hops. The per-concern subdirs in §5 are
descriptive of *what the plugins are*, not where they live; the actual
filesystem layout is the flatter shape below.

**Done:**

| Plugin | Source location | Notes |
|---|---|---|
| `ThreeContext` | `src/viewer/three/ThreeContext.js` | Wraps `IfcContext`. As of 5d.3 the wrapped object is the in-repo vendored `src/viewer/three/context/` copy, not the `web-ifc-viewer` node-module. The wrapper's public surface is unchanged. |
| `Picker` | `src/viewer/three/Picker.js` | Moved from `src/view/Picker.js`. |
| `Postprocessor` | `src/viewer/three/CustomPostProcessor.js` | Moved from `Infrastructure/`. |
| `Highlighter` | `src/viewer/three/IfcHighlighter.js` | Moved from `Infrastructure/`. |
| `Isolator` | `src/viewer/three/IfcIsolator.js` | Moved from `Infrastructure/`; isolate routing through `IfcInstanceMap` landed in PR #1518. |
| `Selector` | `src/viewer/three/Selector.js` | Facade over the fork's `IFC.selector` — landed in the slice that opened §3c.iv. ~16 call-sites now route through `viewer.selector.X`. |
| `MeshClipper` + `CutPlaneArrowHelper` | `src/viewer/three/` | `MeshClipper` (renamed from `GlbClipper` in 5d.2) is the sole in-repo clipper — clips any mesh model (IFC + GLB), with the Q/W cursor shortcuts. |
| `Clipper` | `src/viewer/three/Clipper.js` | Mounts as `viewer.clipper`; builds a `MeshClipper` per `setModel(model)`. Since 5d.2 it has a single backend (no fork dispatch). Erases the `modelHasUnstructuredMeshClipper` branch from `CutPlaneMenu.jsx`. |

**Selector facade — landed (recap).**
Wraps the fork's `IFC.selector` behind a stable local API
(`viewer.selector.X`). Pure refactor; no behavior change. The §3c
"Selection" plugin's eventual contract (backed by
`IfcModelService.createSubset` + `postprocessing.OutlineEffect`)
stays the destination; the facade gives us a single seam to swap
the impl in Phase 5 without churning every call-site again. API
surface mirrors what was read on the fork today: materials
get/set, meshes accessors, pickByIds / unpick / preselectFromPick
/ preselectByIds / togglePreselectionVisibility / clearSelection /
clearPreselection.

**Unified Clipper — landed (this slice).**
One `viewer.clipper` object dispatching per-loaded-model between the
fork's `IfcClipper` and the in-repo `GlbClipper`. Call-sites
(`CutPlaneMenu.jsx`, `viewer.js`, `shortcutKeys.js`,
`hashState.js`) no longer branch on `modelHasUnstructuredMeshClipper`
— they call `viewer.clipper.X` and trust the plugin. The fork
clipper is captured at `ShareViewer` construction as
`viewer._forkClipper` so the IFC backing impl is preserved. Model
binding happens via `viewer.clipper.setModel(model)`, called from
`CutPlaneMenu`'s existing model-watching effect.

> **Update (5d.2, done 2026-06): the fork backend is gone.** The
> facade now builds a single in-repo `MeshClipper` (renamed from
> `GlbClipper`) for every model; `viewer._forkClipper` no longer
> exists, and `forkIfcComposition.makeForkIfc` no longer constructs
> `IfcClipper`. The Q/W cursor shortcuts were carried over to
> `MeshClipper` as `createPlaneAtCursor` / `deletePlaneAtCursor`, so
> no UX regressed. The recap above describes the slice-3 two-backend
> dispatch, now historical.

**Clipper API surface (post-5d.2):**
```js
viewer.clipper.setModel(model)
viewer.clipper.active / orthogonalY / clickDrag       // plain session state
viewer.clipper.planes                                 // MeshClipper plane list
viewer.clipper.context                                // undefined (fork escape hatch gone)
viewer.clipper.createFromNormalAndCoplanarPoint(n, p, direction?, offset?)
viewer.clipper.createPlane()                          // keyboard shortcut (Q) — plane at cursor
viewer.clipper.deletePlane()                          // keyboard shortcut (W) — plane at cursor
viewer.clipper.deleteAllPlanes()
viewer.clipper.setInteractionEnabled(enabled)         // arrow drag handlers
viewer.clipper.dispose()
```

**Perf wins folded into the GlbClipper refactor**
(`framerate has always been too slow` — addressed in-flight):

  1. **Clipping planes bound to materials ONCE per add/remove.** The
     previous impl re-walked the scene tree + set `material.needsUpdate
     = true` on every drag mousemove, forcing a shader recompile per
     affected material per tick. On a 1000-mesh model that was tens of
     ms per frame for the entire drag duration. New impl mutates the
     existing `Plane` in place (normal/constant); Three.js re-reads
     plane uniforms each frame for free without rebind.
  2. **`needsUpdate` only on plane-count change.** Three.js compiles
     a shader variant per clipping-plane *count*; plane-value mutations
     re-use the existing shader. The plugin tracks the last bound
     count and skips the tree walk + needsUpdate when unchanged.
  3. **Stable `_clippingPlanes` array reference.** Bound once at first
     `createPlane()` to both `renderer.clippingPlanes` and each
     `material.clippingPlanes`. Subsequent add/remove mutates in place;
     no rebind needed.
  4. **Scratch `Vector3` / `Plane` preallocation** in mouse handlers.
     ~5 allocations/event eliminated; cumulative GC win at 60Hz drag.
  5. **Bug fix while refactoring.** `Ray.intersectPlane(plane, target)`
     returns `null` on a parallel-ray miss, not a sentinel value in
     `target`. The previous code checked `if (intersectionPoint)`
     against the always-truthy target object — never detected misses.
     New code checks the return value.

**Open perf items (deferred):**

  - **On-demand rendering.** The fork's `IfcContext.render` runs
    `requestAnimationFrame(this.render)` *unconditionally* — 60 frames/
    second even when the scene is idle (no camera move, no hover, no
    selection change). Switching to a dirty-flag policy (render only
    when camera-controls fires `change`, or when one of the plugins
    mutates the scene) is the single biggest framerate win available.
    Requires hooking the render loop, which means owning
    `ThreeContext.render` instead of forwarding it to the fork — most
    naturally falls out of Phase 5 when the fork is dropped. A
    transitional implementation could replace
    `ThreeContext._legacy.render` with a dirty-aware wrapper, but the
    fork's animator + camera-controls integration would need careful
    re-plumbing. Tracked here for the Phase 5 PR.
  - **Hover-pick throttling tightening.** Today `viewer.js` throttles
    `highlightIfcItem` to ~30Hz (`PICK_INTERVAL = 33`). On big models
    even 30Hz is too aggressive — the actual raycast cost dominates
    over the throttle interval. Worth measuring with a real model and
    raising the interval (e.g. 50ms) if the visual impact is
    imperceptible.

**Remaining §3c.iv slices:**

1. **`IfcViewsManager` deletion** *(per §8.1)*. Single referenced
   site is the `view=ch.sia380-1.heatmap` URL-parameter branch in
   `ShareViewer.js` lines 3, 56–61. Drop together with
   `Infrastructure/IfcElementsStyleManager.js`,
   `Infrastructure/ViewRulesCompiler.js`,
   `Infrastructure/IfcColor.js`,
   `Infrastructure/ColorHelperFunctions.js`,
   `Infrastructure/IfcCustomViewSettings.js` (last one is also used
   by `WidgetApi/event-handlers/ChangeViewSettingsEventHandler.js`
   — that call site needs to migrate to a `ShareModel`-level
   post-build hook before the file can go).

2. **`PlaceMark` relocation** *(post-Phase-5)*. Moves from
   `Infrastructure/PlaceMark.js` to `src/viewer/three/PlaceMark.js`
   alongside the markers' DOM-overlay code in `Components/Markers/`.
   Low priority — the file is self-contained and the move is purely
   organisational.

3. **`useIfcClipper` capability cleanup** *(small, post-Clipper)*.
   The capability is no longer read by any call-site outside of the
   Clipper plugin's internal `modelHasUnstructuredMeshClipper` helper.
   Could be dropped from `ShareModel.capabilities` once the unified
   Clipper has been in production long enough that no external code
   relies on it (currently zero in-tree consumers besides the plugin
   itself — but the field is on every ShareModel and visible to
   embedders).

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
  *(2026-05: done; the class lives here and still extends the fork's
  `IfcViewerAPI` until Phase 5.)*
- Update `Containers/viewer.js` to import `ShareViewer` instead of `IfcViewerAPIExtended`. The property surface is identical, so call-sites don't change. *(2026-05: done.)*
- Delete `Infrastructure/IfcViewerAPIExtended.js`. *(2026-05: done.)*
- Land the **Selector facade** (§3c.iv slice 1) so the fork's
  `IFC.selector` is reached only through `viewer.selector`. Pure
  refactor; no behavior change. Sets up the Phase 5 impl swap.
- Land the **GlbClipper relocation** (§3c.iv slice 2) — moves
  `GlbClipper` + `CutPlaneArrowHelper` to `src/viewer/three/`.
- Land the **unified Clipper** (§3c.iv slice 3) — one `viewer.clipper`
  facade dispatching per-model; folds the `modelHasUnstructuredMeshClipper`
  branch out of `CutPlaneMenu.jsx`. Includes a perf refactor of the
  GLB drag-time path (bind clipping planes to materials once;
  in-place plane mutation on drag rather than per-tick rebind + shader
  recompile).

### Phase 5 — drop `web-ifc-viewer` and bump `three`

**Status (2026-06):** 5a, 5b, 5c, 5d.1, 5d.2, 5d.3, **5d.4** are merged
— **the `web-ifc-viewer` fork is gone** (dep + `.tgz` removed; nothing in
`src/` imports it). `three` is **already on 0.184.0** (current stable),
forced tree-wide via `resolutions` — so the original "bump `three`" goal
is met; what remains under **5e** is shedding the fork-era color/lighting
compat scaffolding + wit-three leftovers (see below). **5f** is reframed:
the `web-ifc` shim is **kept** as the Conway↔web-ifc engine flag, not a
deletion target. **5g** renamed the test mock off the `web-ifc-viewer`
name (5d.4 had parked it behind a jest `moduleNameMapper`). The slice
numbering below matches the `5d.N` tags in the committed source comments
(`grep -rn "5d\." src/`).

**Slice 5a — flag default-on (done 2026-05).** This PR. Flips
`conwayDirectIfc` and `glb` to `isActive: true`; removes the
now-dead `if (isFeatureEnabled('conwayDirectIfc'))` branches in
`Loader.js`. Production cache-hit loads now bypass wit-three's IFC
parser entirely; cache-miss loads still call `this.loader.parse(...)`
(wit-three's `IFCLoader.parse`) and then swap the rendered geometry
for the Conway-direct assembler's output.

**Slice 5b — Conway-direct parse (done 2026-05).** Replaces
wit-three's `IFCLoader.parse(buffer)` on the cache-miss path. The
old flow went `applyWebIfcConfig` → `loader.parse` → wit-three
built throw-away geometry → `installConwayDirectGeometry` rebuilt
via Conway-direct assembler + swapped. The new flow opens the model
with Conway directly and builds the renderable Mesh in one pass:

```js
const {modelID, captured} = parseIfcWithConway(buffer, ifcAPI)
const {mesh: ifcModel} = buildConwayIfcModel(captured, ifcAPI, modelID)
decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, {scene})
// property reads route through ifcAPI.properties.* via method
// closures attached by `decorateConwayDirectIfcModel`
```

New module: `src/viewer/ifc/conwayDirectIfcLoader.js`.

- `parseIfcWithConway(buffer, ifcAPI, settings?)` → `{modelID, captured}`
  Conway `OpenModel` + `StreamAllMeshes` in one sync call. Defaults
  the settings to `{COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}`
  to preserve the wit-three baseline. Throws on OpenModel failure
  (returns -1) or when the IfcAPI lacks the required methods.

- `decorateConwayDirectIfcModel(model, ifcAPI, modelID, opts?)` —
  post-build decoration: `computeBoundingBox`/`Sphere`, BVH
  (`computeBoundsTree` reorders the index buffer in place),
  IfcInstanceMap from the post-reorder attributes, capability flips
  (`ifcSubsets: false`, `instancePicking: true`, `expressIdPicking:
  true`), `attachInstanceMapSubsets` for the createSubset method,
  and four property-method closures: `getItemProperties`,
  `getPropertySets`, `getSpatialStructure`, `getIfcType`. All four
  route through `ifcAPI.properties.*` and bind the model's modelID;
  `getSpatialStructure` accepts both calling conventions used
  across the codebase (the manager-shape `(modelID, withProps)` and
  the cache-hit-closure shape `(withProps)`).

What's deleted: `installFlatMeshCapture`, `installConwayDirectGeometry`,
and the latter's unit test file. The wit-three-parse + post-swap
flow they implemented is replaced by `parseIfcWithConway` +
`buildConwayIfcModel` + `decorateConwayDirectIfcModel`.

What still goes through wit-three: `viewer.IFC.addIfcModel` (pushes
to `context.items.ifcModels` + scene-add), the `viewer.IFC.context`
itself (renderer/scene/camera), `viewer.IFC.loader.ifcManager.ifcAPI`
as the path to reach Conway. Slice 5c drops these by replacing
`ShareViewer extends IfcViewerAPI` with composition.

**Slice 5c — ShareViewer composition (done 2026-05, PR #1534).**
Replaced `ShareViewer extends IfcViewerAPI` with composition. The
fork's `IfcViewerAPI` was still instantiated internally (as
`this._fork`) and `this.IFC` / `this.context` / `this.clipper` were
wired from it, but `ShareViewer` stopped being `instanceof
IfcViewerAPI` and downstream code depends on this class, not the
fork. This is the pivot that made the fork's pieces individually
replaceable: each subsequent 5d sub-slice swaps one `this._fork.X`
for an in-repo construct until `_fork` itself is gone.

**Slice 5d — replace the fork surface, piece by piece.** With
composition in place, 5d swaps the fork's load-bearing constructs
(`IFCLoader`, `IfcContext`, `IfcManager`, `IfcClipper`) for in-repo
equivalents, one reviewable PR at a time. The umbrella is **done when
nothing imports `web-ifc-viewer`** — at which point the dep, the
`threeJsmCompatPlugin` esbuild rewrites, and the `webIfcShimAlias`
plugin can all be deleted together (that final cut is slice 5d.4).
Sub-slices use the `5d.N` numbering that landed in the committed code
comments (`grep "5d\." src/`).

- **5d.1 — ShareIfcLoader + ShareIfcManager (done 2026-05, PR #1536).**
  Two in-repo classes wrap Conway's `IfcAPI` directly and take over
  the live consumer paths that used to read the fork's
  `viewer.IFC.loader` (web-ifc-three `IFCLoader`) and
  `viewer.IFC.loader.ifcManager` (web-ifc-three `IFCManager`):
    - `src/viewer/ifc/ShareIfcManager.js` — minimal IFC-manager
      surface (`ifcAPI`, `getExpressId`, `getSpatialStructure`,
      `getItemProperties`, `getPropertySets`, `getIfcType`,
      `idsByType`, plus `state.models` + a `parser` stub for
      `IfcViewsManager`). Methods the fork exposed but live code no
      longer needs are intentionally absent — failures are loud.
    - `src/viewer/ifc/ShareIfcLoader.js` — owns the Conway-direct
      `parse(buffer, …)` entry point `Loader.js#readModel` invokes;
      holds a `ShareIfcManager` as `loader.ifcManager`.
    - `src/viewer/ifc/ifcItemsMapParity.js` — `runIfcItemsMapParityCheck`
      extracted from `Loader.js` to live next to the parse it
      diagnoses.
  **Key gotcha (cost a CI round):** ShareIfcLoader is installed at a
  NEW slot `viewer.ifcLoader`, NOT `viewer.IFC.loader`. Fork-side
  consumers (`IfcClipper`, `ClippingEdges`, `fills`, `plan-manager`,
  `glTF` exporter) still reach into `viewer.IFC.loader.ifcManager.{
  subsets, createSubset, parser.optionalCategories, state}` — which
  `ShareIfcManager` does not have — so `viewer.IFC.loader` must keep
  pointing at the wit-three IFCLoader until those consumers are gone.
  `Loader.js#findLoader`'s `case 'ifc'` reads `viewer.ifcLoader`.

- **5d.2 — drop fork `IfcClipper`, unify on the in-repo clipper (done
  2026-06).** Chose option (a) of the deferred decision — route every
  model through the single in-repo clipper rather than vendor the fork's
  ~678-line `IfcPlane`/`ClippingEdges` family. Changes:
    - `GlbClipper` → renamed `MeshClipper` (`src/viewer/three/MeshClipper.js`)
      and generalised to clip IFC models too. Two fixes for the IFC path:
      (i) `_bindClippingPlanesToMaterials` now binds from the model root
      inclusive, so the single-Mesh Conway-direct cache-miss shape
      (material on the root, no child meshes) gets clipped — the old
      `model.children`-only walk skipped it; (ii) `createPlaneAtCursor` /
      `deletePlaneAtCursor` carry over the fork's Q/W cursor-authoring
      shortcuts (raycast the model / the plane arrows under the pointer
      via `ThreeContext.castRayIfc` / `castRay`).
    - `Clipper` (`src/viewer/three/Clipper.js`) dropped its fork backend:
      no per-model-type dispatch, builds a `MeshClipper` for any model on
      `setModel`, routes `createPlane`/`deletePlane` to the cursor
      methods, and keeps `active`/`orthogonalY`/`clickDrag` as plain
      session state (`viewer.js` writes them; nothing syncs to a fork).
      `viewer.clipper.context` is now always `undefined`; the fork
      global-clipping-registry scrub in `CutPlaneMenu.removePlanes` is
      gone (`MeshClipper.deleteAllPlanes` already unbinds renderer +
      materials).
    - `ShareViewer` / `forkIfcComposition.makeForkIfc` no longer
      construct `IfcClipper`; `viewer._forkClipper` is gone.

  **Not restored:** the fork's section-cut edges (`ClippingEdges`, the
  black outline at the cut) were already non-functional on the default
  Conway-direct path — they build on wit-three's `createSubset` /
  `getAllItemsOfType`, which the Conway-direct parse never populates — so
  dropping them matched production rather than regressing it. Re-adding
  section edges against Conway-direct geometry (the model already carries
  a BVH + per-vertex `expressID`, so a `three-mesh-bvh` shapecast can
  generate them directly) is a separate visual-quality follow-up, not a
  fork dependency.

  `IfcManager` is now the only fork construct `ShareViewer` instantiates
  (see 5d.4).

- **5d.3 — vendor IfcContext, drop `new IfcViewerAPI()` (done 2026-05,
  PR #1539).** ShareViewer stopped calling `new IfcViewerAPI(options)`.
  Vendored `web-ifc-viewer/dist/components/context/*` (~1550 lines
  incl. real Postproduction + CustomOutlinePass) into
  `src/viewer/three/context/`, and now builds the three pieces it
  needs itself:
    - `new IfcContext(options)` — our vendored copy (render loop,
      scene, camera, renderer, raycaster, mouse, animator,
      postproduction). Fork-side `IfcGrid` / `IfcAxes` / `PlanManager`
      / `SectionFillManager` / `IfcDimensions` / `Edges` /
      `ShadowDropper` / `EdgeProjector` / `DXF` / `PDF` / `GLTFManager`
      / `SelectionWindow` — built-but-unused before — no longer get
      constructed (modest bundle win).
    - `makeForkIfc(ifcContext)` (`src/viewer/three/forkIfcComposition.js`)
      — the single re-export point for the fork pieces still alive
      (`IfcManager`, `IfcClipper`). Centralises the deep imports so
      test mocking has one seam. Shrinks to zero callers after
      5d.2 + 5d.4.
  Two `threeJsmCompatPlugin` patches were inlined into the vendored
  copies (Clock shim in `context.js`; light intensities × Math.PI in
  `scene.js`). `ThreeContext` still wraps `IfcContext`, but the
  wrapped object is now in-repo. **Gotcha (cost two CI rounds):** a
  no-op Postproduction stub broke cut-plane edge rendering (12% pixel
  diff) AND the cut-plane-permalink load path (fork's
  `IfcClipper.active` setter dives into `postProduction.composer` /
  `outlineUniforms`); vendoring the *real* Postproduction fixed both.
  Test-mock plumbing notes live in `__mocks__/shareViewerTestHarness.js`
  (the jest.mock-for-local-modules + `globalThis` singleton dedup is
  subtle — read the comments there before touching it).

- **5d.4 — drop the last fork imports + the dep (done 2026-06, this
  slice).** `IfcManager` was the only remaining fork construct
  `ShareViewer` instantiated. Replaced by the in-repo
  `src/viewer/ifc/ShareIfc.js` — a Conway-backed IFC namespace that
  constructs Conway's `IfcAPI` directly (`new IfcAPI()` from the
  `web-ifc` shim) and exposes exactly the surface live code reads off
  `viewer.IFC`: `loader.ifcManager` (a `ShareIfcManager`), a
  material-slot `selector` (the only live remnant of the fork
  `IfcSelector` — the two shared overlay materials; picking runs through
  `IfcInstanceMap`), `getProperties`, `addIfcModel`, `setWasmPath`,
  `dispose`, `context`, `type`, `ifcLastError`. `properties` / `units`
  were dropped (no consumer). Wasm `Init` stays lazy in
  `parseIfcWithConway`, so `setWasmPath` only records the path.
  - **BVH ownership moved.** The fork `IfcManager` globally installed
    `three-mesh-bvh`'s `computeBoundsTree` / `disposeBoundsTree` /
    `acceleratedRaycast` (via `setupThreeMeshBVH`); `ShareIfc` now does
    this at module load. `three-mesh-bvh`, `camera-controls` (vendored
    context camera), and `gsap` (vendored context animator) were
    fork-transitive deps that in-repo code uses directly — promoted to
    direct `package.json` dependencies so the prune doesn't orphan them.
  - **Deleted:** `src/viewer/three/forkIfcComposition.js`, the
    `web-ifc-viewer` dep + `.tgz`, the four fork-targeted
    `threeJsmCompatPlugin` onLoad rewrites + their helpers (and the now-
    purposeless `tools/esbuild/plugins.test.js`). Kept: the
    engine-agnostic `three/examples/jsm/*` `.js`-append resolve hook (5e
    needs it) and `webIfcShimAlias` (5f). `web-ifc` itself survives via
    `@bldrs-ai/ifclib`; `web-ifc-three` had no real `src/` import.
  - **Test harness:** ShareViewer no longer self-imports the fork to
    trigger the harness, so the viewer-stack tests that relied on that
    self-trigger (`ShareViewer.test.js`, `CadView.test.jsx`,
    `MarkerControl.test.jsx`, `Share.test.jsx`) now load the harness
    explicitly before the component-under-test. (Slice 5g later renamed
    the harness `__mocks__/web-ifc-viewer.js` →
    `shareViewerTestHarness.js` and dropped the `moduleNameMapper` it had
    resolved through.)

**Slice 5e — shed fork-era three-compat scaffolding (in progress;
rescoped 2026-06).** The version bump is already *done*: `three@0.184.0` +
`@types/three@0.184.1`, forced tree-wide via `resolutions`. So this slice
is no longer "bump `three`" — it's removing the compat layers that existed
to run the old fork against modern `three`, now that the fork is gone:

  1. **Color / lighting forward step (§6b steps 2, 3, 5 + re-tune the
     inlined lights) — partially landed; managed color only.** 5e enables
     just the first sub-step: `ColorManagement.enabled = true` (the r184
     default; the r135-compat `= false` is removed). `outputColorSpace`
     stays at the production `LinearSRGBColorSpace`, no tone mapper is set,
     and the scene lights keep their production `×π` values — so the only
     visible change is a slight, accepted managed-color shift. The rest of
     the forward step — SRGB output + a tone mapper + a light re-tune — was
     explored and **deferred**: on today's flat IFC lighting a filmic
     mapper (ACES/AgX) just dims/flattens because there's no HDR range to
     map, so it only pays off alongside an environment map + PBR materials.
     Folded into the §6e step-4/5 follow-up. For a CAD viewer,
     `NeutralToneMapping` (color-accurate, minimal hue shift) is the likely
     mapper choice there rather than ACES.
  2. **Drop the `BLDRS_face_ids` per-vertex fallback's wit-three-specific
     checks** — wit-three's parse-state assumptions no longer apply.
  3. **Re-evaluate the `?feature=perf` baseline** now the fork (and its
     render path) is gone.
  4. **Keep** the `three/examples/jsm/*` `.js`-append esbuild resolve hook
     — modern `three`'s `package.json#exports` map still requires it; it's
     engine-agnostic, not fork compat.

  *Not in this slice — the `resolutions.three` override.* It force-upgrades
  Conway's `three@^0.173.0` request to `0.184.0` (hence the `incompatible`
  warning on `yarn install`) and keeps `three` a singleton. Conway's
  `three` range is being widened in the Conway repo on a separate thread;
  once that lands the override + warning can drop. Until then it stays and
  is load-bearing (removing it risks a dual-`three` tree).

**Slice 5f — keep `web-ifc` as the engine flag (reframed 2026-06; was
"delete the shim").** Direction change: `USE_WEBIFC_SHIM` /
`isWebIfcShimEnabled` / `webIfcShimAlias` / `build-webifc` /
`serve-share-webifc` / `build-share-copy-wasm-webifc` are the supported
**Conway ↔ web-ifc engine switch** — kept so renders can be compared
side-by-side while Conway proves out. `web-ifc` proper is *not* being
removed here. Eventual removal of the shim is a **product call** (once
Conway is confidently shown to fully supersede web-ifc), not blocked on
imports.

  **Done (2026-06).** The flag was secretly *dead*: `isWebIfcShimEnabled`
  in `tools/esbuild/defines.js` was hardcoded `true` (`// TODO: kill
  this`), so the `web-ifc → conway` alias was always applied and
  `build-webifc`'s `USE_WEBIFC_SHIM=false` was ignored — it built Conway
  (logged `Engine: conway (via web-ifc shim)`). Fixed:
  `isWebIfcShimEnabled` now reads `parse(process.env.USE_WEBIFC_SHIM) ??
  true` — default stays Conway, and `USE_WEBIFC_SHIM=false` now logs
  `Engine: web-ifc` and **builds the real web-ifc engine cleanly** (no
  esbuild resolution errors). `web-ifc` is also promoted to a direct
  `package.json` dependency (`0.0.35`) — was only transitive via
  `@bldrs-ai/ifclib`.

  **Runtime render verification — driven through CI.** The build succeeds,
  but loading a model under real web-ifc surfaced a wasm init failure.
  Root cause (confirmed in CI): web-ifc 0.0.35's glue picks its engine at
  import time — `if (self.crossOriginIsolated) WebIFCWasm =
  require_web_ifc_mt() else require_web_ifc()` (web-ifc-api.js:52713). The
  app runs cross-origin isolated (a `SharedArrayBuffer` service worker, for
  Conway's *own* MT wasm), so web-ifc selects its **multi-threaded** module
  — which then can't run: the pthread bootstrap does
  `new Worker(locateFile("web-ifc-mt.worker.js"))` (web-ifc-api.js:1084),
  but the npm package ships **neither** `web-ifc-mt.worker.js` **nor** a
  standalone `web-ifc-mt.js` for that worker to import. CI showed the chain
  end-to-end: `crossOriginIsolated=true` → worker URL 404
  (`net::ERR_FAILED`) → `both async and sync fetching of the wasm failed` →
  `abort()`. So MT 0.0.35 is structurally unshippable as-packaged, not a
  path bug. The single-threaded `web-ifc.wasm` ships and is self-consistent.

  Decision (revised 2026-06): **pin this build to web-ifc's single-threaded
  engine now; treat MT as a follow-up.** `webIfcSingleThreadPlugin`
  (`tools/esbuild/plugins.js`, registered only when the shim is off) makes
  two asserted rewrites of `web-ifc-api.js`: forces the import-time selector
  to its ST branch, and resolves `*.wasm` from the absolute `/static/js/`
  (web-ifc otherwise resolves it relative to the page's `scriptDirectory` —
  the deep model route, not the server root — so it 404s regardless of
  `SetWasmPath`). Each rewrite asserts exactly one hit, so a future web-ifc
  bump fails the build loudly rather than silently regressing to broken MT.
  This yields a green render of `index.ifc` under real web-ifc for
  render/correctness comparison vs Conway; the **perf** comparison
  understates web-ifc (ST is slower than its MT). **MT follow-up:** check
  whether a current web-ifc ships a bundler-friendly MT build with a worker
  (then bump + delete the plugin), or vendor a `web-ifc-mt.worker.js` (+
  standalone mt glue) matching the pinned Emscripten build. Cross-origin
  isolation (`serveStaticIsolated.mjs`) stays in place for when MT lands.

  The verification needs a cross-origin-isolated browser, which the dev
  sandbox can't run, so it's driven through CI: a dedicated
  **`playwright-webifc-run`** job (`.github/workflows/test-flows.yml`) builds
  `USE_WEBIFC_SHIM=false`, serves it isolated
  (`tools/esbuild/serveStaticIsolated.mjs` — COOP `same-origin` + COEP
  `require-corp`; kept off the default/prod servers because COEP breaks the
  Drive Picker), and runs `src/tests/e2e/webIfcEngine.webifc.spec.ts` — a
  smoke that loads `index.ifc`, asserts `crossOriginIsolated`, and forwards
  the browser console so isolated-runtime errors are legible without a local
  browser. The job is **advisory** (a standalone, non-required check).

  Engine API divergence (found via the same CI loop): the Conway-direct
  loader's *geometry* path (`OpenModel` / `StreamAllMeshes` /
  `GetCoordinationMatrix`) runs on stock web-ifc, but its post-load stats
  gather called Conway-only `getStatistics` / `getConwayVersion`, which
  threw `TypeError: …getStatistics is not a function` and discarded an
  otherwise-successful load. Now guarded in `ShareIfcLoader.parse` — the
  stats are best-effort diagnostics, skipped when the engine lacks the API
  (`CadView` already guards on `loadedModel.loadStats`). The deeper
  divergence on the properties / NavTree path through `ifcAPI.properties.*`
  remains for a later slice.

  The three `web-ifc` *constant* imports (`IfcElementsStyleManager`,
  `ViewRulesCompiler`, `bldrsElementProperties`) resolve through the shim
  today; they fall away with the `IfcViewsManager` deletion (§8.1) + the
  properties-path cleanup, independent of the engine flag.

  Build-time vs runtime: today the switch is *build-time* (two builds, two
  tabs). A true one-session runtime toggle would need both engines + both
  wasms bundled with runtime dispatch — a real refactor, deferred unless
  the side-by-side workflow demands it.

**Slice 5g — mocks (done 2026-06).** Renamed
`__mocks__/web-ifc-viewer.js` → `__mocks__/shareViewerTestHarness.js` (the
harness only resolved under the dead `web-ifc-viewer` package name via a
jest `moduleNameMapper`). The 11 viewer-stack test files that imported it
now load the harness by relative path; the `^web-ifc-viewer$`
`moduleNameMapper` entry is dropped (`tools/jest/jest.config.js`), and the
dead `web-ifc-three` / `web-ifc-viewer` entries are removed from
`excludedNodeModules` (`tools/jest/common.js`). The `globalThis`-singleton
+ load-dedup machinery moved unchanged. Pure test-tree rename — no
production coupling.

### Phase 6 — cleanup
- Remove the feature flag from Phase 3.
- ~~Delete `src/Infrastructure/IfcIsolator.js`'s `IfcContext` import.~~ Done — `IfcIsolator` moved to `src/viewer/three/` and no longer imports the fork's `IfcContext`.
- Delete the §8.3 deprecation shim once the GLB-scene PR has cut over.
- Update `DESIGN.md` and `CLAUDE.md` to point at `src/viewer/`.
- ~~Drop `web-ifc` from build scripts.~~ **Superseded by the reframed slice 5f:** the `web-ifc` shim is kept as the Conway↔web-ifc engine flag; its eventual removal is a product call once Conway fully supersedes web-ifc, not a mechanical cleanup.

### Phase 7 — OffscreenCanvas render worker (separate spec, post-merge)
- Per §8.4 Move B. Becomes tractable only once the viewer is wholly under `src/viewer/`, because the worker boundary corresponds exactly to the `ShareViewer` facade. Out of scope for this doc; will get its own design.

---

## 4b. Followups (post-PR #1531)

Captured during the writer-worker landing — the items that fell out
of the freeze-fix work but aren't on the critical path for default-on.

### 4b.1. GLTFExporter is the residual main-thread freeze

After PR #1531 the writer's three big phases are:

| Phase | Where | Cost on Schependomlaan |
|---|---|---|
| `GLTFExporter.parse` | main thread | ~500ms-1s (irreducible without scene-graph worker serialization) |
| Property capture | main thread, chunked w/ yields | ~500ms-1s split into ~6-10 ms-scale chunks; hover-pick interleaves |
| `injectGlbExtensions` + pack | `GlbWriter.worker.js` | 0ms main thread (worker), ~50ms structured-clone cost |

`GLTFExporter` is the last sync block on the main thread. Three
viable strategies (in increasing scope):

1. **Defer GLTFExporter to the next idle window** — wrap the
   `exporter.parse(...)` call in its own `requestIdleCallback`
   beyond the outer one in `Loader.js`. Doesn't reduce the block,
   but at least guarantees it doesn't fire mid-interaction.
2. **Transferable-array extraction** — walk the scene on main
   thread, extract `positions`/`indices`/per-vertex attributes into
   typed arrays (already cheap, no JSON), `postMessage` to a new
   `GlbExporter.worker.js` along with a flat materials manifest,
   rebuild minimal three.js objects in the worker, run GLTFExporter
   there. Doubles memory temporarily but main thread stays fully
   responsive.
3. **Custom streaming exporter** — fork GLTFExporter (or write a
   minimal replacement keyed to the BLDRS Conway-direct shape) that
   walks the scene in chunks with `await yieldToBrowser()` between.
   Most invasive; tightest integration with our extension pipeline.

Recommendation: try (1) first as a one-line change, then evaluate
whether (2) is worth the memory hit. (3) only if neither lands the
remaining responsiveness budget.

### 4b.2. Cache-hit Playwright specs need OPFS-worker fetch routing

`Properties.cacheHit.spec.ts` + `NavTree.cacheHit.spec.ts` are
`test.fixme`'d as of PR #1531. The flag flip (`OPFS_IS_ENABLED: true`
in `vars.playwright.js`) is in place but the specs time out waiting
for `writer: wrote` because **`downloadToOPFS` runs inside the OPFS
Worker, and worker-context fetches are not intercepted by
Playwright's `context.route(...)`**. Three viable un-skip paths:

1. **MSW handler for `/index.ifc`** that fulfils worker-context
   fetches. MSW's service worker DOES intercept worker fetches once
   it's controlling the page; the gap is the race window before
   activation.
2. **Gate the first `page.goto` on `waitForServiceWorker`** so MSW
   is guaranteed in place before any fetch (worker or main).
3. **Pre-seed OPFS via `page.evaluate`** before the first goto so
   the test doesn't need a download at all — the reader path
   exercises against pre-staged bytes.

(2) is the smallest change and probably the right first try. (1)
makes the specs portable to environments where SW activation is
slower. (3) is the most deterministic but loses the writer-side
coverage.

The cache-hit round-trip is currently validated manually on deploy
preview (Snowdon, Schependomlaan).

### 4b.3. Other recommendations from PR #1531 review

Captured here so they don't fall off:

- **Measure structured-clone + `ENTITIES_PER_YIELD` overhead** on
  real loads. Both costs were estimated, not measured. If the
  structured clone of the element-properties payload exceeds
  ~100-150ms on Schependomlaan-class IFCs, that becomes the next
  bottleneck — attack with chunked serialization (start writing
  partial output before the full object is built) or a
  `SharedArrayBuffer` pipe.
- **Stabilize cache-hit specs' fixture coupling.** The specs depend
  on `expressID=621, Name="Together"` from `testdata/models/ifc/
  index.ifc`. Move those to a shared `fixtures/index.ifc.constants.ts`
  so future fixture updates have one place to touch.
- **`prefers-reduced-motion` for `CacheWriteAffordance`.** The
  pulsing dot animation in `Properties.jsx` runs unconditionally;
  small a11y nit.
- **Worker error backoff.** `GlbWriterService.js`'s `error` handler
  nulls `workerRef` so the next call rebuilds — but with no
  `MAX_RESPAWNS` cap, a repeatedly-crashing worker thrashes the
  same way every call. Low priority; failure mode is rare.
- **`clearOpfs` typing.** Uses `: any` for `FileSystemDirectoryHandle`
  async iterator + `removeEntry({recursive: true})` because the
  stage-3 proposals aren't in our TS lib yet. Remove the cast
  once `@types/dom` catches up.
- **Explicit unit tests** for the cache-lookup `try/catch` in
  `Loader.js` and the `installFlatMeshCapture` no-op path (review
  followup from PR #1529). Both are currently exercised via
  integration tests but not asserted explicitly.

---

## 5. New layout

The original sketch grouped plugins under per-concern subdirectories
(`picker/`, `selection/`, `clipper/`, etc.). The implementation
converged on a **flat `src/viewer/three/`** namespace — the per-plugin
files cross-reference each other heavily (Highlighter ↔ Postprocessor,
Selector ↔ Highlighter, Isolator ↔ Highlighter + Selector + Picker),
and the flat shape keeps those imports on `./X` rather than `../Y/Z`.
Co-located `*.test.js` files use the same convention.

Actual layout (current state — top): destination layout (post-Phase 5
— bottom):

```
src/viewer/
  ShareViewer.js              ← facade, replaces IfcViewerAPIExtended
  ShareModel.js               ← capability + format decoration (§8.2)
  three/
    ThreeContext.js           ← extracted Phase 2; wraps the vendored IfcContext (5d.3)
    Picker.js                 ← moved from view/Picker.js
    CustomPostProcessor.js    ← moved from Infrastructure/
    IfcHighlighter.js         ← moved from Infrastructure/
    IfcIsolator.js            ← moved from Infrastructure/
    Selector.js               ← §3c.iv slice 1 — facade over IFC.selector
    MeshClipper.js            ← §3c.iv slice 2 as GlbClipper; 5d.2 generalised + renamed → sole in-repo clipper
    CutPlaneArrowHelper.ts    ← §3c.iv slice 2 — moved from Infrastructure/
    Clipper.js                ← §3c.iv slice 3 — clipper facade; single MeshClipper backend since 5d.2
    forkIfcComposition.js     ← 5d.3 — sole re-export of fork IfcManager (IfcClipper dropped in 5d.2; file deleted in 5d.4)
    elementSubsets.js         ← shared subset helpers (legacy + Conway-direct)
    context/                  ← 5d.3 — vendored from web-ifc-viewer/dist/components/context/*
      context.js              ←   IfcContext (render loop) + inlined Clock shim
      scene.js                ←   IfcScene + inlined light-intensity ×π patch
      renderer/
        renderer.js
        postproduction.js     ←   real EffectComposer outline pipeline (cut-plane edges)
        custom-outline-pass.js
      camera/
        camera.js, projection-manager.js
        controls/             ←   orbit-control (real) + first-person/plan (no-op stubs)
      raycaster.js, mouse.js, ifcEvent.js, animator.js
      base-types.js           ←   IfcComponent + NavigationModes/CameraProjections enums
      LiteEvent.js            ←   fork's tiny pub/sub
      index.js                ←   barrel re-export
  ifc/
    flatMeshToBufferGeometry.js
    IfcItemsMap.js            ← per-IFC-product table (§3b.ii)
    IfcInstanceMap.js         ← per-PlacedGeometry table (§3b.ii)
    buildConwayIfcModel.js
    conwayDirectIfcLoader.js  ← 5b — parseIfcWithConway + decorateConwayDirectIfcModel
    ShareIfcLoader.js         ← 5d.1 — Conway-direct parse entry (viewer.ifcLoader)
    ShareIfcManager.js        ← 5d.1 — minimal IFC-manager surface over Conway IfcAPI
    ifcItemsMapParity.js      ← 5d.1 — diagnostic parity check (?feature=ifcItemsMapParity)
```

`IfcModelService` / `IfcModel` from the original sketch never
materialised as separate files — the "service" surface is split
across `ShareIfcManager` (manager-shape reads) and the property-method
closures `decorateConwayDirectIfcModel` attaches to each model
(§3b). That's a naming divergence from §3b's prose, not a missing
piece.

Tests live next to source.

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

- Phase 5: the fork drop (5d.4) landed *without* the color steps — kept
  deliberately mechanical. The color/lighting forward step (steps 2–3 +
  step 5 + re-tuning the now-vendored lights) is **slice 5e**, a separate
  PR on top of the merged fork removal. Tune one set of `ambient` +
  `directional` values against the new pipeline; snapshot a fresh Cosmos
  baseline. May not fully reproduce the legacy look — accepted risk.
- Phase 6+: step 1 (material colorSpace tagging) + step 4 (PBR + env
  map). Standalone visual-quality PR; ships against the post-5e pipeline.

The compat-path code is a single docblock in `ShareViewer.js` + the
esbuild plugin's lights rewrite. The lights rewrite (`scaleLightIntensities`
on `scene.js`) became dead for the active code path in 5d.3 — the ×π
patch is now inlined in the vendored `src/viewer/three/context/scene.js`
— and the esbuild hook (along with the other three fork rewrites) was
deleted in 5d.4 once the fork `scene.js` stopped loading. Re-tuning to
the modern pipeline edits the vendored copy directly now, not a build
rewrite.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Conway's spatial-structure / properties output isn't byte-equivalent to `web-ifc-three`'s | Medium | Breaks NavTree, Properties panel, search index | Phase 3 parity test against fixture IFCs; keep flag until parity confirmed |
| `IfcModelService` reads per-instance expressID from the conway-supplied per-vertex buffer | High | Cache-hit picking collapses to shared-geometry granularity (observed Phase 2b.2 — 63 unique IDs / 2.1M verts on Momentum.ifc); breaks per-instance Hide/Isolate/Reveal too | Per §3b.ii, build `triangleIndexToExpressId` per-instance at parse — bypass conway's `getElementByLocalID(geometry.localID)` resolution. Persisted via `BLDRS_face_ids` extension for cache parity (landed 2026-05 alongside DRACO unblock). |
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

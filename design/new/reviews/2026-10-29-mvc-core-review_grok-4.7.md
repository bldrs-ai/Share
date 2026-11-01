# MVC core — review of a headless model and controller

**Status:** review. Nothing here is committed scope.
**Date:** 2026-10-29
**Author:** grok-4.7, from a read of this checkout.
**Question:** What would it take to get a headless model and a mutation controller out of Share, so a CLI or an MCP can drive the same operations the web UI does?

Two passes. The first asked how `src/loader` and `src/viewer` would look as their own repos. The second named the target: an MVC core whose model is a capability onion (mesh, then assembly and solids, then IFC), whose controller applies CRUD to a whole model or a part, and whose views are the web UI and a text/CLI. Versions live in git, large binaries in LFS, parts coordinated by a manifest. A type-aware database is the thing to avoid.


## 1. Conclusion

`src/loader` and `src/viewer` are one pipeline, and that pipeline is the web view plus its GLB cache. Publishing them as two packages recreates a circular dependency. Publishing them as one package publishes the view.

The model and controller the CLI needs are a seam that is specified and not built. Conway is the parse engine and already runs in Node. The new module is a document session: open a file, name parts with the existing ref vocabulary, append ops, save a manifest. The web UI and the CLI are both views of that session. `batchedEdit.js` stays the canvas apply path. The splice writer in [create-engine.md](../create-engine.md) is what later turns an op log into a sibling STEP or IFC file.

A usable read/write API exists before that writer. Until then, a saved part is the immutable source plus its op log plus a manifest entry.


## 2. How this was read

Production imports were collected from `src/**/*.{js,jsx,ts,tsx}` with comments stripped. A relative specifier was resolved to a file. Tests (`*.test.*`, `*.spec.*`, `*.fixture.*`) were counted separately and are not in the edge counts below. Line counts skip those test files too. External packages and a handful of dynamic `import()` calls are included where the call site is static enough to see.

Conway types and the Conway CLI flags were read from the package installed at `node_modules/@bldrs-ai/conway`, whose own `package.json` says `0.23.954`. Share's `package.json` pins `@bldrs-ai/conway` at `1.1626.740-g64c84fc2`. The two disagree in this checkout, so the CLI flag list and the `core/model` shape below are the installed tree, and the writer findings are the ones [create-engine.md](../create-engine.md) verified against conway @ `e1d1fbe` (2026-10-01). ifctool was read from the sibling checkout `../ifctool`.

> **Note (2026-11-01): the version mismatch was a stale local install, not the repo.** On `main`, `package.json`, `yarn.lock` and the installed `node_modules/@bldrs-ai/conway/package.json` all agree on `1.1626.740-g64c84fc2`, there is no nested Conway copy, and `@bldrs-ai/conway-web-ifc-adapter` is gone ([adapter-removal.md](../adapter-removal.md)). `0.23.954` matches the adapter-era pin (adapter `0.23.954-2`, adapter-removal.md §2), so the checkout this review was read from most likely had a `node_modules` left over from before the adapter was removed. The Conway shapes this review relies on were re-checked against the pin and hold: `core/model.d.ts`, `scene.d.ts`, `canonical_mesh.d.ts`, `entity.d.ts`; `Model`'s optional `geometry?` and `materials?` and `walk()`; all eleven CLI flags in §5.2, in `compiled/src/ifc/ifc_command_line_main.js`; and the `cli-bundled.cjs` / `cli-step-bundled.cjs` builds.


## 3. Pass 1 — loader and viewer are one pipeline

### 3.1 Size

| Tree | Production | Tests |
|---|---|---|
| `src/loader` | 51 files, ~18k lines | 51 files, ~18k lines |
| `src/viewer` | 74 files, ~23k lines | 55 files, ~20k lines |

The mass inside that is the model representation, shared by both trees:

| Cluster | Files | Lines |
|---|---|---|
| Loader GLB artifact (container, collapse, compress, BLDRS extensions, writer worker) | 23 | ~8.4k |
| Loader format front-ends (OBJ, STL, ADF, splats, STEP sniff, MetaStream) | 20 | ~4.0k |
| Loader orchestration (`Loader.js`, progress, OPFS, URLs) | 8 | ~5.2k |
| Viewer IFC / batched mesh / Conway | 29 | ~11.5k |
| Viewer picking, isolate, highlight, clip | 16 | ~5.7k |
| Vendored `web-ifc-viewer` context (`src/viewer/three/context/`) | 17 | ~1.6k |
| Display, looks, residency | 9 | ~1.6k |
| `ShareViewer` + `ShareModel` + progressive load | 3 | ~3.0k |

Tests are the same size as the code and sit on the Share Jest harness (the Zustand store, the log-capture helpers, the single-Three-instance guard). An extracted package takes that harness with it or it has no tests.

### 3.2 The cycle

Four loader files import eleven viewer modules. Five viewer files import five loader modules. That is the hot path: open, cache hit, batched export, Conway parse.

Loader calls the viewer to finish a model:

- `Loader.js` decorates every result with `ShareModel`, attaches element subsets and `IfcInstanceMap`, reads applied coordination, and hydrates a batched mesh from an instanced GLB.
- `glbExport.js` and `glbBatchedExport.js` walk `batchedModel`, `batchedInstanceTables`, `batchedInstanceGeometry`, `batchedEdit`, and `batchedToMergedMesh`.
- `stl.js` takes its surface material from `lookMaterial`.

The viewer calls back during parse:

- `ShareIfcLoader`, `conwayDirectIfcLoader`, and `ProgressiveLoadSession` report through `loadProgress`.
- `conwayDirectIfcLoader` reads bytes from `opfsSourceByteStore` and throws `unsupportedSchema`.
- `instancedGlbToBatchedModel` reads `bldrsInstanceTables`.
- `batchedGeometryRanges` logs through `glbLog`.

`src/export` is on the same cycle. Six export files import about ten loader modules (`glbContainer`, `glbStrip`, `injectGlbExtensions`, `bldrsInstanceTables`, `bldrsSpatialTree`, and the artifact-size helpers). Three loader files import `export/glbGzip.js` back (`gzipEnvelope.js`, `glbContainer.js`, `glbArtifactSize.js`). `glbCompress.js` still says `src/export` depends on `src/loader` and the dependency runs the other way. The gzip envelope broke that rule.

Two npm packages cannot express this. A third "shared types" package does not fall out either: the shared core is the batched mesh and the BLDRS glTF extensions, which is most of the interesting code on both sides.

### 3.3 Who calls in

The caller list outside the cycle is small. There is no package index. Call sites import file paths.

- `CadView.jsx` is the app entry: `load`, progress, analytics, the two error types, in-memory uploads, `robustBounds`, `Picker`, `looks`.
- `Containers/viewer.js` constructs `ShareViewer` and disposes materials through `ShareModel`.
- `selectionHash.js` and the Residency components use visibility refs and the display enums.
- `AlertDialog`, the Open dialog, and drag-and-drop use `NotFoundError`, `inMemoryUploads`, `gzipEnvelope`, and `glbCacheKey`.
- `DisplaySlice` imports `scopeKey` from `overrideStack`.
- The hide button imports `IfcIsolator`. The isolator reads and writes the Zustand store (selection, hidden ids, isolation mode).

### 3.4 What they call out

These are app policy inside the two directories. A file move leaves each one as an import back into Share.

- **Zustand, as a side channel.** `Loader.js` sets `isCacheWriteInFlight`. `loadProgress.js` writes the load-report lines. `glbArtifactPublish.js` publishes the artifact the Export tab reads. `bldrsElementProperties.js` raises an alert. `IfcIsolator.js` reads and writes selection and isolation.
- **`FeatureFlags.js`.** The engine reads engine flags (`glb`, `glbDraco`, `glbMeshopt`, `glbBatched`, `glbCollapse`, `look`, `batchedMesh`, `demandGeometry`, `disableStreamOpen`, `autoColorParts`, `glbVerbose`, `ifcItemsMapParity`) from the same module that owns auth, quotas, and sharing. Several are read at module scope (`scene.js`, `lookMaterial.js`), so the flag is frozen at import.
- **I/O policy in `load()`.** The signature is `load(path, viewer, onProgress, isOpfsAvailable, setOpfsFile, accessToken, options)`. The body parses GitHub paths, detects LFS pointers, updates recent files, arms the page-reload guard, and writes OPFS. `assertDefined` requires the viewer.
- **Product services.** Sentry in `loadProgress` and `unsupportedSchema`. GA context from `privacy/analytics`. The Share version string imported from the root `package.json`. `routes/localOnly` for the unsupported-schema report. `Components/Camera/hashState` only for the camera hash prefix `'c'`, so the loader can skip auto-framing when a permalink camera is set.
- **`ShareViewer` still imports** `Infrastructure/IfcElementsStyleManager` and `IfcCustomViewSettings`.
- **Build, not just source.** `tools/esbuild/plugins.js` aliases `web-ifc` to Conway's compat surface, and `ShareIfc.js` depends on that alias. `GlbWriter.worker.js` is its own esbuild entry (`tools/esbuild/build.js`). `loadProgress.js` and `stepFormat.js` deep-import `@bldrs-ai/conway/src/...`, which the package exposes via `"./src/*"` but which are not a stable public surface.

### 3.5 What a repo split of these two trees would actually be

One package, versioned with Share, containing `src/loader`, `src/viewer`, and the format half of `src/export` (gzip, compression, portable rewrite, artifact sizes). Quota, the pro module, and the download UI stay in the app. Before the move is more than a copy:

1. Replace `useStore.getState()` inside the engine with a sink: load line, load result, glb artifact, alert, cache-write flag. Give `IfcIsolator` its hidden and selected sets from the caller.
2. Pass an engine-flags object in.
3. Inject GitHub resolution, recents, OPFS, Sentry, and analytics.
4. Put gzip next to `glbContainer`.
5. Carry the `web-ifc` alias, the writer worker, and a public Conway entry for the progress log and the format detector.

Two pieces can leave earlier on their own, because they are already written that way. `src/loader/mts/` and `src/loader/adf/` are an upstream decoder with meshes passed in. `src/viewer/three/context/` is a vendored fork of about 1.6k lines, with almost no Share imports beyond the `look` flag in `scene.js`.

That package is a coherent engine for the web app. It is not the MVC core in §4. `load()` returns a Three object and requires a viewer. Mutations edit GPU instance rows. Saving writes a GLB of the tessellation.


## 4. The target

The MVC the CLI is for:

1. **Model.** A layered onion. Geometry and basic object types at the core, then mesh formats (GLB, USD), then STEP's assemblies and solids, then IFC as the most capable schema. CRUD covers the whole model or a part. The usual lifecycle is: load a model, select a part or sub-assembly, edit it, save that part's new version as a sibling file, and record the link in a manifest. History is git. Large binaries are LFS. A type-aware ACID database is the alternative being declined.
2. **Controller.** Tool logic against those mutations. The agent writes operations, not scene code. This is the rule [model-edit.md](../model-edit.md) §2 already gives `create-310`.
3. **View.** CLI/text or the web UI. Today the full view is the web UI. Text tooling is ifctool, plus Conway's own `cli`.

The gap is a session those views can share. The web UI cannot be driven headless, and neither CLI can edit.


## 5. Where the four pieces are today

### 5.1 Model — Conway has the document, Share has the projection

Conway's `core/model` `Model` is an iterable of `Entity` (`localID` + back-reference). Geometry, materials, and profiles are optional capabilities on that object (`geometry?`, `materials?`, and `ModelProfile`). IFC and AP214 are two schemas that both produce a `Model` and a `Scene` of placement nodes plus geometry nodes. `CanonicalMesh` is a derived extraction (`GeometryObject`), taken after parse. `Scene.walk` yields occurrence path, transform, mesh, material, and entity together.

Entities are read-only views over the source buffer. [create-engine.md](../create-engine.md) §B1 records the consequence: there is no IFC or STEP writer. On the web-ifc compat surface, `CreateModel`, `WriteLine`, and `ExportFileAsIFC` are no-ops. Conway's own editing note (conway `design/new/streaming-federated-loader.md`, "Toward editing") says the unit of change is an overlay of tombstones and appended records on immutable bytes. That is the same shape as [model-edit.md](../model-edit.md) §1.

Share drops that as the runtime object. `decorateShareModel` (`src/viewer/ShareModel.js`) stamps view questions onto the Three object: `expressIdPicking`, `spatialStructure`, `typedProperties`, `ifcSubsets`, `instancePicking`, `batchedPicking`, `useIfcClipper`. `Loader.js` runs non-IFC results through `convertToShareModel` so they can sit in `viewer.IFC`. The GLB artifact is a cache of that tessellation. A cache hit never re-enters Conway, so the solids, the psets, and the STEP occurrence graph are gone on the warm path. The GLB is the wrong save format for the lifecycle in §4.

The identity vocabulary CRUD would key on does exist, and it is already layered by format. `src/viewer/visibilityRefs.js` defines:

| Ref | Names |
|---|---|
| `e<expressID>` | an IFC element, or a STEP product |
| `o<id>.<id>…` | a STEP occurrence (NAUO path, plus the solid when a named body is meant) |
| `n<seg>/<seg>…` | a scene-graph node by NavTree name (ADF, OBJ, GLB, …) |

[model-edit.md](../model-edit.md) §5 adds `g<GlobalId>` for an element the log itself creates, minted when the op is created, and forbids storing a `batchId` or any other per-load instance id. Those refs are pure strings. They currently name hide/isolate permalinks.

### 5.2 Controller — three partial ones

- **`src/viewer/ifc/batchedEdit.js`** is the only mutation API that has landed ([model-edit.md](../model-edit.md) L0, #1915). `addBatchedInstance`, `deleteBatchedInstance`, `setBatchedInstanceMatrix`, `setBatchedInstanceGeometry`, `addBatchedGeometry`. Each op bumps one revision and notifies `onBatchEdit` listeners before it returns. `batchedEditGuard.test.js` fails the build if any other file mentions Three's batch mutators or writes a side table. There is no op log, no undo, and no file output. L1 (the log and undo cursor), L2 (apply backends), and L3 (a JSONL sidecar replayed on load) are specified in that doc and absent from `src/`. A search for an `EditSlice` or a `kind: 'delete'` op finds nothing.
- **`src/WidgetApi/`** is an iframe `postMessage` bus: load, select, hide, unhide, highlight, change view settings, suppress the about dialog. `WidgetApi` only constructs itself when `window.self !== window.top`. It drives the running app.
- **ifctool** (`../ifctool`, package `@bldrs-ai/ifctool`, README version 5.0.1) opens one IFC with web-ifc. `processIfcBuffer` prints elements (`--elts`), types (`--types`), or psets as JSON or CSV. The pipeline in `lib/src/ops/Ops.js` has two read stages, `EXTRACT` (levels) and `LEVELS`. No geometry, no STEP, no GLB, no writes.

Conway ships a `cli` binary (`compiled/examples/cli-bundled.cjs`, from `ifc/ifc_command_line_main.js`). Flags present in the installed build include `--express_ids`, `--types`, `--fields`, `--properties`, `--geometry`, `--gltf`, `--glb`, `--gltf-draco`, `--glb-draco`, `--strict`, `--spaces`. It dumps and can write a glTF. It does not hold a session or apply an edit.

### 5.3 View

The web UI is the only view that can load, select, and (behind `batchedEdit`) mutate. Both CLIs are read-only projections of one file. `DESIGN.md` still describes `src/Infrastructure/` as the 3D viewer; the live viewer is `src/viewer/`.

### 5.4 Store — the lifecycle is specified in pieces, and the manifest is a scene file

The "select a part, save a sibling, point the parent at that revision" lifecycle is not implemented. The nearest pieces:

- **`.bld` files**, parsed by `src/loader/BLDLoader.js`. JSON with a `base`, a `scale`, and `objects[]` of `{href, pos, scale}`. Each child is loaded by calling `load()` again into the same viewer. A nested load must not publish a GLB artifact. This is a scene manifest. It has no revisions, and it requires a viewer.
- **[workspace-store.md](../workspace-store.md)** (2026-07-28, direction only). OPFS as a git working tree, LFS pointer files for blobs, repo boundaries for audience, conversations split into a live stream and a settled file. The stated reason matches §4: `git clone` is the exit, so a database is declined. What it versions is projects and conversations, not model parts. §3 says prove a `workspace/store` seam inside Share and extract it once the interface stops moving. `src/workspace/persistence.ts` is the embryo, and it is a `localStorage` project list (`WorkspaceProject` of `{id, label, path}`).
- **[model-edit.md](../model-edit.md) §1 and §7.** An edited model is the immutable source plus a serialized op log, replayed on load. The log is a document-shaped sidecar through `workspace/persistence.ts`. An edited model never writes under the source's OPFS cache key. IFC/STEP export of an edited model waits on the Conway writer. §9 leaves cross-model paste open: the op either carries the geometry or points at the other model's artifact, and an IFC batch has no occurrence-path table to receive a STEP paste.

The referencing problem that makes a database look attractive is scoped in [create-engine.md](../create-engine.md) §B2. A shared `IfcRelDefinesByProperties` or a shared `IfcLocalPlacement` has to be copy-on-write when one participant changes: mint the new records, splice the one rel that should see them, leave every other record byte-exact. That transform lives inside one STEP file. A manifest of file revisions does not need it. A derived index (the JSON ifctool already emits, rebuilt) answers cross-file questions without becoming the source of truth.


## 6. Capability onion, matched to what a file can hold

The ordering that round-trips is the one Conway already uses: an entity model, with mesh as a derived capability, and IFC as a schema on top of the same entity/scene core as AP214. GLB and USD are tessellations. Filing them under STEP would make the cache the document, which is what the warm load path already does.

| Layer | Carries | Lives now | Save target |
|---|---|---|---|
| Mesh | Triangles, materials, node names | Three scene, GLB cache, Conway `CanonicalMesh` | glTF node extract, or the source file |
| Assembly | Placements, occurrence paths | Conway `Scene`, STEP `o` refs, `.bld` hrefs | Manifest entry plus the part file |
| Solids | Profiles, extrusions; B-rep as source bytes | Conway, read-only | Splice writer ([create-engine.md](../create-engine.md) §B2), not built |
| BIM | Spatial tree, types, psets, rels | Conway IFC schema; ifctool's JSON | Same writer, copy-on-write on shared rels |

A session can expose these as optional capabilities the way Conway's `Model` does (`geometry?`, and a BIM query surface present only for IFC). Share's `ShareModelCapabilities` flags stay on the view: they answer "can I pick this", which is a property of the projection.


## 7. The cut that gives a CLI something to call

One headless session, callable from Node and from Share. Conway stays the parse engine in its own repo. Share's loader and viewer stay the web view. The new module is the document. It can live in Share until `apply` and `save` have been called from both the CLI and `CadView`, which is the extraction rule [workspace-store.md](../workspace-store.md) §3 already gives.

### 7.1 Session

Open a path. IFC and STEP go through Conway. Mesh files enter as mesh plus `n` refs, and stop being coerced through `convertToShareModel` into `viewer.IFC` (that coercion is the view's need for an `IFC` slot, and it stays in the view). The session answers `list`, `get`, and `select` by the ref vocabulary in §5.1. That is a read-only MCP on the day the session exists, and it replaces ifctool's flags and Conway's dump flags with one query surface.

### 7.2 Op log, the only write API

[model-edit.md](../model-edit.md) L1, as pure data: `{id, kind, ref, payload, layer}` with kinds `create`, `delete`, `transform`, `duplicate`, `setProperty`, `setGeometry`, a `view` / `document` tag, and a cursor for undo. The resolver can follow `src/viewer/display/overrideStack.js`, which is already a pure fold. Two subscribers, and they are different functions:

- **Document apply** appends the op and, once the splice writer exists, materializes a file.
- **View apply** is `batchedEdit` and the scene-graph path. The web UI subscribes. The CLI never imports Three.

`create-310` is this surface: the agent writes ops. `WidgetApi` becomes a subscriber that translates iframe messages into those ops.

### 7.3 Files

A workspace directory, git-shaped from the start, so the CLI can use real git while the browser still uses OPFS. wasm-git versus isomorphic-git ([workspace-store.md](../workspace-store.md) §2) is a browser-sync question and does not block the CLI.

```
model.ifc                 # immutable source; LFS when it is big
model.ops.jsonl           # document ops since that source
manifest.json             # parent revision → part revisions
parts/wall-a.ifc          # sibling, written by a later materialize
parts/wall-a.ops.jsonl
```

The manifest is the `.bld` idea with revisions and without a viewer: an entry names a part, the source revision, the refs that were extracted, and the file. `save` writes the op log and the manifest entry. The part's version at that point is the source plus the log, which is diffable. `materialize` is the splice writer: attribute and pset values, then placements, then appended extrusions ([create-engine.md](../create-engine.md) §B2, about 1.5–2.5k lines of TypeScript, no conway-geom change, in the Conway repo). Unmodified regions stay byte-exact, so git's delta stays small and LFS holds the source blobs.

### 7.4 CLI and MCP, as a view

Tools map onto the session: `open`, `list`, `select`, `apply`, `log`, `save`, and `materialize` when the writer exists. The web app performs the same calls and additionally projects the result into the canvas.

### 7.5 Order

1. L1 op log, pure, with the ref vocabulary. No Three, no store.
2. Headless session over Conway for IFC and STEP, plus mesh files as `n` refs. Read-only MCP.
3. `save` writes `*.ops.jsonl` and `manifest.json` on a real filesystem. The CLI uses git. The browser keeps OPFS behind the same document shape.
4. Web view subscribes: document ops project through `batchedEdit`. `load()` stops being the owner of the document.
5. Conway splice writer, slices 1–3. `materialize` starts emitting sibling files. Mesh-format extract (a glTF node, or the source file) is the mesh row's materialize and can land independently.
6. Extract the session to its own package once the CLI and `CadView` both call it.

ifctool stays a migration source for its query flags. Its pipeline is not the controller. Rebuilding it on Conway is optional once the session answers the same queries.


## 8. Left open

- Whether the session module's first home is `src/` or a new package. §7 argues for inside Share until both views call it. [workspace-store.md](../workspace-store.md) §3 agrees and cites adapter version-lag as the cost of extracting early.
- The L3 cache question in [model-edit.md](../model-edit.md) §9: replay the log over the source every load, or cache under `(sourceKey, opLogDigest)`. The doc recommends replay. A CLI does not have the OPFS artifact cache, so replay is the only option there.
- Cross-file paste (§9 of the same doc) once a manifest can name another part's geometry.
- Which git transport the browser uses. Out of scope for the CLI.
- The installed Conway (`0.23.954` in `node_modules`) versus the pin (`1.1626.740-g64c84fc2`). The core `Model` / `Scene` / `CanonicalMesh` shape and the `cli` flags were read from the installed tree. Re-read them against the pin before building the session on a specific Conway API. **Closed 2026-11-01:** a stale local install; the pin is what is installed, and the shapes hold (note in §2).


## Sources

- `src/loader/Loader.js` (`load`, `convertToShareModel`), `src/loader/BLDLoader.js`, `src/loader/glbCompress.js`, `src/loader/glbExport.js`, `src/loader/glbBatchedExport.js`
- `src/viewer/ShareModel.js`, `src/viewer/ShareViewer.js`, `src/viewer/visibilityRefs.js`, `src/viewer/ifc/batchedEdit.js`, `src/viewer/ifc/ShareIfcLoader.js`, `src/viewer/ifc/conwayDirectIfcLoader.js`, `src/viewer/display/overrideStack.js`
- `src/Containers/CadView.jsx`, `src/Containers/viewer.js`, `src/WidgetApi/WidgetApi.js`, `src/workspace/persistence.ts`, `src/FeatureFlags.js`
- `tools/esbuild/build.js`, `tools/esbuild/plugins.js` (`webIfcShimAlias`)
- [model-edit.md](../model-edit.md), [create-engine.md](../create-engine.md), [workspace-store.md](../workspace-store.md), [model-display-controls.md](../model-display-controls.md) §6.3
- Installed `@bldrs-ai/conway`: `compiled/src/core/model.d.ts`, `scene.d.ts`, `canonical_mesh.d.ts`, `entity.d.ts`, `compiled/src/ifc/ifc_command_line_main.js`
- Sibling ifctool: `lib/src/ifctool.js`, `lib/src/ops/Ops.js`, `tool/src/main.js`, `README.md`

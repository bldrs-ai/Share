# Model edit — the create-300 substrate (Track T12)

**Status:** L0 landing (#1915). L1–L3 planned.
**Epics:** `create-300` (#1914), `create-310` (#1919), `create-320` (#1920).
**Related:** #1913 (evict + rematerialize; the memory half builds on L0), #1710
(S5 scoped application: the selection→ref wiring is shared),
[model-display-controls.md](model-display-controls.md) §2 and §6.3,
[create-engine.md](create-engine.md) (create-320 research, #1921).

This doc covers how Share edits a loaded model: delete, transform, duplicate,
create. It records the source-of-truth decision, the four layers that implement
it, and the rules every layer follows. The AI-facing write tools (`create-310`)
and generative creation (`create-320`) sit on top of it and get their own
sections below.


## 1. Decision: immutable source + an op log replayed on load

**An edited model is its immutable source file plus a serialized log of edit
ops, replayed on load.** The log is the document; the scene is derived from it.

This is the choice the display controls already made
([model-display-controls.md](model-display-controls.md) §2): *serialize a
decision, not a scene diff.* "Delete element e1234" is a few bytes and survives
a reload, a cache rebuild and a loader change. The resulting per-instance
scene state is neither small nor stable.

It also means Share's edit substrate does not wait for an engine write path.
Roadmap §7.2/§10 gated the AI editing loop (§7.4 AI.5) on Conway being able to
mutate and re-emit IFC/STEP, which it cannot do today
([create-engine.md](create-engine.md) §B1). With the op log, edits work now and
persist now. **IFC/STEP export of an edited model** is the one thing that still
waits for a Conway writer. Conway's own editing design already has the same
shape: an overlay of tombstones and appended records over immutable source bytes
(conway `design/new/streaming-federated-loader.md` §"Toward editing",
lines 1346-1382 @ `e1d1fbe`). When that writer exists, exporting is replaying
the log into it.


## 2. Naming: the Create verb group

A new verb group, **Create**, in the roadmap's 300 (Pro) band:

| Epic | Issue | Scope |
|---|---|---|
| `create-300` | #1914 | Model edit substrate: L0–L3 below. |
| `create-310` | #1919 | Agent write tools. Edit ops on the T11 tool surface; the agent writes ops, never scene code. |
| `create-320` | #1920 | Generative model creation: engine selection. Research story #1921, summarised in §8. |

All three belong to Track **T12 (Model edit substrate)** in roadmap §5.


## 3. Layers

Each layer is one story of #1914, in dependency order.

| Layer | Story | What it adds |
|---|---|---|
| **L0** | #1915 | Mutation-safe batches. Consumers tolerate deleted and reused instance ids; side tables can grow; `addGeometry` works after load. No UI. §6. |
| **L1** | #1916 | The op log and undo/redo. Pure data, `{id, kind, ref, payload, layer}`, kinds `create` / `delete` / `transform` / `duplicate` / `setProperty` / `setGeometry`. Invertible ops; undo is a cursor over the log. The resolver is pure, modelled on `src/viewer/display/overrideStack.js`. An `EditSlice` holds the log, cursor and `dirty`. |
| **L2** | #1917 | Apply backends. Delete → `deleteInstance`, transform → `setMatrixAt` (plus BVH and bounds refit), duplicate → `addInstance`, create primitive → `addGeometry` + `addInstance`, swap shape → `setGeometryIdAt`. Batched first, then the scene graph. Minimal UI behind the flag. |
| **L3** | #1918 | Persistence. The `document`-layer ops as a JSONL sidecar, replayed over the source on both cache-miss and cache-hit loads. The edited-model cache-key rule (§7). |


## 4. Two op layers: view and document

#1913 §"Keep two layers distinct" is a hard rule from L1 onward. Every op
carries a required `layer`:

- **`view`**: non-semantic. Eviction, residency, hide/isolate-style state. The
  document is unchanged. A view op never enters undo history and never sets
  `dirty`.
- **`document`**: semantic. Delete, paste, create, transform, property and
  geometry edits. The document changed, so the op is undoable and persisted.

Both layers drive the same primitives (`deleteInstance` is both "evict" and
"delete"), so the tag cannot be inferred from the mechanism. Conflating them
fails late and badly: an eviction shows up in undo history or dirties the
document, or a pasted part gets silently evicted and looks like data loss.


## 5. Stable refs

An op names its target with a ref that survives a reload. The vocabulary is
the one the hide/isolate permalink already uses (`src/viewer/visibilityRefs.js`,
[model-display-controls.md](model-display-controls.md) §6.3), plus one new kind:

| Ref | Names | Stable because |
|---|---|---|
| `e<expressID>` | an IFC element (and STEP product hides) | the source file is immutable |
| `o<id>.<id>…` | a STEP occurrence: NAUO path, plus the solid when a named body is meant | same |
| `n<seg>/<seg>…` | a scene-graph node (ADF, OBJ, GLB, …) by NavTree names | names are what the file carries |
| `g<GlobalId>` | an element the log itself **created** | minted when the op is created |

Created elements get a **22-character IFC GlobalId** minted when the `create`
op is created (128 random bits, compressed to the IFC base64 alphabet;
[create-engine.md](create-engine.md) §B3). The GlobalId is stored in the op,
so replay is deterministic and a later op can refer to an element an earlier op
created. It is also what an eventual IFC export writes as the element's
`GlobalId`. **Express ids are never stored in the log.** They are a
serialization detail, allocated at export from the model's highest express id.

**Never a `batchId` or any other per-load instance id.** Neither survives a
reload:

- Hydration reassigns batch ids. A cache-hit model's instances are added in
  artifact table-node order, which groups by (geometry × colour)
  (`glbBatchedExport.js#collectInstanceGroups`,
  `instancedGlbToBatchedModel.js#buildPartition`). That is a different order
  from the live parse's emission order.
- three reuses freed ids. `addInstance` takes the lowest freed id before
  appending (`node_modules/three/src/objects/BatchedMesh.js:580-591`, three
  r0.184), so after one delete and one paste, the same `batchId` names a
  different element.


## 6. L0: mutation-safe batches (#1915)

### 6.1 What three r0.184 does and doesn't promise

Verified against `node_modules/three/src/objects/BatchedMesh.js` (three
0.184.0):

1. **A deleted id throws.** `deleteInstance` only flips `active` and queues the
   id for reuse (:860-869). It frees no memory. Every per-instance accessor
   calls `validateInstanceId` first (:452-462), which throws on an inactive id:
   `setMatrixAt`/`getMatrixAt` (:1074, :1094), `setColorAt` (:1108),
   `setVisibleAt`/`getVisibleAt` (:1162, :1185), `getGeometryIdAt` (:1217).
2. **A freed id is reused.** `addInstance` takes the lowest freed id
   (:580-591), so a paste lands on the deleted instance's row of every
   Share side table, or one past their end.
3. **Growing the geometry buffers can hit the engine's spread limit.**
   `setGeometrySize` spreads one argument per active geometry into `Math.max`
   (:1328-1339). Past the engine's argument limit (about 125k on V8, 65k on
   JavaScriptCore; `incrementalBatchedBuilder.js#probeSpreadLimit`), it throws
   before resizing anything.

### 6.2 What landed

- **One owner for the side tables:** `src/viewer/ifc/batchedInstanceTables.js`.
  It owns `instanceParents`, `instanceOccurrenceIds`, `instanceGeometryIds`,
  `instanceOccurrencePaths`, `instanceColors`, `instanceSourceColors` and the
  derived `occurrencePathToBatchIds`. Its API is `isActive`,
  `forEachActiveInstance` (the active-id iterator), `ensureInstanceCapacity`,
  `writeRow`, `clearRow` and `tablesRevision`, plus the L2-facing
  `addBatchedInstance` / `deleteBatchedInstance`. All three builders (one-shot,
  streaming, cache-hit hydration) write rows through it. `writeRow` writes every
  column, so a recycled id never inherits a stale row. It also keeps the path
  index in step and bumps a revision that derived caches rebuild on: the
  highlight's indices and layers, and residency's records (below).
- **Every per-instance loop skips inactive ids:** highlight (`setLayer`,
  `paint`, `repaintBatchedColors`), colour mode and the palette, the isolator
  (`visualElementsIds`, the mask build, apply and release), residency (both
  precompute walks), the isolation subset, the merged conversion, and the
  occurrence tables. In the occurrence tables a cleared row read as occurrence
  0 and overwrote that occurrence's path.
- **Highlight layers re-resolve on a revision change.** The selection and
  hover layers are sets of batch ids, and a paste into a recycled id inherited
  the deleted instance's membership. The next `paint` of that id, from a
  repaint or from clearing a hover on the paste, drew the paste highlighted.
  Each layer now also keeps the product or occurrence ids it was set with. When
  the revision moves, both layers are re-resolved from those ids through the
  rebuilt index, and every instance whose membership changed is repainted. A
  still-selected product's surviving instances stay lit, and a paste of it
  joins them.
- **Residency remeasures on a revision change.** A `ResidencyController` that
  outlives an edit held a record per batch id taken at construction. A paste
  into a recycled id kept the deleted instance's center, bytes, expressID and
  cached `visible`, so an eviction to zero skipped it; an appended paste had no
  record at all. The controller now remeasures a batch whose `tablesRevision`
  moved, with each record's `visible` unknown so the next write goes through.
  It does not read three's bit back, because under the isolation mask that bit
  is residency's intent AND the isolator's verdict. An unedited batch costs one
  comparison per tick.
- **The batched export writes only live instances.** Before L0, one deleted id
  failed the whole batched export over to the merged slot. An edited model now
  round-trips batched and hydrates without the deleted instance.
- **Raycast** (not in #1915's list). three-mesh-bvh 0.9.10's batched raycast
  walks every issued id and calls `getVisibleAt(i)`
  (`node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:110-116`), so
  after one delete every pick and hover on that batch threw.
  `batchedRaycast.js#raycastActiveInstances`, installed by `ShareIfc.js`,
  answers "not visible" for inactive ids for the duration of the call.
- **The isolation mask grows, and resets recycled ids.** IfcIsolator's
  `base`/`allow` masks are indexed by batch id and were sized once, so a paste
  past their end read as hidden and was never restored. They now extend to the
  batch's id span. A paste into a recycled id inherited the deleted instance's
  entries, so un-isolating replayed its residency eviction onto the paste.
  While the mask is installed it also wraps `addInstance`, and every id three
  issues starts visible and allowed, as an appended one does.
- **`addGeometry` after load:** `src/viewer/ifc/batchedGeometryCapacity.js`.
  - No headroom is reserved at load. An unedited model keeps its exact-size
    buffers and its memory, and every byte of its output is unchanged.
  - The first edit that adds geometry grows the buffers by ×1.25, with a
    minimum step.
  - Growth calls three's own `setGeometrySize` with `_geometryInfo` swapped
    for an empty list, which makes the shrink check's spread zero arguments on
    every engine. For a grow that check is vacuous anyway, and three still
    does the reallocation and copy.
  - Bounds trees are rebound to the new buffer, and a new geometry id gets its
    own tree.

### 6.3 Collapsed cache-hit batches: supported, not refused

`batchedGeometryRanges.js` registers many geometry ids over one shared reserved
block. **Add and delete are supported on these batches.** The only operation
that breaks shared ranges is one that *moves* a block, which is `optimize()`
(BatchedMesh.js:878-970). Growing does not move anything:

- `setGeometrySize` reallocates and copies the old contents at the same offsets
  (:1346-1378), so every range still addresses its own triangles.
- `addGeometry` appends after the shared block.
- `deleteInstance` only flips a flag.

The earlier module note that also called `setGeometrySize` unsafe was
corrected: shrinking below the block's end still throws, as it should. The
collapsed-batch test grows a range batch, adds a shape, and checks that every
range is unchanged and every element still picks through the BVH.

Repacking a range batch (`optimize()`) stays unsupported. Nothing calls it
today. It belongs to #1913's memory half, which has to compact anyway and can
refuse or rebuild a batch flagged `bldrsHasGeometryRanges`.

### 6.4 Not in L0

These are left to L2, because each is O(instances) and an edit batch should
pay for it once rather than per op:

- the batch's `boundingBox`/`boundingSphere` (frustum culling) after a
  transform or paste;
- re-applying an active isolation to a pasted instance;
- re-issuing selection after a delete (the selection *store*, e.g. a
  Properties panel still showing the deleted element; the batch's highlight
  layers already follow the edit, §6.2).

Moving an instance between the opaque and transparent batches, when an op
crosses alpha 1, is also L2.


## 7. Constraints

- **Feature flag.** Every user-visible piece ships behind `?feature=edit`,
  default off. L0 has no UI and changes no behaviour for an unedited model, so
  it needs no flag.
- **Data sovereignty** (roadmap §7.2). Model bytes stay client-side. Ops are
  small and model-derived; what an agent sends to an LLM is governed by the
  "what the AI can see" boundary, not by this doc.
- **Persistence through `src/workspace/persistence.ts`.** The log is a
  document-shaped sidecar ([workspace-store.md](workspace-store.md) §4: never a
  second bespoke store), keyed by the source's cache key plus a log id.
- **An edited model never writes under its source's cache key.** The OPFS
  artifact key is content-addressed to the *source* (`src/loader/sourceCacheKey.js`
  → `glbCacheKey`). Writing edited state under it would serve the edit to
  everyone who opens the unedited source.
- **Untrusted logs.** A log loaded from someone else's link is validated: size
  caps, and refs that must resolve. The rules are
  [glb-model-sharing.md](glb-model-sharing.md) §"Validation and trust", as
  [viewer-replacement.md](viewer-replacement.md) §3b.iii applies them to the
  artifact's payloads. A ref that no longer resolves is reported, not
  silently dropped.
- **Tests.** Every story with UI has a `describeMobileAndDesktop` happy-path
  E2E (`src/tests/e2e/formFactor.ts`) that asserts **scene state**: batch
  tables, `getVisibleAt`, instance and geometry counts. DOM state is not
  enough. The vacuous-assertion bar in [STYLE.md](../../STYLE.md)
  §"Assertions must be able to fail" applies.


## 8. Generative creation (`create-320`)

The engine research (#1921) is in [create-engine.md](create-engine.md). In
short:

- **Don't adopt CADAM** (`Adam-CAD/CADAM` @ `eb21680`) as an engine, an
  iframe app or a service. Borrow its ideas and use the upstream OpenSCAD WASM
  directly.
- **Tier 1 generator: extrusions.** A `create` payload carries profile, depth,
  placement, IFC class and psets. It maps 1:1 onto `IfcExtrudedAreaSolid`, so a
  Conway writer can export it with no loss. Ship this first. It is L2's
  "create primitive", promoted to the agent-facing generator.
- **Tier 2 generator: OpenSCAD WASM**, embedded behind the flag. The `create`
  payload is `{generator: 'openscad', engineVersion, code, params, ifcClass,
  psets}`. A parameter edit is a `setProperty` that re-runs the compile. The
  derived mesh is cached in OPFS keyed by a hash of the payload, and is never
  the source of truth.
- **Conway has no writer** (conway @ `e1d1fbe`), but its editing design (a
  tombstone + append overlay over immutable source bytes) matches the op-log
  decision in §1.


## 9. Open questions

- **L3 cache option.** For an edited model, (a) never cache edited state and
  always replay over the source artifact, or (b) cache under a derived key
  `(sourceKey, opLogDigest)`? (a) is the default recommendation: the source
  artifact stays valid and replay is cheap. Revisit if OpenSCAD-generated
  elements make replay slow; their meshes are cached separately (§8).
- **Cross-model paste.** A paste from model A into model B needs A's geometry
  in B's log. Does the op carry the geometry, or a ref into A's artifact? It
  also needs a policy for tables B lacks: an IFC batch has no occurrence-path
  table, and L0's `writeRow` drops a column whose table is absent rather than
  inventing one.
- **STEP shared-part edits.** A STEP part is placed many times (NAUO
  occurrences). Does "transform this bolt" edit one occurrence (`o` ref) or the
  part definition (every occurrence)? The UI needs to make the difference
  visible.
- **Permissioning.** Who may edit a shared model's log, and which agent tools
  may write (roadmap §10, sandbox security model). `create-310` makes this
  mandatory before write tools ship.

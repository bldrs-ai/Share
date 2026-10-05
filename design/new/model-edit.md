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

L0 went through four review rounds that each found one more cache keyed by
batch id that an edit left stale: residency's records, then the highlight
layers, then the same layers again when a paste kept its membership. Each
round fixed one consumer with its own lazy check. The fifth version replaces
those per-consumer checks with one mechanism, described here.

#### One mutation API: `src/viewer/ifc/batchedEdit.js`

Nothing in src changes what a loaded batch holds except through it:

| Op | three call | Event |
|---|---|---|
| `addBatchedInstance(mesh, geometryId, row, matrix)` | `addInstance` (+ `setInstanceCount` when full) | `addInstance` |
| `deleteBatchedInstance(mesh, batchId)` | `deleteInstance` | `deleteInstance`, with the retired row's `parent` / `occurrenceId` / `geometryId` |
| `setBatchedInstanceMatrix(mesh, batchId, matrix)` | `setMatrixAt` | `setMatrix` |
| `setBatchedInstanceGeometry(mesh, batchId, geometryId, sourceGeometryId)` | `setGeometryIdAt` | `setGeometry` |
| `addBatchedGeometry(mesh, geometry)` | `addGeometry` (after `batchedGeometryCapacity` growth) | `addGeometry` |

Every op bumps the batch's **one** revision (`batchEditRevision`) and then,
before it returns, calls every listener registered with
`onBatchEdit(mesh, listener)` with `{mesh, revision, events}`. `events` is an
ordered array, so a future bulk op can deliver one notification without
changing the contract. Instance ops also null three's whole-batch `boundingBox` /
`boundingSphere`, which three recomputes the next time it culls, sorts or
measures the batch. Keeping the load-time sphere would cull a paste placed
outside it.

Two rules govern the listeners:

- **A listener that throws is reported, not rethrown.** Every listener runs.
  Each error goes to `console.error` (`[batchedEdit] an edit listener failed;
  the edit stands`) and to Sentry, and the op returns normally. By then the
  edit has happened. Throwing would leave the editor without the batch id of
  an instance the batch already holds. For L1 it would also leave the op log
  and the batch disagreeing, since the log appends an op when the edit call
  returns.
- **A listener may not edit.** An op started while listeners are being
  notified throws `BatchEditReentryError` before it changes anything. A
  nested edit would hand the later listeners a change record that no longer
  matches the batch. In review, a listener that deleted each add left the
  highlight indexing a deleted id, and the next selection threw.

`batchedEditGuard.test.js` strips comments from every non-test file in src.
It then fails on two things outside an allowlist:

- **Any mention of a mutator's name.** That covers three's batch mutators
  (`addInstance`, `deleteInstance`, `setMatrixAt`, `setGeometryIdAt`,
  `addGeometry`, `setGeometryAt`, `deleteGeometry`, `optimize`,
  `setInstanceCount`, `setGeometrySize`) and the side tables' writers. It
  matches the name rather than a call shape, so destructuring, bracket
  access, aliases, optional calls and calls split over lines are all caught.
- **Any write to a side table.** That is an element store, a mutating
  Map/array method, or replacing the table.

The allowlist holds `batchedEdit.js`, the table owner, the load-time builders,
decoration, and the two display-colour writers (colour is display state, not
identity). Each entry is checked for still being used.

`batchedInstanceTables.js` keeps the side tables: `isActive`,
`forEachActiveInstance`, `ensureInstanceCapacity`, and the row writers.

- All three builders write rows through `writeRow` / `clearRow`: one-shot,
  streaming and cache-hit hydration. `writeRow` writes every column, so a
  recycled id never inherits a stale row, and keeps
  `occurrencePathToBatchIds` in step.
- **Those two refuse a loaded `BatchedMesh` at run time**, so no code path
  can change a loaded row without the notification. `batchedEdit.js` uses
  their `editWriteRow` / `editClearRow` twins, which the guard confines to it.
- The module no longer has a revision of its own; the edit revision replaces
  it.

#### Consumers subscribe; state is right when the edit returns

| Consumer | Subscribes | On an edit |
|---|---|---|
| Highlight (`batchedHighlight.js`) | when its state is created; the subscription has the mesh's lifetime | A delete drops the id from both layers and both indices. An add joins the indices, and joins a layer if its product (or, for an occurrence layer, its occurrence) is one the layer was set with; if it does, it is painted at once. O(1) per event. |
| Residency (`ResidencyController`) | in the constructor; `dispose()` unsubscribes | Marks the batch's records stale. If the target is below 1 it re-applies now (one slider tick), so a paste made at target 0 is hidden before the edit returns. At target 1 nothing a record holds changes what is drawn, so the O(batch) remeasure waits for the next read. |
| Isolation mask (`IfcIsolator`) | when the mask is installed; release unsubscribes | A delete resets the id's `base`/`allow`, so a paste into it does not inherit the deleted instance's eviction. An add is ruled on by `mask.verdict`, the filter the last isolation pass applied, so a paste made while isolating shows or hides with its siblings. |
| Framing bounds (`robustBounds.js`) | does not subscribe | Its cache key includes the sum of the batches' edit revisions. Bounds are computed on demand anyway, so a key that moves with every edit is exact, and there is no listener to release per cached object. |

Residency and the mask both write an added instance's bit. Residency's write
goes through the mask's `setVisibleAt` wrapper into `base`; the isolator's goes
into `allow`. The result is `base AND allow` whichever listener runs first, and
a test covers both orders.

Removed: the per-consumer revision compares in highlight
(`reresolveLayers`) and residency (`sync_`), `repaintBatchedColors`'
catch-up step, the isolator's `addInstance` wrapper, and the highlight's
"skip a deleted id" guard in `paint` (a deleted id can no longer be in a
layer).

#### Ids for added instances

- `addBatchedInstance` requires `parent`, `occurrenceId` and the source
  `geometryId`, and throws `BatchEditIdError` if one is missing. The row
  writer used to default them to 0. Occurrence 0 is a real occurrence, so a
  paste without one erased its path from the cache-hit occurrence tables.
  Source geometry id 0 is a real dedup key, so two created shapes without
  one were read back as the same shape.
- **Minting rule.** Created content takes its ids from
  `mintOccurrenceId` and `mintGeometryId`.
  - **One mint per model.** It accepts the model root or any of its batches;
    all resolve to the same mint. `decorateBatchMeshes` links a model's
    batches (`batchedModel#linkBatchedModel` / `modelBatchesOf`), and the
    floor is taken over all of them. Occurrence and source-geometry ids are
    model-global, and a mint keyed by the batch it was called with handed the
    opaque batch an id the glass batch held.
  - **The floor is taken at the model's first edit of any kind,** before that
    edit changes a row, or at the first mint if that comes earlier. The floor
    is one past the largest id in any row. At that point the rows are what
    the load wrote, so a later delete cannot lower it. A floor taken over
    live rows after a delete re-minted the deleted maximum, and the paste
    carrying it inherited any selection that still named it. The floor is not
    taken at load, so an unedited model pays nothing.
  - **The counters only rise:** by minting, and by any explicit id an edit
    writes, so a caller-chosen id is never minted again either.
  - Ids are sequential, not a high fixed base, because STEP occurrence ids
    index dense arrays.
  - A paste of an existing shape keeps that shape's source geometry id and
    mints only an occurrence id.
  - These are per-load ids, like `batchId`. The op log never stores them
    (§5); a created element's stable ref is its `g<GlobalId>`.
- **Post-load geometry never dedupes as source geometry.**
  `batchedInstanceGeometry#sourceKey` keys a geometry that
  `addBatchedGeometry` added per mesh, as it already did for collapsed range
  ids. This holds even if a caller reuses a source id on the row.
- `setBatchedInstanceGeometry` requires the new source id and moves the row's
  `instanceGeometryIds` entry with it.

#### Other L0 changes

- **Every per-instance loop skips inactive ids:** highlight, colour mode and
  the palette, the isolator (`visualElementsIds`, the mask build, apply and
  release), residency (both precompute walks), the isolation subset, the
  merged conversion, and the occurrence tables. In the occurrence tables a
  cleared row read as occurrence 0 and overwrote that occurrence's path.
- **The batched export writes only live instances.** Before L0, one deleted id
  failed the whole batched export over to the merged slot.
- **An edited model is never cached.** That merged fallback was also the only
  thing keeping an edited model out of the source's OPFS slot. The writer
  (`glbExport.js#exportAndCacheGlb`) now skips any batched model with
  `modelHasPostLoadEdits`: a nonzero edit revision or an inactive instance.
  The writer runs at idle, after the model is on screen, so an edit can land
  before it does (§7).
- **Raycast** (not in #1915's list). three-mesh-bvh 0.9.10's batched raycast
  walks every issued id and calls `getVisibleAt(i)`
  (`node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:110-116`), so
  after one delete every pick and hover on that batch threw.
  `batchedRaycast.js#raycastActiveInstances`, installed by `ShareIfc.js`,
  answers "not visible" for inactive ids for the duration of the call.
- **The isolation mask grows.** IfcIsolator's `base`/`allow` masks are indexed
  by batch id and were sized once, so a paste past their end read as hidden.
  They now extend to the batch's id span.
- **`addGeometry` after load:** `src/viewer/ifc/batchedGeometryCapacity.js`.
  - No headroom is reserved at load. An unedited model keeps its exact-size
    buffers and its memory, and every byte of its output is unchanged.
  - The first edit that adds geometry grows the buffers by ×1.25, with a
    minimum step.
  - Growth calls three's own `setGeometrySize` with `_geometryInfo` swapped
    for an empty list, which makes the shrink check's spread zero arguments on
    every engine. For a grow that check is vacuous anyway, and three still
    does the reallocation and copy.
  - **Growth is all or nothing.** three disposes the old geometry and advances
    the max counts before it allocates the new arrays, and that allocation is
    what fails on a large model. On a throw, the geometry, both max counts,
    `_geometryInitialized` and every bounds tree's binding are restored, and
    the error is rethrown.
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

Left to L2:

- **Re-issuing selection after a delete.** This is the selection *store*,
  e.g. a Properties panel still showing the deleted element. The batch's
  highlight layers already follow the edit (§6.2).
- **Product-level lists.** IfcIsolator's `visualElementsIds` is the product
  list hide-all and isolate work from. It is built at load, so a created
  *product* (not a paste of an existing one) has to be added to it by the
  `create` op.
- **Colour mode for an added instance.** The caller passes the instance's
  live and source colours. Under the auto palette, a create op has to pass
  the palette colour as the live one.
- **Bulk ops.** Each op notifies once. While residency's target is below 1,
  each notification costs one slider tick. A bulk paste should deliver one
  notification with many events; the listener contract already takes an
  event array, so that is an addition to `batchedEdit.js`, not a change for
  the consumers.
- **Moving an instance between the opaque and transparent batches** when an
  op crosses alpha 1.
- **The reveal-hidden ghost overlay.** IfcIsolator's `revealedElementsSubset`
  is baked from the batch when hidden elements are revealed, and it does not
  follow edits. It needs an edit listener, or a rebuild after the op, once an
  op can touch a hidden element.


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

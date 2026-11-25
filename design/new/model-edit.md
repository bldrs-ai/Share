# Model edit — the create-300 substrate (Track `create-t300`)

**Status:** L0 landed (#1915). L1 landing (#1916). L2–L3 planned.
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
| `create-310` | #1919 | Agent write tools. Edit ops on the `apps-t300` tool surface; the agent writes ops, never scene code. |
| `create-320` | #1920 | Generative model creation: engine selection. Research story #1921, summarised in §8. |

All three belong to Track **`create-t300` (Model edit substrate)** in roadmap §3.2.


## 3. Layers

Each layer is one story of #1914, in dependency order.

| Layer | Story | What it adds |
|---|---|---|
| **L0** | #1915 | Mutation-safe batches. Consumers tolerate deleted and reused instance ids; side tables can grow; `addGeometry` works after load. No UI. §6. |
| **L1** | #1916 | The op log and undo/redo. Pure data, `{id, kind, targets, payload, layer}`, kinds `create` / `delete` / `transform` / `duplicate` / `setProperty` / `setGeometry`. Invertible ops; undo is a cursor over the log. The applier and resolver are pure, modelled on `src/viewer/display/overrideStack.js`. An `EditSlice` holds the log, cursor and `dirty`. §6b. |
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

An op names its targets with refs that survive a reload and, where the format
allows it, a re-export of the source. The vocabulary is the one the
hide/isolate permalink uses (`src/model/visibilityRefs.js`,
[model-display-controls.md](model-display-controls.md) §6.3), narrowed for a
log that is persisted. `src/session/edit/editRefs.js` parses, formats and
validates it.

| Ref | Names | In an op? | Stable because |
|---|---|---|---|
| `g<GlobalId>` | an IFC element, **from the source or created by the log** | yes; the only IFC ref. Canonical form only: 22 characters, the first `0`–`3` | `IfcRoot.GlobalId` is what the file carries, and authoring tools keep it across re-exports. A created element's is minted when the op is created. |
| `o<id>.<id>…` | a STEP occurrence: NAUO path, plus the solid when a named body is meant | yes, **source-pinned** (§5.2) | only over the exact source bytes it was recorded against |
| `n<seg>/<seg>…` | a scene-graph node (ADF, OBJ, GLB, …) by NavTree names | yes | names are what the file carries |
| `e<expressID>` | an IFC element, or a STEP product row | **no**: permalinks and per-load resolution only | it is not: see below |

**`e<expressID>` is refused in an op** (#1916 thread). An expressID is a STEP
line number: local to one file, and reassigned by any re-export of the base
model. A log keyed on it silently re-targets the wrong elements the first time
the base is re-authored and re-uploaded. It stays correct in a permalink, which
names one file, and as a **per-load resolution cache**: a source `g` ref
resolves GlobalId → expressID → instances on each load, and only the GlobalId
is stored.

**A `g` ref must be a canonical compressed GlobalId.** Its first character
carries the GUID's top 2 bits, so it is `0`–`3`; anything past `3` encodes more
than 128 bits and is not a GlobalId (review of #2346). Some exporters write
such ids anyway. That element cannot be named by a `g` ref: the ref is
reported invalid rather than resolved. Assist's `viewer/tools/refs.js` keeps
its own looser grammar for reads.

Created elements get a **22-character IFC GlobalId** minted when the `create`
op is created (128 random bits, compressed to the IFC base64 alphabet;
[create-engine.md](create-engine.md) §B3; `src/session/edit/globalId.js`). A
`duplicate` mints one per copy the same way. The GlobalId is stored in the op,
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

The same holds for L0's minted occurrence and geometry ids (§6.2): they are
per-load, and the op log never sees them.

**Targets are a list.** An op carries `targets: [ref, …]` even for one
element. A scope is a set of node paths (#1710's scope algebra;
[scope-model.md](scope-model.md), **pending**, being drafted alongside #1704),
and a list lets an op carry that set later without a schema change. L1 gives
the list no meaning beyond "apply to each, or refuse them all if one does
not resolve" (§6b).

### 5.1 GlobalId on a cache-hit load: missing today

Checked against `public/index.ifc` (Conway parse in Jest, then the GLB writer's
own capture, `engine/glbEngineCapture.js#captureEngineExtensions`):

| | fresh parse | cache hit |
|---|---|---|
| spatial-tree nodes | 11 | 11 |
| nodes carrying `GlobalId` | 11 | **0** |
| `SearchIndex.eltsByGlobalId` keys | 22 (11 GlobalIds and their lower-cased aliases) | **0** |
| `getExpressIdByGlobalId('3hm2qpxcLC2QR6PjoCX$Ma')` | `'771'` | **`undefined`** |

- **Why.** `CadView.jsx#installModelTree` builds the search index from the
  spatial tree (`initSearch`). On a fresh parse that tree is Conway's `'names'`
  mode, which carries Name, LongName and GlobalId. On a cache hit it is
  `BLDRS_spatial_tree`, and `engine/bldrsSpatialTree.js#serializeNode` keeps
  `expressID`, `type`, `Name`, `LongName`, the STEP fields and `children`,
  but not `GlobalId`. `export/glbPortable.js#nodeNameOf` already notes this.
- **The GlobalId is still in the artifact,** in `BLDRS_element_properties`:
  #771's decodes from the container. But that payload is keyed by expressID
  and inflated lazily, one block at a time. Going from GlobalId to expressID
  would mean inflating every block, which is what its design avoids.
- **Consequence.** On a cache hit, which is the default reload path, every
  source `g` ref is unresolved. L1's resolver reports it rather than failing
  silently (`editApply.test.js` pins this: the test flips when the artifact
  carries GlobalId). The index answers **unknown** there, not absent (§6b):
  it cannot see the source, so a miss proves nothing, and a `create` under a
  source element's GlobalId is refused rather than allowed to overwrite it. Assist's `viewer/tools/refs.js` resolves `g` refs through
  `SearchIndex` too, and has the same gap today.
- **Proposed fix, for L2 (not done here, because it changes the artifact
  payload).** Keep `GlobalId` in `serializeNode`. The live tree already has
  it, so this is one field per node. It costs at least 16 bytes per node
  compressed, since a GlobalId is 128 random bits and doesn't gzip: about
  16 KB per 1,000 nodes. The field is additive, so readers that ignore it are
  unaffected. Artifacts written before it lack it, and L2 needs one of two
  answers for them:
  - a cache-key bump, so they are rewritten; or
  - a one-time reverse map built by inflating the element-properties blocks.
  That choice is the owner's.

Two more things about `SearchIndex` as a resolver:

- **It is not exact.** `indexElementByString` also files every key
  lower-cased, so a lower-cased GlobalId resolves to the element, and IFC's
  alphabet is case-sensitive. `indexElement` also puts description tokens
  into `eltsByGlobalId`. And `getExpressIdByGlobalId` answers with the
  first element of a set without saying that there were others.
- **What L1 uses instead.** Edit refs resolve through
  `editApply.js#ifcGlobalIdIndex`. It is exact and case-sensitive, and it
  reports a GlobalId that two elements share (a real exporter defect) rather
  than picking one.

Neither path indexes an IfcRoot that is not in the spatial tree, such as an
opening. L1 does not change that.

### 5.2 STEP: occurrence refs are source-pinned

A STEP occurrence path is NAUO express ids. A re-export renumbers them just as
it renumbers IFC express ids, and STEP has no GUID to fall back on. **No
portable STEP identity is safe yet, so none is adopted.** The rule instead:

- An `o` ref is accepted in an op, and `editRefs.js#isPortableEditRef` answers
  false for it.
- It is correct over the exact source bytes it was recorded against. A
  re-parse of the same bytes yields the same ids (engine-worker.md §5.5).
- **L3 (#1918) must bind a log holding a non-portable ref to the source's
  content key** (`src/loader/sourceCacheKey.js`). It must also refuse to
  replay such ops over any other source, and report each one as unresolved
  because the source changed. A re-authored STEP base then drops its `o` ops
  loudly, rather than re-targeting them silently.

The candidates considered, and why each is unsafe:

| Candidate | Fails when |
|---|---|
| Product-name path, like `n` | Names repeat: every instance of "Bolt M6" has the same one. Telling siblings apart needs ordinals, and those follow the file's NAUO order, so a re-export that reorders an assembly re-targets silently. It is the expressID failure, rarer but still silent. |
| The NAUO's own `id` string (`'NAUO12'`) | Exporters regenerate it. |
| A geometry content hash | It names the part, not the occurrence: every placement of a shared part collides. Any tessellation change also breaks it. |

This interacts with the shared-part question in §9 (edit one occurrence or the
part definition). Revisit both together.


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

#### One mutation API: `src/model/batchedEdit.js`

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

The per-geometry BVHs are the one thing built into a loaded batch afterwards:
`decorateBatchMeshes` hands them to `deferredBatchedBvh.js`, which builds them
in idle time once the model is on screen (Share#2101). It builds them
INDIRECT, keeping each tree's triangle order in a buffer of its own, so the
build never changes what the batch holds. A direct build sorts the index in
place, and done between the slices of a sliced reader (the GLB writer's
`snapshotBatchedModel`) that would be a change no revision announces.
`addBatchedGeometry` still builds its new id's tree directly, inside the op
and its revision bump.

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
  The instance tree that picks now go through once it is built
  (`batchedInstanceBvh.js`, built after load by `deferredBatchedBvh.js`) runs
  the same per-instance raycast over just the ids a ray's box test names, and
  asks `isActive` before `getVisibleAt`, so a deleted id is skipped there too.
  It is an `onBatchEdit` listener: an id an edit adds, moves or reshapes is
  walked on every ray besides the tree's own candidates, and a revision the
  listener has not seen turns the tree off. `batchedInstanceBvh.test.js`
  compares its hits with the full walk's after each kind of edit.
- **The isolation mask grows.** IfcIsolator's `base`/`allow` masks are indexed
  by batch id and were sized once, so a paste past their end read as hidden.
  They now extend to the batch's id span.
- **`addGeometry` after load:** `src/model/batchedGeometryCapacity.js`.
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


## 6b. L1: the op log (#1916)

Numbered 6b so §7–§9, which other docs cite, keep their numbers. All of it is
pure data and pure functions, with no THREE and no model. It ships
unconditionally and nothing calls it until L2. Tests run against the fake
backend in `editBackend.fixture.js`.

| File | Holds |
|---|---|
| `src/session/edit/globalId.js` | The IFC compressed-GUID codec and `mintGlobalId` (128 random bits; an injectable byte source for tests) |
| `src/session/edit/editRefs.js` | `g` / `o` / `n` parse, format, validate; `e` refused; `isPortableEditRef` (§5, §5.2) |
| `src/session/edit/editOps.js` | The op shape, `validateEditOp`, `makeEditOp` (mints) |
| `src/session/edit/editLog.js` | The log and its cursor: record, undo/redo steps, dirty, `appliedOps` |
| `src/session/edit/editApply.js` | `applyEditOp` / `revertEditOp`, the `EditBackend` and resolver contracts, `EditInconsistentError` (fail-stop), `ifcGlobalIdIndex` |
| `src/store/EditSlice.js` | The store's log, cursor, `isEditDirty`, `canUndoEdit` / `canRedoEdit`, `applyEdit` / `undoEdit` / `redoEdit` |

### The op

`{id, kind, targets, payload, layer}`, plain JSON. `validateEditOp` checks the
same rules whether an op was just made or came out of someone else's link
(L3's untrusted-log check, §7, starts from it). **Every schema is exact**: an
envelope or payload key it does not list is refused, so no per-load id
(§5) can ride an op into the persisted log.

- **`targets`** is a non-empty list of distinct edit refs (§5).
- **`layer`** is required, either `'view'` or `'document'`, and never
  defaulted (§4).
- **`id`** is 128 random bits in the same 22-character encoding as a
  GlobalId. It is not a ref.

The payload by kind:

| Kind | Targets | Payload |
|---|---|---|
| `create` | one `g` ref, minted by `makeEditOp` | what to build: **opaque** to L1 (L2; create-320's generators, §8), scanned for per-load keys |
| `delete` | the elements | `{}` |
| `transform` | the elements | `{matrix}`: 16 finite numbers, column-major, a delta pre-multiplied onto each target's placement |
| `duplicate` | the sources | `{copies, matrix?}`: one minted `g` ref per target, in order, disjoint from the targets; `matrix` places each copy, as a transform would |
| `setProperty` | the elements | `{key, value}`: `value` a string, finite number, boolean, or `null` to remove. `undefined` and `NaN` are refused because JSON drops or nulls them, and a persisted op would come back different. |
| `setGeometry` | the elements | `{geometry}`, an object: **opaque** to L1, scanned for per-load keys |

The two opaque values are what a generator builds from (an extrusion's
profile and psets, OpenSCAD's code and params; §8), and L1 cannot enumerate
them before L2 and create-320 fix their shapes. Until each gets an exact
schema, `editOps.js#PER_LOAD_KEYS` is refused at any depth inside them:
`batchId`, `instanceId`, `expressId`, `modelId`, `occurrenceId`,
`occurrencePath`, `geometryId`, `sourceGeometryId`. The match ignores case and
a plural `s`. `parent` is left out: it is the L0 row's expressID column, but
also an ordinary word a payload may use for a ref.

**An op is plain JSON, checked on its canonical copy.**
`editOps.js#canonicalEditOp` is the one gate between an op from anywhere
(`makeEditOp`, an op literal, a persisted log) and the backend or the log.

- **It first builds a deep-frozen copy by walking the op.** The walk refuses:
  - a prototype other than Object's or Array's: Map, Set, Date, typed arrays
    and class instances;
  - BigInt, functions and symbols;
  - non-finite numbers;
  - array holes and `undefined` elements;
  - any own `toJSON`;
  - cycles;
  - nesting past 100 levels.
- **It normalizes two things the way JSON does.** An `undefined` property is
  dropped, and `-0` becomes `0`. THREE produces `-0` in ordinary matrices.
- **Only then do the schema and the per-load scan run, on that copy.**
  `applyEditOp` applies the copy and returns it, and `recordApplied` records
  it. So what was checked, applied and persisted is one object.
- **What this closes (review of #2346, round 2):**
  - A `toJSON` could emit `{batchId: 7}` after the scan.
  - A `BigInt` used to fail only in the record step, after the backend had
    already changed.
  - A `Map` would have replayed as `{}`.

`recordApplied` runs the gate again. For an op it already made, that is a
lookup. Either way, an op literal that skipped `makeEditOp`, or an op mutated
after it was applied, cannot put anything else in the log.

L1 does not restrict which kinds a `view` op may be. Eviction is a view-layer
`delete`. Whether any other pairing is meaningful is for the code that makes
view ops (#1913) to say.

### Invertibility: captured at apply, kept beside the op

`applyEditOp` captures what reverts the op **before** any of its forward steps
run. A multi-target op therefore records each target as it was, even if one of
its own steps changes another.

| Kind | Captured (per target) | Revert |
|---|---|---|
| `create` | nothing | `delete` what it made |
| `duplicate` | nothing | `delete` each copy |
| `delete` | `capture(target)`: everything `restore` needs (matrix, colour, row, geometry) | `restore(ref, snapshot)` |
| `transform` | `getMatrix` | `setMatrix(prior)` |
| `setProperty` | `getProperty(key)` (`null` when absent) | `setProperty(key, prior)` |
| `setGeometry` | `getGeometry` | `setGeometry(prior)` |

How the undo record is kept:

- **It lives in the log entry, `{op, undo}`, and not in the op.** A delete's
  snapshot holds per-load ids such as a row's `parent` and `occurrenceId`.
- **It is never persisted.** `editLog.js#appliedOps` returns the applied ops
  only, which is what L3 writes. A replay captures them afresh.
- **Redo re-applies the op and captures again.** So the undo after a redo
  returns to the state at the redo, including anything a view op changed in
  between.

### Undo/redo is a cursor

The log is `{entries, cursor, cleanCursor}`. `entries[0 … cursor)` have been
applied; the rest are the redo tail. Undo and redo move the cursor. Nothing
is kept on a second stack.

- **A document op recorded after an undo truncates the redo tail.**
- **A view op is applied but leaves the log as it was.** It is not in
  history, it does not dirty, and it does not truncate redo, since nothing
  the user could undo has changed. `editLog.js#recordApplied` is the one
  place this is decided.
- **Dirty means `cursor !== cleanCursor`.** A fresh load is clean at 0, and
  `markClean` (L3's save) moves the clean point. Undoing back to the saved
  point is clean again. If a truncation drops the saved point, that state can
  never come back, and `cleanCursor` becomes -1.

### The applier and the resolver

Both are pure. They turn an op into calls on an `EditBackend`, and its refs
into targets through a resolver. L2 implements both.

- **`EditBackend`** has one method per element action:
  - `create(ref, payload)`, `delete(target)`, `capture(target)`,
    `restore(ref, snapshot)` and `duplicate(target, copyRef, payload)`;
  - `transform(target, matrix)`, `getMatrix`, `setMatrix`;
  - `getProperty` / `setProperty`, `getGeometry` / `setGeometry`.

  After `create`, `duplicate` and `restore` return, the resolver must resolve
  the ref they were given. `restore` takes the ref, not a target, because a
  deleted element may no longer resolve.
- **The resolver** is `makeEditRefResolver({g, o, n})`, one lookup per ref
  kind the model can answer. It gives one of three answers per ref
  (`editApply.js#RefStatus`):

  | Answer | Means |
  |---|---|
  | `{status: 'live', target}` | It names a live element; `target` is the backend's per-load handle |
  | `{status: 'absent', reason}` | **Proven** to name nothing live: the lookup covers every element the ref could name and found none, or found it deleted |
  | `{status: 'unknown', reason}` | The lookup cannot tell: unavailable, ambiguous, or not covering the elements |

  - Any other answer, including the pre-tri-state `{target}`, is read as
    unknown.
  - A ref of a kind the model has no lookup for is unknown.
  - For IFC, the `g` lookup starts from `ifcGlobalIdIndex(spatialTree)`
    (GlobalId → expressID, exact; §5.1). A GlobalId two elements share is
    unknown. A miss is absent only when every node in the tree carries a
    GlobalId; on a cache hit none does, so a miss there is unknown. The
    index covers the spatial tree only, so an element outside it (an
    opening, a type) is not seen; L2's lookup has to close that gap. L2
    adds expressID → live instances, plus its registry of created refs.
- **Refs are canonical.** `editRefs.js#editRefError` accepts only the
  spelling `formatEditRef` gives back. `nMesh~1` and `nMesh` name one node,
  as do `o01` and `o1`. Accepting both would let one op name one element
  twice: the uniqueness check would pass on the strings, and the second step
  of a multi-target delete would fail-stop (review of #2346, round 5). With
  one spelling per element, uniqueness of strings is uniqueness of elements.
- **One precondition table, checked before the first backend call, in
  every direction.** `editApply.js#EDIT_PRECONDITIONS[kind][direction](op)`
  gives `{live, absent}`: the refs that must be live and the refs that must
  be proven absent. `checkPreconditions` resolves them all before anything
  runs, the undo capture's reads included.

  | Kind | Apply (and redo) | Undo |
  |---|---|---|
  | `create` | target absent | target live |
  | `delete` | targets live | targets absent (`restore` brings them back) |
  | `duplicate` | sources live, copies absent | copies live |
  | `transform`, `setProperty`, `setGeometry` | targets live | targets live |

  - The `live` refs, resolved in order, are the targets the steps act on.
  - Everything is derived from the op. An undo record adds no refs, since a
    delete's snapshots are restored under the op's own targets.
  - Only `live` satisfies a must-be-live ref, and only `absent` satisfies a
    must-be-absent one. **`unknown` never does, either way.**
  - The table is the one mechanism. It replaced the per-kind special cases,
    each of which was found in turn by review of #2346: in round 4, a
    create's target and a duplicate's copies were never checked; in round 5,
    a delete's undo restored refs without checking them, and a failed lookup
    was read as absent. The next edge case is a row, not a branch.
- **A refusal changes nothing.** An invalid op, or one whose preconditions
  fail, returns `{ok: false, reason, unresolved?, live?, unknown?}`. Each
  list holds `{ref, reason}`:
  - `unresolved`: refs that had to be live and aren't;
  - `live`: refs that had to be absent and name a live element;
  - `unknown`: refs that had to be absent and can't be proven so.

  Every failing ref is reported, never just the first. The log stays
  consistent and the next op is accepted. Sessions reach these states,
  because view ops are not in history:
  - an eviction can remove an element an earlier document op's undo has to
    touch;
  - a view-layer `create` can take the ref a delete's undo would restore.

  An undone create's or duplicate's outputs are deleted, so they are absent
  again and redo proceeds.
- **Revert runs newest target first**, the mirror of apply. Redo is
  `applyEditOp` again, capturing a fresh undo record.

### When the backend throws: fail-stop, then replay

**The `EditBackend` contract: a throw from any method means the scene's
state is unknown.** The method may have changed some of it before throwing,
and so may the steps of the same op that ran before it. The L0 ops throw on
real states: `BatchEditIdError`, `BatchEditReentryError`, and a failed
allocation in `batchedGeometryCapacity.js`. A throw from the resolver is
treated the same way, since a resolver that throws instead of answering
`{reason}` is broken.

**L1 does not compensate.** On any such throw during apply, undo or redo:

- Nothing is put back, and no partial step is rolled back.
- `editApply.js#EditInconsistentError` is thrown. It carries the original
  error as `cause`, plus the canonical `op` and the `direction` (`apply`,
  `undo` or `redo`, `editApply.js#EditDirection`) for diagnostics.
- `EditSlice` marks the log inconsistent: `isEditInconsistent` is set and the
  error is kept in `editInconsistency`. The cursor stays where it was.
- While it is set, every `applyEdit` (view ops included), `undoEdit` and
  `redoEdit` refuses with a reason that says so. `resetEdits` does not clear
  it, since dropping the history leaves the scene just as broken.

**Why fail-stop and not compensation (review of #2346).** The first design
reverted the steps already done and rethrew. Each review round found the next
way that was wrong:

1. Undo had no rollback, so a multi-target undo that failed part way left the
   backend half reverted under an unmoved cursor.
2. The compensation can itself throw, on the same allocation that failed the
   edit.
3. A step that mutates and then throws is not compensated, because a step is
   only counted as done once it returns.

The third is not a counting bug to patch. A compensation is a further run of
backend calls against a backend that has just shown it throws, over a state
nobody can see. No version of it can be made safe, so there is none. Fewer
mechanisms is the point: the code that could get this wrong was removed
rather than grown.

**Recovery is replay, which §1 already implies.** The source is immutable and
the log is the document:

1. Rebuild the scene from the source, with a **new** backend object.
2. Replay `appliedOps(editLog)` over it, which is the applied prefix up to
   the cursor. The replay captures fresh undo records.
3. Call `markEditsRecovered(context, replayedLog)`.

L3 (#1918) automates this. Until then, recovery is a reload.

`markEditsRecovered` is the only way back to consistent, other than
installing a different model. It is refused when the log is not
inconsistent, and refused when given any backend that has failed: a rebuilt
scene comes with a new backend object, so a failed one means nothing was
rebuilt.

**A failed backend is never installed again.** The slice keeps every backend
that has thrown in a `WeakSet`, and `setEditContext` and
`markEditsRecovered` both refuse one. Without it, backend A fails, B is
installed (which rightly clears the state, as a new model), and reinstalling
A passes the identity check because A is not B (review of #2346, round 4).
The set is never cleared: by the contract, a recovered scene is a new
backend object, so nothing in it can become usable again. These checks are
cheap and deliberately narrow. It cannot see a new
backend object wrapped around the old, broken scene; L2's one-backend-per-scene
contract (EditSlice, below) rules that out.

### EditSlice

The store holds the log and the booleans derived from it (`editCursor`,
`isEditDirty`, `canUndoEdit`, `canRedoEdit`), kept in step on every change.
It also holds `editContext`, the `{backend, resolver}` pair L2 installs for
the loaded model, and `editLogBackend`, the backend the log's undo records
were captured against.

- **`setEditContext` tells a new model from a lifecycle update by the
  backend's identity.**
  - A backend other than `editLogBackend` is a new model. The log is reset
    and the slice is consistent again, since the old undo records hold
    another scene's per-load state.
  - The same backend (with a new resolver or a rebuilt context object), or
    null, keeps the log and any inconsistency as they are. Clearing the
    context therefore does not clear an inconsistency (review of #2346,
    round 3).
  - A backend that has ever failed is refused, with `{ok: false, reason}`,
    and nothing changes (above). `setEditContext` returns `{ok}`.
  - Why identity: the backend *is* the scene the undo records describe. A
    model or session id would call a rebuilt scene of the same model "the
    same", which is exactly the case that must not be. The context object
    is too fine, since a caller may rebuild `{backend, resolver}` around the
    same scene.
  - **So L2's contract is one backend object per built scene.** A rebuild
    makes a new one.
- `isEditInconsistent` / `editInconsistency` and `markEditsRecovered` are the
  inconsistent state and its exit (above).
- With no context, every action reports `no edit backend` and changes nothing.
- `applyEdit`, `undoEdit` and `redoEdit` return the applier's
  `{ok, reason?, unresolved?, live?, unknown?}`, or throw
  `EditInconsistentError`.

### Left to L2 and L3

- **L2 (#1917).**
  - Implement `EditBackend` over `batchedEdit.js`: `delete` →
    `deleteBatchedInstance`, `restore` / `duplicate` → `addBatchedInstance`
    with minted ids (§6.2), `transform` / `setMatrix` →
    `setBatchedInstanceMatrix`, `setGeometry` → `setBatchedInstanceGeometry`.
  - Add the resolver's expressID → instances leg and the created-ref
    registry.
  - Make GlobalId resolvable on a cache hit (§5.1).
  - Install the context per model.
  - Ship the first UI behind `?feature=edit`. The flag exists, default off,
    and gates nothing in L1.
- **L3 (#1918).**
  - Serialize `appliedOps`.
  - Bind any log holding a non-portable ref to its source's content key
    (§5.2).
  - Validate untrusted logs with `validateEditOp` plus resolution, and report
    what did not apply.


## 7. Constraints

- **Feature flag.** Every user-visible piece ships behind `?feature=edit`,
  default off (`src/FeatureFlags.js`, added with L1). L0 has no UI and changes
  no behaviour for an unedited model, so it needs no flag. L1 has no UI either,
  so the flag gates nothing until L2.
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

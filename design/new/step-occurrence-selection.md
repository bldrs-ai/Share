# STEP occurrence-keyed selection

## Problem

STEP reuses one part (`product_definition`) across many occurrences. Conway's
geometry historically owned each mesh by the part *type*
(`product_definition_shape`), shared by every occurrence, and Share keys
selection on that scalar `expressID`. So selecting one nut in the NavTree
highlights *all* nuts, and a scene pick can't tell which occurrence was hit.
The unique key is the **occurrence path** — the ordered NAUO express ids
root→leaf — which the product-structure tree already carries on every node as
`occurrencePath`, but which was absent from the geometry.

See Conway `design/new/step-metadata-nist.md` §"Occurrence identity".

## Conway side (PR #353 — landed upstream)

- Each geometry instance is stamped with its occurrence path, threaded through
  the AP214 assembly walk.
- The web-ifc compat surface exposes it: **`PlacedGeometry.occurrencePath`**
  (`ReadonlyArray<number>`; `undefined` for IFC, empty for a root-level STEP
  placement). `FlatMesh`es still group by the shared part-type expressID; the
  per-occurrence identity rides on each `PlacedGeometry`, which lines up 1:1
  with Share's per-instance `IfcInstanceMap`.

Share consumes this once it bumps to the Conway release that ships #353.

## Share side

### Geometry paths can extend below tree leaves (why Arty_Z7 had no highlight)

The tree and geometry agree on NAUO segments, but they are **not always the
same length**. Conway's geometry walk pushes one occurrence segment per child
`shape_representation` level; only a CDSR-placed child resolves to a NAUO id —
for a plain `shape_representation_relationship` child the fallback pushes the
SRR's *own* express id. Alibre / ST-Developer exports (e.g. the Arty_Z7 board)
attach every part's brep that way: `SDR → SHAPE_REPRESENTATION` (placement
axes only) + `SHAPE_REPRESENTATION_RELATIONSHIP(SR, ADVANCED_BREP_SHAPE_REP)`.
So every geometry instance's path is the tree leaf's path **plus a trailing
non-NAUO segment** (`[…, 31310, 31242, 38151]` vs the tree's
`[…, 31310, 31242]`), and an exact-key join between the two sides matches
nothing. Simpler exports (solids directly in the SDR's representation) have no
extension, which is why the small-model tests passed while Arty failed.

The symptom pair that identifies this case: **hide works but highlight
doesn't** — the hide path resolves prefix-inclusively (an extension segment is
just a deeper key under the node's prefix), while the leaf-click highlight and
the pick→NavTree reconciliation used exact keys. Two consumer-side fixes
restore the join without touching the persisted tables (no GLB schema bump —
caches keep the raw extended paths):

- **Leaf click → scene:** `getInstanceIdsForOccurrencePath`'s
  `includeDescendants: false` fast path falls back to the prefix scan when the
  exact key misses. An exact *hit* still skips the scan — when the tree leaf's
  own key exists, deeper keys belong to other (deeper-NAUO) occurrences.
- **Scene pick → NavTree:** the pick handler trims the instance's raw path to
  the deepest tree-known prefix (`trimToTreeOccurrencePath` +
  `occurrencePathKeySetForTree`, `utils/occurrencePaths.js`) before it enters
  the store, so the NavTree's exact-key row highlight / scroll / auto-expand
  and the `H`-toggle's node key (the path's last segment) all see tree-valid
  paths. No tree keys (IFC, pre-0.9.0 cache) passes the path through; no
  shared prefix degrades to null = type-level, same as having no path.

A root fix (only push NAUO-backed segments, or expose the segment kind) belongs
upstream in Conway's `makeThunk` occurrence stamping; the Share-side fixes above
keep working either way since a NAUO-only geometry path is just the zero-
extension case.

### Identity below the product (conway#628)

`BLSN_007.stp` (test-models-private#98) is the case the occurrence path alone
could not express: a 281 MB Rhino 7 / ST-DEVELOPER hull export that is **one
product, zero NAUOs, zero CDSRs and 2,268 individually named bodies**. Every
body shares the one product's (empty) occurrence path *and* its
`product_definition_shape`, so both join keys collapse — Share showed a
one-node tree in which every click selected the whole boat.

Conway's fix changes what an occurrence path is **made of**, so read it as a
contract change and not a bug fix:

- An individually addressable body **ends its occurrence path with its own
  express id**, on the `PlacedGeometry` and on the spatial-tree node alike.
  So a body's path is `[...nauoChain, bodyExpressID]` (the NEMA motor:
  `[14107, 14045]`), a no-NAUO body's is just `[bodyExpressID]`, and a
  single-solid part keeps a NAUO-only path (`[14108]` — the product node *is*
  the body, so there is nothing to disambiguate).
- **A plain `shape_representation_relationship` id is no longer a segment.**
  It binds a part to its own detail representation; it is not an occurrence
  and has no tree node. This is the Arty_Z7 "trailing non-NAUO segment"
  extension described above, which therefore largely disappears for solids —
  but `trimToTreeOccurrencePath`'s prefix fallback stays, because suppressed
  anonymous dumps and pre-0.19.0 cache artifacts still produce paths the tree
  doesn't have.
- The ephemeral solid layer is **on by default** and uncapped for named sets.
  Suppression is all-or-nothing: a partially emitted layer would leave the
  dropped bodies stamped with paths that resolve to no node. The >32-unnamed
  anonymous-dump gate still applies, and there the geometry stamps no body
  segment either, so paths collapse to the product node coherently.

**What that changed in Share** (the consumer side is small — the engine now
hands over a key that the existing machinery could already carry):

- `findNodeByOccurrencePath` no longer *skips* ephemeral solid nodes; it
  prefers a product node and falls back to a solid one. That fallback is what
  makes a body reachable at all — with its own segment on the path, a pick's
  trimmed path lands ON the solid node. The product preference covers the
  pre-#628 shape, where solids share their part's path and a path-only lookup
  must not name one body. Nothing shipped feeds that shape to this code today
  — the engine no longer emits it, and an artifact written by one that did is
  never opened, because the schema version is part of the artifact *filename*
  (`glbArtifactPath`), so a stale artifact reads as a miss rather than as old
  data. Treat the preference as defence against engine/schema lockstep drift
  (the extension readers run on every GLB load, not only on cache lookups),
  not as a live compatibility path.
- `resolvePickedOccurrenceNode` (extracted from `canvasDoubleClickHandler`'s
  funnel, so it can be tested) promotes the selection to the solid node when
  the path names one. Without it a BLSN pick still degraded to the
  `product_definition_shape` — the tree resolved, the *selection* didn't, and
  Properties showed 'Document' for every body.
- `occurrenceElementPathIds` / `resolveElementPathOccurrence` are the
  permalink pair. The solid's express id is appended below the occurrence path
  **only when the path doesn't already end with it**; appending
  unconditionally would mint `/1020254/367733/367733`. That doubled URL is
  degraded rather than dead — the resolver reads the repeat through the
  conway#387 anonymous-piece branch, so the selection still lands on the body,
  at the cost of registering a transient "piece" row for something that
  already has a tree node. The pair keeps a body's URL canonical; the extra
  segment stays required for pieces that genuinely share their owner's path
  (an anonymous piece, and a pre-#628 solid).
- **Hover is a separate path from the click funnel**, and had the same bug
  one layer down. `Containers/viewer.js`'s mousemove (throttled to 30fps)
  calls `ShareViewer#highlightIfcItem`, whose batched-render branch resolved
  the hit to its *parent product* (`getPickedItemId` →
  `instanceParents[batchId]`) and recoloured every instance under it — one
  product for the whole of BLSN_007, so hovering anything turned the entire
  hull cyan while the click highlight beneath it was already correct. It now
  resolves the hovered instance's global occurrence id straight off the hit's
  `batchId` and paints through `applyBatchedInstancePreselection`, the hover
  twin of the selection narrowing. Two things this costs nothing: the lookup
  is a typed-array index plus a memoised `Map` (no traversal per mouse-move),
  and the repaint only runs when the hovered *instance* changes — which is
  also why the per-frame dedup key had to stop being the product id, since
  every body of a no-NAUO product shares one. The merged/cache-hit render
  path was already per-instance (`_setConwayPreselectionFromHit` builds its
  subset from the hovered triangle's instance), and models with no occurrence
  table still hover at product level, which is the right granularity there.
- **GLB schema bumped `0.18.0 → 0.19.0`.** Path composition is baked into the
  artifact on both sides (`BLDRS_face_ids.occurrencePaths` and the
  `BLDRS_spatial_tree` node paths), so a hit on an artifact baked by a
  pre-#628 engine would keep serving those paths — bodies sharing one path
  again, and no body nodes in the tree — to post-#628 resolution code.
  Cache-hit users would never see the fix; same shape and same remedy as the
  0.15.0/0.16.0/0.17.0/0.18.0 engine bumps. Its own number rather than a
  merge into 0.18.0: that bump shipped to main on conway 1.1592.684, which
  predates #628, so 0.18.0 artifacts already exist holding the old path
  shape.

Everything else took the new paths unchanged, which is the point of keying on
the path in the first place: `IfcInstanceMap`'s occurrence tables and the
batched builder's path tables carry them verbatim,
`getInstanceIdsForOccurrencePath` resolves a body's exact key (its
`geometryExpressId` filter is now redundant for a body but still needed for
anonymous pieces and pre-#628 solids), the NavTree renders the solid nodes as
ordinary rows and matches `isSelected`/scroll on (path, solid id), and the
per-occurrence hide keys on the body's own express id either way.

**Scale.** A 2,268-body product is a 2,269-node tree and a 2,269-row flatten;
`VariableSizeList` renders only the visible window, and `getVisibleNodes` is
one map + one push per node, so the panel does not hang. It is still a single
flat sibling list with no grouping or search-within-node affordance — the
usability limit, not a performance one.

### The id-space mismatch (why scalar `expressID` can't join the two sides)

The two surfaces speak **different express-id spaces** for STEP:

- **NavTree node** `expressID` = the occurrence's **NAUO** express id
  (`AP214ProductStructureExtraction.buildNode`: `occurrenceExpressID ?? productDefId`).
- **Geometry** `FlatMesh.expressID` / `IfcInstanceMap.parentExpressId` = the
  geometry's owning element, the **`product_definition_shape`** (PDS), shared by
  every occurrence of the part type (`ap214_scene_builder.geometryOccurrences`).

So a NAUO id never equals a PDS id, and the *old* scalar-keyed flow
(`node.expressID === selectedElements[0]`) matched **nothing** in either
direction — the "no interaction between NavTree and scene" symptom. The one key
**both** sides carry is the **occurrence path** (Conway's occurrence test proves
the 18 geometry paths equal the 18 tree-leaf paths), so all cross-boundary
selection now joins on it, not on the scalar id.

### The runtime data path (where occurrence data had to be threaded)

The cache-miss STEP load is `buildConwayIfcModel` → `decorateConwayDirectIfcModel`.
`buildConwayIfcModel`'s map (via `instanceMapFromOrderedPlacedRanges`) *did* carry
the occurrence tables — but `decorateConwayDirectIfcModel` **rebuilds** the map
from geometry attributes (`instanceMapFromGeometry`) after the BVH permutes the
index buffer, and per-vertex attributes can't encode a variable-length path. Two
gaps closed: (a) `flatMeshToBufferGeometry` now stamps `occurrencePath` onto each
range; (b) `decorateConwayDirectIfcModel` carries the occurrence tables
(`instanceIdToOccurrencePath` / `occurrencePathToInstanceIds`) forward onto the
rebuilt map — safe because the synthetic instance ids line up 1:1 (same emission
order; BVH permutes only the index buffer, not the numbering).

### Done (landed — PRs #1573 + #1575)

- **Data foundation.** `IfcInstanceMap` captures `instanceIdToOccurrencePath` +
  `occurrencePathToInstanceIds` from each `PlacedGeometry.occurrencePath`, with
  `getOccurrencePathByInstance` (instance → path) and
  `getInstanceIdsByOccurrencePath` (path → instances).
  `flatMeshToBufferGeometry` + `decorateConwayDirectIfcModel` thread the path to
  the *runtime* map (see above). `bldrsSpatialTree.serializeNode` preserves
  `occurrencePath` for cache-hit trees; `NavTreePanel.mapSpatialNode` keeps it on
  the rendered node objects. Store carries `selectedOccurrencePath`. Unit-tested;
  additive and `null`/absent for IFC.
- **Scene pick → NavTree (per-occurrence).** `canvasDoubleClickHandler` resolves
  the picked instance's occurrence path and carries it into the selection funnel.
  The NavTree scroll + `isSelected` **match on the occurrence path** (not the
  colliding PDS id the pick reports as `selectedElements[0]`), and the tree
  auto-expands from the leaf NAUO id, so a scene pick reveals and highlights the
  *one* node. Scene highlight is per-instance via `setInstanceSelection`.
- **NavTree click → NavTree (per-occurrence).** A node click passes its
  `occurrencePath`; the tree highlights only that occurrence, not all six.
- **NavTree click → occurrence-scoped scene highlight.**
  `ShareViewer.getInstanceIdsForOccurrencePath` resolves a node's path to the
  exact instance ids (prefix-inclusive, so an assembly node lights up its whole
  sub-tree) across the scene meshes; the click funnels them as `instanceIds` so
  `setInstanceSelection` highlights only that occurrence. This is required, not
  just nicer: the node's NAUO id can't reach the PDS-keyed mesh, so without the
  path resolution a STEP node click highlights *nothing* in the scene.

- **Cache-hit BVH must be order-preserving (`indirect: true`).** The
  cache-hit reader builds the per-mesh `IfcInstanceMap`s from
  `BLDRS_face_ids` in the GLB's *original* triangle order, then builds the
  per-geometry BVHs (`Loader.js#restoreCacheHitPicking`). three-mesh-bvh's
  default build sorts `geometry.index` in place into spatial leaf order,
  which silently invalidates every triangle-keyed consumer built just
  before it: a pick's `faceIndex` resolves through the stale table to the
  wrong instance/element (an i-beam Properties-reports as a bolt; NavTree
  can't sync), and the selection subsets draw the table's triangle ranges
  against the permuted buffer — because BVH leaf order is spatially local,
  the wrong highlight lands on *nearby other parts*, which reads as
  "clicking selects stuff around it". The cache artifact itself is fine
  (face_ids ↔ per-vertex ids verified aligned); only the runtime order
  diverged. Fix: `computeBoundsTree({indirect: true})` — the index buffer
  is never touched and raycasts report original-order `faceIndex`, so
  tables, raycasts, and subsets stay aligned. The cache-miss path never
  had the problem: `decorateConwayDirectIfcModel` rebuilds its map *from*
  the geometry after its (permuting) build. Pinned by
  `Loader.restoreCacheHitPicking.test.js` (including a contrast test that
  the default build really does permute, so the pin can't pass vacuously).

- **Cache-hit parity.** The occurrence tables also survive the GLB cache. The
  writer persists the global `instanceId → occurrencePath` table on
  `BLDRS_face_ids`; the reader decodes it to
  `userData.bldrsFaceIds.occurrencePaths`, and `Loader.js` reattaches it to each
  restored per-mesh map via `IfcInstanceMap.attachOccurrencePaths` (only for the
  instance ids that mesh actually holds, since the GLB splits into per-material
  primitives). Schema bumped `0.8.0 → 0.9.0` so stale occurrence-less caches read
  as a miss and get rewritten. **This is why an already-cached STEP model (e.g.
  one loaded on the same preview origin before this change) has to be re-fetched
  once: OPFS holds the old 0.8.0 artifact with no occurrence data until the
  schema bump forces a re-parse.**

  - **Where the writer reads the table matters once the render path changed.**
    The merged Conway-direct path keeps the table on `model.instanceMap`, and
    `glbExport` read it straight off there. But the **default render path is now
    the demandGeometry BatchedMesh** (`incrementalBatchedBuilder` →
    `assembleBatchedModel`), which has **no `instanceMap`** — its per-occurrence
    data lives on the batch meshes as `instanceOccurrencePaths` /
    `instanceGeometryIds`, keyed by `batchId`. So a batched-first load wrote a
    cache with the occurrence table silently dropped, and a cache-hit reload
    (new tab, same origin — the batched model bakes down to a merged GLB on
    read) restored the **NavTree** occurrence highlight (the spatial tree
    persists paths independently) but **not the scene** per-occurrence highlight
    (`getInstanceIdsForOccurrencePath` found no mesh table). `glbExport` now
    re-keys the batch side tables to the global occurrence id — the `instanceID`
    `batchedModelToMergedMesh` bakes per vertex, i.e. the synthetic instance id
    the reader rebuilds its map on — via
    `batchedToMergedMesh.batchedModelOccurrenceTables`, so the batched write is
    at parity with the merged one (paths **and** the per-solid geometry ids).

- **Per-occurrence hide.** The NavTree eye and the `H` shortcut hide one
  occurrence's geometry, not every reuse of the part. `IfcIsolator` tracks
  `hiddenOccurrences` (node id → instance ids) and the hide reveal subset omits
  their union via `IfcInstanceMap.createSubsetMeshByParent`'s `excludeInstances`
  option; `HideToggleButton` / `hideSelectedElements` resolve the node's
  occurrence path to instances (`getInstanceIdsForOccurrencePath`) and key the
  hidden-store by the NAUO node id so the eye toggles. Hiding by the scalar
  expressID would hit the shared `product_definition_shape` and vanish every
  reuse ("H hides both", "eye does nothing"). The NavTree hide/eye icons also
  now survive a cache-hit reload (the isolator reads the model's own
  `getSpatialStructure` so `canBeHidden` is populated).

- **Permalink (round-trip).** The element-path URL doubles as the occurrence
  encoding: for STEP, `selectItemsInScene` writes the path segments below the
  file as `[rootExpressId, ...occurrencePath]` (the elementsById parent-path
  lookup can't be used — duplicated subtrees share expressIDs so the table
  holds only the last-visited duplicate, and a scene pick's PDS id isn't a
  tree node at all). On load, `selectElementBasedOnFilepath` resolves the
  segments below the root back to an occurrence path when the tree knows the
  key (`occurrencePathKeySetForTree`), mirrors the NavTree click funnel
  (`getInstanceIdsForOccurrencePath` + `selectedOccurrencePath`), and falls
  back to the legacy scalar-id selection for IFC / unknown paths. Two
  supporting fixes: the pathname→element-path split now matches the file
  suffix at a path boundary (`fileSuffixBoundaryRegex`) — the bare type-name
  regex also matched directory segments like `/step/` and silently dropped
  the element path — and the NavTree row highlight applies to assembly rows,
  not only leaves. E2E: `src/Components/NavTree/navTreePermalink.spec.ts`.

- **Every operation on a selection goes through its occurrences.** A row's id
  (NAUO, or a body's solid id) owns no geometry, so anything that took the
  selection's ids straight to the geometry reached nothing. One resolver,
  `occurrencePaths.selectedOccurrences`, turns a selection into occurrences:
  the funnel's exact `selectedOccurrencePath` for a single selection, the
  anchor rows looked up in the tree for a multi-selection (every duplicate of
  a reused sub-assembly, which share NAUO ids). Its consumers:
  - **Isolate** (`IfcIsolator.isolateOccurrences`) shows just those
    occurrences' instances — `isolatedInstanceIds` on the batched mask,
    `includeInstances` on the merged subset (the converse of the hide's
    `excludeInstances`). It used to isolate the row ids and blank the model.
    The permalink writes it as `#d:iso=o…` (model-display-controls §6.3).
  - **Hide** of a multi-selection hides each occurrence (`hideOccurrences`),
    and toggles back when all are hidden.
  - **Highlight**: `selectItemsInScene` resolves a row-keyed selection (a
    shift-click multi-selection, a search) to its instances, so it lights up.
  - **The NavTree eye** (`IfcIsolator.canHideOccurrence`) goes on every row
    whose path resolves to geometry. `canBeHidden` reads element ids, which a
    leaf row's NAUO never is, so every leaf part — and every body row — had
    none.
- **Multi-select from the scene.** A shift-double-click on a Conway-direct
  model now toggles the picked row in the selection (`elementSelection`, as a
  NavTree shift-click does), where it used to mean "the whole IFC element".
  For STEP the row is the picked occurrence's node, not the geometry's PDS; a
  single occurrence selection is re-expressed as its row first, so it stays in
  the multi-selection. E2E: `src/viewer/three/stepVisibility.spec.ts`.
- **Multi-selection in the permalink.** The path carries one element, so a
  shared multi-selection reopened with only its first highlighted. A
  `#sel:<ref>,<ref>…` token (`Containers/selectionHash.js`) now lists every
  selected row in the `#d:` ref vocabulary — `e<id>` for IFC and STEP rows,
  `n<name path>` for scene-graph formats — written by `SelectionHashWriter`
  for two or more rows and restored by `CadView#onViewer` after the
  hide / isolate terms. The path keeps the first row; the location watcher
  leaves the selection alone while `#sel:` is present, since re-selecting the
  path's element would collapse the multi-selection.

### Remaining (follow-up)

1. ~~**Per-occurrence isolate.**~~ Done — see above.
2. **Reveal-hidden ghosts skip occurrence hides.** The "reveal hidden" (ghost)
   overlay is built from `hiddenIds` (product-type) only, so a per-occurrence
   hide shows no cyan ghost. The hide itself is correct; only the ghost preview
   omits it. Would need the ghost subset to build from the hidden instances.
3. **Assembly-node eye vs child eyes.** Hiding an assembly occurrence via its
   eye hides all descendant geometry but only marks the assembly node's eye
   (the store is keyed by node id); child-leaf eyes still read "shown." Toggling
   the assembly eye is the way to reveal them again. Making descendant eyes
   follow would need per-node hidden-state derived from the occurrence prefix.
4. **Root-level parts** — mostly closed by conway#628, see §"Identity below
   the product". A *body* placed directly under the product root now carries
   `[bodyExpressID]`, so the no-NAUO multibody file (BLSN_007) reconciles
   exactly. What remains is the sliver the body segment can't reach: a
   root-level product whose single solid makes it its own body, where the path
   is legitimately empty and `getOccurrencePathByInstance` still normalizes it
   to `null`. The one-root file is closed (#1909, below), and so is a file of
   several top-level products (#1901, "Several top-level products" below),
   through the PDS→node owner lists Conway puts on the tree (conway#723).

   **One-root files (#1909).** The sliver was not harmless: a part with no
   assembly structure (DSA2, `sameIdentityShells.step`) is *all* root-level
   geometry, so a double-click on any of its shells highlighted no NavTree row.
   The pick reports the `product_definition_shape` (`#8`), the tree's only row
   is the `product_definition` (`#7`), and the empty path joins on neither.
   It was the same on a first load as on a reopened export, portable or not:
   nothing about it came from the cache. Assemblies were unaffected, because
   every placement below the root carries a path.

   Fix: `selectFromInstancePick` tells "the instance's path is present and
   empty" (`IfcInstanceMap.hasEmptyOccurrencePath`, or a zero-length entry in
   the batch's `instanceOccurrencePaths`) from "no occurrence data" (IFC, an
   undecorated model), which `getOccurrencePathByInstance` conflates as
   `null`. For the former, `findSoleRootNode` names the tree's root **when it
   is the only node with an empty path** — exact, since an empty path means
   "no NAUO above this" and in a one-product file that is the root alone — and
   the pick passes that row as the selection's *anchor*. The anchor is what the
   NavTree row highlight, Properties, the TopBar crumb and the `.step/<root>`
   permalink follow, while `selectedElements` keeps the owner id the scene and
   hide key on, so scene highlighting and `H` are unchanged. This is the same
   rule `glbPortable.js#emptyPathJoinOf` applies to the export (#1908).

   **Several top-level products (#1901, conway#723).** Conway wraps them in a
   synthetic `Model` node and gives the wrapper and each part
   `occurrencePath: []`, so the empty path names no one part. Since
   `@bldrs-ai/conway` `1.1609.723` every tree node lists the
   `product_definition_shape`s that describe it
   (`productDefinitionShapeExpressIDs`: the part's own, then on an occurrence
   node the occurrence's), which are exactly the ids a placement reports as
   its owner. `utils/occurrencePaths.js#occurrenceOwnerIndex` keys every node
   by `${path}|${owner}` for each id in its list, and a pick with
   `(path, parent)` resolves to `index.get(`${path.join('/')}|${parent}`)`.
   For an empty-path pick that is the part that owns the shell
   (`findRootLevelOwnerNode`, which falls back to `findSoleRootNode`, so a
   one-product file resolves as before, whatever the owner). The wrapper's
   list is empty and is never a target. `serializeNode` keeps the list, so a
   cache hit resolves the same as a fresh parse; an artifact written before
   it has no list and a multi-root pick there stays unhighlighted, as before
   (no `schemaVer` bump: `glb-export-premium.md` §4.3).

   Every rule below holds per part. A part is a **top-level product**: the
   sole root of a one-product file, or one part of a multi-root file
   (`findRootLevelProductNode`). Its own instances are all of the model's
   root-level instances in the first case and, in the second, those whose
   owner its list names (`rootLevelInstancesOfProduct`, fed per instance by
   `ShareViewer#getRootLevelInstances().instanceOwners`). A part's permalink is
   `part.step/<wrapper>/<part>` (`part.step/0/3007` in `twoRootShells.step`),
   the element table's path to its row, and `resolveRootOnlyElementPath` reads
   it as the root-only link one level down.

   **One rule for selecting a top-level product.** Four paths select it, and
   they agree on what is lit:

   | path | the scene is on | how |
   |---|---|---|
   | scene **pick** | the shell clicked | `selectFromInstancePick` names the instance |
   | scene **shift-pick** | the shells picked, each toggled on its own (a picked child occurrence keeps its row) | `toggleRootLevelInstanceSelection` |
   | NavTree **row click** | the whole product: the root-level instances plus every descendant occurrence's; shift-click on the selected row drops it; Hide and Isolate act on all of it | the funnel resolves the root anchor: `rootLevelSelectionForAnchors` |
   | **permalink** `part.step/<root>` (multi-root: `part.step/<wrapper>/<part>`) | the whole product, the same | same resolver, via `selectRootOnlyElement` |

   A **shift-click on another row** after shift-picking shells recomputes the
   instances from the anchors; the root anchor then carries the shells already
   picked (`keepNarrowing`, which `elementSelection` sets for shift-clicks only),
   rather than widening them to the product or, as before, dropping them. A
   plain click on the row after a pick is a row click: the whole product.
   Whole means the descendants too: an assembly whose root has geometry of its
   own (`assemblyWithRootGeometry.step`: 40 root-level shells, two child
   occurrences, 42 instances) must not narrow to the root-level shells when its root row is
   clicked, which `selectedOccurrences` would otherwise have found by path for
   every row but the root's. A root with **no** root-level geometry (a plain
   assembly such as AS1) is outside this: the resolver returns nothing and its
   root row selects what it always did (measured on main: the row and its
   descendants' ids, no instance lit).
   Three more edges of the same rule:

   - **A shift-pick of a root shell onto a picked child occurrence.** The
     child's pick is anchored on its geometry's owner, which is no row; the
     shell joins with the child's *row* (the path's leaf, or its solid) as the
     anchor, as `elementSelection` re-expresses it for a shift-click. Left as
     the owner, the `#sel:` link written from the two anchors dropped it and
     re-selected just the root, the whole product.
   - **A shift-click on the root row when it is already selected** takes it
     out, whether it is an anchor of a shell pick (the viewer's ids hold the
     shells' owner, not the row) or of a row click. Its owner ids go with it.
   - **Hide (`H`) and Isolate on a whole-product selection** act on the whole
     product: the root-level instances plus every descendant's. The root's empty
     path gives `selectedOccurrences` nothing, so `IfcIsolator` adds the root
     as a pathless occurrence carrying its selected instances. A pick narrowed
     to some shells keeps the owner-id route. The pathless root is not written
     to the `#d:` link (it has no path to write); its children's hides and
     isolations still are.

   The root's empty path is no key for `selectedOccurrences`/
   `getInstanceIdsForOccurrencePath`, so every row-driven path needs the
   resolver above; a path that selects the root's row and not its instances
   leaves the row and URL selected with nothing lit (a NavTree row click did
   exactly that). Only a root-level instance in the selection proves a URL came
   from a pick, so reading `.step/<root>` back skips re-selecting only then.

   Follow-ups from review, all on the same case:

   - **Cache hit, merged layout.** The pick needs the map to know an instance's
     path is *present and empty*. `attachOccurrencePaths` (the merged
     cache-hit restore, `Loader#restoreCacheHitPicking`) used to skip every
     `[]` entry, so a part made only of root-level placements came back with
     no occurrence table and the pick lit no row after a reopen. It now keeps
     `[]` in the per-instance table and still leaves it out of the reverse
     `occurrencePathToInstanceIds` index, as the cache-miss populator does.
     The default (batched) cache-hit layout was never affected: its
     `instanceOccurrencePaths` keep the empty arrays. The merged layout is
     reached with `?feature=disableGlbBatched`, or by a model the batched
     writer declines.
   - **The permalink.** The pick writes the root's id alone (`part.step/7`).
     `selectElementBasedOnFilepath` only read paths of two or more segments,
     so the link restored nothing. `resolveRootOnlyElementPath` now accepts a
     single segment that is a whole number equal to the root's id, when the
     root is the sole empty-path node (`findSoleRootNode`) — so IFC and
     several-top-level-product links read exactly as before — and
     `selectRootOnlyElement` selects what the pick does: the root row as the
     anchor, `selectedElements` the ids that own the geometry, and the scene
     on every root-level instance (`ShareViewer#getRootLevelInstances`; a link
     cannot say which shell was clicked). A link whose model has no root-level
     geometry stays ignored, as it was. The pick that wrote the URL is not
     re-selected from it (its anchor is already the root), which would widen
     the one-shell highlight.

   - **Shift-pick.** A shift-double-click of a root-level shell used to do
     nothing (its owner is no row, so `elementSelection` returned). Toggling
     the product's row instead would drop the product on the second shell, as
     every shell shares it. `toggleRootLevelInstanceSelection` toggles the
     *instance*: it joins `selectedInstanceIds`, the root row stays an anchor
     while any root-level instance is selected, and the last one out takes the
     row and the root's owner ids with it. Other selected rows and their
     instances are carried over. Assemblies, IFC and every placement below the
     root keep the row toggle.

   Closed by the owner lists (above): with several top-level products the
   pick used to stay unhighlighted (never mis-highlighted), since the tree,
   the instance tables and the instance map carried no shape-to-definition
   link. `exportGlb.spec.ts` picks a shell of the second part of
   `twoRootShells.step`, on a fresh parse and from the cache, and expects that
   part's row alone, still narrowed to the one shell after the `0/3007` link
   is read back.
5. **`?feature=batchedMesh`.** The BatchedMesh render path builds no
   `IfcInstanceMap`, so per-occurrence (and all per-instance) selection no-ops
   under that flag — a documented gap in `buildBatchedConwayModel`, not a
   regression (NAUO≠PDS meant a STEP node click highlighted nothing there
   before this work either).
6. ~~**No eye on a body row.**~~ Done (`canHideOccurrence`, above). Was:
   `IfcIsolator.canBeHidden` answers from
   `visualElementsIds` (per-vertex expressIDs, i.e. the PDS) and the
   parent→children map, so a `type:'solid'` leaf is in neither and
   `NavTreeNode` renders no hide icon for it. The hide itself works — `H` on a
   selected body takes `hideSelectedElements`' occurrence branch and removes
   just that body — so this is a missing affordance, not a broken one. It
   predates conway#628 (the NEMA motor's bodies had it too) but is far more
   visible on a model whose rows are *all* bodies.

Each step degrades gracefully to today's type-level behavior when no occurrence
path is present (IFC, single-occurrence parts). A **shift-click**
multi-selection is keyed by rows rather than by occurrence path, so a row
of a reused sub-assembly selects every duplicate of it (they share its id).

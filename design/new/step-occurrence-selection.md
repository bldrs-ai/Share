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

### Done (this PR)

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

- **Cache-hit parity.** The occurrence tables also survive the GLB cache. The
  writer persists the global `instanceId → occurrencePath` table on
  `BLDRS_face_ids` (`glbExport` reads it off `model.instanceMap`); the reader
  decodes it to `userData.bldrsFaceIds.occurrencePaths`, and `Loader.js`
  reattaches it to each restored per-mesh map via
  `IfcInstanceMap.attachOccurrencePaths` (only for the instance ids that mesh
  actually holds, since the GLB splits into per-material primitives). Schema
  bumped `0.8.0 → 0.9.0` so stale occurrence-less caches read as a miss and get
  rewritten. **This is why an already-cached STEP model (e.g. one loaded on the
  same preview origin before this change) has to be re-fetched once: OPFS holds
  the old 0.8.0 artifact with no occurrence data until the schema bump forces a
  re-parse.**

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

### Remaining (follow-up)

1. **Permalink.** Extend the `#n:;p:` / element-path URL to encode the occurrence
   path and resolve it on load.
2. **Per-occurrence isolate.** Isolate (`I` / temp-isolation) still shows every
   occurrence of the isolated part type — the same occurrence→instance
   resolution the hide path now uses would make it per-occurrence too.
2. **Root-level parts.** A placement directly under the product root has an empty
   occurrence path (no NAUO), which `getOccurrencePathByInstance` normalizes to
   `null` — an empty path can't disambiguate anything. So a scene pick of a
   *root-level* part can't reconcile to its NavTree node (the pick reports the
   PDS id, which never equals the node's id), and it silently degrades to
   type-level. Harmless when the file has one root assembly (the common case);
   only bites files with several distinct parts placed directly at the root. A
   real fix needs a PDS→product-definition→node reverse map, out of scope here.
3. **`?feature=batchedMesh`.** The BatchedMesh render path builds no
   `IfcInstanceMap`, so per-occurrence (and all per-instance) selection no-ops
   under that flag — a documented gap in `buildBatchedConwayModel`, not a
   regression (NAUO≠PDS meant a STEP node click highlighted nothing there
   before this work either).

Each step degrades gracefully to today's type-level behavior when no occurrence
path is present (IFC, single-occurrence parts). NavTree **shift-click** on an
occurrence node also degrades to type-level accumulate (multi-select wins the
modifier slot; per-occurrence highlight is single-selection only).

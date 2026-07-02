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

### Remaining (follow-up)

1. **Permalink.** Extend the `#n:;p:` / element-path URL to encode the occurrence
   path and resolve it on load.
2. **Cache-hit parity.** The occurrence tables ride the cache-miss
   `buildConwayIfcModel` path; the cache-hit GLB restore
   (`instanceMapFromTriangleIds` / `instanceMapFromGeometry` in `Loader.js`) does
   not yet reconstruct them, so a reloaded (GLB-cached) STEP model falls back to
   type-level selection until the path is persisted per-instance in the artifact.

Each step degrades gracefully to today's type-level behavior when no occurrence
path is present (IFC, single-occurrence parts).

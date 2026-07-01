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

Selection flow today (all keyed on the scalar `expressID`):
`NavTree click → node.expressID → viewer.setSelection([expressID])`, and
`scene pick → triangle → IfcInstanceMap instance → parentExpressId → NavTree`.
The mesh instance map (`src/viewer/ifc/IfcInstanceMap.js`) is the seam: it
already assigns one synthetic instance per `PlacedGeometry`.

### Done (this PR)

- **Data foundation.** `IfcInstanceMap` captures `instanceIdToOccurrencePath`
  from each `PlacedGeometry.occurrencePath`, with `getOccurrencePathByInstance`
  (instance → path) and `getInstanceIdsByOccurrencePath` (path → instances).
  `bldrsSpatialTree.serializeNode` preserves `occurrencePath` so cache-hit trees
  keep it. Store carries `selectedOccurrencePath`. All unit-tested; additive and
  `null`/absent for IFC.
- **Scene pick → NavTree (per-occurrence).** `canvasDoubleClickHandler` resolves
  the picked instance's occurrence path and carries it into the selection funnel;
  the NavTree scroll + `isSelected` match on the occurrence path, so a scene pick
  highlights the *one* node — not every reuse. (Scene highlight was already
  per-instance via `setInstanceSelection`.)
- **NavTree click → NavTree (per-occurrence).** A node click passes its
  `occurrencePath`, so clicking one occurrence of a reused part highlights only
  that node in the tree, not all six.

### Remaining (follow-up)

1. **NavTree click → occurrence-scoped scene highlight.** A node click still
   highlights *all* the part-type's instances in the 3D scene (only the tree
   narrows). Resolve the node's `occurrencePath` → the per-mesh instance ids
   (`getInstanceIdsByOccurrencePath` across the scene meshes) and pass them as
   `instanceIds` so `setInstanceSelection` lights up only that occurrence. Needs
   care with the per-mesh instance-id spaces, and in-browser validation.
2. **Permalink.** Extend the `#n:;p:` / element-path URL to encode the occurrence
   path and resolve it on load.

Each step degrades gracefully to today's type-level behavior when no occurrence
path is present.

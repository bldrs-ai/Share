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

- `IfcInstanceMap` now captures **`instanceIdToOccurrencePath`** from each
  `PlacedGeometry.occurrencePath`, with `getOccurrencePathByInstance(id)`.
  Additive and safe: `null` for IFC / a Conway without the field, so every
  existing path is unchanged until the data appears. Unit-tested in
  `IfcInstanceMap.test.js`.

### Remaining (follow-up, needs the Conway bump + in-browser validation)

1. **Pick → occurrence.** In `CadView.canvasDoubleClickHandler`, resolve the
   picked instance to its occurrence path (not just `parentExpressId`) and carry
   it into selection.
2. **NavTree node identity.** Key selection/highlight/scroll on the occurrence
   path (nodes already expose `occurrencePath`) instead of the colliding
   `expressID`, so one nut highlights one nut.
3. **Highlight.** `IfcInstanceMap.createSubsetMeshByParent` collects *all* a
   part-type's instances; add an occurrence-scoped subset so only the picked
   occurrence lights up.
4. **Permalink.** Extend the `#n:;p:` / element-path URL to encode the
   occurrence path, and resolve it on load.

Each step degrades gracefully to today's type-level behavior when no occurrence
path is present.

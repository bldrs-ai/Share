# Demand/tiled rendering — budgeted, progressive geometry for PSB-class models

Consumer-side plan for conway epic
[conway#390](https://github.com/bldrs-ai/conway/issues/390)'s demand
plane. Status and motivation: the streamed columnar open shipped
(default-on, #1609), and the browser-MT spike
([#1610](https://github.com/bldrs-ai/Share/issues/1610),
[conway-geom#148](https://github.com/bldrs-ai/conway-geom/issues/148))
established that load-time whole-model extraction cannot be
meaningfully accelerated in the browser — ~75% of it is serial JS
driver. This milestone therefore **deletes** it: extract on demand,
under an explicit byte budget, rendering what the user is looking at.

## Where a PSB load's 52.6s goes today (clean tab, prod)

| phase | time | heap | this milestone's effect |
|---|---|---|---|
| download prep + read | ~3.9s | +1.7GB | untouched (OPFS-from-birth milestone) |
| streamed parse | 13.4s | +376MB | untouched (already shipped) |
| whole-model extraction | 31.1s | +627MB | **deleted** — demand batches instead |
| merged-geometry build | 7.9s | +1.5GB | **deleted** — incremental BatchedMesh adds |

Target: first pixels ≈ parse + first demand batch (~15s class on PSB),
full interactivity while geometry streams in, geometry residency
bounded by budget instead of model size.

## Conway machinery this consumes (all merged, tested end-to-end)

- Per-product demand extraction seam: `prepareDemandExtraction()` +
  `extractProductGeometryByLocalID()` (`@bldrs-ai/conway`, Phase B2).
- `DemandGeometryQueue` (priority + byte budget) over `GeometryTiles`;
  `GeometryTilePool` (refcounted shared assets over the wasm TilePool);
  `IfcTileAssetExtractor` (representation-item closure attribution);
  `DemandResidencyPump` (async source-residency admission) — the
  `@bldrs-ai/conway/demand` plane.

## Slices

### A — Progressive extraction + incremental scene (perceived-latency win)

No eviction yet; same total work, radically better time-to-pixels, and
it de-risks incremental scene mutation.

1. **Conway shim**: a deferred open — `OpenModelStreamed(data,
   {DEFER_GEOMETRY: true})`-style — that parses and registers the model
   *without* extraction, plus a batch surface:
   `ExtractGeometryBatch(modelID, batchSize) → {extracted, remaining}`
   driving the B2 seam cooperatively, and an incremental
   `StreamNewMeshes(modelID, cb)` that yields only meshes produced
   since the last call (the existing scene-walk capture, watermarked).
2. **Share loader**: when the `demandGeometry` flag is on and the GLB
   cache misses, open deferred; render loop pulls batches (file order
   initially), converts through the existing
   FlatMesh→BatchedMesh/merged path *incrementally*, repaints between
   batches; spatial tree and properties work from batch one (they never
   depended on geometry).
3. **Picking option A** (decided earlier): CPU position+index retained,
   normals/UVs nulled on upload where the batched path allows.
4. GLB cache write happens at completion, unchanged. Flag default OFF
   until preview burn-in (this changes UX semantics — geometry pops in;
   the names-first skeleton is the designed mitigation).

Exit gate: PSB first-pixels < 20s in a preview; final scene
mesh-parity with the classic path (same product set, same triangle
counts); all flows green with the flag off.

### B — Budgeted residency + eviction (the memory endgame)

Wire the full pump→queue→tile-pool→extractor composition. Renderer
holds BatchedMesh instances only for resident products; eviction
removes instances and releases tiles (refcounted shared assets make
mapped-item sharing safe). Priority = camera (frustum + screen-space
extent) once bounds exist — bounds come from first extraction and are
cached; pre-first-extraction ordering falls back to file order +
storey/spatial heuristics. Budget defaults device-sized, overridable.

Exit gate: PSB interactive under a ~1.5GB geometry budget; walkthrough
keeps a stable frame rate while the resident set turns over; no leaks
across evict/re-extract cycles (pool accounting invariants already
tested conway-side).

### C — Tiles as truth + GPU picking (Phase C flip)

Uploads served from wasm tile payloads (`readGeometryTilePayload`),
CPU-side canonical meshes dropped, picking moves to the GPU ID-buffer
(option B). Removes the last O(model) CPU geometry copies.

## Flags & rollout

`demandGeometry` (default off) gates A; sub-flags per slice as they
land. The classic whole-model path remains the fallback until C is
burned in, mirroring the `disableStreamOpen` rollout pattern.

## Cross-references

- conway epic: conway#390 (status addendum in
  `design/new/streaming-federated-loader.md`)
- Browser-MT spike data: #1610, conway-geom#148, parked #1612
- Cooperative native open (needed by OPFS-from-birth, not by slice A):
  conway#420

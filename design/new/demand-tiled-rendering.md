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

### A2 — Parse-time preview channel (first pixels in the first seconds)

Slice A's first pixels still wait for the parse (~13s on PSB). A2
moves them into the parse itself. Durable extraction mid-parse is
structurally impossible for typical IFC — relationship records
(rel-voids, rel-materials, styled items) extend to ~92–97% of file
depth (measured on Schependomlaan), so a prefix extraction can miss
openings and materials. Conway therefore emits **throwaway preview
payloads** (`Loadersettings.ON_PREVIEW_MESH`): prefix snapshots of the
live columnar index, extracted through disposable prefix models under
a per-tick time budget, geometry copied out of the wasm heap
(self-contained, byte/product-capped), coordination frame pinned so
preview and durable placements coincide. The durable pump re-extracts
everything after the parse and replaces the preview — final parity
untouched by construction.

Share side: `parseIfcWithConway(..., onPreviewMesh)` threads the
callback into the deferred open; `payloadToPreviewMesh` builds pooled
render-only meshes (geometry cached by geometryExpressID for mapped
sharing) into the same preview group the slice-A batches use.
Preview meshes for products the durable batches later re-emit overlap
identically until the swap — invisible, and gone with the group.

Measured (node, Schependomlaan 49MB): first payload 583ms into a
1199ms parse. On PSB-class parses this is first pixels at ~1–2s of
parse instead of ~13s.

### STEP parity (shipped alongside A2)

The whole demand surface is schema-parametric as of conway 1.428:
AP214/AP203/AP242 get the streamed columnar open, the deferred pump
(assembly-tree units — one per part, so single-root assemblies like
Arty stream progressively; conway maps the consumer batch size onto
part granularity), and the parse-time preview channel via a
per-schema adapter. The loader needed zero changes — the demand
branch feature-detects the same pump either way. STEP loads are
geometry-dominated (Arty: 0.8s parse / 11.5s extraction), so the
pump is the visible win there; the preview channel is future-proofing
for large STEP parses.

Three follow-up fixes (conway #431) made the STEP preview channel
actually live — it was silently dead and could corrupt the durable
open: (1) `ColumnarIndexSink` snapshots now CLONE retained complex
(multi-mapping) entries, because models stamp lazy vtable/buffer
state onto them in place and AP214's transforms are complex
instances — a throwaway prefix model was poisoning the durable model
(Arty pump: 49 → 0 meshes); IFC was immune only because IFC files
have no complex instances. (2) AP214 `prepareDemandExtraction`
contains per-record getter throws, so a truncated prefix yields
partial units instead of aborting (one dangling record used to kill
the channel on tick #1). (3) `retryEmptyUnits` adapter semantics:
AP214's unit list is fixed at the file head while geometry arrives
throughout the file, so the channel re-runs units that captured
nothing against each richer prefix generation instead of consuming
the list once before any geometry exists.

### Progressive-load session (format-neutral instrumentation)

`src/viewer/ProgressiveLoadSession.js` — a small state machine
(idle → previewing → assembling → finished/aborted) that owns
everything the user sees/reads while a model loads, shared by IFC and
STEP (both route through `ShareIfcLoader.parse`): demand-preview
group lifecycle, the camera follow, and progress/summary reporting.
Format loaders only convert their streams (preview payloads, pump
batches) to meshes and trigger it.

The camera follow is a STRICT fit: the session keeps a running union
box of everything shown, and refits only when new geometry lands
outside the currently framed sphere (overflow-triggered,
event-driven, min 250ms apart growing to 1s) — so existing geometry
is never pushed offscreen between timer beats, and contained infill
causes no camera churn at all. First fit instant, follow-ups
tweened, stops forever on user input.

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

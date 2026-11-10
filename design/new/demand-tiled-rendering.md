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

Sequenced plan as of the v1.431 field milestone (PSB 77s = 47.9s
parse + 27.1s assemble; Arty 14.5s). Each step is a separate PR round.

**B1 — incremental durable assembly (dissolve the 27s assemble
stage).** Today the demand pump streams render-only preview meshes,
and the durable model is STILL built monolithically at the end
(merged BufferGeometry by default, BatchedMesh behind the flag) and
swapped in. B1 makes the BatchedMesh itself the durable object,
assembled incrementally during the pump: each delta batch appends
geometries + instances (capacity reserved with a growth factor —
BatchedMesh reallocation copies), picking decoration (expressID ↔
instance ranges) accumulates per batch, opaque/transparent split as
today. The preview group and the end-of-load build/swap disappear on
this path; end-of-load work shrinks to nav/spatial wiring + stats.
The merged path stays as the non-demand fallback. Expected: PSB
Total ≈ parse + ~0, from 77s to ~50s.

**B2 — residency slider + eviction (the feature, not just the
policy).** User-accessible control: a glasses icon in OperationsGroup
opens a popup with a residency slider (100% = whole model resident …
0% = fully evicted) and a priority-metric selector for eviction
ordering:
  a. screen occupancy — projected bounds area, frustum-weighted;
  b. memory limit — slider maps to a byte budget vs the full model;
  c. distance from selection — when a part is selected, priority is
     inverse distance from its bounds.
Architecture: a ResidencyController scores products with the selected
metric, keeps the top set that fits the slider's target, and applies
deltas — evict removes BatchedMesh instances and releases tiles
(refcounted shared assets keep mapped-item sharing safe), re-infill
re-extracts through the demand queue (conway tile-pool machinery,
Phase B InstanceAssetSource). Smoothness rules: rescore throttled
(~150ms), bounded churn per frame, hysteresis band so the boundary
doesn't flap. The slider doubles as the instrumentation surface for
choosing a DEFAULT eviction policy later — dialing it by hand on real
models is how the intuition gets built.

Exit gate: PSB interactive under a ~1.5GB geometry budget; slider
drag from 100→10→100 re-infills smoothly with a stable frame rate;
no leaks across evict/re-extract cycles (pool accounting invariants
already tested conway-side).

**B3 — adaptive residency during camera motion (#2130).** B2's slider
trims draw cost for as long as the user leaves it down; B3 trims it only
while the camera moves, which is when a slow frame is felt, and puts the full
picture back the moment it stops.

*Why (the owner's measurements, M2 MacBook Air, real GPU).* A repaint probe
forced 60 repaints of a still view and timed the CPU (three's render calls)
and the GPU (a WebGL2 fence placed after the draw, polled from a
MessageChannel loop):

| Model | Triangles | CPU p50 | GPU p50 (p95) |
|---|---|---|---|
| Momentum | 72k | 0.2 ms | 9.2 ms (22) |
| Seestrasse | 1.06 M | 4 ms | 21.7 ms (27) |
| PSB (large private IFC) | 12.0 M | 4.9 ms | 47 ms (106) |
| PSB, small window | 12.0 M | 5.5 ms | 46.5 ms (97) |
| PSB, residency slider at 25% by "screen occupancy" (by size in fact, see *Known limits*) | 2.36 M | 1.3 ms | **14.4 ms** (18.5) |

PSB is triangle-bound, not fill-bound (shrinking the window changed
nothing): GPU time is about 6 ms + 3.4 ms per million triangles. At full
detail it orbits at about 20 fps (47 ms a frame); at 25% occupancy residency
the owner reports it "feels instant".

*The controls.* The Display menu's residency section becomes the **at rest**
setting, unchanged in default (100%) and behaviour. Behind
`?feature=motionResidency` (default off, for the owner's A/B) a second
section, **While moving**, has the same percent slider and priority metric
plus **Auto**, the default. Manual 100% is "no change while moving" and is
exactly today's viewer. Both persist the same way: the display-override
stack (`motionResidency: {mode, percent, metric}`,
model-display-controls.md §2) and the `#d:` token (`mres=25`,
`mres=auto.memory`; Auto + occupancy is the default and writes nothing).

*The overlay (ResidencyController).* A record carries two verdicts,
`restKept` (what `apply` computes for the at-rest target, as before) and
`motionKept`; an instance is shown iff both hold. The motion set is the top
of the motion metric's ordering drawn only from the at-rest set, so motion
can take parts away but never add one, and `endMotion` restores exactly the
at-rest set — the still picture is what it is without B3. It composes with
hide/isolate for free: every write goes through `setVisibleAt`, which
IfcIsolator's mask already arbitrates (a user-hidden part stays hidden, a
part evicted for motion comes back at rest). An edit during motion
re-applies, rebuilding the overlay over the fresh records at its fraction.
Picks at rest see the full at-rest set; hover is off during drags.

*No sort on the camera's critical path.* Sorting 300k records costs
150–270 ms in V8, so a gesture walks an ordering built beforehand: the
at-rest order filtered to what it kept (O(n)) when the metrics match, or
one built in idle time (`prepareMotion`) when they don't. Moving the motion
fraction moves one cut along that ordering, flipping only the instances
between the old and the new cut — bounded per frame (20k) after a gesture's
first frame. A selection change drops the prepared DISTANCE ordering, which is
rebuilt in idle time (`ResidencyController#selectionChanged`). The owner's
preview run found that the motion ordering kept ranking by the old selection.
The at-rest DISTANCE set now also re-ranks on a deselect, which B2 had skipped.
The first frame and the restore at rest are unbounded, since
the first must already be cheap to draw and the restore must be the whole
picture.

*Motion and rest (MotionResidency).* camera-controls' `update` (input,
damping, transitions, ViewCube snaps, fits) starts motion; 200 ms *and*
three frames without one is rest. Time alone failed on SwiftShader: at
~380 ms a frame camera-controls skips an `update` on some frames of a
steady drag, one quiet frame was already past 200 ms, and every gesture
ended after two frames — too few for Auto to step. Not `controlstart`, or every click-to-select would flicker the
model. `update` fires inside `controls.update()`, which runs before the
frame's paint (`IfcContext#updateAllComponents`), so the first moved pose
is already drawn reduced; rest is noticed in a `ThreeContext#onFrame` hook,
also before the paint, and every instance the restore shows asks for a
paint (`ResidencyController#setVisible_` calls `requestPaint`, on top of
the `setVisibleAt` hook's background ask), so
the full set lands in the frame that found the camera still. The load's own
camera follow is not motion (`RenderDemand#isFollowMoving`). Any cached
frame a hover overlay keeps is invalidated the normal way: every eviction
and restore is a hooked `setVisibleAt` plus a `requestPaint()`.

*Auto (autoResidency.js).* Under Auto, while moving, each painted frame's
GPU time is measured (gpuFrameTimer.js): an `EXT_disjoint_timer_query_webgl2`
query around the paint where the browser exposes it, else the owner's fence
technique, one fence in flight, polled from MessageChannel tasks, given up at
500 ms. The paint is bracketed by `RenderDemand#observePaints`, called from
the render closure around `composer.render()`. The budget is one display
interval, read off the loop's idle animation frames, not assumed (16.7 ms at
60 Hz, 8.3 ms at 120 Hz). Intervals after a paint are ignored,
or a 47 ms orbit would read as a 21 Hz display. Each step scales the
fraction by budget/measured. GPU cost is a + b·f, so that proportional step
under-predicts a cut's saving and over-predicts a growth's cost: from either
side the walk is monotone toward the budget and does not cross it. The
smoothness rules carried over from B2 handle the noise:

- the median of at least 3 frames painted at the current fraction (each
  change opens a new epoch);
- at most one step per 150 ms;
- shrink above the budget, grow only below 0.7 of it;
- ×0.5 to ×1.25 per step, aiming at 0.85 of the budget;
- a ceiling at the smallest fraction seen over budget, which relaxes ×1.1
  after 2 s held under budget;
- a 10% floor.

The fraction persists across gestures, so the next drag starts from the last
good target and its first frames are already cheap.

*Tuning, from the owner's preview run (M2 Air, 60 Hz, DPR 2).* The first
cut budgeted 0.8 of the interval (13.3 ms) with a 5% floor. On PSB, Auto went
to the floor and the menu read "Auto (5%)", which the owner called "a bit
liberal with the threshold". The repaint probe there puts the GPU at about
6.4 ms fixed + 3.4 ms per million triangles. Momentum's whole frame is
already 9.2 ms, so with each step aiming at 0.85 of the budget, 13.3 ms
leaves little room above the fixed cost. A full interval (the step aims at
~14.2 ms) is about 2.3 M triangles: PSB at 25%, measured at 14.4 ms, the
trade-off the owner found good. The floor rose to 10%, below which an orbit
stops reading as the model. On the owner's re-test with this tuning (M2 Air,
60 Hz) PSB settled near the 10% floor with the main massing preserved;
the owner accepted that as the trade-off. `MIN_FRACTION` is the knob if it
ever proves too aggressive.

*Follow-up, not B3.* With several sessions or views visible at once, the
budget has to be one GPU budget shared across them, not a full interval
each.

*Rollback.* `motionResidency` is default off. Off, no driver is built and
nothing listens to the camera. Manual 100% is the per-user off switch.

*Known limits.* Until the follow-up to B3, `ResidencyControl` handed the
controller `viewer.context.ifcCamera.perspectiveCamera`, a field `ThreeContext`
does not have, so in the app OCCUPANCY scored by part size alone, without
regard to the view. The owner's 25% measurement above was therefore by size.
It now reads `context.getCamera()`, so OCCUPANCY is angular size from the eye.
The ranking is taken from the camera when a set is chosen: a slider or metric
change, a selection under DISTANCE (which falls back to OCCUPANCY with none),
an edit, and, when the while-moving metric differs from the at-rest one, the
motion order's first sort after each of those. It is not re-ranked as the
camera orbits, so after a large move the at-rest set still reflects the
earlier view until the slider is touched again. Hover after a fling, while
damping is still moving the camera, can pick against the motion set; picks at rest never do. With
render-on-demand off every frame paints, so there are no idle frames to read
the display rate from and Auto assumes 60 Hz.

### Parallelism plan (consistent with the #1612 spike findings)

The isolation spike (Share #1612, parked) proved the COOP/COEP + MT
wasm infrastructure works and refuted the payoff: browser geometry is
~75% serial JS driver, so MT wasm nets zero-to-negative on real
machines (PSB 45s MT vs 31s ST) while carrying the MT tax and the
auth/Picker breakage. The plan that is consistent with that data
parallelizes the DRIVER, not the inner loops, and needs no headers:

**P1 — props worker (first use of the transfer plane).** The GLB
props capture + spatial tree + export currently waits for the whole
load, then runs on idle. Instead: at parse end ("indexReady"), ship
the serialized columnar index (M4 sidecar machinery) plus the source
bytes (transfer or OPFS handle) to a worker running its own ST wasm.
The worker opens a properties-only model (no geometry; windowed
OPFS-backed BufferProvider keeps residency at a fraction of main) and
produces the BLDRS props/tree payloads while the MAIN thread is still
extracting geometry — the props latency disappears into the pump
window, and the idle cores (M2: 4P+4E far from saturated) do real
work. Main merges the payloads at writer time.

**P2 — geometry worker sharding (the 30s push).** Generalize the same
transfer plane: K workers, each with its own ST wasm + model open
from the shared index sidecar, each extracting a SHARD of the demand
unit list and posting transferable geometry payloads (the
PreviewMeshPayload/tile shape) back to the main thread's incremental
BatchedMesh assembly (B1). This parallelizes the serial JS driver
itself — the thing the spike showed MT wasm cannot touch — with no
SAB, no COOP/COEP, no MT tax, no auth/Picker phases. Memory cost of
K model opens is bounded by the windowed provider + names-only trees.

**P3 — revisit MT wasm** only if P2 profiling shows in-wasm parallel
sections dominating again, or worker sharding hits a wall SAB would
fix. The parked #1612 phases (auth relay over BroadcastChannel,
Picker popup) resume unchanged in that case.

### Load session → observer plane

ProgressiveLoadSession (the format-neutral state machine) grows an
observer registration: the session emits lifecycle events — opened,
indexReady(sidecar), previewMesh, meshBatch, assembling, modelReady,
finished/aborted — and the current preview+camera-follow behavior
becomes the first observer (render infill). The props worker (P1) is
the second (kicks its worker on indexReady). Geometry sharding (P2)
rides the same events. This is the generalization that lets every
latency-hiding consumer start AS SOON as its inputs exist instead of
at load end.

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

# Lazy / incremental IFC properties — memory reduction

**Status:** Living doc. Steps 1–2 **shipped to `main`** (PR #1588, #1589);
step 3 (OPFS source spill wiring) **in progress**; step 4 (compression
default) **deferred, separate track**.

**Owner:** Pablo (with Claude).

**Companion doc:** [`bldrs-ai/conway` → `design/new/memory-residency.md`](https://github.com/bldrs-ai/conway/blob/main/design/new/memory-residency.md).
This doc owns the *product* goal and the Share-side load pipeline; the conway
doc owns the *engine* primitives (SoA descriptors, `'names'` mode,
`ReleaseEntityCache`, `SpillModelSource`) this wiring consumes. Read together.

**Related PRs (this doc ↔ code):**
- Share #1588 — load spatial tree in `'names'` mode + `ReleaseEntityCache`. *merged*
- Share #1589 — streaming (fixed-memory) GLB element-properties writer. *merged*
- Share #1587 — conway 1.372 bump (SoA descriptors). *merged*
- conway #373 (→ 1.373) and conway #374 (→ 1.374) — the engine surfaces #1588 and the upcoming step 3 consume.


## The goal, in one line

Open a PSB-class model (100 MB–1 GB IFC; 9 M+ entities) in a browser tab
**without the code-5 renderer OOM**, and keep the property working set bounded
to what the UI actually touches — not the whole parsed model.

The failure we're designing against is concrete and reproducible: on `main`
before this track, PSB rode a **~2.9 GB JS heap** and *intermittently* crashed
the renderer (Chrome "Aw, Snap — Error code 5") while writing the GLB cache.
The crash was marginal — it fired when the machine had less slack — which is
exactly why a *bounded* path beats a *usually-fits* one.


## Where the property memory goes (the sinks)

| # | Sink | Scale (PSB) | Fix | Status |
| --- | --- | --- | --- | --- |
| 1 | **Raw STEP/IFC source buffer**, pinned all session | 100s of MB (≈ source) | conway #374 windowed spill → wire `SpillModelSource` in Share | conway shipped; **Share wiring = step 3, in progress** |
| 2 | conway per-entity descriptor cache | O(entities) | SoA (#372) + `ReleaseEntityCache` (#373); called post-load (#1588) & mid-sweep (#1589) | ✅ shipped |
| 3 | Property-JSON object graph in the GLB writer (materialise-all) | multi-GB transient | streaming writer (#1589) → O(reachable ids) | ✅ shipped |
| 4 | Eager full-property inline of the spatial tree at load | O(products) | `'names'` mode (#1588) | ✅ shipped |
| 5 | GLB geometry bytes | 448 MB | Draco / meshopt (compression) | **deferred — separate track** |

Rows 2–4 shipped; **row 1 is the next and largest remaining resident**; row 5
is not a *properties* problem at all (it's geometry bytes — the thing that
makes the write slow and the reload big) and is tracked separately below.


## What shipped

### Step 1 — `'names'` spatial tree + `ReleaseEntityCache` (PR #1588)

The eager full-property visit on model load is vestigial from the web-ifc
days: conway's parse-time index already backs on-demand access, so the load
path only needs node names.

- Bumps `@bldrs-ai/conway` → **1.373.1180** (conway #373).
- `CadView.jsx`: `getSpatialStructure(0, true)` → `getSpatialStructure(0,
  'names')` on both load branches, then `ReleaseEntityCache(0)` once the
  element-types map is built (gated on `IsModelOpen(0)` so cache-hit GLB
  loads stay silent).
- `conwayDirectIfcLoader.js`: pass `'names'` through un-coerced (the old
  `!!args[1]` would have silently upgraded it back to the full-record visit).

Consumer audit (all load-time tree consumers verified against the slim
shape): `setupLookupAndParentLinks`, `SearchIndex`, `reifyName`,
`groupElementsByTypes`, NavTree, `IfcIsolator`, cache-hit closure capture,
GLB writers. `getByFloor` deliberately untouched — it still requests full
props on demand because it needs `Elevation`.

### Step 2 — streaming GLB property writer (PR #1589)

The GLB cache writer's fast path materialised **every** parsed entity into
one `itemProperties` object (millions of records → multi-GB transient JS
heap) and only *then* filtered to the reachable-from-`IfcRoot` closure
(~50 k on Snowdon, ~341 k on PSB). #1589 replaces it with a two-sweep
streaming capture that gzips the wire JSON incrementally:

- **Sweep 1** — linear scan via sync `proxy.getLine`; serialise `IfcRoot`
  seeds (GlobalId-bearing) straight into a pako streaming `Deflate`, build
  the product→psetIds index inline, queue non-geometric refs. Records not
  kept are dropped on the spot.
- **Sweep 2** — drain the ref closure by id.
- Memoization off during the sweep (restored, throw-safe); descriptor cache
  released once when the sweep ends. (An earlier revision also released it
  every 200 k materialisations mid-sweep; once that release became real on
  conway ≥ 1.373 it regressed the sweep 1.5–2.5× **and** doubled process
  heap through wipe/re-growth churn — SKYLARK bench: 19–22 s / 1.6 GB
  without the tick vs 31–47 s / 3.3 GB with it, CPU profile 18 % GC + 12 %
  descriptor re-materialisation. Removed in #1591; the SoA descriptor
  transient (~1 GB on 9 M-entity IFCs) rides the sweep and is returned by
  the end-of-sweep release.)
- **Peak retained: O(reachable ids + pset index + one record + compressed
  output)** instead of O(all parsed records).

Wire format unchanged (same gzipped `{itemProperties, propertySets}` the
reader already decodes; key order differs, decode-identical). A
`precompressed` seam through `injectGlbExtensions` embeds the gzipped bytes
verbatim so neither the main thread nor the writer worker re-materialises.

### Measured — PSB, in context

The runs are noisy (machine state swings parse time 16 s↔52 s across
otherwise-identical loads), so treat cross-run per-phase deltas with
suspicion. What's robust:

- **Property phase:** streaming end-to-end **≈ even-or-faster** than the old
  capture-then-filter (116 s incl. filter vs 138 s capture+filter on one
  slow-machine run), at **6.6 MB** peak vs materialising all 9.38 M entities.
- **The crash is intermittent** — the eager path rides the OOM edge; #1589
  removes the tail risk and the GC-pressure variance. This is a
  *memory-safety* win, **not** a headline speedup.
- **Neither step moves the 448 MB / ~150–200 s geometry write** — that's
  identical across prod/#1588/#1589 and is the compression track (below).

> **Merge-order note (why it mattered):** #1588 and #1589 are independent
> branches, but #1588 alone keeps the *eager* capture and rode the OOM;
> #1589 has the fix. #1588's `ReleaseEntityCache` releases are also no-ops
> until conway 1.373. So we merged **#1589 first, then rebased #1588 onto
> it** — at no point did `main` carry the eager-path-on-large-model OOM.


## Priorities / what's next

### Step 3 (active) — wire the OPFS source spill (task: "drop resident source buffer")

Row 1 above — the raw source buffer — is the largest remaining resident.
conway #374 (shipped in **1.374.1181**) provides `SpillModelSource` /
`ensureLineResident` / `StepExternalByteStore`; Share needs to use it.

- **Bump conway 1.373.1180 → 1.374.1181.**
- **Store backing already exists:** Share stages the source IFC in OPFS at
  `BldrsLocalStorage/V1/Projects/<path>` (`Loader.js`, `sourceCacheKey.js`) —
  the same `[glb] writer: upload source, key=BldrsLocalStorage/…` line in the
  load logs. Implement a `StepExternalByteStore` that reads byte ranges from
  that OPFS file via `OPFSService`.
- **Placement is the crux.** The GLB property capture (the *biggest* sync
  `getLine` sweep) is **deferred to an idle callback and fire-and-forget** —
  `scheduleIdleWork(runWriter)` at `Loader.js:736`, awaited only by its own
  `.finally` at `Loader.js:732`. So it runs *after* CadView's post-load
  handler. **The spill must hang off the writer's `.finally`** — the single
  point where every load-time sync sweep (geometry, `'names'` tree, GLB
  capture) is guaranteed done. A sync `getLine` on a non-resident range
  throws by design, so placing it earlier would break the capture. Cache-hit
  loads skip the writer entirely → the "don't spill cache-hit" gate for free.
- **On-demand reads:** route Properties-panel `getItemProperties` (and psets)
  through `ensureLineResident` before the sync read. The conway shim's async
  property APIs already `ensureResident` internally; confirm the Share path
  goes through them and doesn't hit a bare sync `getLine`.
- **Guard:** only spill when the OPFS source is confirmed present + sha-matched
  (Share already has the source sha in the cache key).

### Step 4 (deferred, separate track) — geometry compression default

The 448 MB uncompressed GLB and its ~150–200 s write / slow cache-hit reload
are the actual *user-visible* cost, and they're **geometry**, not properties.
Draco (`glbDraco`) and meshopt (`glbMeshopt`) are already fully wired
(`glbCompress.js`, `@gltf-transform` transforms, WASM encoder) but **off by
default**. Open question: flip a default on, or auto-enable above a
vertex/byte threshold? Needs an A/B of write-time + GLB size (draco ≈ 5–10×
smaller geometry but heavy encode; meshopt ≈ 2–4× but encodes in seconds) —
run `?feature=glbDraco` / `?feature=glbMeshopt` on a large model and compare.


## Open questions / risks

- **Internal coupling (medium):** the streaming capture (#1589) and the
  upcoming spill both reach conway adapter internals
  (`getPassthrough().model[0]`, `SpillModelSource`). The slow-path fallback
  limits blast radius to "slower, not broken." conway's proposed roots-only
  iterator (see companion doc) is the chance to replace the internal reach
  with a supported surface.
- **Spill timing:** the whole design rests on the spill running strictly
  after all sync sweeps. If a future feature adds a sync `getLine` sweep on
  the load path, it must run before the spill or route through
  `ensureLineResident`.
- **Draco vs. worker freeze:** compression encode is CPU-heavy; keep it in
  the GlbWriter worker, not the main thread.


## Cross-references

- Engine primitives (conway): [conway `design/new/memory-residency.md`](https://github.com/bldrs-ai/conway/blob/main/design/new/memory-residency.md)
- GLB artifact / cache contract: `design/new/glb-model-sharing.md`

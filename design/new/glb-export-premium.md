# GLB Export as a Pro feature — design

Status: v0.1 (2026-09-10). Epic `share-140`, tracking issue
[#1831](https://github.com/bldrs-ai/Share/issues/1831) (row in
[roadmap.md](../roadmap.md) §3.1).
Owner: Pablo (with Claude).

Share already converts every IFC/STEP it opens into a GLB and parks it in
OPFS as the next-load cache (design/new/glb-model-sharing.md). This doc is
the plan for handing that GLB to the user as a **download**, sold as a Pro
feature: what the artifact is and what has to happen to it before it leaves
the browser, how the export code is delivered *only* to subscribed users,
how a user sees what they have exported, and what each further format (OBJ,
STL, USD, …) would need.

Sections 1–3 are the investigation; §4–§6 the design; §7 the stages that
become the epic's sub-issues; §8 the cross-browser smoke checklist.


## Status & remaining work

*Updated 2026-09-16, after #1837/#1851/#1852 landed, the #1855 container
gzip (§1.1a), today's byte-attribution measurement on #1831, and the
`.glb.gz` round trip (§4.7), which reverses a decision §4.3 used to record.*

**Where things stand:** the feature described in §1–§6 below is fully built
and ships behind `?feature=export` (default **off**). Export lives in the
Save dialog's Export tab: the Include Bldrs metadata toggle, Portable
toggle, Compression dropdown (None / Meshopt / Draco), Quality rung,
Compress download toggle, a Download size line that *is* the file, and a
centred accent Export GLB action last. #1837 landed the pro-module
pipeline, Download GLB, and export tracking; #1851 added portable export +
re-hydration; #1852 added the compression controls (three-rung quality
ladder, background codec sweep, `.glb.gz`). **My Exports
(`Open/ExportsList.jsx`) is built and unit-tested but not mounted**, per
owner decision (#1838) — the `record-export.js` / `exportHistory.js`
tracking data path stays live regardless. Code delivery is gated through
the `pro-module` Netlify function (Auth0 bearer + Management API check on
every request, `Cache-Control: private, no-store`), built with esbuild
rather than Netlify's default nft bundler because nft crashes an ESM
function importing axios on cold start (§4.2). Just landed on this branch:
the byte-attribution instrument `tools/glb/byteBudget.mjs` (0ec7339) and the
v3 gzipped OPFS container, #1855, 6d20d33 (§1.1a) — a real Snowdon artifact
goes 67,830,692 → 21,396,007 B stored, 68.5% saved, ~0.5 s to inflate, the
size read still never touching BIN. **And the `.glb.gz` round trip closes**
(§4.7): Share opens its own compressed export by drag-and-drop and through the
Open dialog's Local tab, with no `supportedTypes` entry and no `findLoader`
arm — the envelope comes off at the upload seam, and a second seam in
`Loader#load` covers the paths that skip it.

1. **The measurement the epic was waiting on landed today, and it reframes
   the remaining lossless work.** §4.3's "container" finding (≈1.2 MB
   geometry against ≈15.5 MB container on Snowdon) was right in total but
   never split between the JSON chunk and the instance transforms — the
   split decides which follow-up issue matters most, and nobody had run it.
   It has now been run on a real batched-native Snowdon artifact
   (67,830,672 B, produced end to end by Share's own writer, not
   estimated). Exhaustive byte-level partition: geometry (`POSITION` +
   `NORMAL` + indices) 46,178,568 B (68.1%), JSON chunk 14,440,907 B
   (21.3%), `BLDRS_element_properties` 6,129,233 B (9.0%), instance
   transforms (`TRANSLATION`/`ROTATION`/`SCALE`) 873,960 B (1.29%),
   `BLDRS_instance_tables` 136,116 B, `BLDRS_spatial_tree` 71,856 B. So the
   "~15.5 MB of container" is **94.3% JSON chunk, 5.7% instance
   transforms** — the opposite of an instance-transform-dominated split.
   Snowdon turns out not to be instance-heavy in the artifact Share
   actually writes: 21,849 instances over 12,251 groups (a 1.78× reuse
   ratio), and 86.5% of nodes carry exactly one instance — the cost is the
   **node graph** (one full node + mesh + material + accessors +
   bufferViews per group), not per-instance placement data. Consequences:
   - **#1857** (Draco+Meshopt together / quantized instance transforms) is
     re-scored from "the biggest remaining win" to **~2.7% of a Draco'd
     export** and is deferred — not the priority the epic body still
     states.
   - **#1854**'s two named JSON-slimming levers both measure **0 bytes**:
     dropping node `name` strings recovers nothing because the batched
     writer emits no names at all, and dropping `min`/`max` on everything
     but `POSITION` recovers nothing because all 12,251 pairs are already
     on `POSITION` accessors, where glTF requires them. Both were reasoned
     from the merged-mesh layout, not the batched one. The levers that do
     exist there are new — material dedup (12,251 materials, 90 distinct,
     ~1.74 MB) and single-instance node collapse (~2.5 MB) — for ~4.3 MB
     together. **Material dedup has since landed**, and so has a third
     lever neither issue named: sharing the `EXT_mesh_gpu_instancing`
     accessors by content, worth 1,801,935 B of JSON + 456,524 B of BIN and
     writer-side (§1.1b). Single-instance collapse has NOT landed: the two
     cut its premise to ~0.7 MB, and what is left needs a mixed
     instanced/plain artifact shape that both readers refuse today —
     evaluated and deferred, not skipped.
   - **All of this is now measured end to end.** A real Snowdon artifact
     rebuilt through Share's own writer goes **67,830,672 → 53,131,764 B,
     −21.7%**, of which the JSON chunk is −8,167,232 (14,440,907 →
     6,273,675) and BIN is −6,536,756. 21,849 placements, unchanged, and
     the placement multiset — identity, transform, colour and geometry
     content hash — compares with **0 differences** (§1.1b).
   - **The largest single lossless item, #1859, has since landed** (§1.1b).
     The batched writer keyed geometry groups on `geometry.uuid` (object
     identity) rather than content, so 5,031 of the 12,251 groups were
     byte-identical duplicates — roughly 6.08 MB of duplicated BIN plus
     5.9 MB of JSON bookkeeping, **~12 MB, 17.7% of the artifact**. It now
     keys on content via `src/loader/contentKey.js`.
   - **Withdrawn: #1858**, closed `not_planned`. It claimed
     `BLDRS_element_properties` capture took 24.6 minutes on Snowdon. The
     same code on the same model, timed in a real browser with
     `?feature=glbVerbose`, reports **1,855 ms** — a ~2,000x gap on
     identical code and identical output. The minutes were an artefact of
     the sandbox harness, where `yieldToBrowser()`'s `scheduler.yield()`
     is frame-coupled and no frames are being produced
     (`src/utils/scheduling.js`); 99.1% of writer wall time there sat in
     75 yields. **No wall-clock duration measured in that harness is
     trustworthy.** Byte counts from it are unaffected — they do not
     depend on the clock — which is why the measurements elsewhere in this
     doc stand.
2. **Inline gzip of the glTF JSON chunk turned out to be spec-impossible,
   not just hard.** The GLB chunk-type field is fixed at `0x4E4F534A`, the
   JSON chunk's position is fixed first, and its contents are defined as
   the glTF JSON verbatim — `extensionsUsed`, which would say the chunk is
   compressed, lives *inside* the JSON a reader would have to inflate to
   find that out. No Khronos extension targets JSON or the scene graph. An
   extra chunk after BIN is spec-legal (verified against three.js r184 and
   gltf-transform 4.3.0) but is a carrier, not a compressor — it doesn't
   shrink what ships. This is why the win landed at the OPFS **container**
   layer instead (§1.1a, gzip outside the GLB entirely), not as an in-GLB
   JSON transform.
3. **S4 (#1835) is the ship gate for all of the above, and it is not
   done.** Outstanding: cross-browser smoke (Firefox, Safari — including
   OPFS `createWritable` and `CompressionStream` for `.glb.gz` — Edge, iOS
   Safari, Android Chrome) with real Auth0 accounts per tier, against the
   §8 checklist; the real Management API path for `record-export`
   (including whether the `https://bldrs.ai/app_metadata` JWT claim carries
   `exports` at all — an Auth0 Action outside this repo); flipping `export`
   to `isActive: true`; and the site-wide esbuild-bundling decision for
   every other ESM Netlify function that imports axios
   (`gh-oauth-exchange`, `gh-oauth-refresh`, `unlink-identity`,
   `create-portal-session`, `stripe-webhook`), which shares the same latent
   nft cold-start crash #1837 fixed locally for `pro-module` and
   `record-export`. Desktop smoke on the deploy preview (14 Sep) found
   export working end to end with None/Meshopt/Draco all opening in Share
   and the three.js editor; the two findings it produced became their own
   issues (#1844 picking on a re-opened Bldrs GLB, #1843 portable export)
   and are both now shipped.
4. **Open work beyond S4, in roughly the priority order the epic's handoffs
   give it:** #1854 (JSON slimming — the two originally-named levers measure
   0; material dedup and instancing-accessor sharing have landed,
   single-instance node collapse is evaluated and deferred, §1.1b), #1859 (dedupe duplicate
   geometry groups, ~12 MB / 17.7% — **landed**, §1.1b), #1862 (re-express the
   JSON chunk after the write — merged bufferViews, dropped glTF-default
   fields, shortest-round-trip float32 bounds, identity instancing attributes
   omitted — **landed**, §1.1c; accessor-count reduction via mesh collapse
   deferred there, reader proven in §1.1d, and the **writer landed behind
   the default-off `glbCollapse`** (#1871, §1.1d) — 7.4× on a DSA-shaped
   proxy, its rollout still owed), #1857 (deferred — ~2.7% of a
   Draco'd export, not the headline it was thought to be), #1853
   (decimation, deprioritised — it attacks the ~1.2 MB geometry term on
   Snowdon, not the container), S5
   #1836 (further export formats, §6).
5. **§7's two open questions are still open.** Whether free users get one
   export as a conversion moment (§7.1) and how `shareProPendingReauth`
   should be treated (§7.2) are both **owner decisions S4 has not made** —
   this fold-back records the shipped reality, not those decisions.


## 1. What we already have

### 1.1 The artifact

`src/loader/glbExport.js#exportAndCacheGlb` runs post-parse (idle-scheduled
from `Loader.js`) for every IFC/STEP source and writes **one** OPFS file at
the key `src/loader/glbCacheKey.js#glbCacheKey` derives from the source
(`<ns1>/<ns2>/<ns3>/<file>.<schemaVer>.glb` + commit hash). Per-source-kind
adapters in `src/loader/sourceCacheKey.js` produce the key input for GitHub,
local, upload, Drive and external sources. The file is not a bare GLB: it is
the **Bldrs container** (`src/loader/glbContainer.js`) — a 16-byte header
(`BLDR`, version, chunkCount, compression-mode byte, container-codec byte)
followed by exactly one chunk (the writer always packs a single chunk,
`packGlbChunks([bytes])`), and that chunk *is* a valid standalone GLB. So the
export is, at the byte level, `(await unpackGlbContainer(bytes)).chunks[0]`.

### 1.1a The container is gzipped (v3, #1855)

Since #1855 the container stores its chunks **compressed**, because Share was
caching every model it opened uncompressed: a real Snowdon artifact is
67,830,692 B, and gzip stores it in 21,396,007 B — **68.5% saved** — for
~1.7 s to deflate on the write and ~0.5 s to inflate on the read. The owner's
ruling on #1855 governs the trade: *"saving 10s or 100s of MB of disk space
for a slightly slower load (100s of ms) is a great tradeoff."* **Do not
"fix" that latency by reverting to uncompressed bytes** — it is the price
this was bought at, not a regression.

Three things about the shape are load-bearing, and the full argument (with
the wire format) is in `glbContainer.js`'s module doc:

- **Each chunk is TWO gzip members**, split at the inner GLB's JSON/BIN chunk
  boundary, with both stored lengths in the chunk record. That is what keeps
  `glbArtifactSize.js#artifactSizesFromFile` — the Export tab's size line —
  able to answer from a `File.slice` without ever touching BIN (902,702 B
  inflated instead of 21 MB, ~90 ms). A whole-file gzip would have destroyed
  that random access, and the obvious alternative of leaving the JSON chunk
  raw and gzipping only BIN measures 34,934,225 B — it forfeits 40% of the
  win, because the glTF node graph is the most compressible thing in the file
  (16.0× on its own). The split costs nothing: 21,396,007 B against a
  whole-file gzip's 21,397,212 B.
- **The container codec is byte 13, not the `mode` byte.** `mode` means "codec
  inside the inner glTF" and `Loader.js#tryLoadCachedGlb` treats a mismatch
  against the active feature flag as a cache MISS, so a gzip value smuggled
  into it would false-miss on every load, re-parsing the model while the cache
  sat there unread.
- **v2 (uncompressed) artifacts are read in place, and `schemaVer` is NOT
  bumped.** The container version describes the envelope; `schemaVer`
  describes the contents, which are unchanged. A bump would also be
  counterproductive: `schemaVer` is part of the artifact filename and nothing
  sweeps retired slots, so it would leave the old 68 MB file on disk *and*
  write a 21 MB one beside it, after a full re-parse. The cost of reading in
  place is that an existing v2 artifact never shrinks, since a cache hit runs
  no writer — reclaiming those wants a stale-slot sweep, not a version bump.

`packGlbChunks` and `unpackGlbContainer` are consequently **async**:
`CompressionStream` has no synchronous form, and pako measures 4.2 s against
the native 1.6 s on a Snowdon-sized BIN chunk. Where `CompressionStream` is
missing (Safari before 16.4) the writer emits a v2 container, so the cache
keeps working at the old size rather than failing.

What that GLB carries depends on the render path that produced it (all
default-on today):

| Layout | Slot (`schemaVer`) | Geometry encoding | Bldrs data |
|---|---|---|---|
| Batched-native (`glbBatched`, default) | `0.21.0-batched` | `EXT_mesh_gpu_instancing` + `BLDRS_instance_tables` | `BLDRS_spatial_tree`, `BLDRS_element_properties`, `scenes[0].extras` (title, coordination frame) |
| Merged bake (fallback when the batched export declines) | `0.21.0` (or `-draco` / `-meshopt`) | one merged mesh, colour-binned materials, per-vertex `_EXPRESSID` / `_INSTANCEID` | + `BLDRS_face_ids` |

All Bldrs extensions are listed in `extensionsUsed` only (never
`extensionsRequired`), so any glTF reader loads the geometry and ignores the
rest. `KHR_draco_mesh_compression` / `EXT_meshopt_compression` appear only
when the corresponding flag is on (both off by default).

Two properties of the artifact matter for a download:

- **It is not what a third-party viewer shows Share showing.** Source colours
  are exported verbatim and the auto-colour palette is re-derived on read
  (view-140 S1, #1706), so Blender/three.js viewers render the authored
  colours — for a colourless STEP that means grey, not Share's palette.
  Acceptable; document it in the export UI's help text.
- **`BLDRS_element_properties` is the whole pset closure of the model.** The
  originator's own model, so no leak *to us* — but a user exporting to hand
  the GLB onward may not want vendor psets travelling with it. The export
  therefore offers a "strip Bldrs metadata" option (§4.3).

### 1.1b What the writer groups on (#1859, #1854)

`src/loader/glbBatchedExport.js#collectInstanceGroups` bins every placement
into one node per **(geometry content × exact source colour)**, and that
grouping is where the artifact's size is decided — the batched-native layout
spends one node + one mesh + six accessors + two bufferViews per group, so
the group count multiplies straight through the JSON chunk.

**It used to bin on `geometry.uuid`, which is object identity, not content.**
The shapes arrive from `makeInstanceGeometryReader`, whose cache keys on
conway's `geometryExpressID`
(`viewer/ifc/batchedInstanceGeometry.js#sourceKey`), so two IFC types that
emit byte-identical meshes arrived as two objects and were written twice.
Measured on a real Snowdon artifact: **12,251 groups over 7,178 distinct
contents** — 5,031 of them (41%) byte-identical in geometry *and* colour, i.e.
groups the writer's own stated key should already have merged. Cost:
6,079,368 B of duplicated BIN plus ~5.9 MB of JSON bookkeeping, ~17.7% of the
file, and the reuse ratio the node graph's cost follows from is 3.04×, not
1.78×.

`src/loader/contentKey.js` is the fix: an interner that maps every
geometry to the first object seen carrying the same POSITION + NORMAL + index
bytes, so the existing identity-keyed dedup below it becomes content dedup
without changing shape. Three things it has to get right, and each has a test
that a mutation was verified to turn red:

- **The hash only buckets; byte equality decides.** A 32-bit hash over
  thousands of shapes collides at a percent-level rate and a collision here
  would draw the wrong geometry, so every bucket candidate is compared byte
  for byte. `contentKey.test.js` carries a constructed FNV-1a collision
  (0xEDC3_D3B7) precisely so that check is not vacuous.
- **Merged groups concatenate in batch-iteration order, and the
  `BLDRS_instance_tables` rows travel with the transforms.** They cannot
  diverge, because both are derived from one `entries` list in one pass — but
  the join is by ROW (`extras.bldrsTableNode`, then index), so a merge that
  ordered one side differently would decouple every element id from its
  geometry. This is the `BLDRS_face_ids` identity hazard in a new place; it is
  pinned by a fixture whose two duplicate shapes *interleave*, so a per-shape
  concatenation is distinguishable from a batch-order one.
- **Same geometry, different colour must SHARE accessors, not merge.** 42
  Snowdon groups are that case. They stay distinct nodes with distinct
  materials over one set of POSITION/NORMAL/indices accessors — which is what
  `accessorsFor` already did for one geometry object, and now does for one
  geometry *content*.

**NORMAL is part of the identity.** ~730 Snowdon shapes share positions and
topology but differ in normals (smoothing or winding variants); hashing
POSITION + indices alone gives 6,448 distinct against 7,178. They are
correctly not merged, and the two numbers are not in contradiction.

**Materials are shared per colour, not minted per bin** (#1854). The writer
used to create one material per group: 12,251 declared for 90 distinct
colours, 1,758,073 B of JSON for 12,970 B of content. A material here is a
pure function of the source colour, and readers take colours from
`BLDRS_instance_tables` and never from the material (§1.1, and
`bldrsInstanceTables.js` on why), so sharing is exact and writer-side only.

**The instance transforms are shared by content too**, which is the same
mechanism one level up: almost every IFC placement is unit-scaled and the
orientations repeat, so the 7,220 nodes left after content dedup hold **74
distinct SCALE payloads and 357 distinct ROTATION ones** against 7,205
distinct TRANSLATION ones. One accessor per distinct payload is 1,801,935 B
of accessor + bufferView JSON and 456,524 B of BIN. The `tag` on the content
cache is what keeps a count-4 `VEC3` apart from a count-3 `VEC4` — twelve
identical floats, emphatically not one accessor.

**Evaluated and NOT done: single-instance node collapse.** 10,591 of 12,251
nodes carried exactly one instance, and expressing that transform through
three `EXT_mesh_gpu_instancing` accessors rather than the node's own TRS was
measured at ~2.5 MB of JSON — the third lever #1854 named. Two things took
it off the table, in this order:

1. **The two levers above eat most of it, writer-side.** Content dedup leaves
   5,235 single-instance nodes, not 10,591, dropping the lever to
   ~2,015,475 B; accessor sharing then takes 1,801,935 B of that same JSON
   without touching a reader. What collapse would still add is the
   per-node TRANSLATION accessor and the extension object, minus the node
   TRS it writes back — on the order of 0.7 MB.
2. **It is not a writer change.** A collapsed node is a plain `Mesh` with
   `extras.bldrsTableNode`, so the artifact becomes a THIRD shape — instanced
   and plain nodes in one file — and both readers refuse it.
   `instancedGlbToBatchedModel.js#detectArtifactShape` answers 'instanced' on
   one stamped `InstancedMesh` and `joinNodesToTables` then leaves every
   collapsed node's table row uncovered, so the join returns null and the
   whole cache hit degrades to a plain GLTFLoader model with no picking and
   no palette. `glbPortable.js#collectInstances` `continue`s on a node with
   no instancing extension, silently dropping those placements from a
   portable export, and `isPortableRewritable` gates on the extension name
   being in `extensionsUsed` at all. Unifying the two joins and the two
   shapes is a larger change than both levers above combined, against ~0.7 MB
   — so it is recorded here rather than half-landed.

#### Measured, before and after, on a real Snowdon artifact

Both artifacts produced end to end by Share's own writer through a browser
(`ifc/autodesk/snowdon/…_IFC4.ifc`, 83,153,231 B), partitioned with
`tools/glb/byteBudget.mjs`. **67,830,672 → 53,131,764 B, −14,698,908
(−21.7%)**, with the element-properties and spatial-tree payloads byte for
byte unchanged:

| bucket | before | after | delta |
|---|---:|---:|---:|
| `json.chunk` | 14,440,907 | 6,273,675 | **−8,167,232** |
| `bin.geometry.POSITION` | 16,069,512 | 13,785,108 | −2,284,404 |
| `bin.geometry.NORMAL` | 16,069,512 | 13,785,108 | −2,284,404 |
| `bin.geometry.indices` | 14,039,544 | 12,528,984 | −1,510,560 |
| `bin.instancing.ROTATION` | 349,584 | 106,864 | −242,720 |
| `bin.instancing.SCALE` | 262,188 | 49,560 | −212,628 |
| `bin.instancing.TRANSLATION` | 262,188 | 260,148 | −2,040 |
| `bin.extension.BLDRS_instance_tables` | 136,116 | 141,196 | **+5,080** |
| `bin.extension.BLDRS_element_properties` | 6,129,233 | 6,129,233 | 0 |
| `bin.extension.BLDRS_spatial_tree` | 71,856 | 71,856 | 0 |

Inside the JSON chunk: `accessors` 7,757,948 → 3,401,917, `materials`
1,758,085 → 12,982, `nodes` 1,913,447 → 1,109,611, `bufferViews` 1,647,498 →
968,400, `meshes` 1,300,898 → 745,140. Counts: 12,251 → 7,220 nodes and
meshes, 73,506 → 29,169 accessors, 24,506 → 14,387 bufferViews, 12,251 → 90
materials — and **21,849 instances, unchanged**.

**The tables payload gets 5,080 B BIGGER**, the one line in the table that
goes the wrong way. Nothing is added to it: `parents` and `occurrenceIds`
still carry one entry per placement and `nodes` carries 5,031 fewer rows.
What changed is the ORDER — placements are now grouped by geometry content
rather than by emission — and the payload is gzipped, so a sequence that
clusters less compresses less. 3.7% of a 136 KB payload against 8.2 MB of
JSON is a trade worth making; it is recorded because "one bucket grew" is
exactly the kind of thing a reader would otherwise flag as a bug.

**Losslessness is checked, not asserted.** The 21,849 placements were
extracted from both files as
`(parent, occurrenceId, geometryId, occurrencePath, TRS, colour, SHA-256 of
POSITION+NORMAL+indices)` and compared as multisets: **0 differences.** The
tables' 12,251 distinct conway geometry ids survive intact even though the
file now holds 7,178 distinct glTF geometries, which is the point — geometry
id is per-placement identity, the geometry payload is not.

### 1.1c The JSON chunk is re-expressed after the write (#1862)

**The finding.** `tools/glb/byteBudget.mjs` on a real `DSA2.step` artifact,
23,194,200 B total: `json.chunk` 20,630,338 B (88.95%), all geometry BIN
2,408,616 B (10.38%), instance transforms BIN 40 B. Inside that JSON chunk:
`accessors` 10,675,589 B (46.03%, 86,025 entries), `nodes` 4,508,281 B
(19.44%, 28,674), `meshes` 2,970,996 B (12.81%, 28,674), `bufferViews`
2,313,763 B (9.98%, 28,679). 28,674 nodes, each with exactly one instance at
an identity transform over its own 3-vertex shape — instancing buys nothing
on this model, and ~714 B of declaration describes ~84 B of triangle.

**Why the bufferView count is what it is.** gltf-transform's default
`VertexLayout.INTERLEAVED` emits one bufferView per mesh holding that mesh's
POSITION+NORMAL at `byteStride: 24`, plus one shared view for all indices and
one untargeted view for the instancing accessors. So the view count tracks
the mesh count. `VertexLayout.SEPARATE` was measured and is worse — two views
per mesh — and the library exposes no cross-mesh packing knob, which is why
this is a pass over its output rather than a setting.

**What the pass does** (`src/loader/glbSlim.js`, run inside
`exportBatchedModelAsInstancedGlb` before `injectGlbExtensions`, which
appends `BLDRS_*` payload views of its own):

1. One bufferView per `(buffer, target, byteStride)` class, accessors rebased
   onto it. Legal because nothing in glTF requires an accessor's
   `byteOffset` to be smaller than the view's `byteStride`.
2. Fields restating a glTF default dropped: `primitives[].mode === 4`,
   `byteOffset === 0`.
3. `accessors[].min`/`max` printed at shortest float32 round-trip precision.
   A `Float32Array` element read into JS is a double holding the float32's
   exact value, so `JSON.stringify` spells 1.1 as `1.100000023841858`. The
   shortest decimal that `Math.fround`s back to the identical float32 is the
   same number, not a rounded one — the bounds stay exactly the ones the spec
   requires. Worth 1,173,173 B on the DSA2 shape.
4. Writer-side: an `EXT_mesh_gpu_instancing` attribute that would only say
   identity is not written.

**Two constraints on (4) that are not style:**

- **TRANSLATION can never be dropped.** `src/export/glbPortable.js:201`
  derives the node's instance count from that accessor alone; without it the
  portable rewrite silently emits zero placements for the node, and the file
  it produces then fails its own re-hydration.
- **`attributes` must never go empty.** three's `GLTFMeshGpuInstancing` bails
  at `GLTFLoader.js:1739-1743`, the node hydrates as a plain `Mesh`, and
  `joinNodesToTables` then finds an uncovered table row — so the WHOLE model,
  not just that node, falls back to an undecorated GLTFLoader result with no
  picking and no palette.

**Confirmed on the real model.** Owner export of DSA through the Export tab,
prod against this change:

| DSA | prod | #1862 | delta |
|---|---:|---:|---:|
| `.glb` | 22.1 MB | 18.3 MB | **−3.8 MB, −17.2%** |
| `BLDRS_*` metadata | 152 KB | 152 KB | unchanged |
| `.glb.gz` | 2.1 MB | 1.9 MB | −0.2 MB, −9.5% |

Three things that measurement settles:

- **The synthetic proxy below slightly overstated the win** — it predicts
  −20.03% where the real model gives −17.2%. Near enough to have been a fair
  stand-in for the layout, but the real number is the one to quote.
- **Metadata unchanged is the negative check.** The pass runs before
  `injectGlbExtensions`, so the `BLDRS_*` payloads are outside its reach by
  construction; a moved number there would mean something was wrong.
- **Draco and Meshopt both GROW this file**, on prod and on this change
  alike, so the codec sweep auto-selects plain `.glb`. Both codecs only reach
  the geometry BIN — ~10% of this artifact — and each adds its own
  bookkeeping on top, so on a declaration-dominated model they lose outright.
  This is §1.1's container argument reproduced end to end by a user export.

The gzipped delta is proportionally smaller (−9.5% against −17.2%) because
gzip already collapses much of the repetition this pass removes
structurally. The pass earns its keep on the *uncompressed* `.glb` — what a
third-party viewer opens, and what has to be parsed into memory — not on the
wire size.

**Measured in development**, via two synthetic proxies through the real writer
(`exportBatchedModelAsInstancedGlb`); the DSA2 proxy reproduces the real
artifact's node/mesh/accessor/bufferView counts and its `nodes` and `meshes`
JSON byte-for-byte, so it is a stand-in for the layout, not for the model:

| | DSA2-shaped | Snowdon-shaped |
|---|---:|---:|
| artifact before | 22,750,376 B | 44,382,356 B |
| artifact after | 18,193,964 B | 42,562,928 B |
| | −4,556,412 (−20.03%) | −1,819,428 (−4.10%) |
| JSON chunk | 20,341,690 → 15,785,307 B (−22.4%) | 8,059,986 → 6,240,641 B (−22.6%) |
| bufferViews | 28,676 → 3 | 19,136 → 3 |
| accessors | 86,025 → 86,023 | 33,534 → 33,530 |

Khronos `gltf-validator` on both outputs: 0 errors, 0 warnings — an issue
profile identical to the inputs' (the only notices are `UNSUPPORTED_EXTENSION`
for `EXT_mesh_gpu_instancing`, which the validator does not implement, and
the `UNUSED_OBJECT` accessors that follow from it). Cost on the 20 MB worst
case, in the writer worker: 580 ms for the whole pass, of which 247 ms is the
JSON parse + re-serialize it cannot avoid and 70 ms the walk that proves no
unknown holder references a bufferView. Partly repaid immediately, since
`injectGlbExtensions` parses and re-serializes the same chunk right after and
now gets a smaller one.

**Evaluated, deferred at the time, now underway in §1.1d: reducing the
accessor COUNT.** 86,025 accessors
for 28,674 independently addressable meshes is what that mesh structure
costs; the pass makes each one cheaper and leaves the count alone. Collapsing
the meshes themselves — concatenating tiny single-instance shapes into
shared primitives with per-node identity carried by index ranges — is where
the remaining order of magnitude on a DSA2-shaped model is. Measured on the
post-slim artifact: `accessors` 9,291,470 B, `nodes` 3,619,387 B, `meshes`
2,712,930 B and `scenes` 160,956 B are 99.99% of the 15,785,307 B JSON chunk,
and a collapse removes essentially all of it — 18,193,964 → ~2.6 MB, about
7×. Only on this SHAPE, though: on the Snowdon-shaped proxy, where the nodes
are genuinely instanced and merging them would de-instance and duplicate
geometry, it is worth ~6%.

It is deferred because it is a reader change wearing a writer change's
clothes. Per-element identity lives in the glTF node graph today, and the
readers get at it through FOUR parallel `batchId`-keyed tables, not one:
`instanceParents`, `instanceOccurrenceIds`, `instanceOccurrencePaths` and
`instanceGeometryIds` (`CadView.jsx` reads all four on a click;
`ShareViewer.js` resolves occurrence paths and per-solid selection through
the last three). Packing several elements into one batch instance makes every
one of them ambiguous, and none is guarded — the read is a bare array index —
so the wrong element comes back silently rather than failing. Naming only
`instanceParents` here would invite a redesign that fixes parent picking and
quietly breaks STEP occurrence and per-solid selection, which is the harder
half to notice.

`BatchedMesh` also has no "add a slice of this geometry" API, so `buildPartition`
would have to re-split the merged mesh on every cache hit, spending the win
at load time instead of banking it. The storage side is the cheap half: the
schema version is in the OPFS filename (`glbCacheKey.js`), so a bump retires
old artifacts by itself.

Note what this does NOT reach, because the obvious guess is wrong:
**`BLDRS_face_ids` is not written on the batched path at all** —
`glbExport.js` skips capture when `batchedTables` exists, since per-triangle
identity is a merged-layout concept and the batched artifact carries identity
per instance instead. The hazard is subtler than "it breaks face_ids": a
range-keyed artifact would *import* face_ids' triangle-order fragility into
the one slot currently immune to it, and it would need a NEW canary to do it
safely.

Be precise about what face_ids has, because the obvious reading overstates
it. Of its three checks (`Loader.js`), only ONE is an independent witness:
the order cross-check against the per-vertex `_EXPRESSID`, which reads the
mesh's own data. The `firstExpressId` canary is **self-referential** — it is
`expressIds[0]` copied at capture time and compared against `expressIds[0]`
after decode, so it guards decode integrity and travels happily with a
misordered table. And the one real witness is **disabled on compressed
artifacts**, since DRACO and Meshopt corrupt the per-vertex ids. So a
compressed merged artifact already has no on-file witness for primitive-order
misalignment; only the uncompressed one does.

That is why a range-keyed batched artifact needs its own answer rather than
face_ids' precedent: the batched writer emits no `_EXPRESSID` at all, so the
one mechanism that works uncompressed is not even available to borrow. A
misaligned range table would be undetectable from the file alone, in every
codec.

Recorded here rather than half-landed, same as the node-collapse decision in
§1.1b. §1.1d picks it up, answering the reader question first.

The one contract the pass makes about data is that **every accessor
addresses byte-identical data before and after**, which is exactly what
`glbSlim.test.js` asserts (verified red against a mutation that drops the
offset rebasing). The first implementation laid views out in source order
rather than class by class, which produced OVERLAPPING merged views —
invisible to that byte-identity check, because every accessor keeps its own
offset, but not invisible to three's `GLTFParser`, which uploads a whole
bufferView as one GPU buffer. The fixture's view ORDER (mesh 0's attributes,
indices, instancing, then the rest — copied from a real artifact) is what
makes the regression test able to fail.

### 1.1d The collapse: reader (#1870), then writer (#1871)

§1.1c left the collapse deferred on a reader question, not a writer one:
`BatchedMesh` has no "add a slice of this geometry" API, so it was unclear
whether a merged artifact could be hydrated at all without re-splitting the
buffer on every cache hit and spending the win at load time. That question is
now answered, and the answer is the reason the writer is worth building.

**`src/viewer/ifc/batchedGeometryRanges.js` registers slices.**
`addGeometryRanges(mesh, merged, ranges)` uploads the merged primitive ONCE
through three's own `addGeometry`, then synthesises the `_geometryInfo`
entries `addGeometry` would have produced for each element, pointing them at
data that is already there. Nothing is copied per element. The reason this
works rather than merely appearing to is that a batch's index buffer holds
ABSOLUTE vertex indices — `setGeometryAt` writes each index as `vertexStart +
srcIndex` (BatchedMesh.js:778) — so a draw is fully described by its index
range, and every consumer reads exactly that: `raycast` sets the scratch
mesh's draw range from it, `getBoundingBoxAt` / `getBoundingSphereAt` walk it,
three-mesh-bvh builds one `MeshBVH` per range from it, and this repo's
`batchedInstanceGeometry` re-derives an instance's local geometry from it.

**Proven against the production picking path, not just three's.** `ShareIfc.js`
replaces both `BatchedMesh.prototype.raycast` and `Mesh.prototype.raycast`
with three-mesh-bvh's accelerated pair, and that library reads `_geometryInfo`
itself. `batchedGeometryRanges.test.js` installs the same patches and asserts
a ray aimed at each element returns that element's `batchId`, equal to what a
per-element batch returns for the same ray — and that the collapsed batch
holds exactly one BVH per element, no more. It also asserts per-element
bounds, per-element visibility, and that `instanceGeometryAt` recovers each
element's local geometry byte-for-byte against the per-element reference, so
isolation subsets and both GLB writers keep working.

**The merged upload's own geometry id is REPURPOSED as range 0**, not kept
beside the ranges. `decorateBatchMeshes` calls `computeBoundsTree()` with no
index, which builds a BVH for every geometry id; a leftover id spanning the
whole merged buffer would add a second, model-sized BVH that nothing draws.

**Three facts about glTF decided the file shape**, and they are why the
artifact is hybrid rather than uniformly merged:

1. **A primitive is drawn at one transform**, so each element's placement is
   BAKED into the merged vertices — otherwise the file renders wrong in any
   viewer that does not read `BLDRS_instance_tables`. The group's own offset
   stays on the node, which is what stops baking from costing precision:
   vertices are expressed relative to the group, so a model placed 10^5 m from
   the origin still resolves millimetre detail in float32. Baking against the
   world origin instead would quantise it to centimetres.
2. **A primitive has one material**, so merging is per source color. A group
   is a color, not the whole model.
3. **Genuinely instanced nodes are not collapsed at all** — merging them
   de-instances and duplicates their geometry, which is why §1.1c measures the
   collapse at 7× on a DSA2-shaped model and ~6% on a Snowdon-shaped one. So a
   real artifact carries both kinds of node, and the reader's shape
   discriminator is therefore per TABLE (`ranges` present or not), not per
   file and not per node kind. A fully-collapsed file holds no `InstancedMesh`
   at all, so the old node-kind test alone would have misrouted it to the
   portable reader.

**The invariant the reader verifies.** Each element's index range must
dereference only vertices in its own vertex range. `batchedInstanceGeometry`
recovers local index values by subtracting `vertexStart`, so a stray
cross-element index would underflow silently into every isolation subset and
every re-export rather than throwing. `addGeometryRanges` scans for it and
declines — one linear pass, next to nothing beside the upload that just
happened.

**One assumption the collapse breaks, and where.** An ordinary batch lets a
consumer treat `instanceGeometryIds` — the per-solid identity table — as a
geometry-EQUALITY key, because two instances of one solid genuinely share
their local geometry. A collapsed slice does not: placement is baked, so two
elements of one solid hold different triangles while sharing a row.
`batchedInstanceGeometry`'s per-pass cache keyed on exactly that, so it would
have handed the first element's geometry to every later one — wrong triangles
in isolation subsets, the merged conversion and GLB re-export, silently.
Range ids are therefore recorded on the mesh (`bldrsGeometryRangeIds`) and
take the per-mesh key instead, which is unique per element; a hybrid batch
keeps the source-id key for its ordinary instances. Caught in review, and
worth stating as a rule for the writer work: **anything that reuses an
identity table as a geometry-equality key has to exclude collapsed slices.**

**Private state, guarded.** The repo already depends on `_geometryInfo`
through three-mesh-bvh, so the dependency is not new; what is new is that this
module version-guards it. It compares the entry three actually produced
against the field set it is about to synthesise and returns null on any
mismatch, so a three upgrade that reshapes the entry degrades to the
un-collapsed path instead of picking the wrong element. Two three APIs are
NOT compatible with synthesised ranges and must never be called on such a
batch: `optimize()` and `setGeometrySize()` both re-pack by moving each
entry's reserved block, and ranges deliberately share one. Neither is on the
cache-hit path; the batch is stamped `bldrsHasGeometryRanges` so a caller can
assert it.

**The writer (#1871), behind the default-off `glbCollapse`.**
`src/loader/glbCollapse.js` plans and bakes; `glbBatchedExport.js` emits.
Every group with exactly ONE placement is binned by source colour, each
element's placement is baked into its vertices in double precision, the bin
is recentred on the centre of its bounds (that offset goes on the node, so
float32 keeps the element's *shape* — a 1 mm triangle 10^5 m out survives to
the micrometre, pinned in `glbCollapse.test.js`), and the bin becomes one
primitive. Genuinely instanced groups are untouched, so the file is hybrid.
Three details that are not obvious from the code's shape:

- **A mirrored placement reverses the triangle's winding**, because a
  renderer compensates a mirrored NODE transform and never baked vertices.
- **`EXT_mesh_gpu_instancing` is created only when some node uses it.**
  gltf-transform lists every created extension, so a fully-collapsed file
  would otherwise REQUIRE one it never uses, and 3dviewer.net refuses that.
- **A merged bin's index buffer is Uint16 whenever its vertices fit.** The
  per-shape accessors are always Uint32 (`batchedInstanceGeometry` rebuilds
  them that way), so this is a saving of its own — see the Snowdon row
  below — and one the un-collapsed writer could take too. Not done here.

**`BLDRS_instance_tables` v2** adds, per collapsed node, two per-row count
arrays (vertices, indices) and a `canary`. Counts rather than explicit
starts: rows are back to back by construction, so a stored form that cannot
express a gap or overlap removes that failure outright. The un-collapsed
writer still emits **v1**, so an older build — or a rollback — never meets a
payload it would refuse.

**The range canary** (`bldrsInstanceTables.js#makeRangeCanary`) is the
on-file witness §1.1c said was missing. The writer hashes each row's vertex
count, index count, LOCAL indices and positions (as float32 bits) from the
element's OWN baked arrays, before the copy into the merged buffers; the
reader re-hashes the file's merged buffers through the ranges. They agree
only if the copy, the bookkeeping, and anything that touched the mesh since
all left row i on row i's triangles. On a DSA-shaped model, where every
element is exactly three vertices, a table shifted by one element passes
every structural check there is — that is the case it exists for, and its
test swaps two same-sized triangles and was verified red with the check
disabled. It is **exact on purpose**: Meshopt keeps positions bit-exact and
never reorders, so a Meshopt export re-opens with picking (tested); Draco
quantizes POSITION, so **a Draco export of a collapsed artifact re-opens as
the plain GLTFLoader model — correct picture, no picking.** A tolerance
would have to be wider than Draco's error and narrower than the gap between
neighbouring elements, and on DSA those are the same order. Recorded as a
known limitation of the flag, not solved.

**Its own OPFS slot, not a bump** — a deliberate change from what #1871
proposed. `BLDRS_GLB_COLLAPSED_SCHEMA_VERSION` (`0.22.0-batched-collapsed`,
derived from the batched slot). Bumping the batched slot would have
re-parsed every model for every user to change nothing for the flag-off
majority; sharing it would have broken rollback, since an older build
meeting v2 tables keeps the undecorated model on every cache hit forever
(a hit never rewrites). With the slot in the filename neither end meets the
other's bytes, and `?feature=disableGlbCollapse` finds the un-collapsed
artifacts still on disk. As with `glbBatched`, the writer's slot follows
the bytes (the mode it actually ran in), the reader's follows the flags
(`activeArtifactSpec`), and `isGlbCollapseActive()` is the one seam.
Hydration is NOT gated on the flag: a user can open a collapsed download in
a session that has it off.

**The portable rewrite splits collapsed nodes** (`glbPortable.js#
splitCollapsedNodes`): each element gets POSITION/NORMAL accessors that are
windows onto the merged views and its own index slice, with the indices
rewritten from absolute to local IN PLACE — the BIN does not grow. Re-opening
that file re-merges the rows (`instancedGlbToBatchedModel.js#
remergeCollapsedRows`) instead of adding each as its own geometry, because
only the range path marks range ids, and that mark is what keeps
`batchedInstanceGeometry`'s cache honest (the rule above). The same canary
then witnesses the portable file too. Shape detection now checks the
portable row stamp first: a portable export of a collapsed artifact still
carries tables with `ranges`, and the table test alone routed it to the
wrong join.

**Audit of the rule**, surface by surface: `ResidencyController`'s use
counts and `robustBounds`' box cache key on the batch's own geometry id,
which is unique per range — sound. `ShareViewer`'s solid selection and
`productPalette` read `instanceGeometryIds` as identity, not geometry
equality — sound. The writer's own dedup keys on interned CONTENT, which is
unique per baked element — sound, and it is why re-exporting a re-opened
collapsed artifact re-collapses rather than un-collapsing (tested).

**Measured** on synthetic proxies through the real writer (the #1862
method; real-model numbers are the owner's to take):

| proxy | before | collapsed | |
|---|---:|---:|---|
| DSA-shaped (28,674 single-placement triangles, 12 colours) | 18,404,352 B | 2,502,148 B | **−86.4%, 7.4×** |
| — JSON chunk | 15,748,048 B | 8,596 B | 28,674 nodes → 12 |
| Snowdon-shaped (7,220 groups, 5,235 single, 90 colours) | 46,964,632 B | 38,543,208 B | −17.9% |
| — JSON chunk | 4,913,756 B | 1,506,112 B | −3,407,644 B, 7.3% of the file |
| — indices | 13,689,120 B | 8,726,340 B | −4,962,780 B, Uint16 bins |

So the ~6% predicted for a Snowdon shape is the JSON half, confirmed at
7.3%; the rest is index narrowing. `BLDRS_instance_tables` grows by the
ranges and canaries (DSA: 247,648 → 256,938 B). The portable rewrite of a
collapsed DSA artifact is ~8% LARGER than that of an un-collapsed one
(18.5 vs 17.2 MB) — per-element accessors need a `byteOffset` into the
shared views — which is the right trade for a file whose purpose is
third-party readability. Khronos `gltf-validator` 2.0.0-dev.3.10 on the
collapsed, portable-of-collapsed and baseline files: **0 errors, 0
warnings**, and a fully-collapsed file no longer declares
`EXT_mesh_gpu_instancing` at all.

**Still owed before `glbCollapse` flips on** (#1871 stays the tracker):

1. **Real-model numbers** — a DSA export and an instance-heavy one, through
   a browser with `?feature=glbCollapse`, byte-budgeted.
2. **Third-party viewers** — the three.js editor and 3dviewer.net on a
   collapsed download and on its portable rewrite. Validator-clean is
   necessary, not sufficient.
3. **The owner's call on the Draco limitation above.**
4. Browser coverage: `batchedGlbCache.spec.ts` runs MISS → OPFS → HIT under
   the flag on desktop and mobile, asserting per-element world-bounds
   parity against the live model.

### 1.2 Where a download can be located from

The UI does not hold the cache key. `Loader.js` computes `cacheKeyArgs` from
the source (`gitHubCacheKey` / `localCacheKey` / …) and keeps it in a local
`glbExportContext`; nothing publishes it to the store. The store has
`isCacheWriteInFlight` (true while the writer runs) and `loadedFileInfo`
(`{source, info}`), neither of which identifies the OPFS file. **S2 adds a
`glbArtifact` store slot** `{cacheKeyArgs, schemaVer, writtenAt}` that the
writer sets after `writeGlbBytesToOPFS` resolves and `Loader.js` clears on
every new load — the single hand-off from the loader to the export UI. A
cache-hit load (no writer runs) sets the same slot from the reader
(`tryLoadCachedGlb`), since the artifact it just read is the export.

Both producers can outlive their load — the writer is idle-scheduled and
fire-and-forget, the reader awaits OPFS — so an SPA navigation to a second
model would otherwise let model A's writer republish over model B's cleared
slot, and "Export GLB" on B hands out A. `src/loader/glbArtifactPublish.js`
guards it: `load()` takes a monotonic generation at its start, passes it to
both producers, and `publishGlbArtifact` drops a publish whose generation is
no longer current. A NESTED load — the recursive `load()` `BLDLoader.parse`
runs per object of a `.bld` assembly — takes no generation at all and
publishes nothing (`isNestedLoad` → `NESTED_LOAD_GENERATION`): its cache still
warms per object, but the assembly on screen has no artifact of its own, and
without this each child cleared the slot and then published its own file, so
Export GLB on a two-object scene handed out whichever object loaded last
(#1833). A `.bld` therefore ends with `glbArtifact === null` and the Export
button disabled — its "Preparing GLB…" label overstates a wait that will
never end, which telling "no artifact yet" from "no artifact ever" would
fix.

Reading it back is `readModelByPathFromOPFS(key.originalFilePath,
key.commitHash, key.owner, key.repo, key.branch)` — the reader's own call.

### 1.3 Subscription plumbing

- **Server truth:** Stripe → `netlify/functions/stripe-webhook.js` →
  Auth0 `app_metadata.subscriptionStatus = 'sharePro'` (+ `stripeCustomerId`).
- **Client:** the JWT carries `https://bldrs.ai/app_metadata`; `BaseRoutes`
  decodes it into `store.appMetadata`. `src/quota/quota.js#getTier` is the
  tier mapping (`'sharePro'` → PAID); `GitHubFileBrowser` also treats
  `'shareProPendingReauth'` as Pro.
- **Server-side gate precedent:** `netlify/functions/record-load.js`
  (Bearer → `/userinfo` → Management API → `app_metadata`), with the shared
  `_lib/auth0.js#verifyAuth0Bearer` helper. `create-portal-session.js` is
  the "never trust a client-supplied identity" precedent (#1489).
- **Upgrade path:** `ProfileControl#onSubscriptionClick` — portal if
  `stripeCustomerId`, else `/subscribe/?theme=…&userEmail=…`.
- **Tests:** Playwright mocks Auth0 (`tests/e2e/utils.ts#setupAuthenticationIntercepts`)
  and sets tier through `window.store.setAppMetadata`
  (`Profile/Subscription.spec.ts`); MSW (`src/__mocks__/api-handlers.js`)
  mocks the Netlify functions and reads the tier off the store the same way.
  **Neither environment runs real Netlify functions** — the Playwright build
  is served by `http-server` — so every new function needs an MSW handler
  (dev + jest) and a `page.route` (Playwright).

### 1.4 The build

`tools/esbuild/common.js` is `format: 'esm', splitting: false` (pinned by
`esbuild.test.js`) with two page entries (`src/index.jsx`,
`src/subscribe/index.jsx`) and two workers, each built as its own
`esbuild.build` call in `build.js`. Everything under `docs/` is published
by Netlify. There is no CSP, so `blob:` module imports are allowed; the
page is served COOP `same-origin-allow-popups` without COEP.


## 2. Goals / non-goals

**Goals**

1. A Pro user downloads the current model as a valid, standalone `.glb`
   in one click, from the artifact Share already built — no re-parse.
2. Non-subscribers see the affordance and are routed to upgrade; they
   **never receive the export code**, and the server, not the client, is
   the authority on who does (same principle as quotas).
3. A user can see what they exported (what, when, which format, how big)
   and re-download from the local cache when it is still there.
4. The design extends to other formats by adding a module, not a
   redesign — §6's matrix says what each format can carry.

**Non-goals (this epic)**

- Server-side conversion or server-hosted artifacts. Exports are produced
  and downloaded in the originator's browser; the server sees metadata only.
- DRM. A subscriber can save the module they were served; the hardening
  target is that it is never *published* and never reaches a non-subscriber.
- Exporting from formats that never produce an artifact (OBJ, FBX, PDB, …
  load directly into three). Those are "export from the live scene" — §6.


## 3. Options considered for the gated delivery

| Option | Mechanism | Verdict |
|---|---|---|
| A. Flag in the public bundle | Ship the export code to everyone; hide the button for free users | Rejected — the code is public; "premium" is a `data-testid` away. This is what the UI-only gates in `GitHubFileBrowser` do today and it is fine for *nudges*, not for the thing being sold. |
| B. esbuild `splitting: true` + dynamic `import()` | The chunk is still a public static file under `docs/` | Rejected for the same reason; splitting also changes the whole bundle layout (pinned off in `esbuild.test.js`) for no gating benefit. |
| C. **Separate entry built outside `docs/`, served by an authenticated Netlify function** | Build the pro module as its own bundle into `netlify/functions/_pro-modules/`; `pro-module.js` verifies the bearer token and `app_metadata.subscriptionStatus` on **every** request and streams the JS with `Cache-Control: private, no-store`; the client fetches with the token, wraps the text in a `blob:` URL and `import()`s it | **Chosen.** Reuses the existing gate helpers, no public copy of the code exists, and the only new moving part is a ~60-line function plus a build target. |
| D. Server-side export | Upload the artifact, convert, return a file | Rejected here (a non-goal: the model never has to leave the browser) but the option stays open for formats that need native tooling (USD). |

Why `blob:` + `import()` rather than `import(url)` straight from the
function: a dynamic import can't carry an `Authorization` header, and putting
the token in a query string logs it. The fetch carries the header; the module
text is then imported from a same-origin `blob:` URL (revoked right after)
and never touches OPFS, localStorage or the HTTP cache.


## 4. Design

### 4.1 Module layout

```
src/export/
  proModuleLoader.js     host: loadProModule(name, getToken) → module namespace (blob import), memoised per page
  exportRegistry.js      host: EXPORT_FORMATS matrix (id, label, ext, mime, moduleName, status)
  exportHistory.js       host: OPFS mirror `exports.json` + subscribeToExports (S3)
  useExport.js           host: hook: locate artifact → load module → run → download → record
  pro/
    glbExport.entry.js   PRO MODULE entry (built separately; never bundled into index.js)
    glbExport.js         the export itself: container unpack, optional strip, Blob
src/Components/                    (as built: the components live with their menus,
  Open/ExportSection.jsx            not with the export lib)
                         host: the UI on the Save dialog's Export tab (button, gating, options)
  Open/ExportsList.jsx   host: "My Exports" list (S3), inline under the button (S2b)
  GatedAction.jsx        host: the shared "looks disabled, explains itself" wrapper (S2b)
netlify/functions/
  pro-module.js          GET ?name=<id> — Auth0 bearer + Pro check → JS bytes, no-store
  record-export.js       POST {key, format, title, bytes} → app_metadata.exports (S3)
  _pro-modules/          BUILD OUTPUT (gitignored): glbExport.js
  _tests/                jest suites for the two functions (§4.2: a top-level
                         .js here would deploy AS a function)
```

The host bundle must never import anything under `src/export/pro/`. An
eslint `no-restricted-imports` rule pins it (S1), so a future refactor can't
quietly pull the module back into the public bundle.

### 4.2 Build

`tools/esbuild/build.js` gains a `proModuleBuilds()` alongside the worker
builds: one `esbuild.build` per entry under `src/export/pro/*.entry.js`,
`format: 'esm'`, `bundle: true`, `minify: true`, **`sourcemap: false`**
(no source leak), `outfile: netlify/functions/_pro-modules/<name>.js`.
`netlify.toml` declares `[functions."pro-module"] included_files =
["netlify/functions/_pro-modules/*.js"]` so the bundler ships the files with
the function — at `<task root>/_pro-modules/<name>.js`, the functions
directory stripped, under the esbuild bundler the function is configured
with (`node_bundler = "esbuild"`; nft keeps the repo-relative path, and the
function tries both). esbuild rather than Netlify's default nft because nft
transpiles an ESM function to CommonJS and then ships only what it traced
from the ESM import graph: `import axios` becomes `require('axios')`, which
resolves to `dist/node/axios.cjs`, which is not in the zip, and the function
crashes on cold start — the deploy preview's 502 (#1837 smoke), reproduced
locally with `zip-it-and-ship-it netlify/functions <out>` and a `require()`
of the zipped handler. The same applies to `record-export`; a tools test pins
both. The pro entry may import shared *source* (`glbContainer.js`,
`glbLog.js`); it must not import `three` or React — anything heavy is
injected by the host at call time (§6.1), which is also what keeps the
single-three-instance invariant.

For dev (`yarn serve`) and Playwright, where no function runs, the build
ALSO copies each module to `docs/__pro_dev__/<name>.js` when `SHARE_CONFIG`
is `dev` or `playwright` (never `prod`). The MSW handler for
`/.netlify/functions/pro-module` checks the store's `subscriptionStatus`
like `record-load`'s mock does, then proxies to that copy; Playwright specs
`page.route` the same path and `fulfill({path: 'netlify/functions/_pro-modules/glbExport.js'})`.

Two conventions the deploy bundler imposes on anything added under
`netlify/functions/`, both learned by breaking the deploy preview and
neither visible to `yarn build` or to jest:

- **No `node:`-prefixed builtin imports** (`node:fs/promises`, `node:path`,
  `node:crypto`, …). No pre-existing function used one; write `fs/promises`.
  Same reason `import.meta.url` is avoided for locating `_pro-modules/` —
  `process.env.LAMBDA_TASK_ROOT`, falling back to `process.cwd()`, is what
  the deployed lambda and `netlify dev` both understand.
- **Tests go in `netlify/functions/_tests/`**, not beside their subject.
  Every top-level `.js` in the functions directory is bundled AS a function,
  so a `foo.test.js` there deploys as a junk endpoint and pulls jest-only
  imports into the bundle. Subdirectories without a same-named main file are
  ignored, which is why `_lib/` is safe; jest finds `_tests/` either way
  (`roots` includes `<rootDir>/netlify`).

### 4.3 The GLB export (pro module)

`glbExport.entry.js` exports:

```js
export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary'}
export async function exportArtifact({bytes, options}) → {blob, filename, stats}
```

Steps: `isBldrsGlbContainer` → `unpackGlbContainer` → take chunk 0 → if
`options.stripBldrsMetadata`, parse the JSON chunk and drop every `BLDRS_*`
entry from `extensions`, `extensionsUsed` and node/mesh/primitive/scene
`extensions`, plus the `bufferViews` they referenced **only if** nothing else
references them → repack JSON+BIN with 4-byte padding → `Blob`. The
batched-native layout's `EXT_mesh_gpu_instancing` is a ratified Khronos
extension and stays. Filename: `<title or source basename>.glb`.

The payload views really do go (#1841 — through v0.1 the JSON entries went
and their gzipped bytes stayed, which made the toggle nearly free in the only
currency the user sees). `loader/glbArtifactSize.js#stripBldrsJson` owns that
half: it classifies every `bufferView` reference in the document by whether
only a `BLDRS_*` extension reaches it (a view a geometry accessor shares
stays), compacts the survivors at 4-byte boundaries, re-indexes every
surviving reference and updates `buffers[0].byteLength`; the pro module then
copies the survivors into a fresh BIN chunk. A compressed artifact's geometry
is carried the same way, with one wrinkle: under `?feature=glbMeshopt` a
bufferView's own `buffer`/`byteOffset` address the *decoded* bytes on
`EXT_meshopt_compression`'s fallback buffer (`buffers[1]`, no URI, no bytes in
the file) and the BIN-resident bytes are the compressed range the extension
names, so it is that range which is preserved, re-laid at 4-byte boundaries
and re-offset — treating a `buffer !== 0` view as external emitted an empty
BIN chunk and a file no loader could open (#1841). DRACO needs no special case:
`KHR_draco_mesh_compression.bufferView` is an ordinary view the generic walk
already sees. It lives in `loader/` because
the panel predicts the stripped size from the artifact's header with the very
same function (§4.4) — one computation, so the figure and the file agree
exactly. A GLB with no Bldrs data in it is handed over untouched rather than
re-serialised. `stats` reports `withMetadataBytes` / `withoutMetadataBytes` /
`metadataBytes` for the run either way.

**Compression** (#1842) is the second option, and the pro module does not run
it: the codecs and their wasm live in the host bundle, so `exportArtifact`
takes a `compress` hook and the host's `export/glbCompression.js` supplies the
bytes. The download is still reachable only through the module, which is what
the gate is for.

That module compresses the way the cache writer does — `KHR_draco_mesh_compression`
or `EXT_meshopt_compression`, the same `meshoptimizer/encoder` and the same
script-injected DRACO encoder (`loader/glbCompress.js#loadDracoEncoder`, now
exported for it) — with two differences that come from compressing an artifact
rather than freshly-exported geometry:

- The `BLDRS_*` payloads are already in the file, and `@gltf-transform` drops
  every extension its IO has not registered. So they are lifted out before the
  transform and injected back after it (`injectGlbExtensions`, the same
  on-disk shape the writer wrote), or "Include Bldrs metadata" would silently
  mean nothing under compression. The IO registers `ALL_EXTENSIONS` rather than
  just the codec's own, because the batched-native artifact's geometry IS
  `EXT_mesh_gpu_instancing` and an unregistered extension is a de-instanced
  model.
- `@gltf-transform/functions`' `draco()` / `meshopt()` wrappers are not used.
  Both bundle passes that reorder geometry (`meshopt()` runs `reorder()`,
  `draco()` runs `weld()` and defaults to `edgebreaker`) and `BLDRS_face_ids`
  indexes identity BY triangle position, so a reordered file picks the wrong
  element on re-import. The two extensions are driven directly, with DRACO
  switched to `sequential` whenever the document carries per-triangle or
  per-vertex identity. It also keeps the path off a package jest does not
  transform, so the unit suite runs the real encoders.

One encode serves both metadata states: the transform's own output IS the
without-metadata file (the payloads it dropped are exactly what the toggle
removes), and the with-metadata file is that plus the saved payloads injected
back — arithmetic beside the encode, since the costly stringify+gzip is
already done.

Two cases the first cut got wrong (#1837 codex round 6):

- **The encoder is unavailable** (the DRACO script fails to load, the codec
  rejects the geometry). The export still happens, uncompressed, and reports
  mode `none` — but *uncompressed is not untouched*: the pro module runs no
  strip of its own once a hook is in play, so the fallback's without-metadata
  side is the same strip the module runs for an uncompressed export
  (`loader/glbStrip.js`, shared by both for exactly this reason). The pro
  module's `stats.compression` carries the codec the file actually has —
  `none`, or the source's own codec when the cache pipeline had already
  compressed it, since that file still needs that decoder whatever was
  asked for (a file declaring both codecs, which nothing in Share writes,
  fails the estimate and this codec's export rather than be named by one
  of them) — the history row records that rather than the request, and
  the panel names the fallback beside the figure ("Draco isn't available in
  this browser — the file is uncompressed" / "— the file keeps Meshopt") so
  "Draco" chosen beside that number is not read as a Draco number.
- **The artifact is already compressed.** `?feature=glbMeshopt` /
  `?feature=glbDraco` write compressed artifacts, and `@gltf-transform`
  cannot *read* one without that codec's decoder registered — an
  unregistered extension is dropped, and for a codec the geometry goes with
  it. The compressor reads `extensionsUsed`, registers the source's decoder
  (`meshoptimizer/decoder`; `loader/glbCompress.js#loadDracoDecoder`, the
  viewer's own `draco_wasm_wrapper.js` + `draco_decoder.wasm`) before the
  read, and disposes the source's codec extension from the document when it
  is not the target, or the write would run both encoders over the same
  primitives.

**Quality** (#1848) is the second half of the compression option, and the
whole of `export/exportQuality.js`. Through #1842 the export set exactly ONE
encoder option per codec — Draco's `method`, Meshopt's `method` — and took
`@gltf-transform` 4.3.0's defaults for everything else. Three named rungs now
say what else to ask for. Presets rather than bit counts, because the bit
count means nothing to a CAD user and the two codecs' knobs do not line up: a
shared "12 bits" would be two different things and, for Meshopt, nothing at
all.

| Quality | Draco | Meshopt |
|---|---|---|
| **Best (larger)** | today's defaults: `POSITION:14 NORMAL:10`, speeds 5 | `QUANTIZE` — entirely lossless |
| **Balanced (medium)** *(default)* | same bits + `encodeSpeed:0 decodeSpeed:0` | `FILTER` |
| **Reduced (small)** *(id `smallest`)* | `POSITION:12 NORMAL:8` + speeds 0 | `FILTER` — unchanged from Balanced |

Measured on `src/tests/fixtures/Momentum.ifc` → GLB (1,959,196 B, 43
primitives), reproduced against the pinned encoders: Meshopt `QUANTIZE`
1,347,740 B → `FILTER` 820,912 B (**−39.1%**); Draco EDGEBREAKER 250,184 B →
speeds 0 228,652 B (**−8.6%**) → Reduced 194,932 B (**−22.1%**).

**Three rungs, not the five #1852 shipped** (#1854). `squashed`
(`POSITION:10 NORMAL:6`) and `smooshed` (`POSITION:8 NORMAL:4`) were added on
the strength of those Momentum figures — −34.2% and −46.1% — and removed again
after the owner smoke-tested the ladder on **Snowdon** (Autodesk's large IFC
demo, 83.2 MB `.ifc` → 63.7 MB uncompressed GLB), which is the model class
this feature is sold on:

| | Best | Balanced | Reduced | Squashed | Smooshed |
|---|---|---|---|---|---|
| Meshopt | 49.5 | 38.7 | 38.7 | 38.7 | 38.7 MB |
| Draco | 25.1 | 24.5 | 23.9 | 23.0 | 22.0 MB |

The whole Draco ladder is **−12.4%** there against −46.1% on the fixture it
was tuned on, with visible artifacts at the coarsest rung; Meshopt is flat
across four rungs exactly as `isDracoOnlyRung` says. Two lossy rungs buying
8% between them, for damage the user can see, is not a trade worth offering.
The sweep tables stay in `exportQuality.js`'s module doc rather than being
deleted with the rungs: they are the evidence for where the ladder now ends
and for why P7 N3 was never offered, and without them the next person
re-derives a coarser rung and re-learns this.

**Why the ladder was always going to be worth so little there**, which is the
finding that matters more than the two rungs. With metadata off that 22.0 MB
Draco file is 16.7 MB, and bzip2 of it is **2.8 MB — 6×**. Draco output is
entropy-coded and near-incompressible; measured per chunk on real batched
exports, the JSON chunk gzips 7.5–9.8×, the `BLDRS_*` payloads 1.0× (already
gzipped internally) and the Draco streams ~1×. A 6× whole-file ratio therefore
means almost none of the file IS Draco output — solving `D + R = 16.7`,
`D + R/10 = 2.8` gives **≈1.3 MB of compressed geometry against ≈15.4 MB of
container**: the glTF JSON node graph plus raw float32 instance transforms
(40 B each) that `EXT_mesh_gpu_instancing` puts permanently out of Draco's
reach. Every rung was tuning that 1.3 MB slice. The container is what the
gzipped download below goes after losslessly, and what #1853 goes after
structurally.

Four things about that table are load-bearing:

- **`FILTER` is the default, not a rung you have to find.** It is the largest
  single win in the issue and its cost is narrow and knowable: positions come
  back **bit-exact** (0.000000 mm over all 60,608 vertices, through a decode
  round trip), and only `NORMAL`/`TANGENT` are touched — rewritten
  octahedrally as normalized `BYTE`, ≤1.155°. A shading normal a degree out is
  invisible in a renderer and means nothing to a measurement. Best still
  reaches `QUANTIZE`, because a QA round trip that must be bit-exact in every
  attribute needs a rung that guarantees it.
- **Both Draco speeds or neither.** `encodeSpeed: 0` alone and
  `decodeSpeed: 0` alone each measured exactly 0.0% — 250,184 B either way —
  and only the pair reaches −8.6%.
- **The rungs are a FIDELITY ladder, not a size one, and the UI never claims
  otherwise.** The speed pair's payoff is model-shaped: −8.6% on Momentum
  under EDGEBREAKER (which is what the batched-native default takes) and
  −6.0% on `public/index.ifc`, but **+0.5%** on the same Momentum file under
  SEQUENTIAL and +2.4% on an instance-heavy synthetic. Nothing promises any
  rung weighs less than the one above it; the size line shows the real measured figure
  for whatever is selected, which is what the user actually needs. That is
  also why the coarse rung is **labelled** "Reduced (small)" and never
  "Smallest", under a sub-caption reading "how much detail to keep": a
  superlative about bytes on the control would be exactly the promise this
  bullet says the table cannot make. Its *id* stays `smallest` — it is written into
  export-history rows and estimate cache keys, and renaming it would break
  rows already recorded. The owner chose the parentheticals knowing
  that: **larger / medium / small is a hint, not a guarantee**, it holds on
  the EDGEBREAKER path the default artifact takes, and the dropdown above
  shows each codec's real measured bytes beside it. No rung carries the word
  "lossy" any more — the two that did are gone (#1854), and the coarsest left
  prints a 4.65 mm bound on Momentum, which is a caption rather than a
  warning.
- **Meshopt runs out of rungs before Draco does, and the panel says so.** The
  pinned `EXTMeshoptCompression`'s entire encoder surface is
  `{method: QUANTIZE | FILTER}`; the filter each attribute gets and the bit
  depth it gets it at are hard-coded by attribute semantic in the extension's
  own `getMeshoptFilter` (POSITION and TEXCOORD_0 → none, NORMAL/TANGENT →
  octahedral at 8 bits). Balanced already spends `FILTER`, so **Reduced
  produces Balanced's Meshopt file byte for byte** — true since #1848. The lever `gltfpack` would reach for next is
  `quantize()`, which lives in `@gltf-transform/functions` and reorders
  geometry, so it is off the table for `BLDRS_face_ids`. Rather than ship a
  silently inert option, `exportQuality.js#isDracoOnlyRung` marks that rung
  and the fidelity caption reads "geometry exact; shading normals rounded —
  Meshopt has no coarser setting".

**Where the ladder stops, and what it cost to stop there** (#1852's sweep,
kept as #1854's evidence). Swept on the same two models through the same
pinned encoders, against Reduced, EDGEBREAKER / SEQUENTIAL: P12 N6 −11.3% /
−4.1% at an *unchanged* bound; P10 N6 −15.6% / −8.1% (was `squashed`); P10 N5
−21.4% / −10.1%; P10 N4 −27.1% / −12.1%; P8 N4 −30.9% / −15.4% (was
`smooshed`); P7 N3 −39.7% / −18.9%; and at P2 N2, with the geometry destroyed,
still −56.0% — the floor, which is connectivity and which no bit count
touches.

Three readings, and the first two are why a coarser rung is not worth
re-deriving. **NORMAL, not POSITION, is where the bytes are**: P12→P8 at
NORMAL 8 buys −4.8%, while N8→N6 at POSITION 12 buys −11.3% and moves no
vertex at all, and NORMAL keeps paying — another 5.8 and 5.7 percentage points
of the Reduced baseline at N5 and N4 — long after POSITION has stopped. **Past
10 bits POSITION stops paying**: P10→P9 is −1.0% for double the positional
error, P9→P8 another −1.3% for double again — and that error is the figure the
caption quotes, so POSITION is spent only where a rung needs a visibly coarser
shape. And **the floor is connectivity**, which is the honest ceiling on this
whole axis and the reason decimation (#1853) is a separate piece of work.

P7 N3 was never offered even when the ladder had five rungs: 34.29° of normal
error is where shading stops describing the surface, so the model reads as
blotchy rather than as coarse. What #1854 establishes is that the two rungs
above that line were not worth their damage either — a caption reading "19 mm"
or "75 mm" against a 4.65 mm one, for 8% of a Snowdon-sized file.

`public/index.ifc` → GLB is the second model and shows the other limit: at
6,800 B it is JSON and header, so **every** rung lands within 3% of every
other (P12 N8 1,252 B, P10 N6 1,224 B, P8 N4 1,212 B) while the printed bound
goes 18.19 mm → 72.80 mm → 292.07 mm over its single 86 m primitive. On a
model that small the lossy rungs are all cost and no benefit, which is exactly
what the measured size beside each codec in the dropdown tells the user.

`TEX_COORD` and `COLOR` were swept too and are **not** named — Share's writers
emit POSITION, NORMAL, `_EXPRESSID` and `_INSTANCEID` and nothing else
(`viewer/ifc/flatMeshToBufferGeometry.js`, `batchedSubset.js`), so both
measured byte-for-byte identical on both models, and a key that cannot move a
byte on any artifact Share writes is a key the allowlist would carry for
nothing.

**Quantization bottoms out at the triangle count.** The whole axis is worth
about −56% on Momentum before the geometry is gone, and ~−12% on a real large
model. A *dramatically* smaller file needs mesh **decimation** (#1853) —
`@gltf-transform/functions`' `simplify()` reorders triangles and
`BLDRS_face_ids` indexes identity by triangle position, so it cannot simply be
switched on here — or it needs the container, which is where #1854 went.

Four knobs are deliberately **not** exposed, each measured
(#1848 §4): `quantizationVolume: 'scene'` (4× worse RMS at equal bits, worst
on the large-site/small-part models it would be sold on — `'mesh'` stays);
`quantizationBits.GENERIC` (safe today only because `_EXPRESSID`/`_INSTANCEID`
are `Uint32Array` and take Draco's integer path, where bits are ignored; the
same attribute typed FLOAT came back corrupted at the pinned 12-bit default);
the Draco `method`, which stays derived from `needsTriangleOrder`; and raw bit
spinners.

The caption under the size line says what the rung costs **this** model.
Draco quantizes `POSITION` over the largest axis of each primitive's own box
(`quantizationVolume: 'mesh'`), so the worst-case displacement is
`(√3/2) × range / (2^bits − 1)` — arithmetic over the accessor `min`/`max`
already in the JSON chunk
(`loader/glbArtifactSize.js#positionQuantizationRange`, which keeps the size
read's promise of never touching BIN). Verified as a true upper bound:
predicted 1.163 mm against 1.056 mm measured at 14 bits, 4.653 against 4.067
at 12. The *maximum over primitives*, never the scene bounds — the
batched-native artifact's positions are in local geometry space, so a 5 cm
bolt quantizes in a 5 cm box however large the site is, and scene bounds would
quote a grid four times coarser than the file has. Meshopt gets no millimetre
figure because it has none to give: "geometry exact; shading normals rounded".

The printed figure rounds **up** at whatever precision it shows, never to
nearest (`exportQuality.js#formatMaxShift`). "up to X" is a bound, and to
nearest it stops being one: 4.64 mm printed as "4.6 mm" and 10.49 mm as
"10 mm" both promise less movement than a vertex can really take. Overstating
by under one display step is the safe direction; understating is a caption the
file breaks.

Quality joins portable × codec in the estimate cache key
(`export/artifactSizes.js#rewriteKey`) — but only when an encoder actually
runs, or the uncompressed cell would split three ways and Portable+None would
run the whole rewrite once per rung for three identical files.

**Compress download** (#1854) is the fifth option and the last rewrite to
run, because it wraps whatever the other four produced. `export/glbGzip.js`,
`CompressionStream('gzip')`, no dependency — and on a real model it is the
largest win the panel has, for the reason above: the container is ~92% of a
Snowdon-sized Draco export and gzip takes ~6× off it losslessly, where the
whole quality ladder was worth −12.4% with visible damage.

Reproduced here through the pinned encoders, raw against gzipped:

| model | none | Meshopt | Draco |
|---|---|---|---|
| `Momentum.ifc` → GLB, 1,959,196 B | 1.81× | 1.56× | 1.15× |
| `public/index.ifc` → GLB, 6,800 B | 5.11× | 2.26× | 1.47× |
| instance-heavy synthetic, 622,480 B | 3.16× | 1.14× | 3.08× |

The third row is the shape the batched-native writer actually produces and it
carries the finding that shapes the code: **gzip changes which codec wins**.
Meshopt 198,536 B beats Draco 527,316 B raw, and Draco 171,452 B beats Meshopt
173,721 B gzipped — Draco leaves the instance transforms as raw float32 (whole
file 3.08×) while Meshopt compresses them into something gzip cannot touch
(1.14×). So the background sweep (§4.4) takes `isGzipped` as a real axis,
measures post-compression bytes, and restarts on the toggle; ranking a gzipped
download on raw byte counts would recommend the wrong codec on exactly the
artifacts Share writes.

Four decisions behind it:

- **It is not a fourth axis on the compressed-export cache.** That key space
  was already a review finding, and gzip is a cheap deterministic post-step on
  a cell that already exists. So the bytes cache stays keyed
  `portable × codec × quality`, and a parallel map holds two INTEGERS per cell
  under the same key. The download re-gzips (`artifactSizes.js#gzippedExport`)
  rather than holding a third copy of the file; `gzipBytes` gives the same
  bytes twice, so the figure the user read is the file they get, and
  `exportGlb.spec.ts` checks that end to end in a real browser. The property
  needed is weak — two calls to one function, in one page, on one
  implementation — so nothing depends on two browsers' deflate agreeing.
- **Gzip has no header shortcut**, so codec None with Portable off — the one
  selection whose estimate was a `File.slice` — becomes a whole-file read, and
  the size line shows *Estimating…* for it. `holdsBytes` in `codecSizes.js`
  learns the same thing, or a beaten `none` would leave the whole export
  resident.
- **The 50 MB auto-measure threshold does not move.** Gzip measures ~35 ms/MB
  and the sweep gzips both metadata sides of three codecs, so at 50 MB it adds
  roughly six seconds of wall clock — real, but not what that constant guards.
  The threshold bounds UNINTERRUPTIBLE work: the wasm encoders block the thread
  in one run, while `CompressionStream` is fed a megabyte at a time and awaited,
  so it yields ~60 times on a 60 MB file and the Stop button stays live.
- **`.glb.gz`, and hidden where it cannot be done.** Both extensions, not a
  swap — it is what a web server would serve and what an unarchiver expects,
  and `.glb` in the middle says what is inside. The name is stamped from what
  the host hook *did*, never from what was asked for, so a browser without
  `CompressionStream` (Safari before 16.4) produces a plain `.glb` named
  `.glb`; the toggle is not rendered there at all, and a "Download again" row
  replaying `gzip: true` degrades the same way rather than shipping
  uncompressed bytes under a `.gz`.

**Share now re-opens its own `.glb.gz`, by drag-and-drop or the Open dialog's
Local tab — see §4.7**, which also records why this section previously said it
would not, and what of that argument survived.

**Portable** (#1843) is the fourth option, and like compression it is a host
rewrite the pro module only calls: `export/glbPortable.js#rewriteGlbPortable`.

The default export IS the batched-native artifact (§1.1) — one glTF mesh per
unique geometry CONTENT × source colour (§1.1b), every placement carried by
`EXT_mesh_gpu_instancing`, and the element names in `BLDRS_spatial_tree`
rather than in glTF nodes. That is the right shape for Share's reader and the
wrong one for everyone else: the writer marks the extension
`setRequired(true)`, so **3dviewer.net refuses the file outright** rather than
degrading, and the three.js editor shows a flat list of `mesh_N` where Share
shows Bldrs › Build › Every › Thing (the #1837 smoke).

The rewrite expands it into a plain scene graph: one node per spatial-tree
element, named by `reifyName` — the NavTree's own rule, so the two agree,
which means **`LongName` beats `Name`** — falling back to the prettified type
plus the expressID (`Wall #12`; there is no `GlobalId` to use, since
`BLDRS_spatial_tree` does not carry one and the only copy lives in
`BLDRS_element_properties`, whose whole design is to inflate lazily per
block). Each placement becomes a child node with the instance's TRS,
referencing the **shared** mesh — glTF nodes may share a mesh, so only JSON is
duplicated and the geometry bufferViews are copied byte for byte. An element
with one placement and no children carries the mesh and the transform itself,
so a leaf is one node and not two. Instances join to tree nodes on
`parents[j]`, refined by `occurrencePaths[j]` for STEP (not `occurrenceIds`,
which is a global emission-order index); anything unmatched lands under one
synthetic `Unassigned` root rather than out of the scene.

Three things it must also do, each of which was got wrong or nearly so:

- **Clear the name from `extensionsRequired` as well as `extensionsUsed`.** The
  required list is the one that makes a viewer refuse rather than degrade.
- **Reclaim the orphaned TRS accessors.** Three float accessors per node
  become unreferenced, 40 B per instance — 4 MB on a 100k-instance model — and
  nothing downstream prunes them: `@gltf-transform` keeps an orphaned
  bufferView and the strip only looks at `BLDRS_*` references. The rewrite
  removes the accessors, re-indexes what survives, and reuses
  `glbArtifactSize.js#dropBufferViews` so there is one compaction and not two.
- **Stamp `extras: {bldrsTableNode, bldrsInstance}` on every mesh-bearing
  node.** It is the only way back from a plain Mesh to its row in
  `BLDRS_instance_tables`; without it a portable file is permanently
  un-hydratable by Share.

Raw glTF JSON, not a `@gltf-transform` Document: that library drops every
extension its IO has not registered, so a Document round trip would re-pay the
detach/re-inject dance above and re-serialise the whole BIN, and raw JSON is
what makes "the geometry is byte-identical" provable per accessor.

**Order: portable → codec → strip** (`export/artifactSizes.js` owns it).
Portable must precede the strip, which removes the very payloads it reads, and
any codec: under Meshopt a bufferView addresses decoded bytes on a fallback
buffer the file does not carry, and under Draco the TRS floats are not floats.

**What it costs, measured.** On a synthetic 100k-instance artifact (200 unique
geometries, one element per instance in the spatial tree): the JSON chunk goes
from 210 KB to 14.2 MB — **~140 B per instance** — against 4.0 MB of TRS
accessors reclaimed from BIN, so **~100 B per instance net**. Neither codec
compresses the JSON chunk, so that cost is the same at every compression
setting. On a model whose geometry dominates it is a rounding error; on a
geometry-light, instance-heavy model it can multiply the file (the synthetic
one goes 5.4 MB → 15.4 MB, because 200 triangles is all the geometry there
is). Meshopt on that same synthetic pair makes the point sharply: it takes the
native file 5.4 MB → 2.5 MB and the portable one 15.4 MB → 15.5 MB — very
slightly *larger*, since the codec cannot touch the JSON chunk and adds a
per-bufferView extension entry to it. That is why the toggle is **off by
default** and captioned as a choice rather than a recommendation. The rewrite
itself is ~1.6 s for 100k instances.

**Round trip back into Share, plainly:** the nav tree and Properties survive
(they hydrate from the root `BLDRS_*` entries and are indifferent to the node
graph), and since #1849 **so does picking**. It did not at first:
`instancedGlbToBatchedModel.js#joinNodesToTables` joins on
`obj.isInstancedMesh`, a portable file has plain Meshes by construction, and
the hydration failed soft to a plain — and, on a colourless model, grey — GLB.
The stamped `extras` are what made fixing that possible.
`joinPortableNodesToTables` is the second reader: it regroups the stamped
plain Meshes per table row and reads each one's WORLD matrix (portable nodes
are nested, so the parent chain is part of the placement) where the instanced
join reads `InstancedMesh.getMatrixAt`. From `buildPartition` down the two
shapes are the same code, so a portable file rehydrates to the same decorated
`BatchedMesh` — same `instanceParents`, same matrices, same palette — as the
batched-native artifact it was rewritten from. `detectArtifactShape` picks the
reader off the file (one stamped `InstancedMesh` means native, anything else
takes the portable reader, whose totality check refuses what it cannot cover),
so no flag has to travel with the bytes — the same artifact-not-source
principle #1844 established. Fail-soft is unchanged: missing or partial
stamps, a row index out of range, or no tables all keep the plain GLTFLoader
model.

Options surfaced in the UI: *Include Bldrs metadata (properties, spatial
tree)* — default **on** (it's their model; the toggle exists for onward
sharing) — *Portable* — default **off** (see the measured cost above) —
*Compression: None / Meshopt / Draco* — default **None** (the
file opens everywhere; the other two need the matching decoder registered in
whatever the user opens it with) — and *Compress download* — default **off**
(a `.glb.gz` is not a `.glb`). Share itself is one of those viewers:
`Loader.js#newGltfLoader` carries both decoders unconditionally (they were
gated on the cache writer's `glbDraco` / `glbMeshopt` flags, so a compressed
export failed to open in Share — the #1837 smoke), and the export E2E opens
each compressed download back through the Open dialog. Both smoke findings on
the round trip are now addressed: element picking on a re-opened Bldrs GLB
(#1844 — the hydration gates keyed off the cache, not the file) and the
portable, de-instanced export above (#1843), whose own round trip is pickable
as of #1849.

### 4.4 UI

Lives in the **Save dialog** (`src/Components/Open/SaveModelControl.jsx`), on
an **Export** tab beside a tab labelled **GitHub** — one place for "get this
model out of here", reached from the toolbar control the user already
associates with producing a file. (S2/S3 put it in the Share dialog and the
Profile menu; smoke feedback on #1837's preview moved it, #1838.) The dialog
keeps its "Save" title; only the tab is named GitHub, since "Save" as a tab
label duplicated that title and said nothing about where the save goes
(further #1837 preview feedback, #1838). The tab bar is `Components/Tabs.jsx`,
the Open dialog's pattern, and it only exists behind feature flag `export`
(default off, `?feature=export`) — with the flag off the Save dialog has no
tabs and is exactly what it was.

Both panels share one gutter system: 1em between the tab bar's bottom border
and the panel's own content (`SaveModelControl.jsx`'s `TAB_PANEL_SX`, applied
to both panel wrappers), and 1em between that content and the panel's action
button. Both action buttons render **accent-coloured and in sentence
case** — `variant='contained' color='accent' sx={{textTransform: 'none'}}`,
the same look as the Open dialog's "Connect GitHub" button — after a grey,
all-caps button on the #1837 preview read as disabled when it wasn't
(#1838).

The Export tab hosts `Open/ExportSection.jsx` — the metadata toggle, then the
**Portable** toggle, then the **Compression type** choice, then the **Quality**
rung, then **Compress download**, then the **download size** for the state
those five are in, then **Export GLB last and centred**, with the Pro chip for
a free user riding beside it. That order is the order the choices compound in
— what goes in the file, what shape it is in, how it is squeezed, how hard,
and whether the result travels in an archive — and it is the order
`export/artifactSizes.js` runs them in. Compress download is last for that
reason rather than beside the metadata toggle it otherwise resembles: it is the
only control that wraps the output of all the others, and it sits directly
above the size line it changes most.
Compression type is a dropdown (`Select`: None / Meshopt / Draco) because the
codecs are alternatives, not independent options — it began as a
`ToggleButtonGroup`, whose three side-by-side buttons were the widest control
in the dialog and read as a run-on word under the theme's toggle styling
(owner feedback on #1842). The menu items carry the per-mode test ids.
Quality (Best (larger) / Balanced (medium) / Reduced (small), §4.3) is a
second dropdown directly under it, **disabled rather than hidden** while Compression is None — showing it
only once a codec is picked would change the panel's height under the user's
cursor at the moment they reach for the next control. Under the size line it
captions what the rung costs *this* model: "parts may move up to 4.7 mm;
shading normals rounded" for Draco, "geometry exact; shading normals rounded"
for Meshopt, which has no distance to quote.

Every label block in the section is **left-aligned** (#1842). The theme centres
a Dialog's whole paper (`theme/Components.js`, `MuiDialog.paper.textAlign`),
which made each two-line block float its shorter line under its longer one —
"Download size" sat off-centre above its own caption. The fix is
`textAlign: 'left'` on this section's own Stack, not a theme-wide change; the
action row below re-asserts `center`.

The size line ("Download size … 12.4 MB", captioned "3.1 MB of Bldrs metadata
included/removed") follows both controls. Uncompressed, it is computed when
the tab opens, from a `File.slice` of the artifact's header —
`loader/glbArtifactSize.js#artifactSizesFromFile` reads the container's chunk
length for the with-metadata figure and strips the parsed JSON chunk for the
other, never touching the BIN chunk, so a 400 MB model costs a header read
rather than a stall (#1841). Both figures are exact: the same strip the export
runs.

**Portable is not free, even with no codec.** The header-only read above never
touches the BIN chunk and the rewrite has to — it reads the instance TRS
floats and ungzips two payloads out of it — so Portable takes the same
whole-file path a codec takes and shows *Estimating…* while it runs. The
estimate cache in `export/artifactSizes.js` is keyed
`` `${portable ? 'portable' : 'native'}|${mode}` `` — plus `|${quality}`
whenever an encoder actually runs (§4.3) — for that reason: portable and
native are different FILES at the same codec, two rungs are two different
files again, and a shared cell would quote one and download the other. `useExport.js#compressHookFor` supplies the
hook whenever `portable || codec` rather than for a codec alone, and
`artifactSizes.js#runRewrite` behind it does the metadata strip for the
portable-without-codec case, since the pro module runs no strip of its own
once a hook is in play.

**Gzip rides on the same cache without widening it.** When *Compress download*
is on, every figure the panel shows — the size line and each codec's figure in
the dropdown — is the `.glb.gz` length, measured on the cell above and stored
as two integers under the same key (§4.3). The metadata toggle stays free: one
estimate gzips both sides, so flipping it still moves every figure without an
encode.

**Compressed, the estimate is the compressed file.** The size of a Draco or
Meshopt file is a property of the encoder, not of the input, so there is no
honest shortcut: picking a codec reads the whole artifact, encodes it once,
and reports the byte lengths of the two files that came out. The line reads
*Estimating…* while that runs — a stale figure from the previous choice is a
promise about a file the next click would not produce — and the bytes are
cached per (artifact, portable × codec × quality) in
`export/artifactSizes.js`, so the export that
follows hands over the very bytes whose length the user just read rather than
re-encoding and hoping the two agree. A click fast enough to beat the estimate
shares its in-flight run. Sizes are otherwise cached per published
artifact and absent while unknown — no placeholder that flashes a number and
then corrects itself. The panel carries no "Exports" heading of its own; the tab is
already labelled Export. The dialog's footer action button belongs to the
GitHub tab only: the Export tab's actions are its own buttons.
`Open/ExportsList.jsx` (§4.5) is **not mounted here for now** — the owner
took "My Exports" back off the panel after the #1837 preview (#1838); the
component and the recording pipeline behind it stay.

**Every codec is measured in the background** (#1850), because *which codec
wins swings with model shape and swings against intuition*. Measured:
Momentum.ifc → GLB gives Draco 250,184 B against Meshopt 1,347,740 B; an
instance-heavy synthetic gives Draco −17.3% against Meshopt **−68.0%**. Draco
encodes mesh primitives only and cannot reach `EXT_mesh_gpu_instancing`
accessors at all — and instance-heavy is exactly what the batched-native
writer produces. A user picking on reputation picks wrong about half the time,
and the panel already knew the answer.

So while the tab is open, `export/codecSizes.js` measures each codec's real
output and `export/useCodecSizes.js` wires it to React. Each figure is
appended to that codec's dropdown **option** as it lands (never to the closed
control — at 390px a size beside the label would ellipsize away the half that
matters), and when the last one arrives the panel selects the smallest.

Six constraints shape it, and they are the design:

- **Sequential, cheapest first, releasing as it goes.** Each estimate cell
  holds two whole copies of the export, so a naive sweep would leave three
  codecs' worth resident beside the source. The loop awaits each estimate and
  releases a codec's bytes (`artifactSizes.js#releaseCompressedExport`) the
  moment its figure loses, keeping **at most two** in memory: the best
  measured so far and the one in flight. The order — none, Meshopt, Draco — is
  measured, not guessed: on Momentum, `none` is a header read, Meshopt encodes
  at ~33 ms/MB from a module already in the bundle, Draco at ~135 ms/MB behind
  a second wasm the page has to fetch. The **winner is kept**, so the
  selection that follows lands on a filled cache and the export hands over
  those very bytes. Two cells rather than one is the deliberate trade: Meshopt
  is measured second and wins on instance-heavy artifacts, so a sweep holding
  only the last-measured codec would drop the winner and make the panel
  re-encode up to 50 MB on the main thread the instant it selected it. One
  cell is exempt: the codec the user has SELECTED, passed down as `keepCodec`
  and read at each release rather than captured when the run starts, since
  they can pick one mid-sweep. Freeing that one is unrecoverable from
  outside — the selection has not changed again, so nothing re-estimates.
- **Nothing coordinates what survives a run; it is reconciled.** Releasing as
  it goes bounds ONE sweep, which knows its own order. What should still be
  resident *afterwards* depends on the panel's selection and on whether
  another sweep has superseded this one, and #1852 spent three review rounds
  failing to express that as a handoff — a winner kept and never freed, then a
  release slot raced across sweep generations, then a slot claiming the
  winner while the user was looking at a codec of their own. The panel instead
  states the set it still needs, and everything else for that artifact goes
  (`artifactSizes.js#retainOnlyCompressedExports`): the cell behind the figure
  on screen, plus — only while `codecToSelect` says the dropdown is about to
  move onto it — the sweep's winner. Both come from the same call the
  auto-selection makes, so the two cannot disagree and their order does not
  matter; a superseded sweep finishing late just makes the panel state the
  same set again. It runs on a selection or axis change and on unmount, never
  mid-run, and it subsumes the per-rung eviction that used to enumerate the
  codec × Portable product by hand.
- **Nothing starts above ~50 MB.** ~170 ms/MB across the whole axis, and it is
  not interruptible, so 50 MB is about eight seconds of main-thread work.
  Above the line the panel shows "Codec sizes not measured" and a **Calculate
  sizes** button.
- **Cancel stops the QUEUE, and says so.** `@gltf-transform`'s `writeBinary`
  drives both wasm encoders synchronously and neither exposes an abort, so
  mid-encode cancellation is not available short of terminating the thread.
  The control is therefore labelled **Stop**, and once pressed the status line
  reads "Finishing Draco…" rather than pretending the CPU is idle — a Cancel
  that leaves the work running while claiming otherwise teaches people the
  control doesn't work. Whatever was already measured stays on the dropdown
  and stays usable. Between codecs the scheduler yields to the event loop,
  which is what lets the click be seen at all and what keeps each new figure
  painting as it arrives.
- **The codec axis only.** With Quality (§4.3) and Portable the matrix is
  codec × quality × portable × metadata; the sweep runs the codec axis at the
  *currently selected* quality and Portable setting and restarts — cancelling
  first — when either changes, because every figure it published was measured
  at the old one. The restart cancels but cannot stop the codec already
  running, so the publishing callbacks are gated on **generation**, not on the
  abort (`useCodecSizes.js`): a figure that lands after **Stop** is still this
  sweep's and is kept, while one from a superseded sweep is dropped. Written
  as "not aborted" the two collapse together and one of them breaks —
  either Stop throws away a figure already paid for, or `sizesByCodec` ends up
  holding one figure from the old rung beside two from the new one, which is
  the set the auto-selected winner is read off. The metadata toggle is
  deliberately **not** a restart axis: one estimate produces both sides, so it
  keeps moving every figure for free.
- **An explicit choice is final.** A codec the user picked is never overridden,
  however small a later figure turns out to be. That hangs off the MenuItem's
  own `onClick`, not the `Select`'s `onChange`, because MUI fires `onChange`
  only when the value *changes* — and re-picking the codec already showing,
  having just read the three sizes, is exactly how a user says "this one, stop
  moving it".

`export-section` carries `data-codec-sizes` — the modes measured so far, in
order — so an E2E can wait for the sweep before touching the codec control
(`tests/e2e/export.ts#waitForCodecSizing`); a click racing the auto-selection
reads a dropdown that moved under it.

**Gated actions.** An action the user can't take *yet* is not hidden. It
renders in its normal place in a disabled LOOK, stays clickable, and the
click opens help saying what unlocks it, with the unlocking action as a
button. `Components/GatedAction.jsx` is the one implementation: `aria-disabled`
plus dimming on a focusable wrapper that owns the click, `pointer-events:
none` over the child, and NO DOM `disabled` attribute — a truly disabled
button swallows the click, and the help would never open. Test ids:
`gated-<slug>` on the wrapper, `gated-help` on the popover,
`gated-help-action` on its button.

| Action | Unlocked by | Help | Unlocking action |
|---|---|---|---|
| **Save** (toolbar, signed out) | signing in to a connector (GitHub today; Drive per identity-decoupling) | "Log in to one of your connectors to save models" | Log in → `LoginDialog` |
| **GLB export** (Save → Export, signed in, free) | Pro subscription | "Exporting a GLB needs a Pro subscription" | Upgrade to Pro → `Profile/subscriptionNav.js` |
| **GLB export** (signed out — defensive; the dialog only opens signed in) | logging in | "Log in to export this model as a GLB" | Log in → `LoginDialog` |
| **Private sharing** (Share dialog, `sharing` flag) | Pro subscription | "Private links need a Pro subscription" | Upgrade to Pro |

The private-sharing row is the pattern's third instance and lands with the
sharing epic's visibility control — there is no such control in
`ShareDialog.jsx` yet.

The Export GLB button's own states, resolved in this order:

| State | Button | Click |
|---|---|---|
| no model / no artifact yet (`glbArtifact` null, writer in flight) | disabled, "Preparing GLB…" | — |
| not signed in | gated look + lock | help → log in |
| signed in, not Pro | gated look + lock + `Pro` chip | help → subscription flow |
| Pro | "Export GLB" | `useExport().run('glb')` → progress → browser download → snackbar "Exported <name> (<size>)" |
| module load 401/403 | error snackbar "Export requires a Pro subscription" + re-check tier | server said no; the client badge was stale — force-refresh the JWT like `useQuota` does |

The Pro check on the client uses `getTier(appMetadata, isAuthenticated) ===
TIERS.PAID` **for the UI only**; the function is the authority.
`gtagEvent('export_gated', {reason})` fires when the help OPENS, which is the
moment the user met the gate.

Those status snackbars have to be readable while the dialog that started them
is still open, so `theme/Theme.jsx` puts `zIndex.snackbar` (2100) above
`modal` (2000) — MUI's defaults have the opposite order once `modal` is
raised — and `Components/Dialog.jsx` gives the paper a bottom inset and a
`maxHeight` on mobile, sized for the collapsed snackbar band, so a tall
dialog scrolls inside itself instead of sharing pixels with the message.

Download mechanics: `URL.createObjectURL(blob)` → `<a download>` click →
revoke. Safari ≤ 16 ignores `download` on blob URLs in some configurations
and opens the file inline; the smoke checklist (§8) covers it, and the
fallback is `window.open(blobUrl)`.

### 4.5 Tracking ("my exports")

Two layers, mirroring quotas (`design/new/quotas.md`):

- **Server (authoritative for signed-in users):** `record-export.js` —
  Bearer + Pro check, then append `{id, key, title, format, bytes,
  exportedAt}` to `app_metadata.exports`, newest first, capped at 100
  entries (Auth0 `app_metadata` has a 16 KB soft ceiling; 100 × ~150 B is
  well under). Returns `{exports}`. Same read-modify-write caveat as
  `record-load` (last-write-wins; loss direction is a missing history row,
  never a wrong gate).
- **Client:** `src/export/exportHistory.js` keeps one mirror file per
  account, `exports.<encodeURIComponent(sub)>.json`, at the OPFS root (raw
  `navigator.storage.getDirectory()`, no worker dependency — the quota lib's
  pattern) as the instant-display mirror and the offline fallback. Per
  account because OPFS is partitioned by ORIGIN: a single `exports.json`
  would show the next Auth0 account on that browser the previous user's
  titles and share paths, and hand it their `cacheKeyArgs` — i.e. their
  cached artifacts — through "Download again". Every entry point
  (`loadExports` / `saveExports` / `subscribeToExports` / `recordExport` /
  `hydrateExports`) takes the sub; no sub reads empty and writes nothing.
  There is no migration off the old root `exports.json` — the feature is
  flag-gated and unreleased, and a signed-in user's rows come back through
  the `app_metadata` hydration below.
  The JWT is force-refreshed after a successful record AND the claims it
  comes back with are applied to `store.appMetadata` (`useExport` decodes it
  through `Auth0/appMetadata.js`, the same claim `BaseRoutes` reads) — the
  refresh alone only updates Auth0's token cache, so the store kept the
  pre-export list and the hydration below then dropped the row that had just
  been recorded. As shipped, the local row is written FIRST
  and the server's response then replaces the list — the file is already in
  the user's Downloads when `recordExport` runs, so a 401/403/5xx/offline
  keeps the optimistic row and reports `{recorded: false}` rather than
  losing the entry. The recorded `key` is the share path
  (`window.location.pathname`), matching what `record-load` counts.
- **UI (dormant):** `Open/ExportsList.jsx` — written to render inline under
  the Export GLB button on the Save dialog's **Export** tab (§4.4), and
  currently mounted nowhere (§4.4): the design below stands and the rows keep
  being recorded, but nothing displays them until the list comes back. Its
  jest suite stays; its E2E (`Profile/myExports.spec.ts`) went, since a spec
  for UI that nothing mounts has no subject.
  Signed-in only, and behind the same `export` flag. It is a plain list, not
  a dialog: mounting IS the "open" signal, so the mirror subscription lives
  exactly as long as the list is on screen, and an export made while the tab
  is open appears under the button that made it. Rows: title, format chip,
  size, relative date, source path (click → navigate to the model). A "Download again"
  action re-runs the export **if** the artifact is still in OPFS
  (`doesFileExistInOPFS` on the recorded key + current schema); otherwise
  the row says "open the model to regenerate". Empty state explains the
  feature and points at the Export GLB button above it.

  One thing the sketch above missed: the server row can't produce that OPFS
  key. A share path has no `sourceHash`, which every `sourceCacheKey.js`
  adapter folds in, so the LOCAL row additionally carries `cacheKeyArgs` +
  `schemaVer` — never sent to the server, re-attached BY ROW ID when the
  server's list is mirrored over the local one (key + format survives only
  as the one-to-one fallback for legacy rows that predate the client id —
  an id-bearing local row the server lacks is one it never accepted, and
  is never paired with a later export of the same model; matching on key
  alone gave every export of one model the newest row's cache key and
  options). The shared in-flight flag is held until the record settles, not
  just until the download fires, since it exists to serialise the mirror's
  read-modify-write. "Download again" therefore
  needs both halves: those fields AND the artifact still on disk. A row
  synced from another device has neither and always offers regeneration.
  `useExport().run(format, options, source)` gained the third argument so
  the dialog can export a model that isn't the one on screen.

  The local row also carries the `options` that export RAN with (the third
  browser-only field, re-attached by the same mirror), and "Download again"
  replays them. Without that the re-download silently uses the defaults, so
  a user who exported with the metadata stripped gets a bigger file carrying
  every `BLDRS_*` payload back — under a row whose size says otherwise.

  Mounting the list also **hydrates the mirror from `app_metadata.exports`**
  (`hydrateExports`), read off `store.appMetadata` — the claim `BaseRoutes`
  decodes. A new device, a new browser profile or a cleared cache otherwise
  shows an empty list although the account's rows exist server-side. The
  merge is the one `recordExport` applies to a record response (server list
  wins, browser-only fields re-attached by row id), and an absent or
  empty claim list is a no-op rather than a wipe. Server-wins is not
  older-wins, though: a claim is a JWT snapshot and can lag the mirror, and a
  row whose `record-export` never landed is in no claim at all. What survives
  the merge on top is decided by STATE, not by wall clock (#1840): the
  optimistic row carries `recorded: false` until the server hands it back
  (rows that come from a server list carry no such field), and every
  unrecorded row is kept however its stamp compares. Comparing the two — the
  local stamp is the browser's, the claim's the server's — dropped exactly the
  offline rows the fallback exists for on any machine whose clock trails.
  Bounded as before: a RECORDED local row the claim lacks is one the server
  pruned, and resurrecting it on every open is the opposite bug. That bound
  costs the case where a successful record's JWT refresh also failed — the row
  reads as pruned and waits for the next page load — which is why `useExport`
  applies the refreshed claim. Nothing re-POSTs a pending row; it stays
  pending, and the same merge runs on the record response so a later
  successful export doesn't wipe it. Hydrated rows the server
  alone knows about offer regeneration, as before.
- **Analytics:** `gtagEvent('export_model', {format, bytes_bucket,
  source_kind})` on success — `source_kind` is the loader's categorical kind
  (`github` / `local` / `upload` / `external`), carried on the `glbArtifact`
  slot by both producers, NOT the cache key's `ns1` (the repo owner on
  GitHub, a constant everywhere else) and `gtagEvent('export_gated', {reason})` on a
  login/upgrade redirect — the funnel signal for the pricing page.

### 4.6 Hardening summary

- Export code exists only in `netlify/functions/_pro-modules/` (gitignored
  build output) and in the memory of a page that presented a valid Pro
  token. No sourcemap, minified.
- The function verifies the bearer against Auth0 `/userinfo` on every
  request, reads `app_metadata` through the Management API (never trusts
  the JWT claim the client already has), and answers `403` for non-Pro,
  `401` for no/invalid token. Denials are Sentry-tagged with the sub.
- Response headers: `Content-Type: text/javascript`, `Cache-Control:
  private, no-store`, `X-Content-Type-Options: nosniff`. The client revokes
  the blob URL after import and holds the namespace in a module-scope
  `Map` only (gone on reload).
- Dev bypass follows `_lib/auth0.js`: with `AUTH0_DOMAIN` unset the
  function serves the module and fires the existing one-shot Sentry
  warning — same as the OAuth broker functions.
- What this is not: a Pro user can copy the module text from devtools.
  That's the same exposure as any client-side feature and is accepted; the
  line held is *distribution*, which is what the pricing depends on.


### 4.7 The way back in: opening a `.glb.gz`

This section reverses a decision §4.3 used to record. The old text: *"Share
does not re-open its own `.glb.gz`, deliberately. `DecompressionStream` would
be cheap, but `.gz` is a transport encoding and not a model format: accepting
one means a `supportedTypes` entry, a `findLoader` arm and header sniffing that
every source adapter (upload, GitHub raw, Drive) would have to agree on."* The
owner asked for the round trip anyway, scoped to **drag-and-drop and local
open of our own export**, and the argument's premise turned out to be the
design rather than the objection: because `.gz` is a transport encoding, the
way to accept it is to **decode the transport and never name it a format**.
There is still no `supportedTypes` entry and no `findLoader` arm.

`loader/gzipEnvelope.js` owns it, at two seams:

- **Upload** — `inflateIfGzipEnvelope(file)`, called by `utils/dragAndDrop.js`
  and `utils/loader.js#loadLocalFile` **before** the file reaches OPFS. What
  gets cached and named `<blob-uuid>.glb` is then really a GLB, so every later
  reader of that entry — a re-open from Recents, a save, a size report — sees
  what its name says, and no `.gz` ever enters the app's URL space.
- **Load** — `decodeGzipEnvelope(modelData, loader.type)`, one line in
  `Loader#load` just before `readModel`. This is the net under every path the
  upload seam cannot reach (below), and the reason the sniffer can afford to
  be honest: once `analyzeHeader` answers `glb` for gzipped bytes, anything
  that skipped the upload seam would otherwise hand a gzip member to the GLTF
  parser and fail somewhere deep in it.

The supporting changes, each small:

- **`Filetype#analyzeHeader` looks inside one gzip envelope.** The magic
  `1f 8b` already had a branch (SPZ splats are gzip streams); it now inflates
  the sniff window through fflate's streaming `Gunzip` — which tolerates a
  truncated member, and keeps `analyzeHeader` synchronous — and re-analyzes
  what comes out. SPZ is checked first and is *not* an envelope: gzip is that
  format's own container and its decoder wants the member. One level only, so
  a `.gz.gz` reads as unknown.
- **`Filetype#getValidExtension` strips one trailing `.gz`.** `model.glb.gz`
  is a `glb`, `MODEL.GLB.GZ` too; a bare `.gz` still throws, because there is
  no format in that name to find. `pathSuffixSupported` deliberately does NOT
  strip it — it gates the GitHub file browser's listing, and a GitHub-hosted
  `.glb.gz` is not openable (below).
- **`Filetype#guessTypeFromNameOrFile`** is the name-then-header answer both
  upload seams now use for the OPFS storage extension. It replaces the
  `split('.').pop()` that threw *"Cannot extract filetype from filename"* —
  the exact shape `.glb.gz` defeats. Name first, because the sniffer is
  conservative (binary STL has no magic at all) and the name is what the user
  chose.
- **`gunzipBytes` takes an optional `maxOutputBytes`.** gzip reaches ~1032:1,
  so a few MB of hostile input expands to hundreds of GB and an unbounded
  inflate ends the tab rather than the load. The ceiling is 512 MiB —
  ~8× the largest GLB this epic has measured (63.7 MB, Snowdon) — and it is
  enforced *during* the inflate: the drain reads the stream itself rather than
  `new Response(readable).arrayBuffer()`, which resolves only once the whole
  expansion is already in memory. The OPFS container reader (§1.1a) passes no
  ceiling: it wrote those bytes itself.
- **No `DecompressionStream`, no claim.** Safari before 16.4 — the same bound
  §1.1a has. The seam refuses with a sentence naming the browsers that can,
  rather than a stack trace out of a missing global, and the Local tab grew an
  `onError` callback so the Open dialog can alert it (the picker has already
  closed by then; nothing else was watching).

**The name is never rewritten.** The inflated file keeps the user's
`index.glb.gz` for the recents row and the load report's model line, while the
storage id under it is `<blob-uuid>.glb`. Those two have been distinct since
#1682 and this is one more reason to keep them so.

**What a `.glb.gz` does on the paths that are out of scope**, stated plainly
because "not required" is not the same as "no behaviour":

| path | what happens |
|---|---|
| drag-and-drop, Open → Local | **works** (both seams) |
| Recents, after either of those | works — OPFS holds the inflated GLB |
| locally hosted (`/x.glb.gz`) or a pasted URL | **works** via the load seam, as long as the name or the sniff resolves the type |
| GitHub (`/share/v/gh/.../x.glb.gz`) | **refused at the router.** `fileSuffixBoundaryRegex` needs the `.glb` at a path boundary and `.glb.gz` does not offer one, so the route never parses. The file browser does not list it either (`pathSuffixSupported` is false for it). Deliberate: extending the boundary regex would put `.gz` into route-space, which is what §4.3's objection was actually about |
| Google Drive (`connections/loadFromSource.js`) | **unverified.** That path has its own `split('.')` extension logic, which this change did not touch; a `.glb.gz` there stores as `<blob-uuid>.gz`, and whether the loader's sniff then rescues it depends on an `axios` ranged GET of a `blob:` URL that was not exercised. If Drive is ever brought in scope, route it through `guessTypeFromNameOrFile` like the other two seams |
| a gzipped TEXT-format model (`.obj.gz`, `.ifc.gz`) by URL | opens only through the upload seams. By the load seam the bytes are already a `TextDecoder` string, and gzip run through that is mojibake, not something to recognize |

**Tests.** `loader/gzipEnvelope.test.js` (both seams, against Node's real
`DecompressionStream`), `Filetype.test.js` (envelope sniff, `.gz` names,
name-vs-header), `export/glbGzip.test.js` (the ceiling, including that it
stops mid-inflate), `Loader.test.js` (a gzipped `cube.glb` through `load()`),
plus the two upload seams' own suites. E2E: *"a gzipped export opens back in
Share, with its BLDRS data intact"* in `Components/Share/exportGlb.spec.ts`
exports a `.glb.gz`, saves it under that name, brings it back through the file
chooser, and walks the NavTree to a leaf it can select — the `BLDRS_*`
extensions surviving the round trip is the claim, not merely that something
rendered. The Compress download caption changed with it: *"gzip — saves a
.glb.gz, reopens in Share"*.


## 5. Stages (→ sub-issues of the epic)

| # | Title | Delivers | Tests |
|---|---|---|---|
| S1 | Pro-module pipeline | `proModuleLoader.js`, `pro-module.js` function, `proModuleBuilds()` in build.js, `netlify.toml` `included_files`, dev/playwright copy, MSW handler, eslint import fence, `_lib/auth0.js#getAppMetadata(sub)` factored from `record-load` | jest: loader (blob import mocked), function handler (401/403/200/no-store); tools jest: build emits to `_pro-modules` and not `docs/` in prod |
| S2 | GLB export | `glbArtifact` store slot (writer + reader set, load clears), `pro/glbExport.entry.js`, `useExport`, `ExportSection` in ShareDialog, `export` flag, `subscriptionNav.js` extraction | jest: container→GLB, strip option; **E2E desktop+mobile** (`describeMobileAndDesktop`): Pro user opens a fixture, waits for the writer, clicks Download GLB, asserts a `.glb` download whose bytes start with `glTF`; gated states for anonymous and free |
| S3 | Export tracking | `record-export.js`, `exportHistory.js`, `ExportsDialog.jsx`, Profile menu item, analytics events | jest: history lib (prune/cap/OPFS-unavailable), function handler; **E2E desktop+mobile**: after an export the dialog lists it; "Download again" on a cached artifact |
| S2b | Placement + gated actions (#1838) | Export tab in the Save dialog (`ExportSection` + `ExportsList` moved to `Open/`), Save always visible, `GatedAction.jsx`, `zIndex.snackbar` + mobile dialog inset | jest: gated click still fires, tab hides the Save action, flag-off dialog has no tabs; **E2E desktop+mobile**: signed-out Save shows the help, free Export shows the Pro help, the export snackbar is visible and uncovered over the open dialog |
| S4 | Rollout | This doc folded back to shipped reality, `quotas.md`-style status block, wiki entry, flag flip, roadmap row `share-140` | smoke checklist §8 run on the deploy preview with a real Pro account |
| S5 | Further formats (spec only) | §6 matrix → one issue per format when scheduled | — |

S1 and S2 land in one PR (the smoke instance needs both); S3 follows on the
same branch if timing allows, otherwise its own PR. All behind `export`.


## 6. Other export formats

### 6.1 How a second format plugs in

Each format is a pro module (`src/export/pro/<id>.entry.js`) registered in
`exportRegistry.js` with `{id, label, ext, mime, moduleName, source:
'artifact' | 'scene', status: 'shipped' | 'planned'}`. Two sources:

- **`artifact`** — from the cached GLB bytes (GLB itself; anything a glTF
  → X transform can do). Dependency-free modules, as in S2.
- **`scene`** — from the live three.js `Object3D` (`store.model`). three's
  example exporters (`OBJExporter`, `STLExporter`, `PLYExporter`,
  `USDZExporter`) `import … from 'three'`, and bundling three into the
  module would create a second three instance next to the host's. The
  plan: build the module with `external: ['three']`, and have the host
  loader rewrite the `from"three"` specifier to a runtime-generated shim
  module (a `blob:` module whose text is `export const Vector3 = T.Vector3,
  …` over `Object.keys(THREE)` of the host's namespace, with
  `globalThis.__bldrsThree` set just before import). One shim, generated
  once, shared by every scene-source module. Prototype this in S5's first
  format before committing to it; the fallback is passing the exporter
  classes in from the host, which puts the exporter code back in the
  public bundle (acceptable for OBJ/STL — they are 200-line utilities —
  and not for anything we'd sell on its own).

### 6.2 Feature matrix

What each format can carry. ✔ native, ◐ partial / via convention, ✘ not
representable, — n/a. "Bldrs" columns mean the data Share round-trips today
through `BLDRS_*` extensions.

| Model feature | GLB (S2) | glTF + .bin | OBJ (+MTL) | STL | PLY | USDZ / USD | 3MF | IFC (re-export) |
|---|---|---|---|---|---|---|---|---|
| Triangle geometry | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ◐ (tessellated bodies only) |
| Instancing (batched-native) | ✔ `EXT_mesh_gpu_instancing` | ✔ | ✘ (must de-instance) | ✘ | ✘ | ✔ (references / point instancer) | ✔ (components) | ◐ (mapped items) |
| Per-element identity (expressID / occurrence path) | ✔ `_EXPRESSID` attr, `BLDRS_face_ids` / `BLDRS_instance_tables` | ✔ | ◐ `o`/`g` group names | ✘ | ◐ custom vertex property | ✔ prim paths / customData | ◐ metadata | ✔ (it *is* the id) |
| Source colours (per element) | ✔ | ✔ | ◐ MTL `Kd` per group | ✘ (binary STL colour is vendor-specific) | ✔ per-vertex | ✔ displayColor | ✔ | ✔ IfcStyledItem |
| PBR materials | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ UsdPreviewSurface | ◐ | ✘ |
| Hierarchy / spatial tree | ✔ `BLDRS_spatial_tree` (+ node tree) | ✔ | ◐ flat groups | ✘ | ✘ | ✔ prim hierarchy | ◐ | ✔ |
| Properties / psets | ✔ `BLDRS_element_properties` | ✔ | ✘ | ✘ | ✘ | ◐ customData (size!) | ◐ metadata | ✔ |
| Units + coordination frame | ✔ `scenes[0].extras` (metres) | ✔ | ✘ (unitless) | ✘ | ✘ | ✔ `metersPerUnit`, root xform | ✔ (units attr) | ✔ |
| Cut planes / hidden elements (view state) | ◐ `BLDRS_view_states` (designed, not written) | ◐ | ✘ | ✘ | ✘ | ◐ variants | ✘ | ✘ |
| Portable (named node tree, no required extension) | ✔ per export (#1843) — `~100 B`/instance net | ✔ | — (always de-instanced) | — | — | ◐ (prim hierarchy is native) | ◐ | — |
| Compression | ✔ Draco / Meshopt × Best / Balanced / Reduced, chosen per export (#1842, #1848, #1854) | ✔ | ✘ | ✘ (binary only) | ◐ binary | ◐ (USDZ is a zip) | ✔ (zip) | ✘ |
| Source | artifact | artifact | scene | scene | scene | scene (or server) | scene | — (needs Conway write support) |
| Effort | done in S2 | small (unpack GLB → JSON + bin) | small | small | small | medium (USDZExporter is texture-centric; instancing + metadata need work); server route if fidelity matters | medium | large — out of scope |

Reading the matrix: OBJ/STL/PLY are cheap and lossy (geometry-only;
identity survives only as group names), which is fine for "send it to a
slicer / Blender" and should be labelled as such in the UI. USD is the one
that preserves what Share knows (hierarchy, ids, units, colours) and is the
likely second premium format; its module is the one that decides whether
§6.1's shim approach holds. IFC re-export is a Conway feature, not an
export module.


## 7. Open questions

1. **Should free users get *one* export?** A single free export is a strong
   conversion moment (the quota design's "anonymous gets 2 loads" logic).
   It changes the function's gate from "Pro" to "Pro, or free with no
   prior export" and adds an `exports` read to the check. Not in v0.1;
   flagged for S4's rollout decision.
2. **`shareProPendingReauth`** — `GitHubFileBrowser` counts it as Pro,
   `getTier` doesn't. The function follows `getTier` (the quota authority);
   the UI badge follows `getTier` too. If pending-reauth users complain, fix
   `getTier`, not the export.
3. **Auth0 `app_metadata` as the export ledger** inherits the quota
   design's migration note (Netlify Blobs / KV when Management-API limits
   bite). Same table, same move.


## 8. Cross-browser smoke checklist (deploy preview, `?feature=export`)

For each of Chrome, Firefox, Safari (macOS), Edge, iOS Safari, Android
Chrome — with a real Auth0 account in each of the three tiers:

1. Open a sample IFC; wait for the load snackbar. Open Share → the Export
   section shows "Preparing GLB…" until the writer finishes, then enables.
2. Anonymous: click → login dialog. Free: click → `/subscribe/`. Pro:
   click → a `.glb` lands in Downloads (check the first 4 bytes are `glTF`
   and it opens in <https://gltf-viewer.donmccurdy.com/>).
3. Pro, DevTools → Network: `pro-module?name=glbExport` is `200`,
   `text/javascript`, `cache-control: private, no-store`; a second click
   does **not** re-fetch (memoised). Free user forging the request gets
   `403`; no token gets `401`.
4. Reload the page: the Export section is enabled immediately (cache-hit
   sets `glbArtifact`); export again → same bytes.
5. Toggle "Include Bldrs metadata" off → the file is smaller and its JSON
   chunk has no `BLDRS_` strings (`strings file.glb | grep BLDRS_`).
5b. Compression → Meshopt, then Draco: the line says *Estimating…*, then
   settles smaller; the download weighs exactly what it said; the file opens
   in <https://gltf-viewer.donmccurdy.com/> and still carries `BLDRS_` with
   the metadata toggle on. DRACO specifically, because it is the one that
   fetches a `<script>` and a sibling `.wasm` from `/static/js/draco/` at
   click time — a blocked or mis-served asset is a per-browser failure the
   others never see.
5c. **Portable** on (codec None): the line says *Estimating…*, then settles at
   a different figure; the download weighs exactly what it said; the file
   opens in <https://3dviewer.net/>, which refuses the default export
   (`Unsupported extension: EXT_mesh_gpu_instancing`), and the three.js editor
   shows the nested, named hierarchy (Bldrs › Build › Every › Thing) instead
   of `mesh_N`. Then Portable + Draco, to confirm the codec preserves the node
   names. Reopening a portable export in Share shows the nav tree, renders
   palette-coloured, and picks: clicking a nav-tree row highlights in the
   scene and vice versa, exactly as the default export does (#1849).
6. Save → Export lists the exports below the button, with sizes and dates;
   "Download again" works on the cached one; Clear Local Cache → the row
   says the model must be reopened.
7. Safari specifically: the download is a file, not an inline tab (§4.4
   fallback); OPFS is available (Safari ≥ 17 for `createWritable`).
8. Mobile: the Save dialog's Export tab fits without horizontal scroll at
   390 px, the "Exported …" snackbar is readable over the open dialog, and
   the download lands in Files (iOS) / Downloads (Android).

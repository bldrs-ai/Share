# GLB-based Model Sharing — Design

Status: Draft v0.1 (2026-05-11)
Owner: Pablo (with Claude); originates from Nick's PR #1443 (`glb_local`).
Tracks: PR-of-this-branch (clone of `glb_local`).

This document is the design for taking Nick's GLB-conversion proof-of-concept
through to a production-quality model-sharing path. It supersedes the implicit
design embedded in PR #1443 by being explicit about the artifact contract, the
cache lifecycle, the user-originated upload path, and the testing required
before we transition production.


## Goals

1. **Fast view.** A returning visitor opens a previously-shared model in ~1s,
   regardless of original size (10MB IFC … 200MB IFC).
2. **Privacy by default.** The originator's primary artifact (IFC/STEP/OBJ)
   never has to leave their browser. Only what is needed for viewing is shared.
3. **Compact, extensible, spec-compliant.** Runtime artifact is a plain GLB
   that any GLTF reader can load; Bldrs-specific metadata is carried in named
   GLTF extensions.
4. **Round-trippable Notes & Versions.** A note (and its placemark anchor)
   created in viewer A is visible in viewer B and survives a re-export. View
   states (named camera + cut planes + visibility) ditto.
5. **No backwards-incompatible coupling.** The artifact carries its schema
   version; old cached artifacts are simply ignored, not migrated.


## Non-goals (this phase)

- Server-side IFC→GLB conversion. (Designed-for, not implemented; the artifact
  key is intentionally content-addressed so a Cloud Function can later write to
  the same key without a client change.)
- Three.js upgrade. Tracked separately. Compression strategy is chosen to be
  Three-version-independent for V1 (Meshopt) and to keep DRACO optional.
- Realtime collaboration. Out of scope; the artifact + sidecar shape is chosen
  to support it later (immutable artifact, mutable notes doc).


## The shift Nick's PR didn't make: who originates the GLB

Nick's PR converts on the server-side path (user uploads IFC; we parse and
convert in-browser; GLB is a cache). We are changing the primary contract:

**The originator of a shared model produces the GLB locally and shares the
GLB.** The original IFC is never uploaded for the purpose of sharing.

Rationale:
- **Privacy.** Most large IFCs carry information the originator does not
  intend to publish (vendor names in psets, internal classifications, draft
  geometry on hidden layers). With server-side conversion, the originator has
  to trust us with the full file even if only a subset is shared. With
  originator-side conversion, the export step is also the redaction step.
- **Latency.** A 200MB IFC upload over a residential link is minutes; a 5–20MB
  GLB is seconds. The first share is fast, not slow.
- **The "Wow."** The originator clicks Share and within seconds the link is
  live and openable in another tab in ~1s. Today's flow is "wait, then wait."

Risk we accept by this choice: **injected data in user-originated GLBs.**
The originator can hand us a GLB whose `BLDRS_*` extensions claim a spatial
tree or properties that don't match the geometry. This is no different in kind
from a server-side conversion path that ingests user-provided IFC (we have to
sanitize either way), but it does shift validation onto our reader. See
§"Validation and trust" below.

Filtering (e.g. "strip all psets except IfcQuantity*", "drop classifications
above type X") is **out of scope for v0.1** but the extension split below is
chosen so it can be added without touching geometry packing.


## Artifact contract

A Bldrs shared model is a single `.glb` file. All Bldrs-specific data lives
in **named GLTF extensions**, listed in `extensionsUsed` (none in
`extensionsRequired` — the file remains a valid generic GLTF).

### Extension catalogue

| Extension | Carries | Compression | Read eagerly? |
|---|---|---|---|
| `BLDRS_model_metadata` | source type, source hash (if applicable), authoring tool + version, schema version, creation timestamp, optional title/description | none | yes |
| `BLDRS_element_properties` | `{ [expressID]: { itemProperties, propertySets, type } }` | gzip in bufferView | lazy (on properties-panel open / search) |
| `BLDRS_spatial_tree` | hierarchical `{expressID, type, name, children}`, root at IFCPROJECT-equivalent | gzip in bufferView | yes (drives Nav) |
| `BLDRS_notes` | array of `{id, anchor, body, author, createdAt, replyTo?}`; `anchor` is `{expressID, localPoint:[x,y,z], normal:[x,y,z]}` | gzip in bufferView | yes (small) |
| `BLDRS_view_states` | array of `{id, name, camera:{position, target, up, fov}, cutPlanes:[{normal, point}], hiddenExpressIDs:[…]}` | gzip in bufferView | yes (small) |

Plus a per-primitive attribute on geometry meshes:

| Attribute | Type | Semantic |
|---|---|---|
| `_EXPRESS_ID` | `UNSIGNED_INT` (1 per vertex) | The element's expressID. Replaces the current regex-on-node-name hack. |

### Schema version

`BLDRS_model_metadata.schemaVersion` is a semver string. The Bldrs reader
compares it against its supported range:
- **Major mismatch:** read geometry only, log a structured warning, suppress
  Bldrs-specific UI (Nav from extension, Properties from extension).
- **Minor/patch mismatch:** read everything; treat unknown fields as
  forward-compatible (ignore them).

Schema version is part of the OPFS cache key (see §"Caching and lookup"), so
bumping the schema invalidates all cached artifacts naturally.

### What is NOT in the artifact

- **Notes/Versions storage of record.** The artifact carries a *snapshot* of
  notes and view states at share-time. Live editing of those happens in a
  separate sidecar (Firebase doc or GitHub issue, depending on the federated
  storage choice) that the viewer overlays on top of the GLB. The artifact's
  copy is the offline-readable fallback and the bootstrap state for new
  viewers. See §"Notes & Versions v0.1 round-trip" for the contract.


## Pipelines

### A. Originate (the new primary path)

```
   originator browser
   ───────────────────
       drop IFC/STEP/OBJ
            │
            ▼
       Conway parse           (existing path — we already do this)
            │
            ▼
       Aggregated geometry + serialized props + spatial tree
            │
            ▼
       Conway GLB writer  ◄──── BLDRS_* extensions packed in
            │
            ▼
       artifact: <sourceHash>.<schemaVer>.glb     (held in OPFS)
            │
            ├─► "Share" button → upload artifact only to chosen destination
            │        (Drive folder | GitHub repo | Firebase Storage)
            │
            └─► Viewer can render from the in-OPFS GLB immediately
```

The first-view UX during conversion is **parallel**: we render the live Three
scene from the IFC loader as today and run Conway→GLB in the OPFS worker in
parallel. The user is never blocked on GLB write to see their model. (Once we
have the export hot path optimized, we will measure whether serial-first would
be a worthwhile simplification; today, isolation wins.)

### B. View (the cache-served fast path)

```
   viewer browser
   ──────────────
       URL → artifact key (sourceHash, schemaVer)
            │
            ▼
       OPFS lookup ─── hit ─────► load GLB directly  ──┐
            │                                          │
            │ miss                                     │
            ▼                                          │
       Shared cache (Drive/GitHub/Firebase) ──hit──► OPFS write, then load
            │                                          │
            │ miss                                     │
            ▼                                          │
       (only on a non-shared, local IFC the                                   
        originator dropped) Conway parse → GLB         │
                                                       ▼
                                              BldrsGltfLoader
                                              ├─ read BLDRS_model_metadata
                                              ├─ check schemaVer
                                              ├─ build adapter
                                              │   (BLDRS_spatial_tree → Nav)
                                              ├─ wire Notes/Views overlays
                                              └─ lazy-decompress
                                                    BLDRS_element_properties
                                                    on first need
```

The viewer **never parses IFC** for a model that came in as a GLB. The Conway
parse path only runs for originators who drop a non-GLB.


## Caching and lookup

Artifact key (OPFS layout, current implementation):
```
<ns1>/<ns2>/<ns3>/<sourcePath stem>.<schemaVer>.glb   (file)
+ commitHash                                          (associated hash, per OPFS worker)
```

The `(ns1, ns2, ns3)` namespace is the source-kind tuple; each must be a
single OPFS directory name. The tuple is chosen to match exactly the
(owner, repo, branch) the source-file writer used, so the GLB lands in
the *same OPFS directory* as its source IFC (visible side-by-side in
OPFS Explorer). Per-source-kind tuples (see `src/loader/sourceCacheKey.js`):

| Source kind          | ns1                  | ns2     | ns3        | sourceHash provenance              |
|----------------------|----------------------|---------|------------|------------------------------------|
| GitHub               | `<owner>`            | `<repo>`| `<branch>` | git commit SHA (from upstream)     |
| Local / sample       | `BldrsLocalStorage`  | `V1`    | `Projects` | SHA-1 of source bytes              |
| Upload               | `BldrsLocalStorage`  | `V1`    | `Projects` | SHA-1 of source bytes              |
| External URL         | `BldrsLocalStorage`  | `V1`    | `Projects` | SHA-1 of source bytes              |
| Google Drive         | `BldrsLocalStorage`  | `V1`    | `Projects` | Drive md5Checksum if avail, else SHA-1 |

GitHub gets a pre-download cache lookup (we know the sha before fetch). The
other kinds run a post-download lookup: we read the file into OPFS, hash the
bytes, then check the cache — saving the IFC parse on a hit. Within the
shared local dir, the per-file commitHash (content sha) disambiguates
collisions when two sources happen to have the same filename.

This key is computed identically by:
- the originator's writer (`src/loader/glbExport.js#exportAndCacheGlb`),
- the viewer's reader (`src/loader/Loader.js#tryLoadCachedGlb`),
- a future server-side pre-baker.

A unit test pins each adapter's shape (`sourceCacheKey.test.js`) and the
generalised key derivation (`glbCacheKey.test.js`).

### How to test V0a today

1. Open any model URL with `?feature=glb`. Examples:
   - Homepage sample: `/share/v/p/index.ifc?feature=glb`
   - GitHub: `/share/v/gh/<owner>/<repo>/<branch>/<file>?feature=glb`
   - Upload: drop an IFC, then append `?feature=glb` to the URL.
2. Open DevTools → Console. On a cold load you should see (with `<kind>` =
   `github`/`local`/`upload`/`external`):
   ```
   [glb] feature enabled
   [glb] reader: cache lookup <kind> key=<ns1>/<ns2>/<ns3>/<path> sha=<sha>
   [glb] reader: <kind> cache MISS, will export after parse
   [glb] writer: <kind> source, key=<ns1>/<ns2>/<ns3>/<path> sha=<sha> schema=<ver>
   [glb] writer: wrote <bytes>B (1 chunk) to <ns1>/<ns2>/<ns3>/<path>.<ver>.glb in <ms>ms
   ```
3. Reload the same URL. On a warm load you should see:
   ```
   [glb] reader: cache lookup <kind> ...
   [glb] reader: <kind> cache HIT (<bytes>B); swapping to GLB loader
   [glb] reader: unpacked Bldrs container — 1 GLB chunk(s)
   [glb] reader: parsed GLB OK: nodes=N meshes=M verts=V bounds=… centerOffset=…
   ```
4. Inspect OPFS via `snapshotOPFS()` in the dev console. Confirm a
   `.<schemaVer>.glb` file under the per-source namespace (same dir as
   the source IFC).
5. Add `,glbVerbose` to the feature flag to surface cache-key descriptors,
   GLTFExporter byte counts, and a recursive scene traversal summary
   (mesh count, vertex count, bounds, center offset).

### Testing compression (DRACO / Meshopt)

Both compressors are off-by-default; enable per-tab via URL flag. The
cached artifact's filename embeds a compression-aware schema suffix
(`-draco` / `-meshopt`) so compressed and uncompressed caches don't
collide — a flag-off reader never picks up a flag-on writer's bytes
(and vice versa).

1. `?feature=glb,glbDraco` — writer runs the GLTFExporter output through
   `@gltf-transform`'s `draco()` transform (`KHR_draco_mesh_compression`).
   Reader wires `DRACOLoader` (decoder at `/static/js/draco/`).
2. `?feature=glb,glbMeshopt` — writer uses `meshopt()`
   (`EXT_meshopt_compression`). Reader wires `MeshoptDecoder` from the
   `meshoptimizer` package.
3. New log line surfaces the ratio:
   ```
   [glb] compress: draco 5074244B → 1283009B (74.7% reduction) in 412ms
   [glb] writer: wrote 1283091B (1 chunk, draco-compressed) to ... in 580ms
   ```
4. When both `glbDraco` and `glbMeshopt` are on, **DRACO wins**
   (deterministic tie-break). Toggle the other off to A/B.
5. To compare cold/warm timing or memory, pair with `?feature=perf`
   (#1513's PerfMonitor panel).


## Adapter layer — replacing `convertToShareModel`

Current PR mutates arbitrary `Object3D`s with `expressID/type/Name/LongName`
and monkey-patches `ifcManager.getSpatialStructure` / `getPropertySets` via
closures. This works but is brittle and hides failures behind silent fallbacks.

Replacement: a single `GlbAsIfcModelAdapter` class that:
- Holds the GLB scene root and the parsed `BLDRS_*` payloads.
- Implements the *minimum* surface the rest of Share consumes
  (`getSpatialStructure`, `getProperties`, `getPropertySets`, `getExpressId`).
- Reads expressID from the `_EXPRESS_ID` vertex attribute (not from node
  names). This kills the regex hack and the synthetic 5000-element index.
- Returns `null` (not the model itself) on missing payload; callers check.

Single seam where "this isn't really an IFC model" is contained.

### Picking granularity — symptom of the convertToShareModel gap

The user-visible manifestation of the still-missing adapter is that
**raycast-picking on a GLB-cache-hit model selects the whole mesh, not
the individual element**. Empirically: clicking a wall on Bldrs_Plaza
loaded via cache hit highlights the entire floor slab; clicking the
same wall on an IFC-source load highlights just the wall.

The cause is on the writer side AND the reader side:

1. **Writer**: `GLTFExporter` *does* preserve `web-ifc-three`'s per-vertex
   `expressID` buffer attribute as `_EXPRESSID` (the glTF custom-attribute
   convention prefixes with `_`). So the GLB on disk carries a true
   per-vertex expressID.
2. **Reader**: today's cache-hit path goes through
   `convertToShareModel#recursiveDecorate`, which **overwrites** the
   per-vertex attribute with a one-byte mesh-level serial:

   ```js
   const ids = new Int8Array(1)      // one byte for the whole mesh
   ids[0] = id                       // monotonic per Object3D visited
   obj3d.geometry.attributes.expressID = new BufferAttribute(ids, 1)
   ```

   The raycast → faceIndex → expressID lookup therefore returns the
   same mesh-level value for every face, and the picker selects the
   whole mesh.

The fix is the Phase 2b work above: `GlbAsIfcModelAdapter` skips the
recursiveDecorate overwrite entirely and reads from the existing
`_EXPRESSID` attribute. Until then, cache-hit picking is at-mesh
granularity, and the cache feature stays behind `?feature=glb`
off-by-default so production users opting into cache speedup do so
knowing this tradeoff.


## Clipping

Delete `Infrastructure/GlbClipper.js`. Generalize the existing clipper
(`IfcClipper` + `CutPlaneArrowHelper.ts` + `CutPlaneMenu.jsx`) to accept any
`Object3D` root rather than only IFC models. The parallel mouse-handler path
in `GlbClipper` is a likely cause of the "breakage on larger models" Nick
observed — every canvas event raycasts the arrows globally.


## Notes & Versions v0.1 round-trip

We commit to round-tripping the *basics* in v0.1. Iteration on the UX will
continue, but the data contract below is what we ship now so that anything
authored against v0.1 keeps working as we add features.

### Notes v0.1

In-artifact (`BLDRS_notes`):
```
{
  id: "n-<uuid>",
  body: <string>,                       // markdown
  author: { id, displayName } | null,   // null if anonymous
  createdAt: <ISO timestamp>,
  anchor: {
    expressID: <int>,                   // stable across re-export of same source
    localPoint: [x, y, z],              // in element-local coords
    normal:     [x, y, z]
  },
  replyTo: "n-<uuid>" | null
}
```

Why `expressID + local point` rather than world coordinates: expressID is
stable across re-exports of the same source; local point keeps the anchor on
the right face even if the world transform changes (e.g. coordinate system
shift). Reader projects local→world at render time.

A note authored on a viewer's overlay (live, in the sidecar) and *then* baked
into a new share becomes a `BLDRS_notes` entry. A note added at originator
time goes straight into `BLDRS_notes`. The sidecar protocol (Firebase doc
shape) carries the same record shape so import/export is a no-op transform.

### Versions v0.1

Each Version is `{ artifactKey, label, createdAt, parentVersionId? }`. The
list of versions lives in a sidecar (per destination — a doc in Firebase, a
JSON file in the Drive folder, a release/tag in GitHub). The artifact itself
does not enumerate versions; it only knows its own `metadata`.

### View states v0.1

In-artifact (`BLDRS_view_states`), one entry shape:
```
{
  id: "v-<uuid>",
  name: "Floor 2 inspection",
  camera: { position:[x,y,z], target:[x,y,z], up:[x,y,z], fov:<deg> },
  cutPlanes: [ { normal:[x,y,z], point:[x,y,z] } ],
  hiddenExpressIDs: [<int>, …]
}
```

View states are explicit save-points: the user clicks "Save view," names it,
it persists into the artifact on next share *and* into the sidecar for live
edits. The default view is just camera at fit-to-frame, no entry needed.


## Validation and trust

Because the originator produces the GLB, the viewer cannot trust the contents
blindly. The reader enforces:

1. **Magic + version.** Reject anything that isn't a valid GLB.
2. **Schema version range.** Major mismatch → geometry-only mode.
3. **Cross-reference integrity.**
   - Every `_EXPRESS_ID` referenced by `BLDRS_spatial_tree` exists on at
     least one primitive (or is a non-geometric grouping node — IfcSite etc.).
   - Every `BLDRS_notes[*].anchor.expressID` exists.
   - Every `BLDRS_element_properties` key is referenced from the tree.
4. **Size and shape ceilings.** Reject `BLDRS_element_properties` over a
   hard ceiling (e.g. 100MB decompressed) to prevent decompression-bomb
   attacks. Same for tree depth.
5. **Geometry attribute typing.** `_EXPRESS_ID` must be `UNSIGNED_INT`,
   matching primitive's vertex count.
6. **HTML-stripping on display** of any user-authored strings (notes bodies,
   view names, etc.). The reader does not interpret them as markup.

Validation produces a structured report; integrity violations log to telemetry
(`glb_validation_*`) and degrade rather than crash.


## Implementation phases

Each phase is an independent landable PR (or stack on this branch).

### Phase 0 — Stabilize (this PR's first commits, after the design doc)

- Merge current `main` into this branch; resolve conflicts.
- Restore Conway version from `main`. Remove the vendored `.tgz` files and
  the committed `public/static/js/ConwayGeom*.wasm` / `*.js`. Wire wasm copy
  through the existing `build-share-copy-wasm-*` yarn scripts.
- Strip `console.log` from `Loader.js`, `OPFS.worker.js`, `CadView.jsx`,
  `GlbClipper.js`, `ExtBldrsPropertiesPayload.js`.
- Fix the `_malloc` leak for the gzipped properties pointer in
  `OPFS.worker.js#exportToGlb` (matching `_free`).
- Remove the 60-line commented `elementTypesMap` / 3dm dead-code blocks.

Exit: CI green; diff against `main` is purely the GLB work; no committed
binaries; no `console.log`s.

### Phase 1 — Cache key + skip-IFC path

- Adopt `artifacts/.../<sourceHash>.<schemaVer>.glb` keying. Single helper
  used by both reader and writer; pinned by test.
- In `Loader.js#load`: before kicking off the IFC parse, look up the GLB.
  If present, swap loader to GLB and short-circuit.
- Feature-flag the skip behind `GLB_SERVING_ENABLED` (env-driven) so we can
  ship the write path first and the read-fast path second.

Exit: re-opening an IFC URL whose GLB is cached loads in ≤1.5s with no
Conway parse, measured by a Playwright spec (see test plan T-9).

### Phase 2 — Extension split + adapter

- Replace `ExtBldrsPropertiesPayload` (single blob) with the catalogue above
  (`BLDRS_model_metadata`, `BLDRS_element_properties`, `BLDRS_spatial_tree`).
- Emit `_EXPRESS_ID` from the Conway writer; consume it in the reader.
- New `GlbAsIfcModelAdapter`; delete the closure-patches in
  `convertToShareModel`.

Exit: all existing Properties/Nav/Search tests pass on a GLB-loaded model;
no synthetic `BufferAttribute` index hack.

### Phase 3 — Clipper unification

- Generalize `IfcClipper` / `CutPlaneArrowHelper.ts` to take any
  `Object3D` root.
- Delete `Infrastructure/GlbClipper.js`.
- Revert the GLB-specific branch in `CutPlaneMenu.jsx`.

Exit: identical clipping UX & perf on IFC and GLB models; no per-event
raycast regression in large-model perf spec (T-10).

### Phase 4 — Notes & View states v0.1

- `BLDRS_notes` + `BLDRS_view_states` reader & writer.
- Wire into the existing `useStore` Notes slice; a "Save view" button on the
  camera toolbar.
- Round-trip golden test (T-7).

### Phase 5 — Originator-side share flow

- "Share" UI: choose destination (Drive folder / GitHub repo / Firebase),
  upload the in-OPFS GLB, copy URL. The IFC never leaves the browser.
- Validation pass on the artifact before upload (the same reader-side
  validation, applied to the writer's output).
- Telemetry: `glb_originate_*` events.

Exit: a user can drop an IFC, click Share, and the recipient opens the link
to a working model with no further user action.

### Phase 6 — Shared cache tier

- Firebase Storage (or Drive sidecar) as a second cache tier in front of
  OPFS. Reader's lookup chain becomes OPFS → shared → originate.
- Per-destination, content-addressed.

Exit: two users opening the same `(repo, sourceHash)` both see ≤1.5s loads
even on cold OPFS.

Phases 0–3 land on this PR's branch sequentially. Phases 4–6 may be split
into follow-on PRs.


## Codec choice

V1 ships uncompressed GLB (matches Nick's PR; `outputDraco=false` in the
Conway call). V1.1 enables Meshopt on the write side. Meshopt:

- Pure JS decoder, ~30KB, no WASM.
- No coupling to the Three.js version.
- 3–6× geometry compression typical.

DRACO stays optional and is *not* a prerequisite. If we later decide Meshopt
isn't enough, the Three.js upgrade unblocks DRACO independently.


## Telemetry

We instrument with `gtagEvent` (already used in `CadView`):

| Event | When | Properties |
|---|---|---|
| `glb_export_started` | Conway→GLB worker call begins | sourceType, sourceBytes |
| `glb_export_completed` | Worker reports `glbExported` | durationMs, glbBytes, propsBytes |
| `glb_export_failed` | Worker reports `glbExportError` | reason |
| `glb_cache_hit` | Viewer found GLB in OPFS | sourceHash, schemaVer |
| `glb_cache_miss_oprigin` | Cold viewer, originated from IFC | sourceType |
| `glb_load_ms` | Viewer GLB ready | totalMs, glbBytes |
| `glb_extension_decompress_ms` | `BLDRS_element_properties` opened | bytesBefore, bytesAfter, ms |
| `glb_validation_*` | Per integrity-check failure | which check, severity |
| `glb_schema_mismatch` | Schema version out of range | found, supported |

Watch these for two weeks of canary before turning the flag on broadly.


## Test plan

The biggest risk in this transition is "model looks right but property/Nav is
silently wrong." The test surface is intentionally thick on equivalence and
regression, thin on UI-shape testing.

### Unit (Jest)

- **T-1** `BLDRS_element_properties` codec round-trip: synthetic
  `{itemProperties, propertySets}` → gzip-in-bufferView → decompress →
  deep-equal. Edge cases: empty, non-ASCII, 100MB decompressed.
- **T-2** `BLDRS_spatial_tree` round-trip — including deep trees (≥10
  levels) and trees with `expressID` collisions across non-geometric grouping
  nodes.
- **T-3** Cache key derivation: identical key produced by Loader.js and
  OPFS.worker.js given the same `(owner, repo, branch, path, sourceHash,
  schemaVer)` tuple. Pin in a snapshot test.
- **T-4** Schema-version handling: major mismatch → adapter returns
  `geometryOnly: true`, structured warning emitted, no throw.
- **T-5** Validation: bad `_EXPRESS_ID` typing, oversized
  `BLDRS_element_properties`, missing tree → reader rejects/degrades per
  spec, never crashes.
- **T-6** `_malloc/_free` balance in `OPFS.worker.js#exportToGlb` (with a
  Conway stub).
- **T-7** Notes & view-states round-trip: encode → decode → identical
  records. Including HTML-stripping of bodies.

### Cross-format equivalence (the critical one)

- **T-8** Parameterized harness: for each fixture in the corpus, run:
  ```
  load(ifc)  → snapshot_ifc = { tree, typeCounts, propsForRandomN,
                                bbox, triCount, renderHash }
  export GLB
  load(glb)  → snapshot_glb = …
  assert deepEqual(snapshot_ifc, snapshot_glb) modulo a documented tolerance
                                                 on renderHash (SSIM ≥ 0.99)
  ```
  Corpus: 6–10 real models — sizes 1MB / 10MB / 50MB / 100MB+, IFC versions
  2x3 and 4, with-and-without psets, with-and-without classifications, deep
  spatial tree, localized names.

### Performance regression

- **T-9** Warm-load (GLB in OPFS) of a 50MB IFC: TTI ≤1.5s on the CI runner.
- **T-10** Cold-load of a 50MB IFC: TTI within ±15% of pre-change baseline.
- **T-11** Memory peak during IFC→GLB export ≤2× the IFC-load-alone peak
  (catches leak/double-buffering regressions). Measured via
  `performance.memory.usedJSHeapSize` polling around the export window.
- **T-12** Mouse-event throughput during clipping with a 100k-tri model ≥60
  Hz (catches regressions if we re-introduce per-event global raycasts).

### End-to-end (Playwright)

- **T-13** Open via GitHub URL → Nav tree visible → click element →
  properties panel shows correct values (IFC and GLB paths in two specs).
- **T-14** Search → result selects the same set of expressIDs on the GLB
  path as on the IFC path.
- **T-15** Cut planes (arrow-drag) → identical behavior on GLB as on IFC.
- **T-16** Version switch between two `sourceHash`s of the same file →
  both load fast, view state preserved.
- **T-17** Notes round-trip: author note in viewer A on a GLB, re-export,
  open in viewer B, note appears at the same anchor.
- **T-18** Originator share flow: drop IFC → click Share → recipient opens
  link to a working model.

### Migration & rollback safety

- **T-19** Feature-flag exercise: with `GLB_SERVING_ENABLED=false`, the
  reader never short-circuits to GLB, even with one cached.
- **T-20** Schema bump rehearsal: generate GLBs under `schemaVer=N`, bump
  to `N+1`, reload — old GLBs are ignored, regenerated.
- **T-21** Validation telemetry: an artifact with a deliberately-bad
  `_EXPRESS_ID` triggers `glb_validation_*` event and degrades cleanly.


## Open questions still on the table

- Default destination for originator share: Drive vs. GitHub vs. Firebase
  Storage. Tied to the in-flight identity/federated-storage work; this design
  is destination-agnostic but the UI of Phase 5 has to pick one default.
- "Filtering" UX for the originate step (strip psets, redact strings). The
  artifact contract supports this trivially; the UX is a follow-up.
- Whether the originator's local IFC OPFS cache should be evicted after a
  share — privacy-by-default suggests yes; user choice suggests offer.

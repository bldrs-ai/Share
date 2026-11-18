# GLB artifact contract and trust

**Status:** cache artifact and four extensions built; notes, view states and model metadata designed, not built. Tracking: T2 [#2201](https://github.com/bldrs-ai/Share/issues/2201).
**Date:** 2026-11-18
**Owner:** Pablo

What a Bldrs GLB is: who writes it, what it carries, how its version is
judged, and what a reader checks before trusting it. The older text (phase
plan, test plan, telemetry, codec notes, how-tos) is at
[commit 8c28c7d](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/design/new/glb-model-sharing.md).


## Goals

1. **Fast view.** A model seen before opens from its GLB, with no parse.
2. **Privacy by default.** The source file (IFC/STEP/OBJ) never has to
   leave the originator's browser to be viewed.
3. **Plain glTF.** Any glTF reader loads the geometry. Bldrs data rides in
   extensions listed in `extensionsUsed`, never `extensionsRequired`.
4. **No migration.** An unsupported version is ignored and rewritten.


## Non-goals

- **Server-side conversion.** The key is content-addressed so a server
  could later write the same artifact, but nothing does today.
- **Realtime collaboration.** The artifact is immutable; live edits belong
  elsewhere (see §"Round-trippable Notes & Versions").
- **Sharing the GLB with a recipient.** This is post-MVP (T2 Phases 4–6).
  A recipient-side GLB becomes a derived artifact of a published version
  under `share-200` ([#2144](https://github.com/bldrs-ai/Share/issues/2144)).
  `share-110` ([#2205](https://github.com/bldrs-ai/Share/issues/2205)) is
  Drive Save only.


## Who produces the GLB

**Decision: the originator's browser writes the GLB,** right after it
parses the source, since it already holds the geometry, properties and tree.

Why:
- **Privacy.** Large IFCs carry data the owner may not mean to publish
  (vendor psets, internal classes, draft geometry). Nobody has to trust us
  with the full file, and export is where redaction would happen.
- **Size and cost.** A GLB is a fraction of its IFC, and there is no
  conversion service to run.

Rejected: converting on a server from an uploaded source. It needs the
whole file, costs upload time, and still has to sanitise untrusted input.

The cost: **a GLB is untrusted input.** Today the reader sees only our own
writer's output or a file the user opened. Once GLBs come from other
browsers, it must validate them (§"Validation and trust").


## Pipelines

### A. Originator

The source is parsed and shown as usual. Then the writer
(`src/loader/glbExport.js#exportAndCacheGlb`, with the batched build in
`src/loader/glbBatchedExport.js`) packs the model and its `BLDRS_*`
extensions into the Bldrs container in OPFS, off the user's path.
The `glb` flag (on by default) gates write and read.

### B. Viewer

The reader (`src/loader/Loader.js#tryLoadCachedGlb`) looks up the
artifact. A hit loads the GLB and the extensions rebuild NavTree,
Properties and picking; a miss parses and writes. The lookup is local OPFS
only; there is no shared tier.


## Caching and lookup

[glb-export-premium.md](glb-export-premium.md) §1.1–§1.1d owns the cache
key (`glbCacheKey.js`, `sourceCacheKey.js`), the gzipped container and its
slots. Google Drive loads skip OPFS, so a Drive model gets no GLB cache
([#2100](https://github.com/bldrs-ai/Share/issues/2100)).


## Artifact contract

### Extension catalogue

Built:

| Extension | Carries | Reader |
|---|---|---|
| `BLDRS_spatial_tree` | Spatial hierarchy, `{expressID, type, Name?, LongName?, children}`, gzipped JSON (`bldrsSpatialTree.js`) | Eager; NavTree |
| `BLDRS_element_properties` | Properties and psets of every entity reachable from the tree, block-indexed (`BPRI`) so no giant string is needed (`bldrsElementPropertiesCapture.js`) | Lazy, per block |
| `BLDRS_instance_tables` | Per-instance identity of the batched artifact: id tables, STEP occurrence paths, source colours; v2 adds collapsed rows with ranges and an exact canary (`bldrsInstanceTables.js`) | Eager; batched model |
| `BLDRS_face_ids` | Per-triangle ids of the merged artifact, kept out of vertex attributes so a codec cannot corrupt them (`bldrsFaceIds.js`) | Eager; `IfcInstanceMap` |

All four live in `src/loader/`. The title rides in
`scenes[].extras.bldrsTitle`. The original single-blob reader,
`ExtBldrsPropertiesPayload.js`, is still registered.

Designed, not built:

| Extension | Would carry |
|---|---|
| `BLDRS_model_metadata` | Source type, source hash, authoring tool and version, schema version, created time, title |
| `BLDRS_notes` | A snapshot of notes at export time (shape below) |
| `BLDRS_view_states` | Named views: camera, cut planes, hidden elements (shape below) |

The designed `_EXPRESS_ID` vertex attribute is not the contract: identity
rides in the two tables above, and per-vertex ids are only a fallback on
uncompressed files.

### Schema version

**Rule: the schema version is in the artifact's path, and any bump makes
every older artifact a cache miss.** It is `BLDRS_GLB_SCHEMA_VERSION` in
[`glbCacheKey.js`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/loader/glbCacheKey.js#L334)
(0.25.0 here), whose comment logs each bump. Bump it whenever an older
reader would misread the writer's output; the miss re-parses and rewrites,
so there is no migration code. The container's own version is separate
(glb-export-premium.md §1.1a).

A GLB opened as a file has no path, so each extension judges its own
payload: `BLDRS_instance_tables` treats an unknown `version` as
unreadable, and `BLDRS_element_properties` refuses the pre-0.13.0 format
with an alert. The designed rule for `BLDRS_model_metadata`: a major
mismatch reads geometry only; minor or patch reads all and ignores unknown
fields.


## Picking granularity

A cache hit picks per instance, like a fresh parse, so the old "one
template highlights every copy" limitation is gone. The model side is
[viewer-replacement.md](viewer-replacement.md) §3b.


## Round-trippable Notes & Versions (designed, not built)

Kept as a starting point, pending reconciliation with notes-100 ([#670](https://github.com/bldrs-ai/Share/issues/670):
notes are issues anchored to versions) and with view-140's display
overrides (model-display-controls.md). The artifact would hold a
snapshot; the record of truth stays outside it.

- **Note:** `{id, body (markdown), author: {id, displayName} | null,
  createdAt, anchor: {expressID, localPoint: [x,y,z], normal: [x,y,z]},
  replyTo}`. The anchor is an element id plus a local point, not world
  coordinates: the id survives re-export and the point stays on its face
  if the world transform moves.
- **View state:** `{id, name, camera: {position, target, up, fov},
  cutPlanes: [{normal, point}], hiddenExpressIDs}`.
- **Versions:** the artifact names only itself. The version list is
  `share-200`'s manifest in [model-versioning.md](model-versioning.md).


## Validation and trust

**Rule: a reader degrades on bad input; it never crashes and never shows
wrong data as right.** A failed check drops the feature it feeds (picking,
NavTree, Properties) or treats the artifact as a cache miss.

Built:

1. **Empty artifacts.** [`glbArtifactHealth.js`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/loader/glbArtifactHealth.js)
   refuses to write a scene with no vertices and evicts a cached artifact
   with no renderable primitive on read.
2. **Codec trust** ([#1847](https://github.com/bldrs-ai/Share/issues/1847)).
   Per-vertex ids are trusted only on an uncompressed file. The codec is
   read from the file's own `extensionsUsed`
   ([`glbCompress.js#glbCompressionModeFromExtensions`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/loader/glbCompress.js#L124)),
   not only from the container header, so a downloaded export the user
   compressed is judged right.
3. **Structural checks.** `BLDRS_instance_tables` returns null on an
   unknown version, mismatched table lengths or bad ranges, so the load
   falls back to a miss. Its canary is exact: a lossy codec fails it and
   the model renders without picking.
4. **Depth ceiling.** The spatial tree is cut at 100 levels on capture and
   read.
5. **Title sanitising.** A cached title is stripped of control, bidi and
   `<>` characters and capped at 200 characters
   ([`Loader.js#sanitizeCachedTitle`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/loader/Loader.js#L1928)).

Designed, not built (needed before GLBs come from other browsers):

6. **Schema range check** from `BLDRS_model_metadata`, as above.
7. **Cross-reference integrity.** Every id in the tree exists on some
   geometry or is a non-geometric group (IfcSite and the like); every note
   anchor exists; every properties key is reachable from the tree.
8. **Size ceilings.** A hard cap on the decompressed properties payload
   (on the order of 100 MB) and on the container's inflate, against
   decompression bombs.
9. **Text as text.** Every user-authored string (names, note bodies, view
   names) is shown as plain text, never as markup.

Failures go through the Reported Conditions routing in `CLAUDE.md`:
expected degradation to GA, a broken fallback to Sentry.

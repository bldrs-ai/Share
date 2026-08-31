// Cache-key derivation for GLB runtime artifacts.
//
// Per design/new/glb-model-sharing.md §"Caching and lookup", a GLB artifact
// derived from a source file is stored in OPFS using a 3-level namespace
// (`<ns1>/<ns2>/<ns3>/<originalFilePath>` + commitHash) so the existing
// worker helpers `doesFileExistInOPFS` / `retrieveFileWithPathNew` work
// unchanged. Each of ns1/ns2/ns3 is a single OPFS directory name (no
// slashes; non-empty).
//
// The artifact's `originalFilePath` is derived from the source's filepath by
// replacing the extension with `<schemaVer>.glb`. Schema-version is part of
// the filename so bumping the schema naturally invalidates older artifacts.


/**
 * Current Bldrs GLB artifact schema version. Bumped on any backwards-
 * incompatible change to the BLDRS_* extension contract or cache-key shape.
 *
 * Bumping this ALSO retires the batched-native slot, which is derived from
 * it (`BLDRS_GLB_BATCHED_SCHEMA_VERSION` below) — deliberately, since that
 * is the slot most users actually read. Nothing extra to do here; the note
 * exists so the coupling is visible from where the bump gets written.
 * 0.18.0 — retires artifacts whose STEP occurrence paths mean something
 *         different from what the app now reads. conway#628
 *         (test-models-private#98) changed the path's own composition, not
 *         just its contents: an individually addressable body now ends its
 *         occurrence path with its OWN express id, on the geometry instance
 *         and on the spatial-tree node alike, and a plain
 *         `shape_representation_relationship` id is no longer a segment at
 *         all. Both tables travel baked into the artifact — `occurrencePaths`
 *         on `BLDRS_face_ids`, and the node paths in `BLDRS_spatial_tree` —
 *         so a 0.17.0 cache hit serves pre-#628 paths to post-#628 resolution
 *         code: a multibody part's bodies again share one path (every body of
 *         BLSN_007 selecting the whole boat, the bug this fixes), and NEMA's
 *         relationship-suffixed `[14107, 6611]` still matches no tree node.
 *         The same release also turns the ephemeral solid layer on by default
 *         and drops its 256-per-product cap, so a cached tree simply lacks
 *         the body nodes a fresh parse now emits. Cache-hit users would never
 *         see any of the fix — the same "cache-hit users see it, cache-miss
 *         users don't" shape as 0.15.0/0.16.0/0.17.0, and the same remedy.
 *         Older 0.17.0 artifacts read as miss; next miss rewrites with the
 *         new paths and solid nodes. IFC artifacts carry no occurrence data
 *         and are unaffected, but the key is format-blind so they rewrite
 *         too. See design/new/step-occurrence-selection.md §"Identity below
 *         the product".
 * 0.17.0 — retires artifacts baked by pre-1.1585 engines, releasing the
 *         #641-epic geometry + shading train (conway#666/#668/#674/#676:
 *         wrong-sheet inverse-solve recovery, ribbon-sweep chain side,
 *         analytic vertex normals + normals in the GLB, v-monotone
 *         decomposition). Geometry AND shading normals are baked into the
 *         artifact and nothing in the cache key identifies the engine, so
 *         without this bump a returning user's cache hit bypasses conway
 *         entirely and keeps serving the damaged faces and mis-grouped
 *         seam normals these releases fix — cache-miss users see the new
 *         output, cache-hit users never do. Same failure shape and same
 *         remedy as 0.15.0/0.16.0; found by review on the release PR
 *         (Share#1797). Older 0.16.0 artifacts read as miss; next miss
 *         rewrites with the new engine's output.
 * 0.16.0 — retires artifacts baked in the old coordination frame. conway
 *         1.501.1426 (bldrs-ai/conway#501, issue conway#87) stopped anchoring
 *         `COORDINATE_TO_ORIGIN` on whichever element a file happens to
 *         declare first: a model inside the precision budget now keeps the
 *         coordinates its file authored. index.ifc moved by (+76, 0,
 *         +11.4504) — x ∈ [-76, 10] became x ∈ [0, 86] — and every other
 *         near-origin model moved by its own old recentre.
 *         Geometry is baked into the GLB in world coordinates and nothing in
 *         the cache key identifies the engine, so without this bump a user
 *         holding a pre-1.501 artifact keeps rendering the model at its old
 *         position while the app's cameras — the homepage default in
 *         `utils/navigate.js`, and every `#c:` permalink captured after the
 *         bump — point at the new one. Reported as an offset homepage logo
 *         that a cache clear fixed, which is exactly the shape of this bug:
 *         cache-hit users see it, cache-miss users don't, so it survives
 *         local testing.
 *         Same failure mode and same remedy as 0.15.0 below; that entry's
 *         note about pairing an engine bump with a schema bump is the rule
 *         this follows.
 * 0.15.0 — retires STEP artifacts baked at the wrong world scale. conway
 *         1.460.1363 (bldrs-ai/conway#458, PR conway#460) stopped applying a
 *         STEP file's length-unit factor as its RECIPROCAL, so a millimetre
 *         model that used to arrive 1e6x too large now arrives at true size.
 *         Geometry is baked into the GLB in world coordinates and nothing in
 *         the cache key identifies the engine, so without this bump a user
 *         holding a pre-1.460 artifact would keep loading the oversized
 *         geometry indefinitely — never picking up the fix, and disagreeing
 *         with cache-miss users on every shared camera / cut-plane link.
 *         Older 0.14.0 artifacts read as miss; next miss rewrites at true
 *         scale. IFC artifacts are unaffected (the IFC path folds
 *         `linearScalingFactor` into its coordination matrix and never had
 *         the defect), but the key is format-blind so they rewrite too.
 *         Precedent for pairing an engine bump with a schema bump: d1a74ea.
 * 0.14.0 — fixed the batched writer dropping STEP per-occurrence data. The
 *         default render path is now the demandGeometry BatchedMesh, which
 *         has no `instanceMap`; the writer had read `occurrencePaths` /
 *         `geometryExpressIds` straight off `model.instanceMap`, so a
 *         batched-first load cached with both tables silently absent. On
 *         cache-hit the spatial tree still restored occurrence paths (NavTree
 *         highlighted) but the mesh table was gone, so scene per-occurrence
 *         selection collapsed to the part-type id (permalink reload lost the
 *         3D highlight). The writer now re-keys the batch side tables via
 *         `batchedModelOccurrenceTables`; this bump retires the occurrence-less
 *         0.13.0 artifacts those batched writes produced so the next miss
 *         rewrites them complete. IFC artifacts are unaffected (no occurrence
 *         data). See design/new/step-occurrence-selection.md.
 * 0.13.0 — replaced `BLDRS_element_properties`' monolithic gzipped-JSON
 *         payload with a block-indexed binary container ("BPRI" magic:
 *         gzipped header carrying an id→block index + the pset table,
 *         followed by independently gzipped ~1MB record blocks). The
 *         old format required inflating the whole payload into ONE JS
 *         string — V8 caps strings at ~512MiB, so PSB-class models
 *         died in pako's string join (`RangeError: Invalid string
 *         length`) and even smaller models materialised the full
 *         object graph for a panel that reads one element at a time.
 *         The reader now decodes the header index on first access and
 *         one block per record miss (LRU-cached). NO legacy read
 *         path: older 0.12.0 artifacts read as miss and rewrite; an
 *         old-format payload arriving as a shared GLB file raises a
 *         "clear local cache" alert instead of decoding.
 * 0.12.0 — extended `BLDRS_face_ids` with a geometry-piece identity table
 *         (`geometryItemIdentities`: distinct geometry express id →
 *         {type, name}, resolved through the live parser at write time).
 *         Cache-hit loads can now label anonymous below-product pieces
 *         ("Face #6321" transient NavTree rows, Properties-panel Type)
 *         without re-parsing the STEP — the ids themselves already
 *         travelled in `geometryExpressIds` (0.11.0), but their identity
 *         didn't. Older 0.11.0 artifacts read as miss; next miss rewrites
 *         with the table attached. IFC artifacts are unaffected (no
 *         geometry-express-id table). See conway#387.
 * 0.11.0 — extended `BLDRS_face_ids` with a global per-instance geometry
 *         (solid) express-id table (`geometryExpressIds`, index = synthetic
 *         instance id), and the spatial tree with Conway's ephemeral solid
 *         nodes (`includeSolids`). Together they restore per-solid selection
 *         of multibody STEP parts (NavTree `type:'solid'` rows ↔ the one
 *         body's instances) on cache-hit. Older 0.10.0 artifacts read as
 *         miss; next miss rewrites with the table and solid nodes attached.
 *         IFC artifacts are unaffected. See conway
 *         design/new/step-nonproduct-semantics.md.
 * 0.10.0 — adopted standard glTF scene naming (#1595): the writer now
 *         stamps the model title into the standard `scenes[0].name`
 *         field (what generic viewers like the three.js editor
 *         display) in addition to the Bldrs-only `extras.bldrsTitle`,
 *         replacing GLTFExporter's 'AuxScene' placeholder. Reader-side,
 *         `convertToShareModel` now surfaces standard `Object3D.name`
 *         node names (glTF `nodes[i].name` via GLTFLoader) in the
 *         NavTree / Properties panel instead of the 'Object'
 *         placeholder. Element-level hierarchy still travels in
 *         `BLDRS_spatial_tree` — the exported scene graph is a merged
 *         mesh (one node per material bin, not per IFC element), so
 *         per-element standard nodes would defeat the draw-call
 *         batching; the standard fields carry what the flat graph can
 *         express. Older 0.9.0 artifacts read as miss; next miss
 *         rewrites with the scene name attached.
 * 0.9.0 — extended `BLDRS_face_ids` with a global STEP occurrence-path
 *         table (`occurrencePaths`, index = synthetic instance id) so a
 *         cache-hit STEP model restores per-occurrence NavTree↔scene
 *         selection instead of collapsing to the part-type id shared by
 *         every reuse. Older 0.8.0 artifacts read as miss; next miss
 *         rewrites with the table attached. IFC artifacts are unaffected
 *         (no occurrence data). See design/new/step-occurrence-selection.md.
 * 0.8.0 — added `BLDRS_face_ids` glTF extension carrying per-triangle
 *         `expressID` / `instanceID` arrays as a Base64-encoded JSON
 *         payload, separate from the per-vertex attribute stream.
 *         Decouples element-identity storage from geometry compression
 *         — DRACO sequential mode now works (preserves triangle order),
 *         Meshopt still skipped (reorders triangles). Cache-hit
 *         `IfcInstanceMap` rebuilds from this extension when present,
 *         bypassing DRACO/Meshopt corruption of per-vertex `_EXPRESSID`
 *         / `_INSTANCEID`. Older 0.7.0 artifacts read as miss; next
 *         miss rewrites with face_ids attached.
 * 0.7.0 — added `BLDRS_element_properties` glTF extension carrying the
 *         IFC item-properties + property-sets closure (BFS through the
 *         reference graph from spatial-tree elements). Cache-hit GLBs
 *         now hydrate the Properties panel without re-parsing the IFC.
 *         Paired with the spatial tree extension (0.6.0), this is the
 *         last piece of §3b.iii default-on gating for `conwayDirectIfc`.
 *         Older 0.6.0 artifacts read as a miss; next miss rewrites with
 *         both extensions.
 * 0.6.0 — added `BLDRS_spatial_tree` glTF extension carrying the IFC
 *         spatial hierarchy. Cache-hit GLBs now hydrate the NavTree
 *         without re-parsing the IFC (previously required the live
 *         `viewer.IFC.loader.ifcManager` which only exists on cache-
 *         miss IFC parses). Older artifacts read as a miss because the
 *         schema version embeds in the filename; the next miss rewrites
 *         with the extension attached. See
 *         design/new/viewer-replacement.md §3b.iii default-on gating.
 * 0.5.0 — switched the writer from conway's GeometryAggregator to
 *         three.js GLTFExporter on the rendered IFCLoader model. Conway
 *         was filtering by CanonicalMeshType.BUFFER_GEOMETRY and
 *         silently dropping elements it hadn't finalized to triangles,
 *         producing fragmented cached artifacts on complex IFCs
 *         (Bldrs_Plaza, Momentum, Seestrasse). Serializing what
 *         web-ifc-three already rendered preserves every visible
 *         element and bakes COORDINATE_TO_ORIGIN automatically.
 * 0.4.0 — Bldrs GLB container wrapping one or more raw GLB chunks.
 * 0.3.0 — collapsed the per-source-kind namespace prefix; the GLB lives
 *         in the SAME OPFS dir as its source IFC.
 * 0.2.0 — generalised cache key from GitHub-only (owner/repo/branch) to a
 *         per-source-kind 3-level namespace (ns1/ns2/ns3).
 */
export const BLDRS_GLB_SCHEMA_VERSION = '0.18.0'


/**
 * Schema version for the batched-NATIVE artifact layout (view-140 S9 /
 * viewer-replacement §3b.v, the `glbBatched` flag — DEFAULT-ON): geometry
 * deduped via `EXT_mesh_gpu_instancing`, per-instance identity + verbatim
 * SOURCE colors in `BLDRS_instance_tables` (replacing the per-triangle
 * `BLDRS_face_ids`), no compression. A distinct SLOT, but DERIVED from the
 * merged version rather than an independent literal: the two layouts
 * co-exist behind the flag — flag-on writers/readers use this slot, flag-off
 * ones stay on the merged `BLDRS_GLB_SCHEMA_VERSION` slot above, and neither
 * can ever half-read the other's artifact because the version is part of the
 * FILENAME. That disjointness is what made flipping the flag on safe with no
 * migration: a user's existing merged artifacts simply read as miss and
 * rewrite.
 *
 * **Why derived, not its own literal.** Disjointness and INVALIDATION are
 * different problems, and a separate string only solves the first. Every
 * bump entry at the top of this file hangs off `BLDRS_GLB_SCHEMA_VERSION`,
 * and the last two (0.16.0, 0.15.0) are engine-coupled — the class that
 * applies verbatim to this layout, which bakes world coordinates the same
 * way (vertex positions plus per-instance TRS accessors). With `glb`,
 * `demandGeometry` and `glbBatched` all default-on, this is the slot
 * substantially every user reads. So an independent literal would mean the
 * documented ritual — bump the version, write the entry — retiring the slot
 * almost NOBODY reads, while the majority kept serving geometry baked by
 * the superseded engine: the offset-homepage-logo bug quoted at the top of
 * this file, with the cache-hit and cache-miss populations swapped, and
 * just as invisible to local testing. Interpolating removes the decision —
 * an engine-coupled bump retires both layouts for free. The cost is that an
 * engine-NEUTRAL merged bump re-parses batched artifacts once too, the same
 * tradeoff 0.15.0 already accepts for IFC ("the key is format-blind so they
 * rewrite too").
 *
 * Do not re-inline this as a literal; `glbCacheKey.test.js` pins the
 * coupling and the disjointness together.
 *
 * The merged layout remains the writer's fallback for models that load
 * merged (or that the batched writer refuses — shear, missing attributes),
 * written to its own slot as before. Note the asymmetry that follows: such a
 * model is never found by a flag-on reader, so it re-parses every load —
 * uncached, never miscached (`glbExport` logs the fallback).
 */
export const BLDRS_GLB_BATCHED_SCHEMA_VERSION = `${BLDRS_GLB_SCHEMA_VERSION}-batched`


/**
 * Derive the OPFS originalFilePath for the GLB artifact corresponding to a
 * source file. The returned path is the value to pass as `originalFilePath`
 * to `doesFileExistInOPFS` and to the worker's retrieveFileWithPathNew.
 *
 * Examples:
 *   sourcePath="models/foo.ifc", schemaVer="0.1.0"  -> "models/foo.0.1.0.glb"
 *   sourcePath="foo.step",       schemaVer="0.1.0"  -> "foo.0.1.0.glb"
 *   sourcePath="foo",            schemaVer="0.1.0"  -> "foo.0.1.0.glb"
 *
 * The source's directory prefix is preserved so the artifact lives next to
 * its source within the OPFS tree.
 *
 * @param {string} sourcePath The source file's `originalFilePath` as used
 *   elsewhere in OPFS (e.g. "subdir/model.ifc").
 * @param {string} [schemaVer] Defaults to BLDRS_GLB_SCHEMA_VERSION.
 * @return {string} The derived artifact path.
 */
export function glbArtifactPath(sourcePath, schemaVer = BLDRS_GLB_SCHEMA_VERSION) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    throw new Error('glbArtifactPath: sourcePath must be a non-empty string')
  }
  if (typeof schemaVer !== 'string' || schemaVer.length === 0) {
    throw new Error('glbArtifactPath: schemaVer must be a non-empty string')
  }

  const lastSlash = sourcePath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? sourcePath.slice(0, lastSlash + 1) : ''
  const base = lastSlash >= 0 ? sourcePath.slice(lastSlash + 1) : sourcePath

  const lastDot = base.lastIndexOf('.')
  // Drop the source extension if present; otherwise keep the whole base.
  const stem = lastDot > 0 ? base.slice(0, lastDot) : base

  return `${dir}${stem}.${schemaVer}.glb`
}


/**
 * Full OPFS key descriptor for a GLB artifact. The 3-tuple `(ns1, ns2, ns3)`
 * is the source-kind namespace; each component must be a non-empty OPFS
 * directory name (no slashes). The existing worker helpers' (owner, repo,
 * branch) parameter slots carry it unchanged.
 *
 * @param {object} args
 * @param {string} args.ns1 First namespace component (typically the source
 *   kind tag, e.g. 'gh-bldrs-ai', 'local', 'ext-example.com', 'gdrive').
 * @param {string} args.ns2 Second namespace component (e.g. GitHub repo,
 *   'BldrsLocalStorage', external host placeholder, Drive fileId).
 * @param {string} args.ns3 Third namespace component (e.g. GitHub branch,
 *   'V1', placeholder for non-GitHub sources).
 * @param {string} args.sourcePath OPFS originalFilePath of the source file.
 * @param {string} args.sourceHash Content / commit hash uniquely identifying
 *   the source bytes.
 * @param {string} [args.schemaVer]
 * @return {{owner:string, repo:string, branch:string, originalFilePath:string, commitHash:string, schemaVer:string}}
 */
export function glbCacheKey({ns1, ns2, ns3, sourcePath, sourceHash, schemaVer = BLDRS_GLB_SCHEMA_VERSION}) {
  for (const [name, val] of [['ns1', ns1], ['ns2', ns2], ['ns3', ns3]]) {
    if (typeof val !== 'string' || val.length === 0 || val.includes('/')) {
      throw new Error(`glbCacheKey: ${name} must be a non-empty string with no slashes`)
    }
  }
  if (!sourcePath || !sourceHash) {
    throw new Error('glbCacheKey: sourcePath and sourceHash are required')
  }
  return {
    owner: ns1,
    repo: ns2,
    branch: ns3,
    originalFilePath: glbArtifactPath(sourcePath, schemaVer),
    commitHash: sourceHash,
    schemaVer,
  }
}

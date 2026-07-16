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
export const BLDRS_GLB_SCHEMA_VERSION = '0.10.0'


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

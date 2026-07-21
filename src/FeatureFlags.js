export const flags = [
  {
    name: 'authentication', isActive: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  },
  {name: 'googleOAuth2', isActive: true},
  {name: 'googleDrive', isActive: true},
  // Multi-user sharing UI (Share dialog, visibility chip). Provider scaffolding
  // ships unconditionally; this flag gates the consumer surface in PR2+.
  // See design/new/multi-user-sharing.md.
  {name: 'sharing', isActive: false},
  // GitHub-as-Sources connection. The GitHubProvider, Netlify Functions and
  // /auth/gh/callback.html ship unconditionally; this flag gates the
  // SourcesTab "Connect GitHub" button + browse-via-connection wiring that
  // land in identity-decoupling PR2.
  // See design/new/identity-decoupling-decisions.md.
  {name: 'githubAsSource', isActive: false},
  // GLB runtime artifact pipeline (design/new/glb-model-sharing.md).
  // `glb` enables both the writer (post-IFC-parse cache warm-up) and the
  // reader (skip-IFC-when-GLB-cached fast path in Loader.js).
  // Default-on as of the Phase-5 prep landing — cache-hit GLB loads
  // bypass wit-three entirely (spatial tree + properties + per-element
  // picking all round-trip through BLDRS_* glTF extensions).
  {name: 'glb', isActive: true},
  // DRACO compression for cached GLBs. Applies to BOTH write and read:
  // writer pipes the GLTFExporter output through @gltf-transform's
  // draco() transform; reader wires DRACOLoader into the GLTFLoader.
  // The cached artifact's filename embeds a `-draco` schema suffix so
  // compressed and uncompressed caches don't collide. Three 0.135's
  // DRACO regression is resolved by the r184 upgrade (PR #1514).
  // Off-by-default because compression adds 100-300ms per cache write;
  // flip on via `?feature=glb,glbDraco` to size-compare on your models.
  {name: 'glbDraco', isActive: false},
  // Meshopt compression for cached GLBs. Mirror of `glbDraco` using
  // EXT_meshopt_compression via @gltf-transform's meshopt() transform.
  // Typically faster to decode than DRACO with comparable ratios.
  // When both `glbDraco` and `glbMeshopt` are on, DRACO wins
  // (deterministic; toggle the other off to compare).
  {name: 'glbMeshopt', isActive: false},
  // Verbose GLB writer/reader diagnostics (cache-key descriptor dump,
  // modelID, geometry size, chunk count). Top-level `[glb] writer/reader:`
  // milestone lines stay on whenever `glb` is on; this is the extra detail.
  {name: 'glbVerbose', isActive: false},
  // Post-parse parity check that runs the new IfcItemsMap populators
  // against the live model and logs the diff. Diagnostic only — no
  // behavior change. Phase-3 prep work for the viewer replacement
  // (design/new/viewer-replacement.md §3b). Flip on via
  // `?feature=ifcItemsMapParity` to compare the per-vertex and
  // Conway-direct populators on a real IFC.
  {name: 'ifcItemsMapParity', isActive: false},
  // Conway-direct IFC model build. When on:
  //   * The Conway-direct assembler builds a merged BufferGeometry +
  //     per-color material array from the captured FlatMesh stream,
  //     and that geometry REPLACES web-ifc-three's rendered output.
  //     The IFC manager (properties, spatial tree, typed search) is
  //     preserved; only the rendered triangles + picking source of
  //     truth change.
  //   * Picking is per-PlacedGeometry instance by default (matches
  //     what was clicked, not the whole IFC product). Shift-click
  //     expands to every instance of the parent. Hover preselection
  //     follows the same per-instance semantic.
  //   * With `glb` also on, per-vertex `instanceID` round-trips
  //     through the IFC→GLB→IFC cache automatically (GLTFExporter's
  //     `_INSTANCEID` rename + reader-side restore + capability
  //     inference + cache-hit IfcInstanceMap reconstruction).
  // Default-on as of the Phase-5 prep landing. The Conway-direct
  // geometry assembler + per-instance picking are the production
  // rendering path; live IFC parses still run wit-three to drive the
  // FlatMesh stream (geometry is then replaced by the Conway-direct
  // build). Cache-hit GLB loads bypass wit-three entirely.
  // Implies (turns on) the StreamAllMeshes capture wrapper;
  // `ifcItemsMapParity` shares the same capture.
  // Design: design/new/viewer-replacement.md §3b.
  {name: 'conwayDirectIfc', isActive: true},
  // Streamed columnar IFC open (conway epic #390). When on, the
  // cache-miss IFC parse calls Conway's `OpenModelStreamed` instead of
  // `OpenModelAsync`: the model's record index is columnar from birth
  // (no per-record object phase — the dominant JS-heap cost of parsing
  // large models). Everything downstream (mesh capture, properties,
  // spatial tree, OPFS source spill) is unchanged, and Conway falls
  // back to the classic open internally on any streamed-parse failure,
  // so this flag can never make a load fail that would have succeeded.
  // Default-on; kill switch for prod is flipping this to false (or
  // dropping the flag branch entirely once burned in).
  {name: 'streamOpen', isActive: true},
  // BatchedMesh render path: render the Conway-direct geometry as a
  // THREE.BatchedMesh (one geometry per shared shape + per-instance
  // transforms) instead of the merged BufferGeometry — the ~60% vertex-
  // memory win measured in §3b.iv, at ~1 draw call. Picking is native
  // (`batchId`). Off by default as a deploy-preview *validation gate*
  // (render/pick can't be exercised headlessly); once confirmed in a
  // preview this flips to always-on within the Conway-direct path. 3D
  // selection-outline / isolate / GLB-cache for the batched path are
  // follow-ups. Flip on via `?feature=batchedMesh`.
  // Design: design/new/viewer-replacement.md §3b.iv.
  {name: 'batchedMesh', isActive: false},
]


/**
 * Implication graph: keyed by parent flag name (lower-case), value is
 * the list of sub-flag names whose presence in the URL also activates
 * the parent. Use this when a sub-option is meaningless without the
 * parent (e.g. `glbDraco` and `glbMeshopt` configure GLB-cache
 * compression — they have no effect when the GLB pipeline itself is
 * off). Lets users write `?feature=glbDraco` instead of having to
 * remember to add `glb` explicitly.
 *
 * Keep keys + values lower-cased; lookups go through the lowercased
 * caller-supplied name in `isFeatureEnabled`.
 */
const FEATURE_IMPLICATIONS = {
  glb: ['glbdraco', 'glbmeshopt', 'glbverbose'],
}


/**
 * Non-React feature-flag check. Mirrors `useExistInFeature` (in
 * src/hooks/useExistInFeature.js) but is usable from non-component modules
 * (loaders, services, etc.). A feature is enabled if its static flag has
 * `isActive: true` OR if the URL contains `?feature=<name>` (comma-separated
 * for multiple) OR if any sub-flag that implies it is in the URL (see
 * `FEATURE_IMPLICATIONS`).
 *
 * Reads `window.location.search` directly, so this is a snapshot at call
 * time. Components that need to react to URL changes should use
 * `useExistInFeature` instead.
 *
 * @param {string} name Flag name (case-insensitive)
 * @return {boolean}
 */
export function isFeatureEnabled(name) {
  if (!name) {
    return false
  }
  const lowerName = name.toLowerCase()

  const staticFlag = flags.find((f) => f.name.toLowerCase() === lowerName)
  if (staticFlag?.isActive) {
    return true
  }

  if (typeof window === 'undefined' || !window.location) {
    return false
  }
  const enabledFeatures = new URLSearchParams(window.location.search).get('feature')
  if (!enabledFeatures) {
    return false
  }
  const urlFlags = enabledFeatures.split(',').map((f) => f.trim().toLowerCase())
  if (urlFlags.includes(lowerName)) {
    return true
  }
  // Implication check: any sub-flag in the URL activates its parent.
  // `?feature=glbDraco` (compression sub-option) implies `?feature=glb`
  // (cache pipeline) — without this the sub-option is silently
  // ignored because the parent pipeline is gated separately.
  const impliers = FEATURE_IMPLICATIONS[lowerName]
  if (impliers && impliers.some((sub) => urlFlags.includes(sub))) {
    return true
  }
  return false
}

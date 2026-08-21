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
  // Workspace shell (conversational-CAD epic assist-300, #1657): the
  // ProjectsDrawer (projects → models, localStorage-persisted) leftmost in
  // RootLandscape + the logo popup with marketing links. Flag-off layout
  // must stay byte-identical to today's — the merge into production chrome
  // is invisible until flipped.
  // See design/new/conversational-cad.md §2.
  {name: 'workspace', isActive: false},
  // Usage quotas. The quota lib (src/quota), the record-load Netlify
  // function, the useQuota hook and QuotaLimitDialog all ship
  // unconditionally; this flag gates ENFORCEMENT. When off, useQuota
  // reports unlimited capacity and record() is a no-op, so no load is
  // ever counted or blocked and the QuotaBadge stays hidden. Off by
  // default while quotas are validated against real Auth0 + public/private
  // repos; enable per-session with `?feature=quotas`. Flip isActive to true
  // to roll the limits out to everyone.
  // See design/new/quotas.md.
  {name: 'quotas', isActive: false},
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
  // OFF-switch for the streamed columnar IFC open (conway epic #390).
  // By default the cache-miss IFC parse calls Conway's
  // `OpenModelStreamed` instead of `OpenModelAsync`: the model's record
  // index is columnar from birth (no per-record object phase — the
  // dominant JS-heap cost of parsing large models). Everything
  // downstream (mesh capture, properties, spatial tree, OPFS source
  // spill) is unchanged, and Conway falls back to the classic open
  // internally on any streamed-parse failure, so streaming can never
  // fail a load the classic path would survive.
  // Inverted semantics on purpose: `?feature=` can only turn flags ON,
  // so the runtime escape hatch for a default-on behavior must be an
  // off-flag — `?feature=disableStreamOpen` reverts one session (and
  // A/Bs the same build); flipping this to true is the prod-wide kill
  // switch.
  {name: 'disableStreamOpen', isActive: false},
  // Demand/tiled rendering (design/new/demand-tiled-rendering.md,
  // #1613): cache-miss IFC/STEP parses open with DEFER_GEOMETRY and
  // pump Conway's ExtractGeometryBatch — parse-time preview + the
  // durable model assembling incrementally on screen instead of one
  // 30s+ whole-model extraction. Default ON (shipped with the
  // milestone: PSB 77s -> 57s); `?feature=disableStreamOpen` remains
  // the classic-path escape hatch and this flag the demand kill switch.
  {name: 'demandGeometry', isActive: true},
  // Geometry worker pool (conway#394 M3, design/new/geometry-workers.md).
  // Cache-miss IFC geometry extraction moves off the main thread into N
  // conway instances, each with its own wasm heap, pumping a disjoint shard
  // of the products. Measured in node at 2.59x on PSB at N=4; the browser
  // number is what the smoke instance is for.
  //
  // Off by default because the worker-side wasm init cost in a BROWSER is
  // unmeasured — in node it dominated small models, so PSB-scale wins and
  // MB-Khaya-scale losses are both plausible until a real run says.
  // `?feature=workers` sizes the pool from hardwareConcurrency AND declines
  // on sources below `MIN_POOL_SOURCE_MB` — standing the pool up is a fixed
  // cost charged before the first product is touched, so on a small model it
  // is pure overhead (Share#1760). `?feature=workers1` (…2, …3, …) pins a
  // count, which is how N is compared against N=1 on one machine, and is
  // honoured at any size so a benchmark cannot silently opt itself out.
  {name: 'workers', isActive: false},
  {name: 'workers1', isActive: false},
  {name: 'workers2', isActive: false},
  {name: 'workers3', isActive: false},
  {name: 'workers4', isActive: false},
  {name: 'workers5', isActive: false},
  {name: 'workers6', isActive: false},
  {name: 'workers7', isActive: false},
  {name: 'workers8', isActive: false},
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
  // Synthetic per-part coloring for STEP/CAD models that carry no
  // presentation data. When a batched model comes back entirely
  // default-grey (no COLOUR_RGB / STYLED_ITEM, e.g. the Jetenginestep
  // AP203 export), each part is repainted from a curated palette (colors
  // assigned by dense index over the sorted distinct parts, so ≤ palette
  // -size parts never collide) — Onshape-style, so a multi-part assembly is
  // legible instead of a grey blob. Strictly no-op the moment any real
  // color is present, so IFC and colored STEP are untouched. Default-on; it
  // only changes models that had zero color to begin with.
  // See src/viewer/ifc/productPalette.js.
  {name: 'autoColorParts', isActive: true},
  // Diagnostic OFF-switch for the full-screen loading overlay
  // (Components/LoadingBackdrop.jsx). The overlay is a dimmer that sits
  // above the canvas, so it also swallows pointer events for the whole
  // load — which makes anything that goes wrong *during* a progressive
  // load unobservable: you cannot orbit or zoom out to tell "the model
  // shifted offscreen" apart from "the model isn't there".
  // `?feature=disableLoadOverlay` leaves the canvas live so a load can be
  // inspected while it streams.
  //
  // Note when using it: taking the camera fires `controlstart`, which
  // stops ProgressiveLoadSession's camera follow permanently (by design
  // — the user outranks the follow). So the first interaction freezes
  // the camera for the rest of the load. That is what makes the flag
  // useful for "where did it go", and also why the follow's own framing
  // can't be observed in the same run.
  //
  // Inverted semantics on purpose: `?feature=` can only turn flags ON,
  // so an off-switch for default-on behavior has to be an off-flag.
  {name: 'disableLoadOverlay', isActive: false},
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


/* One-shot guard: the warning below is about the URL, which does not change
 * within a page load, so it is worth saying once and never again. */
let warnedUnknownFlags = false


/**
 * Warn once about `?feature=` names that match no flag.
 *
 * `?feature=` can only turn flags ON, and an unrecognised name is simply not
 * found — so a typo is indistinguishable from the feature being off. That is
 * fine for a flag you can see the effect of, and quietly costly for one whose
 * whole purpose is a measurement: `?feature=worker4` (singular) reads exactly
 * like `?feature=workers4` and silently produces a baseline run, which is a
 * benchmark you then believe.
 *
 * Warn, don't guess: correcting a near-miss to the flag we think was meant
 * would turn a typo into a different silent behaviour.
 */
function warnUnknownUrlFlags() {
  if (warnedUnknownFlags || typeof window === 'undefined' || !window.location) {
    return
  }
  warnedUnknownFlags = true

  const requested = new URLSearchParams(window.location.search).get('feature')
  if (!requested) {
    return
  }
  const known = new Set(flags.map((f) => f.name.toLowerCase()))
  const unknown = requested
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !known.has(f.toLowerCase()))

  if (unknown.length > 0) {
    console.warn(
      `[features] ignoring unknown ?feature= value(s): ${unknown.join(', ')} — ` +
      'nothing was enabled by them')
  }
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

  warnUnknownUrlFlags()

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

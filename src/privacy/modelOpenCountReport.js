/*
 * The shape of a model-open report: what the page may say about one real
 * model load, displayed or failed, and the only thing the `model-open-count`
 * function will pass on to GA. Shared by the page (app/modelOpenCount.js) and
 * the function (netlify/functions/model-open-count.js), so neither can send or
 * accept a value the other doesn't know. design/new/model-open-counts.md says
 * why it exists: GA no longer runs in the browser (owner, 2026-11-25), and
 * these cookieless first-party reports are the main usage signal.
 *
 * Every field is a closed enum, a bounded integer, or the in-memory page
 * session id. Nothing here can carry a URL, a file name, a path or a content
 * id: the function rejects any report with a key or value it doesn't know.
 * The one model name allowed is a sample's, from the Open dialog's roster
 * (Components/Open/sampleModelRoster.js): those models are ours and public.
 *
 * Browser-safe and Node-safe: no imports, no globals. That is why the lists
 * below are written out rather than imported (Filetype.js pulls in axios and
 * three; the roster lives under Components); modelOpenCountReport.test.js
 * holds each equal to its source.
 */


/** The GA event the function sends for a report. */
export const MODEL_OPEN_COUNT_EVENT = 'model_open_count'

/** Longest body the function reads; a real report is under 600 bytes. */
export const MAX_REPORT_BYTES = 1024

/**
 * Filetype.js#supportedTypes, in its order. A loaded model's `type` is the
 * loader's extension (Loader.js#findLoader), or `glb` for a cache hit.
 */
export const MODEL_OPEN_FORMATS = Object.freeze([
  'adf', 'fbx', 'glb', 'gltf', 'ifc', 'ifczip', 'ksplat', 'nrrd', 'obj', 'pdb', 'ply', 'sog', 'splat',
  'spz', 'step', 'stl', 'stp', 'usd', 'usda', 'usdc', 'usdz', 'xyz', 'zip',
])

/** sampleModelRoster.js#SAMPLE_MODELS' names, lowercased, in roster order. */
export const SAMPLE_IDS = Object.freeze([
  'momentum', 'seestrasse', 'gear', 'arty', 'jetengine', 'robot_hand', 'caffeine',
])

/** loader/loadAnalytics.js#LOAD_FAILURE_REASONS' values; `none` for a load that didn't fail. */
export const REASON_CLASSES = Object.freeze(['oom', 'parse', 'unsupported_schema', 'unrecognized_format', 'other', 'none'])

/**
 * loader/loadAnalytics.js#KNOWN_LOAD_PHASES, plus its `none` (no phase seen,
 * and every load that didn't fail) and `other`.
 */
export const LAST_PHASES = Object.freeze([
  'download', 'headerparse', 'dataparse', 'geometry', 'scenebuild', 'serialize', 'convert',
  'applying-model-fixups', 'buffering-model-bytes', 'converting-model-format',
  'decoding-model-data', 'downloading-model-data', 'hashing-model',
  'parsing-model-data', 'preparing-file-download', 'processing-model-data',
  'reading-model-data', 'none', 'other',
])

/**
 * The closed value set of each required field. A report must carry every one.
 *
 * - `content_type`: the model's format, `other` for anything not in
 *   MODEL_OPEN_FORMATS.
 * - `size_bucket`: loader/loadAnalytics.js#bucketFileSize's buckets, the ones
 *   `load_failed` uses, so the two divide by size the same way.
 * - `source`: where the model came from. `sample` is the Open dialog's
 *   samples and any other Bldrs-hosted project file; the bundled demo is
 *   never reported (privacy/analytics.js#isRealModelOpen).
 * - `sample_id`: which sample, for a sample from the roster; else `none`.
 * - `open_kind`: the page's first open or one switched to in-app
 *   (utils/reportModelOpen.js#modelOpenKind).
 * - `form_factor`: mobile or desktop (clientCapabilities.js#formFactor).
 * - `load_outcome`: loader/loadProgress.js#LOAD_OUTCOMES for a load that
 *   finished, `failed` for one that threw.
 * - `reason_class`, `last_phase`: `load_failed`'s pair for a failed load;
 *   `none` for any other.
 * - `triangle_bucket`, `error_bucket`, `warning_bucket`: the geometry the
 *   load produced and the engine's (else the console tee's) error and warning
 *   counts, bucketed (app/modelOpenCount.js#triangleBucket, #countBucket);
 *   `unknown` when not measured, which a failed load always is. Buckets, not
 *   counts: an exact triangle count, or an engine's exact error tally, is the
 *   same on every open of a model, so it would fingerprint a private model
 *   across visits (codex on #2355).
 */
export const MODEL_OPEN_COUNT_FIELDS = Object.freeze({
  content_type: Object.freeze([...MODEL_OPEN_FORMATS, 'other']),
  size_bucket: Object.freeze(['<1mb', '1-10mb', '10-50mb', '50-200mb', '200mb+', 'unknown']),
  source: Object.freeze(['local', 'sample', 'github', 'gdrive', 'url']),
  sample_id: Object.freeze([...SAMPLE_IDS, 'none']),
  open_kind: Object.freeze(['page', 'in_app']),
  form_factor: Object.freeze(['mobile', 'desktop']),
  load_outcome: Object.freeze(['displayed', 'no_geometry', 'unusable', 'failed']),
  reason_class: REASON_CLASSES,
  last_phase: LAST_PHASES,
  triangle_bucket: Object.freeze(['<10k', '10k-100k', '100k-1m', '1m-10m', '10m+', 'unknown']),
  error_bucket: Object.freeze(['0', '1-9', '10-99', '100-999', '1000+', 'unknown']),
  warning_bucket: Object.freeze(['0', '1-9', '10-99', '100-999', '1000+', 'unknown']),
})

/**
 * The page session id, required. GA4's own Measurement Protocol `session_id`
 * parameter, which must be a positive integer (`^\d+$`), so GA groups one
 * visit's loads into a session itself. Random, made once per page load and
 * held only in memory (app/modelOpenCount.js#pageSessionId): it is not an
 * identifier of the browser, and a reload starts a new one. At most 16
 * digits, the range the page draws from.
 */
export const SESSION_ID_PATTERN = /^[1-9]\d{0,15}$/

/**
 * Optional timings in ms, each a non-negative safe integer when present.
 * Absent when the load didn't produce it (a failed load has none; a mesh
 * format has no engine timings), so GA tells "not measured" from 0. Raw
 * numbers, unlike the counts above: a timing moves with the network, the
 * device and what else the page is doing, so it doesn't repeat across visits.
 *
 * - `load_ms`: the reporter's wall clock, load start to end, the same
 *   definition for every format (`stats_loadTime` on real_model_open).
 * - `first_mesh_ms`: load start to the first mesh on screen.
 * - `open_ms`, `parse_ms`, `geometry_ms`: the engine's own stage timers, for
 *   IFC/STEP (ShareIfcLoader#loadStats).
 */
export const MODEL_OPEN_COUNT_MEASURES = Object.freeze([
  'load_ms', 'first_mesh_ms', 'open_ms', 'parse_ms', 'geometry_ms',
])


/**
 * A report as the function will accept it, or null.
 *
 * @param {string} text the request body
 * @return {?object} every MODEL_OPEN_COUNT_FIELDS key with a known value,
 *   `session_id`, and any of MODEL_OPEN_COUNT_MEASURES; nothing else
 */
export function parseModelOpenCountReport(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_REPORT_BYTES) {
    return null
  }
  let value
  try {
    value = JSON.parse(text)
  } catch (_) {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const report = {}
  for (const [field, allowed] of Object.entries(MODEL_OPEN_COUNT_FIELDS)) {
    if (!allowed.includes(value[field])) {
      return null
    }
    report[field] = value[field]
  }
  if (typeof value.session_id !== 'string' || !SESSION_ID_PATTERN.test(value.session_id)) {
    return null
  }
  report.session_id = value.session_id
  for (const key of Object.keys(value)) {
    // Own keys only: `in` would also find Object.prototype's, and so wave a
    // body key like `constructor` through unchecked.
    if (Object.prototype.hasOwnProperty.call(report, key)) {
      continue
    }
    if (!MODEL_OPEN_COUNT_MEASURES.includes(key) || !Number.isSafeInteger(value[key]) || value[key] < 0) {
      return null
    }
    report[key] = value[key]
  }
  return report
}

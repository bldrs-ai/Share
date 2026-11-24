/*
 * The shape of a model-open count: what the page may say about one real model
 * open, and the only thing the `model-open-count` function will pass on to
 * GA. Shared by the page (privacy/modelOpenCount.js) and the function
 * (netlify/functions/model-open-count.js), so neither can send or accept a
 * value the other doesn't know. design/new/model-open-counts.md says why it
 * exists: since #2051 GA sees only consenting visitors, and this count is the
 * one that needs no consent.
 *
 * Every field is a closed enum. Nothing here can carry a URL, a file name, a
 * path, a content id, a client id or a time of day: the function rejects any
 * report that isn't exactly these keys with these values. A field that can't
 * be a closed enum doesn't belong here.
 *
 * Browser-safe and Node-safe: no imports, no globals. That is why the format
 * list is written out rather than imported from src/Filetype.js (which pulls
 * in axios and three); modelOpenCountReport.test.js holds the two equal.
 */


/** The GA event the function sends for a report. */
export const MODEL_OPEN_COUNT_EVENT = 'model_open_count'

/** Longest body the function reads; a real report is under 150 bytes. */
export const MAX_REPORT_BYTES = 512

/**
 * Filetype.js#supportedTypes, in its order. A loaded model's `type` is the
 * loader's extension (Loader.js#findLoader), or `glb` for a cache hit.
 */
export const MODEL_OPEN_FORMATS = Object.freeze([
  'adf', 'fbx', 'glb', 'gltf', 'ifc', 'ifczip', 'ksplat', 'nrrd', 'obj', 'pdb', 'ply', 'sog', 'splat',
  'spz', 'step', 'stl', 'stp', 'usd', 'usda', 'usdc', 'usdz', 'xyz', 'zip',
])

/**
 * The closed value set of each field. A report must carry every field, and
 * nothing else.
 *
 * - `content_type`: the model's format, `other` for anything not in
 *   MODEL_OPEN_FORMATS (a loader that tagged itself oddly).
 * - `size_bucket`: loader/loadAnalytics.js#bucketFileSize's buckets, the
 *   ones `load_failed` sends, so the two divide by size the same way.
 * - `source`: where the model came from. `sample` is the Open dialog's
 *   samples and any other Bldrs-hosted project file; the bundled demo is
 *   never counted (privacy/analytics.js#isRealModelOpen).
 * - `open_kind`: the page's first open or one switched to in-app
 *   (utils/reportModelOpen.js#modelOpenKind).
 * - `form_factor`: mobile or desktop (clientCapabilities.js#formFactor).
 * - `consent`: the visitor's analytics setting (privacy/analytics.js
 *   #isAllowed). The count is sent either way; this says which, so GA can
 *   tell the opens it also saw as real_model_open from the ones it didn't.
 */
export const MODEL_OPEN_COUNT_FIELDS = Object.freeze({
  content_type: Object.freeze([...MODEL_OPEN_FORMATS, 'other']),
  size_bucket: Object.freeze(['<1mb', '1-10mb', '10-50mb', '50-200mb', '200mb+', 'unknown']),
  source: Object.freeze(['local', 'sample', 'github', 'gdrive', 'url']),
  open_kind: Object.freeze(['page', 'in_app']),
  form_factor: Object.freeze(['mobile', 'desktop']),
  consent: Object.freeze(['on', 'off']),
})


/**
 * A report as the function will accept it, or null.
 *
 * @param {string} text the request body
 * @return {?object} exactly the MODEL_OPEN_COUNT_FIELDS keys, each a known value
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
  const fields = Object.keys(MODEL_OPEN_COUNT_FIELDS)
  if (Object.keys(value).length !== fields.length) {
    return null
  }
  const report = {}
  for (const field of fields) {
    if (!MODEL_OPEN_COUNT_FIELDS[field].includes(value[field])) {
      return null
    }
    report[field] = value[field]
  }
  return report
}

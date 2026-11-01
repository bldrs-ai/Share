import {supportedTypes} from '../Filetype'
import {prefixObjectKeys} from '../utils/objects'
import {isOutOfMemoryError} from '../utils/oom'
import {EngineOpenFailureError, STATUS_UNRECOGNIZED_FORMAT} from './engineOpenFailure'
import {UnsupportedSchemaError} from './unsupportedSchema'


/*
 * GA4 params for load outcomes (Share#1954, ops#28 §6): the pure half of
 * the instrumentation, kept apart from CadView and the reporter so the
 * closed vocabularies below are testable without a viewer.
 *
 * Everything that reaches GA here comes from a closed set or a bucket.
 * Nothing is free text: error messages, file names and URLs can carry
 * user content, and GA4 custom dimensions have a cardinality budget.
 */


/** `load_failed` `reason_class` values. Closed set; see classifyLoadFailure. */
export const LOAD_FAILURE_REASONS = Object.freeze({
  OOM: 'oom',
  PARSE: 'parse',
  UNSUPPORTED_SCHEMA: 'unsupported_schema',
  // conway could not recognise the bytes as a STEP/IFC file at all (a zip, a
  // UTF-16 save, an HTML error page, …): conway#742's UNRECOGNIZED_FORMAT.
  // Split out of `parse` because it is the user's file, not an engine bug.
  UNRECOGNIZED_FORMAT: 'unrecognized_format',
  OTHER: 'other',
})

const BYTES_PER_MB = 1024 * 1024 // eslint-disable-line no-magic-numbers

/** Upper bounds (exclusive, MB) and labels for `size_bucket`. */
const SIZE_BUCKETS_MB = [
  [1, '<1mb'],
  [10, '1-10mb'],
  [50, '10-50mb'], // eslint-disable-line no-magic-numbers
  [200, '50-200mb'], // eslint-disable-line no-magic-numbers
]
const SIZE_BUCKET_LARGEST = '200mb+'
export const SIZE_BUCKET_UNKNOWN = 'unknown'

/**
 * Engine and loader messages that mean the bytes were reached but could not
 * be turned into a model: the OpenModel/parse family from conway, Share's
 * own post-parse build failures, and the loaders' "could not read".
 * Network and routing failures ("No response received", "Error response
 * from server", "Invalid URL path") deliberately do not match: those are
 * `other`, because nothing was parsed.
 */
const PARSE_FAILURE_PATTERN =
  /pars(e|ing)|openmodel|could not read model|builder construction|batched build|no renderable geometry/i

/** `load_failed` `last_phase` when no progress event was seen. */
export const PHASE_NONE = 'none'
const PHASE_OTHER = 'other'

/**
 * The phase vocabulary GA may carry, as slugs. Engine phases are conway's
 * ProgressEvent taxonomy (progress_log.js STAGE_LABELS); the rest are the
 * legacy strings Loader#load passes to onProgress, slugged by
 * normalizeLoadPhase. Anything else becomes `other`.
 */
const KNOWN_PHASES = new Set([
  'download', 'headerparse', 'dataparse', 'geometry', 'scenebuild', 'serialize', 'convert',
  'applying-model-fixups', 'buffering-model-bytes', 'converting-model-format',
  'decoding-model-data', 'downloading-model-data', 'hashing-model',
  'parsing-model-data', 'preparing-file-download', 'processing-model-data',
  'reading-model-data',
])

// Loader#load reports download progress as the bare string `12 MB`, which
// reaches the reporter as a phase of its own.
const DOWNLOAD_PROGRESS_PATTERN = /^\d+(\.\d+)?\s*mb$/i


/**
 * Bucket a byte count for the `size_bucket` param. A raw size is both
 * high-cardinality and, for a private model, close to identifying.
 *
 * @param {number} [bytes] model size when the load reported it
 * @return {string} '<1mb' | '1-10mb' | '10-50mb' | '50-200mb' | '200mb+' | 'unknown'
 */
export function bucketFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return SIZE_BUCKET_UNKNOWN
  }
  const megabytes = bytes / BYTES_PER_MB
  const bucket = SIZE_BUCKETS_MB.find(([limitMb]) => megabytes < limitMb)
  return bucket ? bucket[1] : SIZE_BUCKET_LARGEST
}


/**
 * Reduce a reporter phase to the closed set GA may carry.
 *
 * @param {string} [phase] the last `load.phase` the reporter saw
 * @return {string} a slug from KNOWN_PHASES, `download` for byte-count
 *   strings, 'none' when no event arrived, else 'other'
 */
export function normalizeLoadPhase(phase) {
  if (typeof phase !== 'string' || phase === '') {
    return PHASE_NONE
  }
  if (DOWNLOAD_PROGRESS_PATTERN.test(phase.trim())) {
    return 'download'
  }
  const slug = phase.trim().toLowerCase().replace(/(\.\.\.|…)$/, '').trim().replace(/\s+/g, '-')
  return KNOWN_PHASES.has(slug) ? slug : PHASE_OTHER
}


/**
 * Place a load failure in the `reason_class` closed set. Order matters:
 * OOM first, because an out-of-memory abort during parsing also matches
 * the parse pattern, and unsupported-schema is a typed refusal that
 * CadView already handles as its own outcome.
 *
 * @param {*} error whatever loadModel threw
 * @return {string} one of LOAD_FAILURE_REASONS
 */
export function classifyLoadFailure(error) {
  if (error?.isOutOfMemory === true || isOutOfMemoryError(error)) {
    return LOAD_FAILURE_REASONS.OOM
  }
  if (error instanceof UnsupportedSchemaError) {
    return LOAD_FAILURE_REASONS.UNSUPPORTED_SCHEMA
  }
  // Only the status picks the class, never the reason text (free text; see
  // the closed-set note at the top). Any other engine status stays `parse`
  // through the message pattern below, as the generic -1 always did.
  if (error instanceof EngineOpenFailureError && error.status === STATUS_UNRECOGNIZED_FORMAT) {
    return LOAD_FAILURE_REASONS.UNRECOGNIZED_FORMAT
  }
  const message = typeof error?.message === 'string' ? error.message : ''
  return PARSE_FAILURE_PATTERN.test(message) ?
    LOAD_FAILURE_REASONS.PARSE :
    LOAD_FAILURE_REASONS.OTHER
}


/**
 * A model format for GA from a file extension: only the formats Share
 * supports, otherwise 'unknown'. Free-form extensions ("Model.v2 final")
 * stay out of a dimension.
 *
 * @param {string} [extension] lowercase extension without the dot
 * @return {string}
 */
export function knownFormat(extension) {
  return supportedTypes.includes(extension) ? extension : 'unknown'
}


/**
 * Params of the `load_failed` event.
 *
 * @param {object} opts
 * @param {*} opts.error what loadModel threw
 * @param {string} [opts.format] extension of the model being loaded
 * @param {number} [opts.fileSize] bytes, when the load got far enough to know
 * @param {string} [opts.phase] last reporter phase, when a load reported one
 * @return {{content_type: string, size_bucket: string, reason_class: string, last_phase: string}}
 */
export function loadFailureParams({error, format, fileSize, phase}) {
  return {
    content_type: knownFormat(format),
    size_bucket: bucketFileSize(fileSize),
    reason_class: classifyLoadFailure(error),
    last_phase: normalizeLoadPhase(phase),
  }
}


/**
 * Copy of `obj` without undefined values. A param GA never received is
 * different from one it received as undefined, and the "absent until conway
 * ships it" counters rely on the former.
 *
 * @param {Record<string, any>} obj
 * @return {Record<string, any>}
 */
export function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
}


/**
 * Params for `real_model_open` that describe how the load went: the
 * `load_outcome` verdict plus every `stats_*` value.
 *
 * Two sources merge. `completedStats` is the progress reporter's
 * cross-format snapshot (loadProgress#getCompletedLoadStats), `loadStats`
 * is conway's engine view for IFC/STEP (ShareIfcLoader). The engine wins
 * where both speak (memoryUsed, and counts once conway#740 adds them),
 * with ONE exception: `loadTime` always comes from the reporter. It is the
 * wall clock from load start to load end, the same definition for every
 * format. Conway's own total (`stats_openMs`) is a parse timer that
 * excludes download, wasm init and the geometry pump, and letting it
 * overwrite `loadTime` is what made the metric mix two definitions
 * (Share#1954).
 *
 * Values that are undefined are dropped, so a counter nothing produced is
 * absent in GA rather than present and empty.
 *
 * @param {object} opts
 * @param {object} [opts.completedStats] reporter snapshot, unprefixed keys
 * @param {object} [opts.loadStats] engine stats, unprefixed keys
 * @param {string} [opts.loadOutcome] 'displayed' | 'no_geometry' | 'unusable'
 * @return {Record<string, any>} params, `stats_`-prefixed except `load_outcome`
 */
export function buildOutcomeParams({completedStats, loadStats, loadOutcome}) {
  const merged = {...completedStats, ...loadStats}
  if (completedStats?.loadTime !== undefined) {
    merged.loadTime = completedStats.loadTime
  }
  return omitUndefined({
    load_outcome: loadOutcome,
    ...prefixObjectKeys(omitUndefined(merged), 'stats_'),
  })
}

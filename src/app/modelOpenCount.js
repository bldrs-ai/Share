import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster'
import {shouldInitGa} from '../index/ga'
import {bucketFileSize, loadFailureParams} from '../loader/loadAnalytics'
import {modelOpenKind} from '../utils/reportModelOpen'
import {formFactor} from '../privacy/clientCapabilities'
import {
  MODEL_OPEN_COUNT_FIELDS,
  MODEL_OPEN_COUNT_MEASURES,
  MODEL_OPEN_FORMATS,
} from '../privacy/modelOpenCountReport'
import {isSampleModel} from './localOnlyMode'


/**
 * Where a report goes: a function on Share's own origin, which passes it to GA
 * through the Measurement Protocol (netlify/functions/model-open-count.js).
 * Same-origin, like client-capabilities, so a blocker that stops
 * googletagmanager.com lets it through, and the visitor's IP never reaches
 * Google. The name avoids the words filter lists match on paths (`beacon`,
 * `collect`, `analytics`, `track`, `telemetry`).
 */
export const MODEL_OPEN_COUNT_PATH = '/.netlify/functions/model-open-count'


// The sample roster's GitHub routes by repo path, the shape a GitHub route
// result's getRepoPath() gives (`/org/repo/branch/file`), the same derivation
// as app/localOnlyMode.js#SAMPLE_REPO_PATHS. The camera fragment is not part
// of the model.
const GH_ROUTE_PREFIX = '/share/v/gh'
const SAMPLE_ID_BY_REPO_PATH = new Map(
  SAMPLE_MODELS
    .map((sample) => [sample.path.split('#')[0], sample.name.toLowerCase()])
    .filter(([path]) => path.startsWith(`${GH_ROUTE_PREFIX}/`))
    .map(([path, id]) => [path.slice(GH_ROUTE_PREFIX.length), id]),
)


/*
 * The page session id: GA4's Measurement Protocol `session_id`, so GA groups
 * one visit's loads into a session. Random, drawn on first use, and held in
 * this module variable ONLY: never a cookie, localStorage, sessionStorage,
 * IndexedDB or OPFS (modelOpenCount.test.js spies on each). So it lives
 * exactly as long as the page: an in-app model switch keeps it, a reload or a
 * new tab draws another, and nothing on the device ties one visit to the next.
 * That is what keeps the report free of an identifier of the browser.
 */
let pageSessionId = null

// 2^53 / 2^32: the high word's range that keeps the id a safe integer.
const HIGH_WORD_LIMIT = 0x200000
const UINT32_RANGE = 0x100000000


/**
 * @param {object} [cryptoApi] globalThis.crypto, for tests
 * @return {string} this page's session id, a positive integer of at most 16
 *   digits (modelOpenCountReport.js#SESSION_ID_PATTERN)
 */
export function pageSession(cryptoApi = globalThis.crypto) {
  if (pageSessionId === null) {
    const words = new Uint32Array(2)
    cryptoApi.getRandomValues(words)
    // A 53-bit draw, then +1 so it is never 0 (GA's pattern is a positive
    // integer); the largest result, 2^53, is still 16 digits.
    pageSessionId = String(((words[0] % HIGH_WORD_LIMIT) * UINT32_RANGE) + words[1] + 1)
  }
  return pageSessionId
}


/**
 * The `source` of a route, one of MODEL_OPEN_COUNT_FIELDS.source. The same
 * split as privacy/analytics.js#modelRouteSource, with the samples (GitHub
 * routes, app/localOnlyMode.js#isSampleModel) told apart from the user's own
 * GitHub models. A `file` route that isn't an upload is a Bldrs-hosted
 * project file; the bundled demo, the only one the homepage opens, never gets
 * here (isRealModelOpen), so the rest count as samples.
 *
 * @param {object} routeResult routes.ts#handleRoute, the store's modelPath
 * @return {string|undefined} undefined for a route kind with no source
 */
export function modelOpenSource(routeResult) {
  if (routeResult?.kind === 'file') {
    return routeResult.isUploadedFile === true ? 'local' : 'sample'
  }
  if (routeResult?.kind === 'provider' && routeResult.provider === 'github') {
    return isSampleModel(routeResult) ? 'sample' : 'github'
  }
  if (routeResult?.kind === 'provider' && routeResult.provider === 'google') {
    return 'gdrive'
  }
  if (routeResult?.kind === 'url') {
    return 'url'
  }
  return undefined
}


/**
 * @param {object} routeResult
 * @return {string} the roster sample's id, or `none` for anything else, a
 *   user's own model above all: no other model is ever named
 */
export function modelOpenSampleId(routeResult) {
  if (!isSampleModel(routeResult)) {
    return 'none'
  }
  return SAMPLE_ID_BY_REPO_PATH.get(routeResult.getRepoPath()) ?? 'none'
}


/**
 * The enum fields every report carries, or null when one has no value in its
 * enum (no source, no open kind), in which case nothing is sent rather than a
 * guess.
 *
 * @param {object} routeResult
 * @param {object} fields content_type, size_bucket, load_outcome and the
 *   failure pair, already in their enums
 * @param {object} env openKind, nav
 * @return {?object}
 */
function baseReport(routeResult, fields, {openKind = modelOpenKind(routeResult), nav = globalThis.navigator} = {}) {
  const source = modelOpenSource(routeResult)
  if (!source || !MODEL_OPEN_COUNT_FIELDS.open_kind.includes(openKind)) {
    return null
  }
  return {
    content_type: fields.content_type,
    size_bucket: fields.size_bucket,
    source,
    sample_id: modelOpenSampleId(routeResult),
    open_kind: openKind,
    form_factor: formFactor(nav),
    load_outcome: fields.load_outcome,
    reason_class: fields.reason_class ?? 'none',
    last_phase: fields.last_phase ?? 'none',
    session_id: pageSession(),
  }
}


/**
 * @param {*} type a loaded model's or failure's format
 * @return {string} one of MODEL_OPEN_COUNT_FIELDS.content_type
 */
function contentType(type) {
  const format = String(type ?? '').toLowerCase()
  return MODEL_OPEN_FORMATS.includes(format) ? format : 'other'
}


// real_model_open's `stats_*` params (loadAnalytics#buildOutcomeParams) that
// the report carries, by the report's own name. Each falls back in order: the
// engine's error and warning counts when it supplies them, else the console
// tee's, as captureLoadDiagnostics reads them.
const MEASURE_SOURCES = Object.freeze({
  load_ms: ['stats_loadTime'],
  first_mesh_ms: ['stats_firstMeshMs'],
  open_ms: ['stats_openMs'],
  parse_ms: ['stats_parseTime'],
  geometry_ms: ['stats_geometryTime'],
  triangle_count: ['stats_triangleCount'],
  vertex_count: ['stats_vertexCount'],
  error_count: ['stats_errorCount', 'stats_pageErrorCount'],
  warning_count: ['stats_warningCount', 'stats_pageWarnCount'],
})


/**
 * @param {object} outcomeParams buildOutcomeParams' result
 * @return {object} the measures that are present and finite, rounded to
 *   integers (engine timers can be fractional) and clamped at 0
 */
function measuresOf(outcomeParams = {}) {
  const measures = {}
  for (const name of MODEL_OPEN_COUNT_MEASURES) {
    const value = MEASURE_SOURCES[name]
      .map((param) => Number(outcomeParams[param]))
      .find((n) => Number.isFinite(n))
    if (value !== undefined) {
      measures[name] = Math.max(0, Math.round(value))
    }
  }
  return measures
}


/**
 * The report for a load that finished.
 *
 * @param {object} routeResult the route loaded
 * @param {object} loadedModel the loaded model; only its `type` is read
 * @param {object} [env]
 * @param {object} [env.outcomeParams] real_model_open's `load_outcome` and
 *   `stats_*` params (loadAnalytics#buildOutcomeParams)
 * @param {string} [env.openKind] utils/reportModelOpen.js#OpenKind
 * @param {object} [env.nav] navigator
 * @return {?object}
 */
export function modelOpenCountReport(routeResult, loadedModel, {outcomeParams = {}, ...env} = {}) {
  const outcome = MODEL_OPEN_COUNT_FIELDS.load_outcome.includes(outcomeParams.load_outcome) &&
    outcomeParams.load_outcome !== 'failed' ? outcomeParams.load_outcome : 'displayed'
  const report = baseReport(routeResult, {
    content_type: contentType(loadedModel?.type),
    size_bucket: bucketFileSize(Number(outcomeParams.stats_fileSize)),
    load_outcome: outcome,
  }, env)
  return report && {...report, ...measuresOf(outcomeParams)}
}


/**
 * The report for a load that threw: `load_failed`'s closed-set params
 * (loadAnalytics#loadFailureParams) in the report's fields, and no measures.
 *
 * @param {object} routeResult the route loaded
 * @param {object} failure
 * @param {*} failure.error what the load threw
 * @param {string} [failure.format] the model's extension, when known
 * @param {number} [failure.fileSize]
 * @param {string} [failure.phase] the last reporter phase
 * @param {object} [env] openKind, nav
 * @return {?object}
 */
export function modelOpenFailureReport(routeResult, {error, format, fileSize, phase}, env = {}) {
  const params = loadFailureParams({error, format, fileSize, phase})
  return baseReport(routeResult, {
    content_type: contentType(params.content_type),
    size_bucket: params.size_bucket,
    load_outcome: 'failed',
    reason_class: params.reason_class,
    last_phase: params.last_phase,
  }, env)
}


/**
 * Hand one report to the browser. Only where GA itself would have loaded
 * (index/ga.js#shouldInitGa's host rule: production, or a bldrs deploy
 * preview with `?feature=gaEnableInPreview`; never localhost or under
 * webdriver), so dev, unit tests and E2E send nothing.
 *
 * `navigator.sendBeacon` posts a string as text/plain, a simple request, so
 * there is no preflight and it survives the page unloading. `fetch` with
 * `keepalive` is the fallback. Best-effort: never throws.
 *
 * @param {Function} build returns the report, or null to send nothing
 * @param {object} env hostname, isWebdriver, enableInPreview (shouldInitGa's)
 *   and nav, for tests
 * @return {boolean} whether a report was handed to the browser
 */
function send(build, env) {
  try {
    const hostEnv = {}
    for (const key of ['hostname', 'isWebdriver', 'enableInPreview']) {
      if (key in env) {
        hostEnv[key] = env[key]
      }
    }
    if (!shouldInitGa(hostEnv)) {
      return false
    }
    const report = build()
    if (!report) {
      return false
    }
    const body = JSON.stringify(report)
    const nav = env.nav ?? globalThis.navigator
    if (typeof nav?.sendBeacon === 'function' && nav.sendBeacon(MODEL_OPEN_COUNT_PATH, body)) {
      return true
    }
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch(MODEL_OPEN_COUNT_PATH, {method: 'POST', body, keepalive: true}).catch(() => null)
      return true
    }
  } catch (_) {
    // Best-effort: a report that can't be sent is dropped.
  }
  return false
}


/**
 * Report one real model load that finished. The caller
 * (Containers/modelOpenEvents.js#reportModelOpened) calls it exactly where it
 * sends real_model_open: a real model (not the demo), once per open.
 *
 * It needs no consent because it carries nothing about the visitor (only what
 * privacy/modelOpenCountReport.js allows), stores nothing on the device (the
 * session id is in memory only), and the function sends it to GA under one
 * fixed client id from the server, so the visitor's IP never reaches Google
 * (design/new/model-open-counts.md).
 *
 * @param {object} routeResult the route loaded
 * @param {object} loadedModel the loaded model
 * @param {object} [env] see modelOpenCountReport and send
 * @return {boolean} whether a report was handed to the browser
 */
export function reportModelOpenCount(routeResult, loadedModel, env = {}) {
  return send(() => modelOpenCountReport(routeResult, loadedModel, env), env)
}


/**
 * Report one real model load that failed, as `load_outcome: failed`. The
 * caller (Containers/loadFailure.js#reportLoadFailure) calls it beside
 * `load_failed`, under the same real-open guard and per-model dedupe.
 *
 * @param {object} routeResult the route loaded
 * @param {object} failure see modelOpenFailureReport
 * @param {object} [env] see modelOpenFailureReport and send
 * @return {boolean} whether a report was handed to the browser
 */
export function reportModelOpenFailure(routeResult, failure, env = {}) {
  return send(() => modelOpenFailureReport(routeResult, failure, env), env)
}


/** Test-only: forget this page's session id, as a reload would. */
export function _resetPageSessionForTests() {
  pageSessionId = null
}

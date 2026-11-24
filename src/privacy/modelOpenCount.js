import {shouldInitGa} from '../index/ga'
import {bucketFileSize} from '../loader/loadAnalytics'
import {modelOpenKind} from '../utils/reportModelOpen'
import {isAllowed} from './analytics'
import {formFactor} from './clientCapabilities'
import {isSampleModel} from './localOnlyMode'
import {MODEL_OPEN_COUNT_FIELDS, MODEL_OPEN_FORMATS} from './modelOpenCountReport'


/**
 * Where a count goes: a function on Share's own origin, which passes it to GA
 * through the Measurement Protocol (netlify/functions/model-open-count.js).
 * Same-origin, like client-capabilities, so a blocker that stops
 * googletagmanager.com lets it through, and the visitor's IP never reaches
 * Google. The name avoids the words filter lists match on paths (`beacon`,
 * `collect`, `analytics`, `track`, `telemetry`).
 */
export const MODEL_OPEN_COUNT_PATH = '/.netlify/functions/model-open-count'


/**
 * The `source` of a route, one of MODEL_OPEN_COUNT_FIELDS.source. The same
 * split as privacy/analytics.js#modelRouteSource, with the samples (GitHub
 * routes, privacy/localOnlyMode.js#isSampleModel) told apart from the user's
 * own GitHub models. A `file` route that isn't an upload is a Bldrs-hosted
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
 * The count for one open, or null when a field has no value in its enum (no
 * source, no open kind), in which case nothing is sent rather than a guess.
 *
 * @param {object} routeResult the route loaded
 * @param {object} loadedModel the loaded model; only its `type` is read
 * @param {object} [env] overrides, for tests
 * @param {number} [env.fileSize] the model's bytes, as the load reported them
 * @param {string} [env.openKind] utils/reportModelOpen.js#OpenKind
 * @param {object} [env.nav] navigator
 * @param {boolean} [env.consent] privacy/analytics.js#isAllowed
 * @return {?object} exactly MODEL_OPEN_COUNT_FIELDS' keys
 */
export function modelOpenCountReport(routeResult, loadedModel, {
  fileSize, openKind = modelOpenKind(routeResult), nav = globalThis.navigator, consent = isAllowed(),
} = {}) {
  const source = modelOpenSource(routeResult)
  if (!source || !MODEL_OPEN_COUNT_FIELDS.open_kind.includes(openKind)) {
    return null
  }
  const type = String(loadedModel?.type ?? '').toLowerCase()
  return {
    content_type: MODEL_OPEN_FORMATS.includes(type) ? type : 'other',
    size_bucket: bucketFileSize(fileSize),
    source,
    open_kind: openKind,
    form_factor: formFactor(nav),
    consent: consent ? 'on' : 'off',
  }
}


/**
 * Send one cookieless count of a real model open. The caller
 * (Containers/modelOpenEvents.js#reportModelOpened) calls it exactly where it
 * sends real_model_open: a real model (not the demo), once per open.
 *
 * Sent WHATEVER the visitor's analytics setting, which is the point of it:
 * since #2051 GA sees only those who consent. It needs no consent because it
 * carries nothing about the visitor (only the enums in
 * modelOpenCountReport.js), stores nothing on the device, and the function
 * sends it to GA under one fixed client id from the server, so no report is
 * tied to a browser and the visitor's IP never reaches Google
 * (design/new/model-open-counts.md).
 *
 * Only where GA itself would run (index/ga.js#shouldInitGa: production, or a
 * bldrs deploy preview with `?feature=gaEnableInPreview`; never on localhost
 * or under webdriver), so dev and E2E send nothing. The host check is GA's
 * and not the consent check that rides with it.
 *
 * `navigator.sendBeacon` posts a string as text/plain, a simple request, so
 * there is no preflight and it survives the page unloading. `fetch` with
 * `keepalive` is the fallback. Best-effort: never throws.
 *
 * @param {object} routeResult the route loaded
 * @param {object} loadedModel the loaded model
 * @param {object} [env] see modelOpenCountReport; plus `hostname`,
 *   `isWebdriver`, `enableInPreview` (shouldInitGa's) for tests
 * @return {boolean} whether a count was handed to the browser
 */
export function reportModelOpenCount(routeResult, loadedModel, env = {}) {
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
    const report = modelOpenCountReport(routeResult, loadedModel, env)
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
    // Best-effort: a count that can't be sent is dropped.
  }
  return false
}

/*
 * The shape of what a signed-in user's page may tell the `account-usage`
 * function (netlify/functions/account-usage.js), and of what that function
 * stores against the account (design/new/account-usage.md). Shared by the
 * page (app/accountUsage.js) and the function, so neither can send or accept
 * a field the other doesn't know.
 *
 * Every field is a closed enum or a bounded non-negative integer. Nothing
 * here can carry a URL, a file name, a path, a content id or free text: the
 * function rejects any body that isn't exactly one of these shapes. That is
 * the privacy rule the design doc states, and this file is where it is
 * enforced.
 *
 * Browser-safe and Node-safe: it imports only modelOpenCountReport.js, which
 * imports nothing, so the enums the cookieless count (#2355) sends and the
 * ones stored per account are one list.
 */
import {MODEL_OPEN_COUNT_FIELDS} from './modelOpenCountReport.js'


/** Longest body the function reads; a real load report is under 700 bytes. */
export const MAX_ACCOUNT_USAGE_BYTES = 2048

/** The `kind` of a POST to account-usage. */
export const ACCOUNT_USAGE_KINDS = Object.freeze({
  LOAD: 'load',
  LIMIT: 'limit',
  FUNNEL: 'funnel',
  PREFERENCE: 'preference',
})

/**
 * The limits a free account can reach. `private_model` is record-load's (and
 * the client's own pre-check of the same ledger); `export_slot` is
 * pro-module's free model slot. The window each is counted over is the
 * metering code's business, not this file's: a limit hit records which
 * limit, never which window.
 */
export const LIMIT_KINDS = Object.freeze({
  PRIVATE_MODEL: 'private_model',
  EXPORT_SLOT: 'export_slot',
})

/** What the gate did: refused (`blocked`), or let through over the limit (`soft`). */
export const LIMIT_GATES = Object.freeze({BLOCKED: 'blocked', SOFT: 'soft'})

/** Who decided the refusal. */
export const LIMIT_DECIDERS = Object.freeze({SERVER: 'server', CLIENT: 'client'})

/**
 * The enum fields of a load report: #2355's count (minus `consent`, which
 * means nothing here: a signed-in report is not consent-based, see the design
 * doc) plus the load's verdict and the account's tier.
 */
export const LOAD_REPORT_FIELDS = Object.freeze({
  content_type: MODEL_OPEN_COUNT_FIELDS.content_type,
  size_bucket: MODEL_OPEN_COUNT_FIELDS.size_bucket,
  source: MODEL_OPEN_COUNT_FIELDS.source,
  open_kind: MODEL_OPEN_COUNT_FIELDS.open_kind,
  form_factor: MODEL_OPEN_COUNT_FIELDS.form_factor,
  load_outcome: Object.freeze(['displayed', 'no_geometry', 'unusable']),
  cache_hit: Object.freeze(['true', 'false']),
  // The page's reading of the account's tier (quota/quota.js#getTier) when
  // the model opened. Only analytics rides on it, never a limit, so the
  // server takes the page's word rather than pay a Management API read.
  tier: Object.freeze(['free', 'pro']),
})

/**
 * The numeric fields a load report may carry, each optional, each a
 * non-negative integer no larger than MAX_METRIC. The keys are the `stats_*`
 * params real_model_open has carried since Share#1954
 * (loader/loadAnalytics.js#buildOutcomeParams), without the prefix, so a
 * number here means what design/new/quotas.md §"Load outcome" says it does.
 * `fileSize` is deliberately absent: the exact byte count of a file can
 * identify it, so only `size_bucket` is kept.
 */
export const LOAD_REPORT_METRICS = Object.freeze([
  'loadTime',
  'openMs',
  'firstMeshMs',
  'vertexCount',
  'triangleCount',
  'productCount',
  'productsWithGeometryCount',
  'engineErrorTotal',
  'engineErrorDistinct',
  'engineWarnDistinct',
  'dataDefectTotal',
  'pageErrorCount',
  'pageWarnCount',
])

/** Ten billion: above any real count or millisecond timing, so a typo can't pass as data. */
export const MAX_METRIC = 1e10

/** Funnel steps the page reports for the server to forward to GA. */
export const FUNNEL_REPORT_EVENTS = Object.freeze({
  LOGIN: 'login',
  BEGIN_CHECKOUT: 'begin_checkout',
})

/**
 * Each funnel event's params, every one a closed enum, each optional unless
 * listed in `required`. The values are the ones the client already sends to
 * GA (privacy/analytics.js FUNNEL_EVENTS, Auth0/gateLogin.js), so the
 * dashboard's queries read the server's events the same way.
 */
export const FUNNEL_REPORT_PARAMS = Object.freeze({
  [FUNNEL_REPORT_EVENTS.LOGIN]: Object.freeze({
    required: Object.freeze(['method']),
    fields: Object.freeze({
      method: Object.freeze(['google', 'github', 'email', 'unknown']),
      from: Object.freeze(['gate']),
      feature: Object.freeze(['export', 'share']),
    }),
  }),
  [FUNNEL_REPORT_EVENTS.BEGIN_CHECKOUT]: Object.freeze({
    required: Object.freeze(['from', 'destination']),
    fields: Object.freeze({
      from: Object.freeze(['profile', 'export', 'quota', 'unknown']),
      destination: Object.freeze(['checkout', 'portal']),
    }),
  }),
})

/** The route kinds a private-model limit can be hit on (quotas.md §"Direct links"). */
const ROUTE_KIND_OF_SEGMENT = Object.freeze({'g': 'gdrive', 'gh': 'github', 'local-only': 'local', 'new': 'local'})

export const LIMIT_ROUTE_KINDS = Object.freeze(['gdrive', 'github', 'local'])


/**
 * The route kind of a share-path key, for a private-model limit hit: the
 * segment after the first `/v/` (quota/limits.js reads route kinds the same
 * way, #1967). Null for a key that isn't one of the three a limit can be hit
 * on. Only the kind is kept, never the key: it can name a private repo's file.
 *
 * @param {string} key a share path, e.g. /share/v/gh/owner/repo/main/m.ifc
 * @return {?string} gdrive | github | local
 */
export function limitRouteKindOfKey(key) {
  const segment = /\/v\/([^/]+)\//.exec(String(key))?.[1]
  return hasOwn(ROUTE_KIND_OF_SEGMENT, segment) ? ROUTE_KIND_OF_SEGMENT[segment] : null
}


/**
 * Parse a POST body to account-usage, or null when it isn't exactly one of
 * the shapes below.
 *
 * - `{kind: 'load', report: {...LOAD_REPORT_FIELDS, ...LOAD_REPORT_METRICS?}}`
 * - `{kind: 'limit', limit: 'private_model', gate, route_kind?}` — only the
 *   client's own refusals (its local pre-check, its offline fallback); a
 *   refusal the server decided is recorded by the function that decided it.
 * - `{kind: 'funnel', event, params}`
 * - `{kind: 'preference', usage_reports: boolean}`
 *
 * @param {string} text the request body
 * @return {?object} the body, normalised; null if invalid
 */
export function parseAccountUsageBody(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_ACCOUNT_USAGE_BYTES) {
    return null
  }
  let value
  try {
    value = JSON.parse(text)
  } catch (_) {
    return null
  }
  if (!isPlainObject(value)) {
    return null
  }
  switch (value.kind) {
    case ACCOUNT_USAGE_KINDS.LOAD: {
      if (!hasExactly(value, ['kind', 'report'])) {
        return null
      }
      const report = parseLoadReport(value.report)
      return report ? {kind: value.kind, report} : null
    }
    case ACCOUNT_USAGE_KINDS.LIMIT: {
      const limit = parseClientLimitHit(value)
      return limit ? {kind: value.kind, ...limit} : null
    }
    case ACCOUNT_USAGE_KINDS.FUNNEL: {
      if (!hasExactly(value, ['kind', 'event', 'params'])) {
        return null
      }
      const params = parseFunnelParams(value.event, value.params)
      return params ? {kind: value.kind, event: value.event, params} : null
    }
    case ACCOUNT_USAGE_KINDS.PREFERENCE:
      if (!hasExactly(value, ['kind', 'usage_reports']) || typeof value.usage_reports !== 'boolean') {
        return null
      }
      return {kind: value.kind, usage_reports: value.usage_reports}
    default:
      return null
  }
}


/**
 * @param {*} value
 * @return {?object} a load report holding every enum field and only known metrics
 */
export function parseLoadReport(value) {
  if (!isPlainObject(value)) {
    return null
  }
  const report = {}
  for (const [field, allowed] of Object.entries(LOAD_REPORT_FIELDS)) {
    if (!allowed.includes(value[field])) {
      return null
    }
    report[field] = value[field]
  }
  for (const key of Object.keys(value)) {
    if (key in LOAD_REPORT_FIELDS) {
      continue
    }
    if (!LOAD_REPORT_METRICS.includes(key) || !isMetric(value[key])) {
      return null
    }
    report[key] = value[key]
  }
  return report
}


/**
 * @param {object} value the body
 * @return {?object} `{limit, gate, route_kind?}`
 */
function parseClientLimitHit(value) {
  const keys = Object.keys(value)
  const allowed = ['kind', 'limit', 'gate', 'route_kind']
  if (keys.some((k) => !allowed.includes(k))) {
    return null
  }
  // A client can only have refused a private model: export slots are decided
  // by pro-module alone.
  if (value.limit !== LIMIT_KINDS.PRIVATE_MODEL || !Object.values(LIMIT_GATES).includes(value.gate)) {
    return null
  }
  if ('route_kind' in value && !LIMIT_ROUTE_KINDS.includes(value.route_kind)) {
    return null
  }
  const hit = {limit: value.limit, gate: value.gate}
  if (value.route_kind) {
    hit.route_kind = value.route_kind
  }
  return hit
}


/**
 * @param {string} event
 * @param {*} params
 * @return {?object}
 */
export function parseFunnelParams(event, params) {
  const spec = hasOwn(FUNNEL_REPORT_PARAMS, event) ? FUNNEL_REPORT_PARAMS[event] : null
  if (!spec || !isPlainObject(params)) {
    return null
  }
  const out = {}
  for (const [key, val] of Object.entries(params)) {
    if (!hasOwn(spec.fields, key) || !spec.fields[key].includes(val)) {
      return null
    }
    out[key] = val
  }
  return spec.required.every((key) => key in out) ? out : null
}


/**
 * Object.prototype.hasOwnProperty.call: Object.hasOwn isn't polyfilled for
 * the app's build targets (SHARE-1XY).
 *
 * @param {object} object
 * @param {string} key
 * @return {boolean}
 */
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isMetric(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_METRIC
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}


/**
 * @param {object} value
 * @param {Array<string>} keys
 * @return {boolean} whether value has exactly these keys
 */
function hasExactly(value, keys) {
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((k) => own.includes(k))
}

/*
 * The shape of a page-visit report: what the page may say about one page
 * load, and the only thing the `page-visit` function will pass on to GA. The
 * visit-side twin of modelOpenCountReport.js, shared by the page
 * (app/pageVisit.js) and the function (netlify/functions/page-visit.js).
 * design/new/model-open-counts.md §"Page visits" says why: with no GA tag in
 * the browser (#2354) GA counts no visits at all, and this restores them
 * without an identifier.
 *
 * Every field is a closed enum, or the in-memory page session id that
 * model_open_count also carries, so a visit and its loads join. Nothing here
 * can carry a path, a URL, the referrer or a campaign string: the function
 * rejects any report with a key or value it doesn't know. `country` is not a
 * page field at all: the function adds it from Netlify's own geolocation, and
 * refuses a body that tries to send one.
 *
 * Browser-safe and Node-safe: no imports, no globals.
 */


/** The GA event the function sends for a report. */
export const PAGE_VISIT_EVENT = 'page_visit'

/** Longest body the function reads; a real report is under 250 bytes. */
export const MAX_VISIT_BYTES = 512

/**
 * Which kind of page was opened (app/pageVisit.js#visitRouteKind). The
 * `viewer-*` kinds follow the model routes (routes/README.md): `viewer-demo`
 * the hosted demo (`/v/p/index.ifc`, `/v/p/index.step`), `viewer-local` a
 * file from the visitor's computer, `viewer-github` (the samples included,
 * as the samples are GitHub routes), `viewer-gdrive`, `viewer-url`.
 * `marketing` is for the marketing site's pages, which are a separate build
 * that doesn't send this report yet; the app itself never sends it.
 */
export const ROUTE_KINDS = Object.freeze([
  'home', 'viewer-demo', 'viewer-local', 'viewer-github', 'viewer-gdrive', 'viewer-url', 'marketing', 'other',
])

/** How the visitor arrived, from the referrer's host (app/pageVisit.js#referrerClass). */
export const REFERRER_CLASSES = Object.freeze(['direct', 'search', 'social', 'bldrs', 'other'])

/**
 * `utm_source` values reported as themselves. Anything else is `other`, an
 * absent one `none`, so a campaign string never reaches GA as free text. The
 * owner extends this list (and the function accepts it at once, the list
 * being shared).
 */
export const UTM_SOURCES = Object.freeze([
  'google', 'bing', 'duckduckgo', 'linkedin', 'twitter', 'x', 'facebook', 'instagram', 'reddit',
  'youtube', 'github', 'newsletter', 'email', 'bldrs',
])

/** `utm_medium` values reported as themselves; the same rules as UTM_SOURCES. */
export const UTM_MEDIUMS = Object.freeze([
  'cpc', 'ppc', 'paid', 'display', 'social', 'paid_social', 'email', 'newsletter', 'referral',
  'organic', 'video', 'affiliate',
])

/**
 * The closed value set of each field the page sends. A report must carry
 * every one, plus `session_id`, and nothing else.
 */
export const PAGE_VISIT_FIELDS = Object.freeze({
  route_kind: ROUTE_KINDS,
  referrer_class: REFERRER_CLASSES,
  utm_source: Object.freeze([...UTM_SOURCES, 'other', 'none']),
  utm_medium: Object.freeze([...UTM_MEDIUMS, 'other', 'none']),
  form_factor: Object.freeze(['mobile', 'desktop']),
})

/**
 * The page session id: model_open_count's (modelOpenCountReport.js
 * #SESSION_ID_PATTERN), the same in-memory value from
 * app/modelOpenCount.js#pageSession, so GA groups a visit and its loads.
 */
export const VISIT_SESSION_ID_PATTERN = /^[1-9]\d{0,15}$/

/**
 * The country the function adds, from Netlify's geolocation of the request
 * (`context.geo.country.code`): an ISO 3166-1 alpha-2 code, else `unknown`.
 */
export const COUNTRY_PATTERN = /^[A-Z]{2}$/
export const COUNTRY_UNKNOWN = 'unknown'


/**
 * A report as the function will accept it, or null.
 *
 * @param {string} text the request body
 * @return {?object} every PAGE_VISIT_FIELDS key with a known value and
 *   `session_id`; nothing else (a `country` from the page is refused)
 */
export function parsePageVisitReport(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_VISIT_BYTES) {
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
  const fields = Object.keys(PAGE_VISIT_FIELDS)
  // Exactly the page's fields and the session id: an extra key, `country`
  // included, refuses the whole report.
  if (Object.keys(value).length !== fields.length + 1) {
    return null
  }
  const report = {}
  for (const field of fields) {
    if (!PAGE_VISIT_FIELDS[field].includes(value[field])) {
      return null
    }
    report[field] = value[field]
  }
  if (typeof value.session_id !== 'string' || !VISIT_SESSION_ID_PATTERN.test(value.session_id)) {
    return null
  }
  report.session_id = value.session_id
  return report
}


/**
 * @param {*} code what the platform's geolocation gave, if anything
 * @return {string} the code if it is an ISO 3166-1 alpha-2 shape, else `unknown`
 */
export function countryParam(code) {
  return typeof code === 'string' && COUNTRY_PATTERN.test(code) ? code : COUNTRY_UNKNOWN
}

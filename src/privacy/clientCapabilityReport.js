/*
 * The shape of a client-capability report: what the page may say about a
 * browser that can't run something Share depends on, and the only thing the
 * `client-capabilities` function will pass on to GA. Shared by the page
 * (privacy/clientCapabilities.js) and the function
 * (netlify/functions/client-capabilities.js), so neither can send or accept
 * a value the other doesn't know.
 *
 * Every field is a closed enum. Nothing here can carry a URL, a file name, a
 * user agent string or an id: the function rejects any report that isn't
 * exactly these keys with these values.
 *
 * Browser-safe and Node-safe: no imports, no globals.
 */


/** The GA event the function sends for a report. */
export const CAPABILITY_REPORT_EVENT = 'client_capability'

/** Longest body the function reads; a real report is under 200 bytes. */
export const MAX_REPORT_BYTES = 512

/**
 * The closed value set of each field. A report must carry every field, and
 * nothing else.
 *
 * - `condition`: what the browser couldn't do. `ga_blocked` is gtag/js
 *   failing to load, which is how a blocked client looks to the page.
 *   `webgl_unavailable` is three's WebGLRenderer failing to get a WebGL 2
 *   context (no GPU, hardware acceleration off, a blocklisted driver, a
 *   headless crawler), which leaves Share with nothing to draw on.
 * - `browser`: the browser family, privacy-focused ones named (Brave,
 *   DuckDuckGo, and the ones with built-in blockers: Opera, Edge's strict
 *   tracking prevention, Firefox's ETP, Safari's content blockers).
 * - `blocker`: what kind of blocking it looked like. `cosmetic` is an
 *   element-hiding ad blocker (uBlock Origin, AdBlock, AdGuard, Brave
 *   Shields' cosmetic filtering): a bait element was hidden. `network` is
 *   request-level blocking only (a tracker blocker like Privacy Badger, a DNS
 *   filter, a browser's tracking protection) or a plain network failure.
 *   `offline` is the browser saying it has no connection. `none` is a
 *   condition that has nothing to do with blocking (`webgl_unavailable`),
 *   for which the page doesn't run the bait check.
 * - `form_factor`: mobile or desktop.
 * - `consent`: whether the user's own analytics setting (privacy/analytics.js
 *   #isAllowed) was on. A report is functional data about what the client can
 *   run, so it is sent either way, and says which.
 */
export const CAPABILITY_FIELDS = Object.freeze({
  condition: Object.freeze(['ga_blocked', 'webgl_unavailable']),
  browser: Object.freeze(['brave', 'duckduckgo', 'opera', 'edge', 'samsung', 'firefox', 'safari', 'chrome', 'other']),
  blocker: Object.freeze(['cosmetic', 'network', 'offline', 'none']),
  form_factor: Object.freeze(['mobile', 'desktop']),
  consent: Object.freeze(['on', 'off']),
})


/**
 * A report as the function will accept it, or null.
 *
 * @param {string} text the request body
 * @return {?object} exactly the CAPABILITY_FIELDS keys, each a known value
 */
export function parseCapabilityReport(text) {
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
  const keys = Object.keys(value)
  const fields = Object.keys(CAPABILITY_FIELDS)
  if (keys.length !== fields.length) {
    return null
  }
  const report = {}
  for (const field of fields) {
    if (!CAPABILITY_FIELDS[field].includes(value[field])) {
      return null
    }
    report[field] = value[field]
  }
  return report
}

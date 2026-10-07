/**
 * The free tier's export allowance: N exports per rolling D days for a
 * signed-in user without Share Pro (owner decision, S4 #1835;
 * design/new/glb-export-premium.md §4.8 and §7.1).
 *
 * THE ONE PLACE N and D live, and the one implementation of the window. The
 * `pro-module` function charges against it, `record-export` reports it, the
 * Export tab displays it and the MSW mocks enforce it in dev and Playwright —
 * all importing this file, so a change to the allowance is one edit and the
 * four cannot disagree about what "at the limit" means.
 *
 * The ledger is Auth0 `app_metadata.exports`, the same list `record-export`
 * keeps as export history (§4.5). A free export is a row with `free: true`,
 * and it is written by `pro-module` at the moment it hands the module over —
 * the one step the server controls — not by `record-export` after the fact,
 * which the client could simply skip (§4.8 says why). Only `free: true` rows
 * count: a Pro user's history never uses up an allowance they would have if
 * they lapsed.
 *
 * The window rolls the way quotas' 30-day window does
 * (design/new/quotas.md §"30-day rolling window"): each free export comes
 * back exactly D days after it was made, rather than all of them at once on
 * a calendar boundary.
 *
 * Dependency-free and imported with its `.js` extension by the functions,
 * which load under plain Node ESM — same constraint as `quota/proStatus.js`.
 */


/** Free exports a signed-in, non-Pro user gets per window. */
export const FREE_EXPORT_LIMIT = 2

/** Length of the rolling window, in days. */
export const FREE_EXPORT_WINDOW_DAYS = 7

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLIS_PER_SECOND = 1000

/** Length of the rolling window, in milliseconds. */
export const FREE_EXPORT_WINDOW_MS =
  FREE_EXPORT_WINDOW_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLIS_PER_SECOND

/**
 * The `error` a refusal at the limit carries, from `pro-module` (403) and its
 * mock, with the allowance beside it. The client keys on it to say "you are
 * out of free exports until <date>" rather than "this needs Pro", and to skip
 * the JWT refresh a stale-tier refusal gets.
 */
export const FREE_EXPORT_LIMIT_REASON = 'free_export_limit'

/**
 * Response header on a module `pro-module` charged a free export for: the id
 * of the ledger row it wrote. The client records the export under that id, so
 * `record-export` fills in the charged row instead of adding a second one —
 * and its presence is what tells the loader not to memoise this delivery.
 */
export const FREE_EXPORT_ID_HEADER = 'X-Bldrs-Export-Id'

/**
 * Response header beside it: the allowance AFTER the charge, as JSON
 * (`freeExportAllowance`'s shape), so the remaining count on the Export tab
 * moves the moment the module arrives rather than after the record round trip.
 */
export const FREE_EXPORTS_HEADER = 'X-Bldrs-Free-Exports'


/**
 * One `app_metadata.exports` row (record-export.js documents the list).
 *
 * @typedef {object} ExportRow
 * @property {string} [id] Row id: the client's, or the charge's
 * @property {?string} [key] Share path of the model; null until recorded
 * @property {?string} [title] Display label
 * @property {string} [format] Export format id, e.g. 'glb'
 * @property {?number} [bytes] Size of the download; null until recorded
 * @property {string} [exportedAt] ISO timestamp, server clock
 * @property {boolean} [free] true only on a free export `pro-module` charged
 */


/**
 * @param {?ExportRow} row One `app_metadata.exports` entry
 * @return {boolean} whether it is a free export with a readable timestamp
 */
export function isFreeExportRow(row) {
  return row !== null && row !== undefined && row.free === true && Number.isFinite(Date.parse(row.exportedAt || ''))
}


/**
 * What a free user has left, from their ledger.
 *
 * A row counts while `now < exportedAt + window`. `nextFreeAt` is when the
 * OLDEST counted row stops counting — the moment one more export frees up —
 * or null when nothing counts.
 *
 * @param {Array<ExportRow>|undefined|null} exportRows `app_metadata.exports`
 * @param {number} [now] millis since epoch — injectable for tests
 * @return {{limit: number, used: number, remaining: number, nextFreeAt: ?string}}
 */
export function freeExportAllowance(exportRows, now = Date.now()) {
  const rows = Array.isArray(exportRows) ? exportRows : []
  const counted = rows
    .filter(isFreeExportRow)
    .map((row) => Date.parse(row.exportedAt || ''))
    .filter((exportedAt) => exportedAt + FREE_EXPORT_WINDOW_MS > now)
  const used = counted.length
  const nextFreeAt = used > 0 ?
    new Date(Math.min(...counted) + FREE_EXPORT_WINDOW_MS).toISOString() :
    null
  return {
    limit: FREE_EXPORT_LIMIT,
    used,
    remaining: Math.max(0, FREE_EXPORT_LIMIT - used),
    nextFreeAt,
  }
}


/**
 * The ledger row `pro-module` writes when it hands a free user the module.
 * `key`, `title` and `bytes` are unknown until the export has run;
 * `record-export` fills them in under the same id.
 *
 * @param {object} args
 * @param {string} args.id A fresh UUID
 * @param {string} args.format Export format id, e.g. 'glb'
 * @param {number} [args.now] millis since epoch
 * @return {ExportRow} the row
 */
export function newFreeExportRow({id, format, now = Date.now()}) {
  return {
    id,
    key: null,
    title: null,
    format,
    bytes: null,
    exportedAt: new Date(now).toISOString(),
    free: true,
  }
}


/**
 * When the next free export frees up, for a sentence: "Thu, Oct 9, 9:00 AM"
 * in the viewer's locale and time zone. The weekday and time are there
 * because the window rolls — "Oct 9" alone would not say whether a user can
 * export tonight or tomorrow morning.
 *
 * @param {?string|undefined} iso `nextFreeAt` from `freeExportAllowance`
 * @param {string|Array<string>} [locales] for tests; the browser's otherwise
 * @return {?string} null when there is no date to give
 */
export function formatNextFreeExport(iso, locales = undefined) {
  const when = Date.parse(iso || '')
  if (!Number.isFinite(when)) {
    return null
  }
  return new Date(when).toLocaleString(locales, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

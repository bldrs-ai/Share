/**
 * The free tier's export rule: a signed-in user without Share Pro may export
 * any model that holds one of their model slots, as often as they like, and a
 * model that holds no slot takes one on its first export (owner decision
 * 2026-10-27: "export your model as much as you want, same logic as views ...
 * ultimately controlled by open slots, not export counts";
 * design/new/glb-export-premium.md §4.8 and §7.1).
 *
 * The slots ARE the private-model allowance: `FREE_PRIVATE_MODEL_LIMIT` per
 * `ROLLING_WINDOW_DAYS` in `quota/limits.js`, kept in Auth0
 * `app_metadata.usageQuota.loads` — the ledger `record-load` writes when a
 * free user opens a private model. There is no second counter. A model opened
 * privately already holds a slot, so its exports cost nothing more; a model
 * that was free to VIEW (a local file, a public GitHub repo, a link-shared
 * Drive file, a hosted sample) takes a slot when it is first exported, so
 * GLB export does not become fully free by way of a local file.
 *
 * THE ONE PLACE the export side of that rule lives. `pro-module` decides with
 * `exportSlotDecision` and takes the slot, `record-export` reports `modelSlots`
 * and checks a recorded export against it, the Export tab displays it and the
 * MSW mocks and the Playwright fallbacks enforce it in dev and E2E — all
 * importing this file, so the four cannot disagree about what "holds a slot"
 * means.
 *
 * The retired rule (2 GLB exports per rolling 7 days, counted per delivery in
 * `app_metadata.exports` rows with `free: true`) is no longer read for
 * gating. Those rows stay where they are, as export history: nothing migrates
 * them and nothing here counts them.
 *
 * Imported with its `.js` extension by the functions, which load under plain
 * Node ESM — same constraint as `quota/proStatus.js`. Its one import,
 * `quota/limits.js`, is dependency-free under the same constraint.
 */

import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_MS, loadsInsideRollingWindow} from '../quota/limits.js'


/** Model slots a signed-in, non-Pro user has per window: the private-model limit. */
export const FREE_MODEL_SLOTS = FREE_PRIVATE_MODEL_LIMIT

/**
 * The `error` `pro-module` (and its mocks) refuse a free user's export with,
 * 403, when the model holds no slot and every slot is taken. `modelSlots`
 * rides beside it, so the client can say when the next slot frees up rather
 * than "this needs Pro", and skip the JWT refresh a stale-tier refusal gets.
 */
export const NO_FREE_SLOT_REASON = 'no_free_model_slot'

/**
 * The `error` `record-export` refuses a free user's export with, 403, when
 * the model it names holds no slot. `pro-module` takes the slot before it
 * hands a free user the module, so for an honest client that never happens —
 * except when the export ran on a module memoised while the account was Pro
 * and the account has since lost Pro. That makes it the definitive "no longer
 * Pro" signal (a 401 is not: an expired token or an Auth0 hiccup gives one
 * too), and the one refusal `useExport` evicts the memoised module on.
 */
export const EXPORT_SLOT_MISSING_REASON = 'export_slot_missing'

/**
 * Request header carrying the model's slot key to `pro-module`,
 * `encodeURIComponent`-encoded. A header rather than the query string so a
 * private repo's file path stays out of CDN access logs; encoded because a
 * header value must be ISO-8859-1 and a model path need not be (`fetch`
 * throws on a raw "Gebäude.ifc").
 */
export const MODEL_KEY_HEADER = 'X-Bldrs-Model-Key'

/**
 * Response header on every module `pro-module` serves a FREE user: the slots
 * after the delivery, as JSON (`slotsHeaderValue`). Its presence is also what
 * tells the loader not to memoise this delivery — a memoised free delivery
 * would export the NEXT model without asking whether it holds a slot. Counts
 * only, never keys: a header value must stay ASCII.
 */
export const MODEL_SLOTS_HEADER = 'X-Bldrs-Model-Slots'

/**
 * Longest key accepted. Keys land in `app_metadata`, which Auth0 caps at
 * 16 KB shared with everything else, so a hostile client must not be able to
 * fill it through this field. Real share paths are a few hundred bytes.
 */
export const MODEL_KEY_MAX_LENGTH = 1024

// A share path: an app prefix, then `/v/<route kind>/<something>`. The same
// route-kind rule as `routes/localOnly.ts#viewRouteKind`.
const MODEL_KEY_PATTERN = /\/v\/[^/?#]+\/[^?#]+/


/**
 * One `app_metadata.usageQuota.loads` row (record-load.js documents the list).
 *
 * @typedef {object} SlotRow
 * @property {string} key Share path of the model holding the slot
 * @property {string} loadedAt ISO timestamp, server clock
 * @property {string} [via] 'export' when an export took the slot; absent for
 *   a private-model open (record-load)
 */

/**
 * A free user's slots, as `record-export` and a `pro-module` refusal report
 * them and the Export tab reads them.
 *
 * @typedef {object} ModelSlots
 * @property {number} limit FREE_MODEL_SLOTS
 * @property {number} used Slots held inside the window
 * @property {number} remaining Slots free, never negative
 * @property {?string} nextFreeAt When the oldest held slot rolls off; null
 *   when none is held
 * @property {Array<string>} keys The models holding them
 */


/**
 * Whether `key` is shaped like a share path this rule can hold a slot for.
 * The server cannot see which model a client exports — the export runs in
 * the browser on the client's own artifact — so this is a shape check that
 * bounds what can be written, not proof of what was exported
 * (glb-export-premium.md §4.8 "What stays bypassable").
 *
 * @param {*} key
 * @return {boolean}
 */
export function isModelKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= MODEL_KEY_MAX_LENGTH &&
    MODEL_KEY_PATTERN.test(key)
}


/**
 * @param {?string|undefined} value `MODEL_KEY_HEADER` as received
 * @return {?string} the key, or null when absent or not decodable
 */
export function decodeModelKeyHeader(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}


/**
 * The slots held at `now`, from the ledger.
 *
 * A row holds its slot while `now < loadedAt + window`
 * (`limits.js#loadsInsideRollingWindow`, the edge `record-load` uses), so a
 * slot comes back exactly one window after it was taken. `nextFreeAt` is when
 * the OLDEST held slot rolls off.
 *
 * @param {Array<SlotRow>|undefined|null} loads `app_metadata.usageQuota.loads`
 * @param {number} [now] millis since epoch — injectable for tests
 * @return {ModelSlots}
 */
export function modelSlots(loads, now = Date.now()) {
  const held = heldRows(loads, now)
  const used = held.length
  const nextFreeAt = used > 0 ?
    new Date(Math.min(...held.map((row) => Date.parse(row.loadedAt))) + ROLLING_WINDOW_MS).toISOString() :
    null
  return {
    limit: FREE_MODEL_SLOTS,
    used,
    remaining: Math.max(0, FREE_MODEL_SLOTS - used),
    nextFreeAt,
    keys: held.map((row) => row.key),
  }
}


/**
 * What `pro-module` does with a free user's export of `key`.
 *
 * - `held`: the model already holds a slot — serve, write nothing.
 * - `take`: it holds none and a slot is free — `loads` is the ledger to
 *   write (the window's rows plus this one, pruned the way `record-load`
 *   writes it), and `slots` is the state after the write.
 * - `full`: it holds none and none is free — refuse with `slots`.
 *
 * @param {Array<SlotRow>|undefined|null} loads `app_metadata.usageQuota.loads`
 * @param {string} key The model's slot key (already `isModelKey`)
 * @param {number} [now] millis since epoch
 * @return {{verdict: string, slots: ModelSlots, loads: ?Array<SlotRow>}} `verdict`
 *   is 'held', 'take' or 'full'
 */
export function exportSlotDecision(loads, key, now = Date.now()) {
  const held = heldRows(loads, now)
  if (held.some((row) => row.key === key)) {
    return {verdict: 'held', slots: modelSlots(held, now), loads: null}
  }
  if (held.length >= FREE_MODEL_SLOTS) {
    return {verdict: 'full', slots: modelSlots(held, now), loads: null}
  }
  const written = [...held, {key, loadedAt: new Date(now).toISOString(), via: 'export'}]
  return {verdict: 'take', slots: modelSlots(written, now), loads: written}
}


/**
 * The `MODEL_SLOTS_HEADER` value: the slots without their keys (a header must
 * stay ASCII, and a model path need not be), plus whether this delivery took
 * a new slot.
 *
 * @param {ModelSlots} slots
 * @param {boolean} taken
 * @return {string} JSON
 */
export function slotsHeaderValue({limit, used, remaining, nextFreeAt}, taken) {
  return JSON.stringify({limit, used, remaining, nextFreeAt, taken: Boolean(taken)})
}


/**
 * When the next slot frees up, for a sentence: "Thu, Oct 9, 9:00 AM" in the
 * viewer's locale and time zone. The weekday and time are there because the
 * window rolls — "Oct 9" alone would not say whether a user can export
 * tonight or tomorrow morning.
 *
 * @param {?string|undefined} iso `nextFreeAt` from `modelSlots`
 * @param {string|Array<string>} [locales] for tests; the browser's otherwise
 * @return {?string} null when there is no date to give
 */
export function formatNextFreeSlot(iso, locales = undefined) {
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


/**
 * The ledger's rows that hold a slot at `now`: inside the window, with a
 * string key and a readable timestamp. Anything else in the list is ignored
 * rather than trusted, as `record-load` ignores it.
 *
 * @param {Array<SlotRow>|undefined|null} loads
 * @param {number} now
 * @return {Array<SlotRow>}
 */
function heldRows(loads, now) {
  const wellFormed = Array.isArray(loads) ?
    loads.filter((row) => row && typeof row.key === 'string' && Number.isFinite(Date.parse(row.loadedAt))) :
    []
  return loadsInsideRollingWindow(wellFormed, now)
}

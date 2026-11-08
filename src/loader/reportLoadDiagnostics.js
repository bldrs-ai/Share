import {gtagEvent} from '../privacy/analytics'


/**
 * GA reports for two degraded-but-working states of a Conway load: preview
 * units the viewer skipped, and an engine-worker source that opened buffered
 * instead of windowed from OPFS. Both are the follow-ups Share#2106 listed
 * in its Reported Conditions table.
 *
 * Why GA and not Sentry: the owner rubric (AGENTS.md, "PRs: a Reported
 * Conditions section") sends only immediately actionable conditions to
 * Sentry. These two are diagnostic after the fact (a best-effort preview
 * that dropped a unit; a slower-but-correct buffered open), so they are
 * counted in GA, like OPFS/reportOpfsSourceCondition.js's `sendToGa`. Each
 * event's params are exactly the fields below, bucketed where a raw number
 * could fingerprint a file, and never a file name, URL or path. The helpers
 * take none, which makes that structural.
 *
 * Why once per load, and only after it succeeded: one failure, one event. A
 * load that throws is already CadView's `captureException`, and a skipped
 * preview unit on a load that then failed is noise next to it. Loader.js#load
 * holds the facts and calls these where it reports the OPFS conditions, after
 * `readModel` resolved. A preview that skipped 400 units is still one event.
 *
 * New params need event-scoped custom dimensions registered in GA Admin
 * before they can be queried (design/new/quotas.md §"Funnel analytics").
 */

/* eslint-disable no-magic-numbers */
const MIB = 1024 * 1024
const GIB = 1024 * MIB
const TEN_MIB = 10 * MIB
const HUNDRED_MIB = 100 * MIB
/* eslint-enable no-magic-numbers */

/**
 * Why a worker load's source buffered, derived at the decision point in
 * Loader.js#load (the worker's own report, `source.fallbackReason`, only
 * covers a windowed open's store, not whether the open was windowed at all):
 * - `in-memory`: a local file held in this page's memory, no OPFS entry
 * - `opfs-unavailable`: OPFS off or absent in this browser
 * - `opfs-failed`: the OPFS path threw and the load fetched directly
 * - `not-store-openable`: an OPFS File, but `canOpenFromStore` said no
 *   (not part-21, `disableStreamOpen`, a header it cannot vouch for)
 * - `store-open-refused`: store open was chosen yet the engine still holds
 *   the source resident
 * - `unknown`: none of the above was recorded
 */
export const ENGINE_BUFFERED_REASONS = [
  'in-memory', 'opfs-unavailable', 'opfs-failed', 'not-store-openable', 'store-open-refused', 'unknown',
]


/**
 * Coarse count of skipped units; never the raw number.
 *
 * @param {number} skipped at least 1
 * @return {string} '1' | '2-10' | '11+'
 */
export function skippedBucket(skipped) {
  if (skipped <= 1) {
    return '1'
  }
  return skipped <= 10 ? '2-10' : '11+'
}


/**
 * @param {number} sizeBytes the source's size
 * @return {string} '<10MB' | '10-100MB' | '100MB-1GB' | '>=1GB'; '>=1GB'
 *   edges are inclusive below (exactly 10 MiB is '10-100MB')
 */
export function sizeClass(sizeBytes) {
  if (sizeBytes < TEN_MIB) {
    return '<10MB'
  }
  if (sizeBytes < HUNDRED_MIB) {
    return '10-100MB'
  }
  return sizeBytes < GIB ? '100MB-1GB' : '>=1GB'
}


/**
 * One event for a load that skipped any parse-preview or demand-preview
 * unit (ShareIfcLoader.js, the two best-effort `skipped` warnings).
 *
 * @param {object} args
 * @param {string} args.format 'ifc' | 'step'
 * @param {string} args.kind source kind: 'github' | 'external' | 'local' | 'upload'
 * @param {number} args.skipped units skipped this load; nothing is sent for 0
 */
export function reportPreviewUnitsSkipped({format, kind, skipped}) {
  if (!(skipped > 0)) {
    return
  }
  sendToGa('preview_unit_skipped', {format, kind, skipped: skippedBucket(skipped)})
}


/**
 * One event for a worker load whose source opened buffered, which is the
 * load whose report lacks its `Engine source I/O` line
 * (engineModelLoad.js#sourceIoLine).
 *
 * @param {object} args
 * @param {string} args.reason one of {@link ENGINE_BUFFERED_REASONS}
 * @param {number} args.sizeBytes the source's size, bucketed here
 */
export function reportEngineSourceBuffered({reason, sizeBytes}) {
  const size = Number.isFinite(sizeBytes) ? sizeBytes : 0
  sendToGa('engine_source_buffered', {reason, size_class: sizeClass(size)})
}


/**
 * Best-effort; the load has its own outcome.
 *
 * @param {string} name
 * @param {object} params
 */
function sendToGa(name, params) {
  try {
    gtagEvent(name, params)
  } catch (_) {
    // Reporting must never fail a load.
  }
}

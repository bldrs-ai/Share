// The engine-side half of classifying a failed conway open: mark the open
// before it is made, then read THAT open's refusal and failure reason off
// conway's statistics. Split out of `unsupportedSchema.js` so it imports
// nothing (no Sentry, no load report): the engine worker runs it against its
// own engine and sends the verdict to the page (engine-worker.md §2.4 G3),
// which builds the user-facing error with `openModelFailure` as before.
//
// In a WORKER, the "two loads in separate IfcAPIs share id 0 in conway's
// module-level statistics map" caveat below does not arise: each worker has
// its own conway module instance and so its own map. IN PROCESS (the
// engine's main-thread fallback, engine/transports.js) it still does: a
// session's IfcAPI shares the page's conway module, and so that map, with
// the page's own engine and with any other in-process session. Share runs
// one load at a time today, so this is noted; per-model sessions loading
// in the background on the fallback (engine-worker.md §7 step 7) must guard
// it.


/**
 * An open about to be made: the id conway will attempt it under, and the
 * statistics object already under that id, if any.
 *
 * @typedef {object} OpenAttempt
 * @property {number} id the id conway will attempt the open under
 * @property {object} [before] the statistics object already under that id
 */


/**
 * Mark an open about to be made, so {@link conwayRefusedSchema} can tell
 * afterwards whether THAT open was refused. Call immediately before the
 * open, with nothing awaited in between.
 *
 * conway keys a load's statistics — including the `UNSUPPORTED_SCHEMA` load
 * status its IFC4X3 refusal records — by the id the open was attempted
 * under, and a refused open returns -1 rather than that id. Every conway
 * open takes its id from the public `globalModelIDCounter` synchronously at
 * call time (the async opens increment it before their first await; the
 * sync `OpenModel` increments only on success), so the counter's value
 * immediately before the call IS the attempted id.
 *
 * That id is only unique within one `IfcAPI`, while conway's statistics
 * live in a module-level map that outlives it — Share builds a fresh
 * `IfcAPI` per load (ShareIfc.js), so ids restart at 0 while an earlier
 * load's statistics stay. An open that fails before its header parses
 * (a corrupt header) writes no statistics at all, and would read an
 * earlier refusal's. So the attempt also snapshots the statistics object
 * already under that id: conway creates a NEW one for every open that gets
 * far enough to refuse, and only a new one counts. Two loads running at
 * once in separate `IfcAPI`s would share id 0 in that map and could read
 * each other's status; Share runs one load at a time, so this is noted
 * rather than guarded.
 *
 * @param {object} ifcAPI
 * @return {OpenAttempt|undefined} undefined on an engine without the
 *   counter (e.g. a test mock)
 */
export function beginOpenAttempt(ifcAPI) {
  const id = ifcAPI?.globalModelIDCounter
  if (typeof id !== 'number') {
    return undefined
  }
  return {id, before: statisticsFor(ifcAPI, id)}
}


/**
 * Did conway refuse the open marked by `attempt` because of its schema?
 *
 * This is the POSITIVE signal: conway sets `UNSUPPORTED_SCHEMA` only on its
 * IFC4X3 refusal paths (bldrs-ai/conway#713, #718), never on a geometry
 * failure or on a non-4X3 file, so an engine regression on an IFC4X3 file
 * conway does support keeps the generic error — the header alone cannot
 * tell those apart. One overlap is conway's by design: its eligibility
 * decision needs a COMPLETE parse, so a truncated or syntax-broken 4X3 file
 * is refused the same way (conway#718's `decide`) and gets this dialog
 * rather than the generic error; the message's "not this one yet" is
 * worded to stay true for it. And it must be THIS open's statistics (a
 * different object from the one {@link beginOpenAttempt} saw), not a
 * leftover.
 *
 * @param {object} ifcAPI
 * @param {OpenAttempt|undefined} attempt from {@link beginOpenAttempt}
 * @return {boolean}
 */
export function conwayRefusedSchema(ifcAPI, attempt) {
  const after = attemptStatistics(ifcAPI, attempt)
  if (after === undefined) {
    return false
  }
  try {
    return after.getLoadStatus?.() === 'UNSUPPORTED_SCHEMA'
  } catch (_) {
    return false
  }
}


/**
 * What conway recorded about WHY the open marked by `attempt` failed
 * (conway#742): its load status (`UNRECOGNIZED_FORMAT`, `OPEN_FAIL`,
 * `INDEX_RESTORE_FAIL`, …) and `getLoadFailureReason()`, read from the same
 * attempt-owned statistics object {@link conwayRefusedSchema} trusts, so an
 * earlier load's leftovers are never read as this open's.
 *
 * Undefined when there is nothing to report: an engine without the counter
 * or the statistics, a pre-#742 conway (no `getLoadFailureReason`), an open
 * that wrote no statistics, or no reason recorded. Callers then keep the
 * generic error.
 *
 * @param {object} ifcAPI
 * @param {OpenAttempt|undefined} attempt from {@link beginOpenAttempt}
 * @return {{status: string, reason: string}|undefined}
 */
export function conwayOpenFailure(ifcAPI, attempt) {
  const after = attemptStatistics(ifcAPI, attempt)
  if (after === undefined) {
    return undefined
  }
  try {
    const reason = after.getLoadFailureReason?.()
    if (typeof reason !== 'string' || reason.trim() === '') {
      return undefined
    }
    const status = after.getLoadStatus?.()
    return {status: typeof status === 'string' ? status : 'UNKNOWN', reason}
  } catch (_) {
    return undefined
  }
}


/**
 * The statistics object THIS open created, as opposed to none or a
 * leftover (see {@link beginOpenAttempt} on why that distinction matters).
 *
 * @param {object} ifcAPI
 * @param {OpenAttempt|undefined} attempt
 * @return {object|undefined}
 */
function attemptStatistics(ifcAPI, attempt) {
  if (attempt === undefined) {
    return undefined
  }
  const after = statisticsFor(ifcAPI, attempt.id)
  return after === undefined || after === attempt.before ? undefined : after
}


/**
 * @param {object} ifcAPI
 * @param {number} id
 * @return {object|undefined} conway's statistics for `id`, if any
 */
function statisticsFor(ifcAPI, id) {
  if (typeof ifcAPI?.getStatistics !== 'function') {
    return undefined
  }
  try {
    return ifcAPI.getStatistics(id) ?? undefined
  } catch (_) {
    return undefined
  }
}

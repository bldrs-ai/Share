// Which engine a Conway load runs on: the model's own engine worker (the
// default since engine-worker.md §7 step 9), or the page's main-thread engine.
// One decision, read by `ShareIfcLoader#isEngineWorkerLoad` for every load
// and by CadView's dev hook, so the kill switch cannot disagree with the
// loader about where a model's engine is.
//
// The main-thread engine is kept permanently (§8 item 6). It serves:
//   - the ROLLBACK: `disableEngineWorker` set `isActive: true` in
//     FeatureFlags.js. That, not `engineWorker: false`, is the prod-wide
//     kill switch, because a static `true` here wins over every URL, while
//     `isFeatureEnabled` ORs a static `false` with the URL: flipping
//     `engineWorker` off would leave every link that still carries
//     `?feature=engineWorker` (a pre-flip opt-in, a shared spec link) in the
//     worker (Codex review on #2083). engine-worker.md §7.2 has the procedure;
//   - `?feature=disableEngineWorker`, the per-session kill switch.
// The legacy `?view=` rules used to be a third: they styled nothing on either
// engine and were deleted (design/tracks/open-t200/layering.md §7, slice V),
// so a `?view=` link loads in the worker like any other.
// The legacy bot chat used to be another: its `new Function` eval read the
// main-thread engine. The Assist port (#1675, ai-workspace.md §13) deleted
// the eval, and the chat now drives the viewer through the tool registry,
// which reads either engine, so `?feature=bot` and `#bot:` loads stay in the
// worker like any other.
// Each is read from the URL at load time, like every other `?feature=`.
import {flags, isFeatureEnabled} from '../FeatureFlags'


/** Why a load runs on the main-thread engine, by `mainThreadEngineReason`. */
export const MainThreadReason = Object.freeze({
  // `disableEngineWorker` is on in FeatureFlags.js: the prod-wide rollback,
  // which no `?feature=` in a URL can override.
  ROLLBACK: 'rollback',
  // `engineWorker` is off and the URL does not opt in (the pre-flip default).
  FLAG_OFF: 'flagOff',
  // `?feature=disableEngineWorker`, this session's kill switch.
  KILL_SWITCH: 'disableEngineWorker',
})


/**
 * The load-report and console wording for each reason a load stays on the
 * main thread.
 */
const REASON_TEXT = {
  [MainThreadReason.ROLLBACK]: 'the engine worker is rolled back: disableEngineWorker is on in FeatureFlags.js',
  [MainThreadReason.FLAG_OFF]: 'engineWorker is off',
  [MainThreadReason.KILL_SWITCH]: '?feature=disableEngineWorker',
}


/**
 * Why this page's next Conway load must run on the main-thread engine, or
 * `null` when it runs in an engine worker. The prod rollback is checked
 * first, since nothing may override it, then the switches a user sets.
 * The flags read the live URL, as everywhere.
 *
 * @return {string|null} a `MainThreadReason`, or null
 */
export function mainThreadEngineReason() {
  // First, and read from the static flag alone: the rollback has to beat a
  // `?feature=engineWorker` in the URL, which the isFeatureEnabled checks
  // below would honour.
  if (flags?.find((f) => f.name === 'disableEngineWorker')?.isActive) {
    return MainThreadReason.ROLLBACK
  }
  if (!isFeatureEnabled('engineWorker')) {
    return MainThreadReason.FLAG_OFF
  }
  if (isFeatureEnabled('disableEngineWorker')) {
    return MainThreadReason.KILL_SWITCH
  }
  return null
}


/**
 * @param {string|null} reason from `mainThreadEngineReason`
 * @return {string} one line for the console and the load report
 */
export function mainThreadEngineNote(reason) {
  return `Engine: main thread (${REASON_TEXT[reason] ?? reason})`
}

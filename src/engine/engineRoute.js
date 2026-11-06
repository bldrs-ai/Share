// Which engine a Conway load runs on: the model's own engine worker (the
// default since engine-worker.md §7 step 9), or the page's main-thread engine.
// One decision, read by `ShareIfcLoader#isEngineWorkerLoad` for every load
// and by CadView's dev hook, so the kill switch and the two legacy consumers
// below cannot disagree with the loader about where a model's engine is.
//
// The main-thread engine is kept permanently (§8 item 6). It serves:
//   - `?feature=disableEngineWorker`, the per-session kill switch. Flipping
//     `engineWorker` to false in FeatureFlags.js is the prod-wide one;
//   - the legacy `?view=` rules (IfcViewsManager, `viewer/legacyViewRules.js`),
//     which style elements through `viewer.IFC.loader.ifcManager` and so need
//     the model open in THAT engine. The stack is due to be deleted (§8 item
//     7, viewer-replacement.md §8.1); until it is, a `?view=` link keeps
//     working by loading on the main thread instead of silently doing nothing;
//   - the legacy `?feature=bot` chat, whose `new Function` eval reads the
//     main-thread engine synchronously (§8 item 7: it stays there and retires
//     with the `?feature=assist` port, ai-workspace.md §13).
// Each is read from the URL at load time, like every other `?feature=`.
import {isFeatureEnabled} from '../FeatureFlags'
import {viewRules} from '../viewer/legacyViewRules'


/** Why a load runs on the main-thread engine, by `mainThreadEngineReason`. */
export const MainThreadReason = Object.freeze({
  // `engineWorker` is off: FeatureFlags.js says so (the prod kill switch).
  FLAG_OFF: 'flagOff',
  // `?feature=disableEngineWorker`, this session's kill switch.
  KILL_SWITCH: 'disableEngineWorker',
  // A known `?view=` rule set is asked for.
  VIEW_RULES: 'viewRules',
  // The legacy `?feature=bot` chat is on.
  LEGACY_BOT: 'legacyBot',
})


/**
 * The load-report and console wording for each reason a load stays on the
 * main thread. The two legacy ones say what needs it, so a user who wonders
 * why a `?view=` link loaded on the slower path reads the answer in the report.
 */
const REASON_TEXT = {
  [MainThreadReason.FLAG_OFF]: 'engineWorker is off',
  [MainThreadReason.KILL_SWITCH]: '?feature=disableEngineWorker',
  [MainThreadReason.VIEW_RULES]: '?view= rules need the main-thread engine',
  [MainThreadReason.LEGACY_BOT]: 'the legacy ?feature=bot chat needs the main-thread engine',
}


/**
 * Does the URL ask for a legacy `?view=` rule set that ShareViewer knows
 * (`viewer/legacyViewRules.js`, anything but `default`)? An unknown name
 * already does nothing on either engine, so it does not move a load.
 *
 * @param {string} [search] `location.search`
 * @return {boolean}
 */
export function hasLegacyViewRules(search = globalThis.location?.search ?? '') {
  const view = new URLSearchParams(search).get('view')?.toLowerCase()
  return Boolean(view) && view !== 'default' && Object.hasOwn(viewRules, view)
}


/**
 * Why this page's next Conway load must run on the main-thread engine, or
 * `null` when it runs in an engine worker. Checked in this order, so the
 * report names the switch the user set rather than a legacy consumer that
 * happens to be on as well.
 *
 * @param {string} [search] `location.search`, for tests (the flags read the
 *   live URL, as everywhere)
 * @return {string|null} a `MainThreadReason`, or null
 */
export function mainThreadEngineReason(search = undefined) {
  if (!isFeatureEnabled('engineWorker')) {
    return MainThreadReason.FLAG_OFF
  }
  if (isFeatureEnabled('disableEngineWorker')) {
    return MainThreadReason.KILL_SWITCH
  }
  if (hasLegacyViewRules(search)) {
    return MainThreadReason.VIEW_RULES
  }
  if (isFeatureEnabled('bot')) {
    return MainThreadReason.LEGACY_BOT
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

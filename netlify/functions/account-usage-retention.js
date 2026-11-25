/*
 * Netlify Function (v2, scheduled): account-usage-retention
 * ----------------------------------------------------------
 * Daily sweep of the per-account usage store (_lib/accountUsage.js,
 * design/new/account-usage.md §"Retention"). Raw per-account records — load
 * reports, limit hits, first-hit markers — are kept RETENTION_MONTHS (13)
 * whole months; a period older than that is reduced to counts with no
 * account attached, written as `rollup/<YYYY-MM>`, and its raw records are
 * deleted.
 *
 * One expired period per run, oldest first, so a run's work is bounded by
 * one month's records rather than by everything that has piled up; a backlog
 * clears a month a day. Periods are found from the store's directory listing
 * (`load/`, `limit/`, `first/` with `directories: true`), and a period's
 * records are listed under its own prefix.
 *
 * Resumable, so a month too big for one run still finishes, and safe to cut
 * short at any step. A period is counted in batches into a checkpoint,
 * `rollup-partial/<period>`, and a record is deleted only once the
 * checkpoint that counted it is written:
 *
 *   1. delete the checkpoint's `pendingDelete` keys (counted last time, maybe
 *      not yet deleted);
 *   2. take the next BATCH_SIZE records, add them to the counts, and write the
 *      checkpoint with them as `pendingDelete`;
 *   3. delete them; repeat until the run's time budget (RUN_BUDGET_MS) is spent;
 *   4. with nothing left, write `rollup/<period>` (`onlyIfNew`) from the
 *      checkpoint and delete the checkpoint.
 *
 * A record is therefore never counted twice (a resumed run deletes what the
 * checkpoint already counted before it lists again) and never deleted
 * uncounted. The checkpoint holds the period's account hashes, to count
 * distinct accounts across batches; the final rollup holds only the count, and
 * the checkpoint is deleted with the period. A period whose rollup already
 * exists only has its leftovers deleted.
 *
 * Scheduled in netlify.toml. Netlify doesn't serve scheduled functions over
 * HTTP in production, so the smoke test leaves it unprobed
 * (smokeFunctions.mjs UNPROBED_FUNCTIONS); replays cover it.
 *
 * Answers 200 with a summary `{v, now, oldestKept, reduced: [{period, ...}]}`
 * (the function log keeps it), 500 when the store can't be opened.
 */
import {getStore} from '@netlify/blobs'
import {
  ACCOUNT_USAGE_STORE,
  listKeys,
  logInfo,
  oldestKeptPeriod,
  parseEventKey,
  readAll,
  usagePeriodsInStore,
} from './_lib/accountUsage.js'


const SUMMARY_VERSION = 1
const DELETE_CONCURRENCY = 25
/** Records counted per checkpoint write. */
export const BATCH_SIZE = 200
/**
 * How long a run works before it stops at a batch boundary: well inside a
 * scheduled function's 30 s, with room for the batch in hand to finish.
 */
export const RUN_BUDGET_MS = 20000
const HTTP_OK = 200
const HTTP_INTERNAL_ERROR = 500


/**
 * @return {Promise<Response>}
 */
export default async function handler() {
  let store
  try {
    store = getStore({name: ACCOUNT_USAGE_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`account-usage-retention: not configured, blob store: ${err?.name ?? 'error'}`)
    return json(HTTP_INTERNAL_ERROR, {error: 'account_usage_not_configured'})
  }
  const summary = await sweep(store, Date.now())
  logInfo(`account-usage-retention: ${JSON.stringify(summary)}`)
  return json(HTTP_OK, summary)
}


/**
 * Reduce the oldest period older than the retention window, as far as the
 * run's budget allows.
 *
 * @param {object} store
 * @param {number} nowMs the clock the periods are judged by
 * @param {object} [options]
 * @param {Function} [options.clock] () => ms, for the budget (tests)
 * @param {number} [options.budgetMs]
 * @return {Promise<object>} the summary
 */
export async function sweep(store, nowMs, {clock = Date.now, budgetMs = RUN_BUDGET_MS} = {}) {
  const startedAt = clock()
  const oldestKept = oldestKeptPeriod(nowMs)
  const expired = (await usagePeriodsInStore(store)).filter((p) => p < oldestKept)
  const reduced = []
  if (expired.length > 0) {
    reduced.push(await reducePeriod(store, expired[0], nowMs, () => clock() - startedAt >= budgetMs))
  }
  const done = reduced[0]?.rollup !== 'partial'
  return {
    v: SUMMARY_VERSION,
    now: new Date(nowMs).toISOString(),
    oldestKept,
    reduced,
    pending: Math.max(0, expired.length - (done ? 1 : 0)),
  }
}


/**
 * @param {object} store
 * @param {string} period
 * @param {number} nowMs
 * @param {Function} isOutOfTime
 * @return {Promise<object>} {period, rollup: 'written' | 'kept' | 'partial', deleted}
 */
async function reducePeriod(store, period, nowMs, isOutOfTime) {
  const rollupKey = `rollup/${period}`
  const partialKey = `rollup-partial/${period}`
  let deleted = 0
  const deleteKeys = async (keys) => {
    for (let i = 0; i < keys.length; i += DELETE_CONCURRENCY) {
      await Promise.all(keys.slice(i, i + DELETE_CONCURRENCY).map((key) => store.delete(key)))
    }
    deleted += keys.length
  }
  const listPeriod = async () => (await Promise.all(['load', 'limit', 'first'].map((type) => listKeys(store, `${type}/${period}/`))))
    .flat().filter((key) => parseEventKey(key)?.period === period)

  if (await store.get(rollupKey, {type: 'json'})) {
    // Rolled up already: only leftovers of a run cut short remain.
    await deleteKeys(await listPeriod())
    await store.delete(partialKey)
    return {period, rollup: 'kept', deleted}
  }

  const partial = (await store.get(partialKey, {type: 'json'})) ?? emptyPartial(period)
  if (partial.pendingDelete.length > 0) {
    await deleteKeys(partial.pendingDelete)
    partial.pendingDelete = []
  }
  const remaining = await listPeriod()
  // The budget is checked after each batch, never before the first: every
  // run moves the period forward by at least one batch, however slow the
  // listing was.
  while (remaining.length > 0) {
    const batch = remaining.splice(0, BATCH_SIZE)
    await countBatch(store, partial, batch)
    partial.pendingDelete = batch
    // Written before the batch is deleted: a run that dies after this line
    // resumes by deleting `pendingDelete` and never counts the batch again.
    await store.set(partialKey, JSON.stringify(partial))
    await deleteKeys(batch)
    partial.pendingDelete = []
    if (remaining.length > 0 && isOutOfTime()) {
      return {period, rollup: 'partial', deleted}
    }
  }
  const written = await store.set(rollupKey, JSON.stringify(finalRollup(partial, nowMs)), {onlyIfNew: true})
  await store.delete(partialKey)
  return {period, rollup: written?.modified === false ? 'kept' : 'written', deleted}
}


/**
 * @param {string} period
 * @return {object} a checkpoint with nothing counted
 */
function emptyPartial(period) {
  return {
    v: SUMMARY_VERSION,
    period,
    loads: {total: 0, byOutcome: {}, byFormat: {}, bySource: {}, byTier: {}},
    limits: {},
    accounts: [],
    pendingDelete: [],
  }
}


/**
 * Add a batch of a period's records to the checkpoint's counts.
 *
 * @param {object} store
 * @param {object} partial the checkpoint, mutated
 * @param {Array<string>} keys
 */
export async function countBatch(store, partial, keys) {
  const accounts = new Set(partial.accounts)
  const limitEntry = (kind) => {
    partial.limits[kind] ??= {hits: 0, blocked: 0, soft: 0, accounts: 0}
    return partial.limits[kind]
  }
  const entries = keys.map((key) => ({key, parts: parseEventKey(key)}))
  for (const {parts} of entries.filter((e) => e.parts?.type === 'first')) {
    limitEntry(parts.rest).accounts++
  }
  const rows = entries.filter((e) => e.parts && e.parts.type !== 'first')
  const records = await readAll(store, rows.map((e) => e.key), {keepMissing: true})
  for (const [i, {parts}] of rows.entries()) {
    const record = records[i]
    if (!record) {
      continue
    }
    if (parts.type === 'load') {
      accounts.add(parts.account)
      partial.loads.total++
      bump(partial.loads.byOutcome, record.load_outcome)
      bump(partial.loads.byFormat, record.content_type)
      bump(partial.loads.bySource, record.source)
      bump(partial.loads.byTier, record.tier)
    } else {
      const e = limitEntry(record.limit ?? 'unknown')
      e.hits++
      e[record.gate === 'soft' ? 'soft' : 'blocked']++
    }
  }
  partial.accounts = [...accounts]
}


/**
 * The counts a period keeps once its accounts are gone: the checkpoint with
 * its account hashes reduced to how many there were.
 *
 * @param {object} partial
 * @param {number} nowMs
 * @return {object}
 */
export function finalRollup(partial, nowMs) {
  return {
    v: SUMMARY_VERSION,
    period: partial.period,
    reducedAt: new Date(nowMs).toISOString(),
    loads: {...partial.loads, accounts: partial.accounts.length},
    limits: partial.limits,
  }
}


/**
 * @param {object} counts
 * @param {*} value
 */
function bump(counts, value) {
  const k = value ?? 'unknown'
  counts[k] = (counts[k] ?? 0) + 1
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}})
}

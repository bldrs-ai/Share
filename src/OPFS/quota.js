/** Quota tiers */
export const TIERS = {
  ANONYMOUS: 'anonymous',
  FREE: 'free',
  PAID: 'paid',
}

/** Private-model load limits per tier */
export const LIMITS = {
  [TIERS.ANONYMOUS]: 2,
  [TIERS.FREE]: 4,
  [TIERS.PAID]: Infinity,
}

/** Listeners notified on every quota write */
const listeners = new Set()

/**
 * Subscribe to quota changes. Returns an unsubscribe function.
 *
 * @param {Function} cb Called with the new quota object after each write
 * @return {Function} unsubscribe
 */
export function subscribeToQuota(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}


/**
 * Returns true if the model key should count toward the usage quota.
 * Local (/v/new/) and Google Drive (/v/g/) are always private.
 * GitHub private-repo detection is deferred to a later iteration.
 *
 * @param {string} key Share path, e.g. '/share/v/g/<fileId>'
 * @return {boolean}
 */
export function isPrivateKey(key) {
  return key.includes('/v/new/') || key.includes('/v/g/')
}


/** @return {string} ISO date string for the first day of next month */
function nextMonthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
}


/**
 * @param {string} [tier]
 * @return {{tier: string, resetDate: string, loads: Array}}
 */
function defaultQuota(tier = TIERS.ANONYMOUS) {
  return {tier, resetDate: nextMonthStart(), loads: []}
}


/**
 * @param {boolean} create Whether to create the file if it doesn't exist
 * @return {Promise<object>}
 */
async function getHandle(create) {
  const root = await navigator.storage.getDirectory()
  return root.getFileHandle('quota.json', {create})
}


/**
 * Reads quota state from OPFS. Returns default quota on any error.
 *
 * @return {Promise<{tier: string, resetDate: string, loads: Array}>}
 */
export async function loadQuota() {
  try {
    const handle = await getHandle(false)
    const file = await handle.getFile()
    return JSON.parse(await file.text())
  } catch {
    return defaultQuota()
  }
}


/**
 * Writes quota state to OPFS and notifies subscribers.
 * Swallows OPFS errors (e.g. private-browsing mode) so quota tracking
 * degrades gracefully to in-memory-only.
 *
 * @param {{tier: string, resetDate: string, loads: Array}} quota
 * @return {Promise<void>}
 */
export async function saveQuota(quota) {
  try {
    const handle = await getHandle(true)
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(quota))
    await writable.close()
  } catch {
    // OPFS unavailable — in-memory state still works via subscribers
  }
  for (const cb of listeners) {
    cb(quota)
  }
}


/**
 * If the tier is 'free' and today is on or after resetDate, clears
 * the loads list and advances resetDate by one month. No-ops for
 * anonymous (lifetime cap) and paid (no cap). Pure — does not write.
 *
 * @param {{tier: string, resetDate: string, loads: Array}} quota
 * @return {{tier: string, resetDate: string, loads: Array}}
 */
export function maybeReset(quota) {
  if (quota.tier !== TIERS.FREE) {
    return quota
  }
  const today = new Date().toISOString().slice(0, 10)
  if (today >= quota.resetDate) {
    return {...quota, loads: [], resetDate: nextMonthStart()}
  }
  return quota
}


/**
 * Pure quota check given a loaded quota object and a model key.
 * Returns whether the load is allowed plus usage counters.
 *
 * @param {{tier: string, loads: Array}} quota
 * @param {string} key
 * @return {{allowed: boolean, used: number, limit: number, alreadyCounted: boolean}}
 */
export function checkQuota(quota, key) {
  const limit = LIMITS[quota.tier] ?? LIMITS[TIERS.FREE]
  if (quota.tier === TIERS.PAID) {
    return {allowed: true, used: quota.loads.length, limit, alreadyCounted: false}
  }
  const alreadyCounted = quota.loads.some((l) => l.key === key)
  const used = quota.loads.length
  return {
    allowed: alreadyCounted || used < limit,
    used,
    limit,
    alreadyCounted,
  }
}


/**
 * Records a private model load in OPFS. Idempotent — the same key is
 * never double-counted. Returns the updated quota, or null if the key
 * is not private.
 *
 * @param {string} key
 * @return {Promise<{tier: string, resetDate: string, loads: Array}|null>}
 */
export async function recordLoad(key) {
  if (!isPrivateKey(key)) {
    return null
  }
  let quota = maybeReset(await loadQuota())
  if (quota.loads.some((l) => l.key === key)) {
    return quota
  }
  quota = {...quota, loads: [...quota.loads, {key, loadedAt: new Date().toISOString()}]}
  await saveQuota(quota)
  return quota
}

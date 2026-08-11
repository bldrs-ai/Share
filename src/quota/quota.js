/** Quota tiers */
export const TIERS = {
  ANONYMOUS: 'anonymous',
  FREE: 'free',
  PAID: 'paid',
}

/** Quotable load limits per tier within the rolling window */
export const LIMITS = {
  [TIERS.ANONYMOUS]: 2, // lifetime cap; never resets without sign-in
  [TIERS.FREE]: 4, // counted within ROLLING_WINDOW_DAYS
  [TIERS.PAID]: Infinity,
}

/** Length of the rolling window for non-anonymous tiers, in days */
export const ROLLING_WINDOW_DAYS = 30

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLIS_PER_SECOND = 1000
const ROLLING_WINDOW_MS =
  ROLLING_WINDOW_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLIS_PER_SECOND

/** Subscribers notified after every saveQuota write */
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
 * Map auth state + Auth0 app_metadata to a quota tier.
 * Pure — used both server-side (record-load) and client-side (useQuota).
 *
 * @param {object} appMetadata Auth0 app_metadata, may be null
 * @param {boolean} isAuthenticated
 * @return {string} one of TIERS.*
 */
export function getTier(appMetadata, isAuthenticated) {
  if (!isAuthenticated) {
    return TIERS.ANONYMOUS
  }
  if (appMetadata && appMetadata.subscriptionStatus === 'sharePro') {
    return TIERS.PAID
  }
  return TIERS.FREE
}


/**
 * Paths whose privacy is unambiguously known client-side without a
 * server round-trip. Local files (/v/new/) and Drive files (/v/g/)
 * are always private.
 *
 * @param {string} key Share path
 * @return {boolean}
 */
export function isLocallyQuotable(key) {
  return key.includes('/v/new/') || key.includes('/v/g/')
}


/**
 * GitHub paths are ambiguous client-side (the same /v/gh/ prefix covers
 * both public and private repos), so the record-load Netlify function
 * resolves their actual privacy via api.github.com.
 *
 * @param {string} key
 * @return {boolean}
 */
export function isServerResolvedPath(key) {
  return key.includes('/v/gh/')
}


/**
 * True if the path is potentially quotable. The server makes the
 * authoritative call for /v/gh/. Use this to decide whether to call
 * record-load at all; use isLocallyQuotable for OPFS-only fallback.
 *
 * @param {string} key
 * @return {boolean}
 */
export function isQuotablePath(key) {
  return isLocallyQuotable(key) || isServerResolvedPath(key)
}


/**
 * Drop loads older than the rolling window. Anonymous tier has a
 * lifetime cap (no reset), so anonymous quotas are never pruned.
 *
 * @param {Array<{key:string,loadedAt:string}>} loads
 * @param {string} tier
 * @param {number} [now] millis since epoch — injectable for tests
 * @return {Array<{key:string,loadedAt:string}>}
 */
export function pruneLoads(loads, tier, now = Date.now()) {
  if (tier === TIERS.ANONYMOUS) {
    return loads
  }
  const cutoff = now - ROLLING_WINDOW_MS
  return loads.filter((l) => Date.parse(l.loadedAt) >= cutoff)
}


/**
 * @param {string} [tier]
 * @return {{tier: string, loads: Array}}
 */
function defaultQuota(tier = TIERS.ANONYMOUS) {
  return {tier, loads: []}
}


/**
 * @param {boolean} create
 * @return {Promise<object>} OPFS file handle
 */
async function getHandle(create) {
  const root = await navigator.storage.getDirectory()
  return root.getFileHandle('quota.json', {create})
}


/**
 * Read quota state from OPFS. Returns default on any error. Silently
 * drops the legacy `resetDate` field that earlier versions persisted.
 *
 * @return {Promise<{tier: string, loads: Array}>}
 */
export async function loadQuota() {
  try {
    const handle = await getHandle(false)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    return {
      tier: parsed.tier || TIERS.ANONYMOUS,
      loads: Array.isArray(parsed.loads) ? parsed.loads : [],
    }
  } catch {
    return defaultQuota()
  }
}


/**
 * Persist quota state to OPFS and notify subscribers. OPFS errors are
 * swallowed so that quota tracking degrades to in-memory only when
 * OPFS is unavailable (private browsing, etc).
 *
 * @param {{tier: string, loads: Array}} quota
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
 * Pure quota check given a loaded quota object and a model key.
 *
 * @param {{tier: string, loads: Array}} quota
 * @param {string} key
 * @return {{allowed: boolean, used: number, limit: number, alreadyCounted: boolean}}
 */
export function checkQuota(quota, key) {
  const limit = LIMITS[quota.tier] !== undefined ? LIMITS[quota.tier] : LIMITS[TIERS.FREE]
  if (quota.tier === TIERS.PAID) {
    return {allowed: true, used: quota.loads.length, limit, alreadyCounted: false}
  }
  const pruned = pruneLoads(quota.loads, quota.tier)
  const alreadyCounted = pruned.some((l) => l.key === key)
  const used = pruned.length
  return {
    allowed: alreadyCounted || used < limit,
    used,
    limit,
    alreadyCounted,
  }
}


/**
 * Record a locally-quotable model load in OPFS. Used for the anonymous
 * (no-server) path; authenticated callers should call the record-load
 * Netlify function and mirror its response into OPFS via saveQuota.
 *
 * Idempotent on key. Returns null when the key is not locally quotable
 * (GitHub paths require server resolution).
 *
 * @param {string} key
 * @return {Promise<{tier: string, loads: Array}|null>}
 */
export async function recordLoad(key) {
  if (!isLocallyQuotable(key)) {
    return null
  }
  const raw = await loadQuota()
  const loads = pruneLoads(raw.loads, raw.tier)
  if (loads.some((l) => l.key === key)) {
    return {...raw, loads}
  }
  const updated = {...raw, loads: [...loads, {key, loadedAt: new Date().toISOString()}]}
  await saveQuota(updated)
  return updated
}

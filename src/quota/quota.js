import {isFeatureEnabled} from '../FeatureFlags'
import {viewRouteKind} from '../routes/localOnly'
import {LIMITS, ROLLING_WINDOW_MS, TIERS, isAlwaysPrivateRouteKind} from './limits'
import {isProSubscriptionStatus} from './proStatus'


// The tiers, their limits and the window are defined once, in limits.js,
// which record-load and the marketing pricing plans import too. Re-exported here
// so the client keeps one import site.
export {LIMITS, ROLLING_WINDOW_DAYS, TIERS} from './limits'

/**
 * What a quota limits, as reported in the `feature` param of the
 * quota_limit_reached funnel event (analytics#FUNNEL_EVENTS). One today: the
 * private model loads every tier above is counted in. A second metered
 * feature gets its own value here so the dashboard can tell the walls apart.
 */
export const QUOTA_FEATURES = {
  PRIVATE_LOAD: 'private_load',
}

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
 * Pure — used client-side (useQuota, the export UI); `record-load` makes the
 * same Pro decision server-side from the same definition.
 *
 * PAID is either Pro status (`quota/proStatus.js`): `sharePro`, and
 * `shareProPendingReauth` — paid, waiting on a re-login for the GitHub scope
 * (design/new/glb-export-premium.md §7.2). So a pending-reauth user also gets
 * unlimited loads, deliberately.
 *
 * @param {object} appMetadata Auth0 app_metadata, may be null
 * @param {boolean} isAuthenticated
 * @return {string} one of TIERS.*
 */
export function getTier(appMetadata, isAuthenticated) {
  if (!isAuthenticated) {
    return TIERS.ANONYMOUS
  }
  if (appMetadata && isProSubscriptionStatus(appMetadata.subscriptionStatus)) {
    return TIERS.PAID
  }
  return TIERS.FREE
}


/**
 * Whether local files are metered — the `meterLocalFiles` feature flag, off
 * by default. Local files are free and unmetered (Share#1966); the flag is
 * an abuse switch that puts them back in the meter (design/new/quotas.md
 * §"Metering local files again"). record-load honours the same flag, or the
 * METER_LOCAL_FILES env var, server-side.
 *
 * @return {boolean}
 */
export function isLocalFileMeteringEnabled() {
  return isFeatureEnabled('meterLocalFiles')
}


/**
 * Paths whose privacy is unambiguously known client-side without a
 * server round-trip: Drive files (/v/g/) are always private. Local files
 * (/v/local-only/, legacy /v/new/) are NOT counted (Share#1966) unless the
 * `meterLocalFiles` switch is on. The rule itself is
 * limits.js#isAlwaysPrivateRouteKind, which
 * netlify/functions/record-load.js#isQuotableLoad and the MSW mock share.
 *
 * By route kind, not substring: a GitHub file path can contain `v/g/` or
 * `v/local-only/` (codex review on Share#1967). viewRouteKind takes the
 * segment after the FIRST `/v/`, so this holds under any install prefix.
 *
 * @param {string} key Share path
 * @param {boolean} [meterLocalFiles] defaults to the feature flag;
 *   parameterized for tests
 * @return {boolean}
 */
export function isLocallyQuotable(key, meterLocalFiles = isLocalFileMeteringEnabled()) {
  return isAlwaysPrivateRouteKind(viewRouteKind(key), meterLocalFiles)
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
  return viewRouteKind(key) === 'gh'
}


/**
 * True if the path is potentially quotable. The server makes the
 * authoritative call for /v/gh/. Use this to decide whether to call
 * record-load at all; use isLocallyQuotable for OPFS-only fallback.
 *
 * @param {string} key
 * @param {boolean} [meterLocalFiles] see isLocallyQuotable
 * @return {boolean}
 */
export function isQuotablePath(key, meterLocalFiles = isLocalFileMeteringEnabled()) {
  return isLocallyQuotable(key, meterLocalFiles) || isServerResolvedPath(key)
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

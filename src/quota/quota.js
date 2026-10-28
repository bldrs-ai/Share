import {isFeatureEnabled} from '../FeatureFlags'
import {viewRouteKind} from '../routes/localOnly'
import {DRIVE_ROUTE_KIND, LIMITS, TIERS, isMeteredLocalRouteKind, loadsInsideRollingWindow} from './limits'
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
 * Signed out is NO tier (null), and is never metered: a signed-out user
 * can't reach a private model, since private GitHub needs a token and a
 * restricted Drive file the user's own Google authorization. Signing in is
 * necessary but not sufficient for a private model; the provider's
 * authorization of the viewer is what makes it private
 * (design/new/quotas.md §"What counts").
 *
 * PAID is either Pro status (`quota/proStatus.js`): `sharePro`, and
 * `shareProPendingReauth` — paid, waiting on a re-login for the GitHub scope
 * (design/new/glb-export-premium.md §7.2). So a pending-reauth user also gets
 * unlimited loads, deliberately.
 *
 * @param {object} appMetadata Auth0 app_metadata, may be null
 * @param {boolean} isAuthenticated
 * @return {?string} one of TIERS.*, or null when signed out
 */
export function getTier(appMetadata, isAuthenticated) {
  if (!isAuthenticated) {
    return null
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
 * Paths known to count without any lookup: local files (/v/local-only/,
 * legacy /v/new/), and only while the `meterLocalFiles` switch is on; they
 * are NOT counted otherwise (Share#1966). The rule itself is
 * limits.js#isMeteredLocalRouteKind, which
 * netlify/functions/record-load.js#isQuotableLoad and the MSW mock share.
 *
 * Drive is not here: whether a Drive file counts depends on its sharing,
 * which takes a lookup (isDrivePath below; useQuota#record).
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
  return isMeteredLocalRouteKind(viewRouteKind(key), meterLocalFiles)
}


/**
 * Drive paths (/v/g/) count only when the file is private: shared with the
 * viewer's Google account or domain, not "Anyone with the link". The CLIENT
 * decides, from how the file was downloaded or its permission list
 * (quota/driveVisibility.js), and sends record-load only the private ones;
 * the server can't see Drive sharing and counts what it is sent
 * (limits.js#isCountedByRouteKind; design/new/quotas.md §"Drive visibility").
 *
 * By route kind, like isLocallyQuotable.
 *
 * @param {string} key Share path
 * @return {boolean}
 */
export function isDrivePath(key) {
  return viewRouteKind(key) === DRIVE_ROUTE_KIND
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
 * authoritative call for /v/gh/, the client's Drive visibility lookup for
 * /v/g/. Use this to decide whether to meter at all; use isLocallyQuotable
 * for what counts with no lookup.
 *
 * @param {string} key
 * @param {boolean} [meterLocalFiles] see isLocallyQuotable
 * @return {boolean}
 */
export function isQuotablePath(key, meterLocalFiles = isLocalFileMeteringEnabled()) {
  return isLocallyQuotable(key, meterLocalFiles) || isDrivePath(key) || isServerResolvedPath(key)
}


/**
 * Drop loads older than the rolling window, by the exclusive-edge rule in
 * limits.js#loadsInsideRollingWindow, which `record-load` and the MSW mock
 * share.
 *
 * @param {Array<{key:string,loadedAt:string}>} loads
 * @param {number} [now] millis since epoch — injectable for tests
 * @return {Array<{key:string,loadedAt:string}>}
 */
export function pruneLoads(loads, now = Date.now()) {
  return loadsInsideRollingWindow(loads, now)
}


/** @return {{tier: string, loads: Array}} */
function defaultQuota() {
  return {tier: TIERS.FREE, loads: []}
}

/**
 * The tier the removed anonymous quota tier stored in `quota.json`. Read
 * only so its ledger can be dropped (loadQuota).
 */
const LEGACY_ANONYMOUS_TIER = 'anonymous'


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
 * drops the legacy `resetDate` field that earlier versions persisted, and
 * the whole ledger of the removed anonymous tier: what a signed-out user
 * opened never counts, so those rows must not follow them into a free
 * account's local mirror (the badge would show them until record-load's
 * answer replaced it).
 *
 * @return {Promise<{tier: string, loads: Array}>}
 */
export async function loadQuota() {
  try {
    const handle = await getHandle(false)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    if (parsed.tier === LEGACY_ANONYMOUS_TIER) {
      return defaultQuota()
    }
    return {
      tier: parsed.tier || TIERS.FREE,
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
  const pruned = pruneLoads(quota.loads)
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
 * Record a counted model load in OPFS: the fallback when record-load is
 * unreachable (useQuota#recordLocally). Normally the record-load response is
 * mirrored into OPFS via saveQuota instead.
 *
 * Writes whatever key it is given: the caller has already decided the load
 * counts (a metered local file, or a Drive file found private), which for
 * Drive took a lookup this module can't repeat.
 *
 * Idempotent on key.
 *
 * @param {string} key
 * @return {Promise<{tier: string, loads: Array}>}
 */
export async function recordLoad(key) {
  const raw = await loadQuota()
  const loads = pruneLoads(raw.loads)
  if (loads.some((l) => l.key === key)) {
    return {...raw, loads}
  }
  const updated = {...raw, loads: [...loads, {key, loadedAt: new Date().toISOString()}]}
  await saveQuota(updated)
  return updated
}

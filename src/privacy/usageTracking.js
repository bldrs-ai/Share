import Cookies from 'js-cookie'
import Expires from './Expires'


const STORAGE_KEY = 'bldrs_model_usage'
const COOKIE_NAME = 'mu'
const OPFS_DIR = '.bldrs'
const OPFS_FILE = 'usage.json'
const VERSION = 1


/** Module-level cache populated asynchronously by initUsageFromOPFS() */
let _opfsCache = null


/** Rate limits by user tier */
const LIMITS = {
  anonymous: {daily: 1, monthly: 5},
  free: {daily: 5, monthly: 25},
  pro: {daily: Infinity, monthly: Infinity},
}


/**
 * Determine user tier from authentication state and app metadata.
 *
 * @param {boolean} isAuthenticated
 * @param {object} appMetadata
 * @return {'anonymous'|'free'|'pro'}
 */
export function getUserTier(isAuthenticated, appMetadata) {
  if (!isAuthenticated) {
    return 'anonymous'
  }
  if (appMetadata && appMetadata.subscriptionStatus === 'sharePro') {
    return 'pro'
  }
  return 'free'
}


/**
 * Check whether a model load is allowed for the given user tier.
 *
 * @param {string} userTier 'anonymous'|'free'|'pro'
 * @return {object} Result with allowed, reason, and stats properties
 */
export function canLoadModel(userTier) {
  if (userTier === 'pro') {
    return {allowed: true, reason: null, stats: getUsageStats(userTier)}
  }
  const usage = loadUsage()
  const limits = LIMITS[userTier]
  if (usage.daily.count >= limits.daily) {
    return {allowed: false, reason: 'daily', stats: getUsageStats(userTier)}
  }
  if (usage.monthly.count >= limits.monthly) {
    return {allowed: false, reason: 'monthly', stats: getUsageStats(userTier)}
  }
  return {allowed: true, reason: null, stats: getUsageStats(userTier)}
}


/**
 * Record a model load — increment daily and monthly counters.
 */
export function recordModelLoad() {
  const usage = loadUsage()
  usage.daily.count += 1
  usage.monthly.count += 1
  saveUsage(usage)
}


/**
 * Get formatted usage stats for UI display.
 *
 * @param {string} userTier
 * @return {{dailyUsed: number, dailyLimit: number, monthlyUsed: number, monthlyLimit: number}}
 */
export function getUsageStats(userTier) {
  const usage = loadUsage()
  const limits = LIMITS[userTier] || LIMITS.anonymous
  return {
    dailyUsed: usage.daily.count,
    dailyLimit: limits.daily,
    monthlyUsed: usage.monthly.count,
    monthlyLimit: limits.monthly,
  }
}


/**
 * Initialize usage data from OPFS. Call once at app startup.
 * Populates _opfsCache so loadUsage() can read it synchronously.
 * If OPFS has data but localStorage/cookie are empty, restores to those layers.
 */
export async function initUsageFromOPFS() {
  const opfsData = await loadFromOPFS()
  if (opfsData) {
    _opfsCache = opfsData

    // Restore to localStorage/cookie if they're empty
    const hasLocalStorage = (() => {
      try {
        return !!localStorage.getItem(STORAGE_KEY)
      } catch {
        return false
      }
    })()
    const hasCookie = !!Cookies.get(COOKIE_NAME)

    if (!hasLocalStorage || !hasCookie) {
      saveUsage(resetIfNeeded(opfsData))
    }
  }
}


// --- Internal helpers ---


/** @return {string} Today's date in UTC as YYYY-MM-DD */
function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}


/** @return {string} Current month in UTC as YYYY-MM */
function monthUTC() {
  return new Date().toISOString().slice(0, 7)
}


/**
 * Simple checksum for tamper detection.
 *
 * @param {object} usage
 * @return {string}
 */
function computeChecksum(usage) {
  const raw = `${VERSION}:${usage.daily.date}:${usage.daily.count}:${usage.monthly.month}:${usage.monthly.count}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0 // Convert to 32bit integer
  }
  const HEX_RADIX = 16
  return Math.abs(hash).toString(HEX_RADIX)
}


/**
 * Reset counters if the day or month has rolled over.
 *
 * @param {object} usage
 * @return {object} Possibly-reset usage
 */
function resetIfNeeded(usage) {
  const today = todayUTC()
  const month = monthUTC()
  if (usage.daily.date !== today) {
    usage.daily = {date: today, count: 0}
  }
  if (usage.monthly.month !== month) {
    usage.monthly = {month: month, count: 0}
  }
  return usage
}


/** @return {object} Default empty usage */
function defaultUsage() {
  return {
    version: VERSION,
    daily: {date: todayUTC(), count: 0},
    monthly: {month: monthUTC(), count: 0},
  }
}


/**
 * Read usage data from OPFS (.bldrs/usage.json).
 *
 * @return {Promise<object|null>} Parsed usage object or null
 */
async function loadFromOPFS() {
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    const fileHandle = await dir.getFileHandle(OPFS_FILE)
    const file = await fileHandle.getFile()
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (parsed && parsed.version === VERSION) {
      return parsed
    }
  } catch {
    // OPFS unavailable, directory/file doesn't exist, or parse error
  }
  return null
}


/**
 * Write usage data to OPFS (.bldrs/usage.json). Creates directory if needed.
 *
 * @param {object} usage
 */
async function saveToOPFS(usage) {
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(OPFS_DIR, {create: true})
    const fileHandle = await dir.getFileHandle(OPFS_FILE, {create: true})
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(usage))
    await writable.close()
  } catch {
    // OPFS unavailable or write error — silently ignore
  }
}


/**
 * Parse the compact cookie string back to a usage object.
 * Cookie format: d:3,m:15,dt:2026-02-23,mt:2026-02
 *
 * @param {string} cookieStr
 * @return {object|null}
 */
function parseCookie(cookieStr) {
  if (!cookieStr) {
    return null
  }
  try {
    const parts = {}
    cookieStr.split(',').forEach((pair) => {
      const [key, val] = pair.split(':')
      parts[key] = val
    })
    if (parts.d !== undefined && parts.m !== undefined && parts.dt && parts.mt) {
      return {
        version: VERSION,
        daily: {date: parts.dt, count: parseInt(parts.d, 10)},
        monthly: {month: parts.mt, count: parseInt(parts.m, 10)},
      }
    }
  } catch {
    // Invalid cookie format
  }
  return null
}


/**
 * Encode a usage object to compact cookie string.
 *
 * @param {object} usage
 * @return {string}
 */
function toCookieStr(usage) {
  return `d:${usage.daily.count},m:${usage.monthly.count},dt:${usage.daily.date},mt:${usage.monthly.month}`
}


/**
 * Load usage from OPFS cache, localStorage, or cookie (in priority order).
 * If the checksum is invalid, treat as max usage (limits reached).
 *
 * @return {object} usage
 */
function loadUsage() {
  let usage = null

  // Try OPFS cache first (populated async at startup)
  if (_opfsCache && _opfsCache.version === VERSION) {
    usage = _opfsCache
  }

  // Try localStorage
  if (!usage) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && parsed.version === VERSION) {
          const expected = computeChecksum(parsed)
          if (parsed.checksum === expected) {
            usage = parsed
          }
          // Checksum mismatch — fall through to cookie or treat as tampered
        }
      }
    } catch {
      // localStorage unavailable or corrupted
    }
  }

  // Fallback to cookie
  if (!usage) {
    const cookieStr = Cookies.get(COOKIE_NAME)
    const fromCookie = parseCookie(cookieStr)
    if (fromCookie) {
      usage = fromCookie
    }
  }

  // Still nothing — fresh usage
  if (!usage) {
    usage = defaultUsage()
  }

  return resetIfNeeded(usage)
}


/**
 * Save usage to localStorage, cookie, and OPFS.
 *
 * @param {object} usage
 */
function saveUsage(usage) {
  usage.checksum = computeChecksum(usage)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch {
    // localStorage full or unavailable
  }

  Cookies.set(COOKIE_NAME, toCookieStr(usage), {expires: Expires.DAYS})

  // Fire-and-forget write to OPFS
  _opfsCache = usage
  saveToOPFS(usage)
}


// Exported for testing
export {STORAGE_KEY, COOKIE_NAME, OPFS_DIR, OPFS_FILE, LIMITS}

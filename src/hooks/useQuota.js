import {useState, useEffect, useCallback} from 'react'
import {captureException} from '@sentry/react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useStore from '../store/useStore'
import {isFeatureEnabled} from '../FeatureFlags'
import {HTTP_FORBIDDEN} from '../net/http'
import {DRIVE_VISIBILITY} from '../quota/driveVisibility'
import {
  TIERS,
  LIMITS,
  isDrivePath,
  isQuotablePath,
  isLocallyQuotable,
  getTier,
  pruneLoads,
  loadQuota,
  saveQuota,
  recordLoad,
  subscribeToQuota,
} from '../quota/quota'


const RECORD_LOAD_ENDPOINT = '/.netlify/functions/record-load'


// Stable no-ops returned when the `quotas` feature flag is off, so the hook's
// shape is unchanged but every gate passes. Module-level keeps their identity
// stable across renders. Not async (avoids require-await); callers `await`
// the returned Promise.
const passthroughCheck = () => ({allowed: true, used: 0, limit: Infinity, alreadyCounted: false})
const passthroughRecord = () => Promise.resolve({allowed: true, used: 0, limit: Infinity, tier: TIERS.PAID, alreadyCounted: false})


/**
 * React hook for usage quota state.
 *
 * For authenticated users the server (record-load Netlify function) is the
 * source of truth: every quotable load POSTs to it, the response is mirrored
 * into OPFS, and the JWT is force-refreshed so other readers (BaseRoutes)
 * see the same app_metadata.
 *
 * Signed-out users are never metered: no tier, the same unlimited
 * passthrough as the flag being off (quota.js#getTier explains why). There
 * is no anonymous OPFS ledger any more.
 *
 * If the Netlify function is unreachable, the hook falls back to OPFS-only
 * for that load and reports to Sentry. We degrade open rather than block
 * legitimate users on an outage.
 *
 * @return {{
 *   used: number,
 *   limit: number,
 *   tier: string,
 *   hasCapacity: boolean,
 *   check: Function,
 *   record: Function,
 * }}
 */
export default function useQuota() {
  // isFeatureEnabled (not the useExistInFeature hook) reads window.location
  // directly, so useQuota imposes no Router context on its consumers — it is
  // rendered in containers that some tests mount without a router.
  const quotasEnabled = isFeatureEnabled('quotas')
  const {isAuthenticated, getAccessTokenSilently} = useAuth0()
  const appMetadata = useStore((state) => state.appMetadata)
  const tier = getTier(appMetadata, isAuthenticated)
  // Signed out has no tier and nothing is metered. While Auth0 is still
  // settling a signed-in user reads as signed out too, so a load in that
  // first moment goes unmetered; useDirectLinkQuota waits it out, and the
  // Open dialog's Drive and GitHub sources need a connection, which is
  // rarely ready sooner.
  const isMetered = quotasEnabled && tier !== null
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    // With the flag off the hook returns the passthrough shape below, so
    // loading OPFS state would be wasted work — and its post-mount setQuota
    // is exactly the kind of unsettled async update that litters every
    // consumer's tests with act() warnings (PLAYBOOK §"Keep the test
    // console clean").
    if (!isMetered) {
      return undefined
    }
    let cancelled = false
    loadQuota().then((raw) => {
      if (cancelled) {
        return
      }
      const next = {...raw, tier, loads: pruneLoads(raw.loads)}
      setQuota(next)
      if (next.tier !== raw.tier || next.loads.length !== raw.loads.length) {
        saveQuota(next)
      }
    })
    const unsub = subscribeToQuota((q) => {
      if (cancelled) {
        return
      }
      setQuota({...q, tier})
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [tier, isMetered])

  const used = quota?.loads.length ?? 0
  const limit = LIMITS[tier] !== undefined ? LIMITS[tier] : LIMITS[TIERS.FREE]

  const check = useCallback((key) => {
    if (!quota) {
      return {allowed: true, used: 0, limit: Infinity, alreadyCounted: false}
    }
    if (tier === TIERS.PAID) {
      return {allowed: true, used, limit, alreadyCounted: false}
    }
    // Re-pruned at call time, not just at mount: a tab left open across a
    // slot's roll-off would otherwise keep counting it until the next
    // record() or remount (agent review on Share#1974).
    const loads = pruneLoads(quota.loads)
    const usedNow = loads.length
    if (key === null || key === undefined || !isQuotablePath(key)) {
      return {allowed: true, used: usedNow, limit, alreadyCounted: false}
    }
    const alreadyCounted = loads.some((l) => l.key === key)
    // Only deny what the client KNOWS is a new private load: /v/gh/ paths
    // may be public (the server resolves that) and /v/g/ ones too (Drive
    // visibility takes a lookup, which record() makes), so both pass the
    // cheap gate and record() makes the authoritative call. Already-counted
    // keys stay openable at limit (server idempotency).
    return {
      allowed: alreadyCounted || !isLocallyQuotable(key) || usedNow < limit,
      used: usedNow,
      limit,
      alreadyCounted,
    }
  }, [quota, used, limit, tier])

  /**
   * Meter one load. For a Drive key, `resolveDriveVisibility` says whether
   * the file is public (quota/driveVisibility.js#driveFileQuotaVisibility,
   * which never rejects); a public one is never sent to record-load, so it
   * is neither counted nor refused. It is called only for a free user, the
   * one tier that can be refused, so a Pro open costs no lookup. Without it a
   * Drive key counts as private: the behaviour before Drive visibility was
   * looked at, and the safe default for a caller that can't tell.
   *
   * @param {string} key Share path being loaded
   * @param {{resolveDriveVisibility?: Function}} [options]
   * @return {Promise<{allowed:boolean,used:number,limit:number,tier:string,alreadyCounted:boolean}>}
   */
  const record = useCallback(async (key, {resolveDriveVisibility} = {}) => {
    if (!isQuotablePath(key)) {
      return {allowed: true, used, limit, tier, alreadyCounted: false}
    }

    if (tier === TIERS.FREE && isDrivePath(key)) {
      const visibility = resolveDriveVisibility ? await resolveDriveVisibility() : DRIVE_VISIBILITY.PRIVATE
      if (visibility === DRIVE_VISIBILITY.PUBLIC) {
        return {allowed: true, used, limit, tier, alreadyCounted: false}
      }
    }

    // Authenticated: server is authoritative.
    let token
    try {
      token = await getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
      })
    } catch (err) {
      captureException(err)
      return recordLocally(key, tier, limit, setQuota)
    }

    let response
    try {
      response = await fetch(RECORD_LOAD_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({key}),
      })
    } catch (err) {
      captureException(err)
      return recordLocally(key, tier, limit, setQuota)
    }

    let data
    try {
      data = await response.json()
    } catch {
      data = {}
    }

    // Mirror the server's authoritative loads into OPFS whenever it sends
    // them (both allow and deny responses) so the badge and the next mount
    // agree with the server even if it's briefly unreachable later.
    if (Array.isArray(data.loads)) {
      const updated = {tier: data.tier ?? tier, loads: data.loads}
      saveQuota(updated)
      setQuota(updated)
    }

    if (response.status === HTTP_FORBIDDEN) {
      // Server denied — surface the limit dialog via the returned payload.
      return {
        allowed: false,
        used: data.used ?? used,
        limit: data.limit ?? limit,
        tier: data.tier ?? tier,
        alreadyCounted: false,
      }
    }

    if (!response.ok) {
      captureException(new Error(`record-load returned ${response.status}`))
      return recordLocally(key, tier, limit, setQuota)
    }

    // A new load was persisted server-side (loads present and not a dedup
    // hit): force-refresh the JWT so app_metadata readers (BaseRoutes etc.)
    // see the bumped count on next read. Skipped for not-quotable / paid /
    // alreadyCounted responses, where app_metadata didn't change and the
    // cacheMode:'off' refresh would be a wasted Auth0 round-trip. Failure
    // here is non-fatal — the hook's own state is already authoritative
    // for the badge / dialog.
    if (Array.isArray(data.loads) && data.alreadyCounted !== true) {
      getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
        cacheMode: 'off',
        useRefreshTokens: true,
      }).catch((err) => captureException(err))
    }

    return {
      allowed: data.allowed !== false,
      used: data.used ?? used,
      limit: data.limit ?? limit,
      tier: data.tier ?? tier,
      alreadyCounted: data.alreadyCounted === true,
    }
  }, [tier, limit, used, getAccessTokenSilently])

  // Feature-gated: with the `quotas` flag off (on since Share#1970) the hook reports
  // unlimited capacity and record()/check() are no-ops, so every load site
  // bypasses gating and the QuotaBadge (hidden when limit === Infinity) never
  // shows. Enforcement is enabled per-session via `?feature=quotas`, or for
  // everyone by flipping the flag's isActive in FeatureFlags.js. A signed-out
  // user gets the same shape: never metered, whatever the flag says. All
  // hooks above run unconditionally, so this early return respects the rules
  // of hooks.
  if (!isMetered) {
    return {
      used: 0,
      limit: Infinity,
      tier,
      hasCapacity: true,
      check: passthroughCheck,
      record: passthroughRecord,
    }
  }

  return {
    used,
    limit,
    tier,
    hasCapacity: tier === TIERS.PAID || used < limit,
    check,
    record,
  }
}


/**
 * OPFS-only record: the fallback when the server is unreachable for a
 * signed-in user (whose tier is kept). Applies the same order of operations
 * as the server — dedup, then capacity gate, then persist — so a denied load
 * is never written (writing it would over-report `used` and make the key
 * read as alreadyCounted later).
 *
 * Counts what is known private without the server: a metered local file, or
 * a Drive file, since record() has already returned for a public one. A
 * /v/gh/ path passes uncounted: only the server can tell its privacy.
 *
 * @param {string} key Share path being loaded
 * @param {string} tier User's quota tier
 * @param {number} limit Per-tier load limit
 * @param {Function} setQuota State setter for the hook's quota cache
 * @return {Promise<{allowed:boolean,used:number,limit:number,tier:string,alreadyCounted:boolean}>}
 */
async function recordLocally(key, tier, limit, setQuota) {
  const current = await loadQuota()
  const pruned = pruneLoads(current.loads)
  const alreadyCounted = pruned.some((l) => l.key === key)
  const isKnownPrivate = isLocallyQuotable(key) || isDrivePath(key)
  if (!isKnownPrivate || alreadyCounted) {
    return {allowed: true, used: pruned.length, limit, tier, alreadyCounted}
  }
  if (pruned.length >= limit) {
    return {allowed: false, used: pruned.length, limit, tier, alreadyCounted: false}
  }
  const updated = await recordLoad(key)
  setQuota((prev) => ({...(prev || updated), loads: updated.loads, tier}))
  return {
    allowed: true,
    used: updated.loads.length,
    limit,
    tier,
    alreadyCounted: false,
  }
}

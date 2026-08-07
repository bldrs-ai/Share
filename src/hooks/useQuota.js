import {useState, useEffect, useCallback} from 'react'
import {captureException} from '@sentry/react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useStore from '../store/useStore'
import {isFeatureEnabled} from '../FeatureFlags'
import {HTTP_FORBIDDEN} from '../net/http'
import {
  TIERS,
  LIMITS,
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
 * For anonymous users there is no server backstop — the hook relies on
 * OPFS only, which is the explicit "lossy nudge to sign in" v1 trade-off.
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
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    // With the flag off the hook returns the passthrough shape below, so
    // loading OPFS state would be wasted work — and its post-mount setQuota
    // is exactly the kind of unsettled async update that litters every
    // consumer's tests with act() warnings (PLAYBOOK §"Keep the test
    // console clean").
    if (!quotasEnabled) {
      return undefined
    }
    let cancelled = false
    loadQuota().then((raw) => {
      if (cancelled) {
        return
      }
      const next = {...raw, tier, loads: pruneLoads(raw.loads, tier)}
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
  }, [tier, quotasEnabled])

  const used = quota?.loads.length ?? 0
  const limit = LIMITS[tier] !== undefined ? LIMITS[tier] : LIMITS[TIERS.FREE]

  const check = useCallback((key) => {
    if (!quota) {
      return {allowed: true, used: 0, limit: Infinity, alreadyCounted: false}
    }
    if (tier === TIERS.PAID) {
      return {allowed: true, used, limit, alreadyCounted: false}
    }
    if (key === null || key === undefined || !isQuotablePath(key)) {
      return {allowed: true, used, limit, alreadyCounted: false}
    }
    const alreadyCounted = quota.loads.some((l) => l.key === key)
    // Only deny what the client KNOWS is a new private load: /v/gh/ paths
    // may be public (the server resolves that), so they pass the cheap gate
    // and record() makes the authoritative call. Already-counted keys stay
    // openable at limit (server idempotency).
    return {
      allowed: alreadyCounted || !isLocallyQuotable(key) || used < limit,
      used,
      limit,
      alreadyCounted,
    }
  }, [quota, used, limit, tier])

  const record = useCallback(async (key) => {
    if (!isQuotablePath(key)) {
      return {allowed: true, used, limit, tier, alreadyCounted: false}
    }

    // Anonymous: OPFS only — same local flow as the server-unreachable
    // fallback, just with the anonymous tier.
    if (tier === TIERS.ANONYMOUS) {
      return recordLocally(key, tier, limit, setQuota)
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

  // Feature-gated: with the `quotas` flag off (the default) the hook reports
  // unlimited capacity and record()/check() are no-ops, so every load site
  // bypasses gating and the QuotaBadge (hidden when limit === Infinity) never
  // shows. Enforcement is enabled per-session via `?feature=quotas`, or for
  // everyone by flipping the flag's isActive in FeatureFlags.js. All hooks
  // above run unconditionally, so this early return respects the rules of hooks.
  if (!quotasEnabled) {
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
 * OPFS-only record: the anonymous path, and the fallback when the server
 * is unreachable for an authenticated user (whose tier is kept). Applies
 * the same order of operations as the server — dedup, then capacity gate,
 * then persist — so a denied load is never written (writing it would
 * over-report `used` and make the key read as alreadyCounted later).
 *
 * @param {string} key Share path being loaded
 * @param {string} tier User's quota tier
 * @param {number} limit Per-tier load limit
 * @param {Function} setQuota State setter for the hook's quota cache
 * @return {Promise<{allowed:boolean,used:number,limit:number,tier:string,alreadyCounted:boolean}>}
 */
async function recordLocally(key, tier, limit, setQuota) {
  const current = await loadQuota()
  const pruned = pruneLoads(current.loads, tier)
  const alreadyCounted = pruned.some((l) => l.key === key)
  if (!isLocallyQuotable(key) || alreadyCounted) {
    return {allowed: true, used: pruned.length, limit, tier, alreadyCounted}
  }
  if (pruned.length >= limit) {
    return {allowed: false, used: pruned.length, limit, tier, alreadyCounted: false}
  }
  const updated = await recordLoad(key)
  if (updated) {
    setQuota((prev) => ({...(prev || updated), loads: updated.loads, tier}))
  }
  const newUsed = updated?.loads.length ?? pruned.length
  return {
    allowed: true,
    used: newUsed,
    limit,
    tier,
    alreadyCounted: false,
  }
}

import {useState, useEffect, useCallback} from 'react'
import {captureException} from '@sentry/react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useStore from '../store/useStore'
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
} from '../OPFS/quota'


const RECORD_LOAD_ENDPOINT = '/.netlify/functions/record-load'
const HTTP_FORBIDDEN = 403


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
  const {isAuthenticated, getAccessTokenSilently} = useAuth0()
  const appMetadata = useStore((state) => state.appMetadata)
  const tier = getTier(appMetadata, isAuthenticated)
  const [quota, setQuota] = useState(null)

  useEffect(() => {
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
  }, [tier])

  const used = quota?.loads.length ?? 0
  const limit = LIMITS[tier] !== undefined ? LIMITS[tier] : LIMITS[TIERS.FREE]

  const check = useCallback((key) => {
    if (!quota) {
      return {allowed: true, used: 0, limit: Infinity, alreadyCounted: false}
    }
    if (tier === TIERS.PAID) {
      return {allowed: true, used, limit, alreadyCounted: false}
    }
    if (key === null || !isQuotablePath(key)) {
      return {allowed: true, used, limit, alreadyCounted: false}
    }
    const alreadyCounted = quota.loads.some((l) => l.key === key)
    return {
      allowed: alreadyCounted || used < limit,
      used,
      limit,
      alreadyCounted,
    }
  }, [quota, used, limit, tier])

  const record = useCallback(async (key) => {
    if (!isQuotablePath(key)) {
      return {allowed: true, used, limit, tier, alreadyCounted: false}
    }

    // Anonymous: OPFS only.
    if (tier === TIERS.ANONYMOUS) {
      if (!isLocallyQuotable(key)) {
        return {allowed: true, used, limit, tier, alreadyCounted: false}
      }
      const updated = await recordLoad(key)
      if (updated) {
        setQuota((prev) => ({...(prev || updated), loads: updated.loads}))
      }
      const newUsed = updated?.loads.length ?? used
      return {
        allowed: newUsed <= limit,
        used: newUsed,
        limit,
        tier,
        alreadyCounted: false,
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
      return fallbackRecord(key, tier, limit, used, setQuota)
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
      return fallbackRecord(key, tier, limit, used, setQuota)
    }

    let data
    try {
      data = await response.json()
    } catch {
      data = {}
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
      return fallbackRecord(key, tier, limit, used, setQuota)
    }

    // Mirror server response into OPFS so the next mount has fresh state
    // even if the server is briefly unreachable later.
    if (Array.isArray(data.loads)) {
      const updated = {tier: data.tier ?? tier, loads: data.loads}
      saveQuota(updated)
      setQuota(updated)
    }

    // Force-refresh the JWT so app_metadata readers (BaseRoutes etc.)
    // see the bumped count on next read. Failure here is non-fatal —
    // the hook's own state is already authoritative for the badge / dialog.
    getAccessTokenSilently({
      authorizationParams: {
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access',
      },
      cacheMode: 'off',
      useRefreshTokens: true,
    }).catch((err) => captureException(err))

    return {
      allowed: data.allowed !== false,
      used: data.used ?? used,
      limit: data.limit ?? limit,
      tier: data.tier ?? tier,
      alreadyCounted: data.alreadyCounted === true,
    }
  }, [tier, limit, used, getAccessTokenSilently])

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
 * Server unreachable — fall back to OPFS-only counting. Mirrors the
 * anonymous code path but keeps the user's authenticated tier.
 *
 * @param {string} key Share path being loaded
 * @param {string} tier User's quota tier
 * @param {number} limit Per-tier load limit
 * @param {number} used Current observed usage
 * @param {Function} setQuota State setter for the hook's quota cache
 * @return {Promise<{allowed:boolean,used:number,limit:number,tier:string,alreadyCounted:boolean}>}
 */
async function fallbackRecord(key, tier, limit, used, setQuota) {
  if (!isLocallyQuotable(key)) {
    return {allowed: true, used, limit, tier, alreadyCounted: false}
  }
  const updated = await recordLoad(key)
  if (updated) {
    setQuota((prev) => ({...(prev || updated), loads: updated.loads, tier}))
  }
  const newUsed = updated?.loads.length ?? used
  return {
    allowed: newUsed <= limit,
    used: newUsed,
    limit,
    tier,
    alreadyCounted: false,
  }
}

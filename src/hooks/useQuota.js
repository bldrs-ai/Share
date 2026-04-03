import {useState, useEffect, useCallback} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {
  TIERS,
  LIMITS,
  loadQuota,
  saveQuota,
  maybeReset,
  checkQuota,
  recordLoad,
  isPrivateKey,
  subscribeToQuota,
} from '../OPFS/quota'


/**
 * React hook for usage quota state.
 * Reads quota from OPFS on mount, subscribes to cross-component changes,
 * and derives the user's tier from Auth0 authentication status.
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
  const {isAuthenticated} = useAuth0()
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    const tier = isAuthenticated ? TIERS.FREE : TIERS.ANONYMOUS

    loadQuota().then((raw) => {
      const updated = maybeReset({...raw, tier})
      setQuota(updated)
      if (updated.tier !== raw.tier || updated.loads.length !== raw.loads.length) {
        saveQuota(updated)
      }
    })

    const unsub = subscribeToQuota((q) => setQuota({...q, tier}))
    return unsub
  }, [isAuthenticated])

  const used = quota?.loads.length ?? 0
  const tier = quota?.tier ?? TIERS.ANONYMOUS
  const limit = LIMITS[tier] ?? LIMITS[TIERS.FREE]

  /**
   * Checks whether a private model load is permitted.
   * Pass null for key to do a generic capacity check (e.g. before a file picker).
   *
   * @param {string|null} key Share path for the model, or null
   * @return {{allowed: boolean, used: number, limit: number, alreadyCounted: boolean}}
   */
  const check = useCallback((key) => {
    if (!quota) {
      return {allowed: true, used: 0, limit: Infinity, alreadyCounted: false}
    }
    if (key === null || !isPrivateKey(key)) {
      return {allowed: used < limit, used, limit, alreadyCounted: false}
    }
    return checkQuota(quota, key)
  }, [quota, used, limit])

  /**
   * Records a private model load. No-op for non-private keys.
   *
   * @param {string} key Share path for the model
   * @return {Promise<void>}
   */
  const record = useCallback(async (key) => {
    const updated = await recordLoad(key)
    if (updated) {
      setQuota(updated)
    }
  }, [])

  return {
    used,
    limit,
    tier,
    hasCapacity: used < limit,
    check,
    record,
  }
}

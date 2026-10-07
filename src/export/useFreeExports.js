import {useEffect, useState} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {TIERS, getTier} from '../quota/quota'
import useStore from '../store/useStore'
import {fetchFreeExportAllowance} from './exportHistory'


// The audience/scope every token call site in the app asks for, so this reads
// the same cached token `useExport` does rather than minting a second one.
const TOKEN_PARAMS = {
  authorizationParams: {
    audience: 'https://api.github.com/',
    scope: 'openid profile email offline_access',
  },
}

// `setTimeout` stores its delay as a signed 32-bit int and fires a larger one
// immediately, so a `nextFreeAt` further out than ~24.8 days is clamped; the
// refetch that fires early just re-arms the timer.
const MAX_TIMEOUT_MS = 2147483647
// Floor on the wait, so a `nextFreeAt` already in the past (client clock
// ahead of the server's, or a failed refetch leaving the old window cached)
// retries on a slow cadence rather than in a tight loop.
const MIN_REFETCH_DELAY_MS = 10000


/**
 * A free user's export allowance, for the Export tab's "N of 2 free exports
 * left" line and its at-the-limit gate (design/new/glb-export-premium.md
 * §4.8).
 *
 * Asks the server (`record-export`'s GET) each time it mounts for a free
 * user, because nothing else on the client knows the count reliably: the
 * JWT's `app_metadata` claim may not carry `exports` at all (an Auth0 Action
 * outside this repo decides that), and an OPFS mirror is per browser while
 * the allowance is per account. Every later answer — a charged module, a
 * recorded export, an at-the-limit refusal — updates the same store slot
 * (`useExport`), so the line moves without another round trip.
 *
 * At the limit, a timer refetches at `nextFreeAt` so a tab left open across
 * the window rolling lifts the gate without a remount.
 *
 * The count is DISPLAY ONLY. `pro-module` re-reads the ledger and decides on
 * every request; a stale or missing count here costs at most a click that
 * the server then answers.
 *
 * @return {?{limit: number, used: number, remaining: number, nextFreeAt: ?string}}
 *   null for Pro, anonymous, or while the allowance is unknown
 */
export default function useFreeExports() {
  const {isAuthenticated, user, getAccessTokenSilently} = useAuth0()
  const appMetadata = useStore((state) => state.appMetadata)
  const allowance = useStore((state) => state.freeExportAllowance)
  const setFreeExportAllowance = useStore((state) => state.setFreeExportAllowance)
  const isFreeTier = getTier(appMetadata, isAuthenticated) === TIERS.FREE
  const sub = user?.sub ?? null
  // Bumped by the `nextFreeAt` timer to re-run the fetch below.
  const [refetchTick, setRefetchTick] = useState(0)
  const nextFreeAt = allowance?.sub === sub && allowance.remaining === 0 ? allowance.nextFreeAt : null

  useEffect(() => {
    if (!isFreeTier || !sub) {
      return undefined
    }
    let isCancelled = false
    fetchFreeExportAllowance(() => getAccessTokenSilently(TOKEN_PARAMS)).then((result) => {
      if (isCancelled) {
        return
      }
      if (result?.freeExports) {
        setFreeExportAllowance({sub, ...result.freeExports})
      } else if (result?.tier === TIERS.PAID) {
        // The client's tier is stale (an upgrade in another tab, say). The
        // server treats this user as unlimited, so drop any cached count —
        // an exhausted one would otherwise keep `ExportSection` gating an
        // entitled user.
        setFreeExportAllowance(null)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [isFreeTier, sub, refetchTick, getAccessTokenSilently, setFreeExportAllowance])

  // At the limit nothing else changes the allowance (the gate intercepts every
  // click, so `pro-module` is never asked), so ask again when the window rolls.
  useEffect(() => {
    const dueAt = Date.parse(nextFreeAt)
    if (!isFreeTier || Number.isNaN(dueAt)) {
      return undefined
    }
    const delay = Math.min(Math.max(dueAt - Date.now(), MIN_REFETCH_DELAY_MS), MAX_TIMEOUT_MS)
    const timer = setTimeout(() => setRefetchTick((tick) => tick + 1), delay)
    return () => clearTimeout(timer)
  }, [isFreeTier, nextFreeAt, refetchTick])

  return isFreeTier && allowance && allowance.sub === sub ? allowance : null
}

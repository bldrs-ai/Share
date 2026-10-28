import {useEffect, useState} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {TIERS, getTier} from '../quota/quota'
import useStore from '../store/useStore'
import {fetchModelSlots} from './exportHistory'


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
 * A free user's model slots (src/export/exportSlots.js#modelSlots), for the
 * Export tab's slot line and its slots-full gate
 * (design/new/glb-export-premium.md §4.8).
 *
 * Asks the server (`record-export`'s GET) each time it mounts for a free
 * user, because nothing else on the client knows the slots reliably: the
 * JWT's `app_metadata` claim may not carry `usageQuota` at all (an Auth0
 * Action outside this repo decides that), `useQuota`'s OPFS mirror is per
 * browser while the slots are per account, and that mirror only ever hears
 * about PRIVATE opens — never a slot an export took. Every later answer — a
 * delivery's slots header, a recorded export, a slots-full refusal — updates
 * the same store slot (`useExport`), so the line moves without another round
 * trip.
 *
 * With every slot taken, a timer refetches at `nextFreeAt` so a tab left
 * open across the window rolling lifts the gate without a remount.
 *
 * The slots are DISPLAY ONLY. `pro-module` re-reads the ledger and decides on
 * every request; stale or missing slots here cost at most a click that the
 * server then answers.
 *
 * @return {?{limit: number, used: number, remaining: number, nextFreeAt: ?string, keys: Array<string>}}
 *   null for Pro, anonymous, or while the slots are unknown
 */
export default function useExportSlots() {
  const {isAuthenticated, user, getAccessTokenSilently} = useAuth0()
  const appMetadata = useStore((state) => state.appMetadata)
  const slots = useStore((state) => state.modelSlots)
  const setModelSlots = useStore((state) => state.setModelSlots)
  const isFreeTier = getTier(appMetadata, isAuthenticated) === TIERS.FREE
  const sub = user?.sub ?? null
  // Bumped by the `nextFreeAt` timer to re-run the fetch below.
  const [refetchTick, setRefetchTick] = useState(0)
  const nextFreeAt = slots?.sub === sub && slots.remaining === 0 ? slots.nextFreeAt : null

  useEffect(() => {
    if (!isFreeTier || !sub) {
      return undefined
    }
    let isCancelled = false
    fetchModelSlots(() => getAccessTokenSilently(TOKEN_PARAMS)).then((result) => {
      if (isCancelled) {
        return
      }
      if (result?.modelSlots) {
        setModelSlots({sub, ...result.modelSlots})
      } else if (result?.tier === TIERS.PAID) {
        // The client's tier is stale (an upgrade in another tab, say). The
        // server treats this user as unlimited, so drop any cached slots —
        // full ones would otherwise keep `ExportSection` gating an entitled
        // user.
        setModelSlots(null)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [isFreeTier, sub, refetchTick, getAccessTokenSilently, setModelSlots])

  // With every slot taken nothing else frees one (the gate intercepts every
  // click on a model holding no slot, so `pro-module` is never asked), so ask
  // again when the window rolls.
  useEffect(() => {
    const dueAt = Date.parse(nextFreeAt)
    if (!isFreeTier || Number.isNaN(dueAt)) {
      return undefined
    }
    const delay = Math.min(Math.max(dueAt - Date.now(), MIN_REFETCH_DELAY_MS), MAX_TIMEOUT_MS)
    const timer = setTimeout(() => setRefetchTick((tick) => tick + 1), delay)
    return () => clearTimeout(timer)
  }, [isFreeTier, nextFreeAt, refetchTick])

  return isFreeTier && slots && slots.sub === sub ? slots : null
}

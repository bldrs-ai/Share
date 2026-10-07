import {useEffect} from 'react'
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

  useEffect(() => {
    if (!isFreeTier || !sub) {
      return undefined
    }
    let isCancelled = false
    fetchFreeExportAllowance(() => getAccessTokenSilently(TOKEN_PARAMS)).then((result) => {
      // A `paid` answer (the client's tier is stale) carries no allowance,
      // and leaves the line absent rather than showing a count for a user
      // the server treats as unlimited.
      if (!isCancelled && result?.freeExports) {
        setFreeExportAllowance({sub, ...result.freeExports})
      }
    })
    return () => {
      isCancelled = true
    }
  }, [isFreeTier, sub, getAccessTokenSilently, setFreeExportAllowance])

  return isFreeTier && allowance && allowance.sub === sub ? allowance : null
}

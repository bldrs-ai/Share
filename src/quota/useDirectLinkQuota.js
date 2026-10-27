import {useCallback, useEffect, useRef, useState} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useQuota from '../hooks/useQuota'
import {GATE_EVENTS, gtagEventWithCid} from '../privacy/analytics'
import {navigateBaseOnModelPath} from '../utils/location'
import {driveFileQuotaVisibility} from './driveVisibility'


/**
 * The `route_kind` param of quota_soft_limit_exceeded, by route.
 */
export const DIRECT_LINK_ROUTE_KINDS = Object.freeze({
  GDRIVE: 'gdrive',
  GITHUB: 'github',
})


/**
 * The quota key a loaded route is metered under, or null when the route is
 * never metered on the direct-link path.
 *
 * The key must be the very string the Open dialog records the same model
 * under, because the ledger dedupes by exact key: a model opened from the
 * dialog and then reloaded (or opened again from a pasted link) has to read
 * as `alreadyCounted`, not as a second private model.
 *
 * - Drive: `${appPrefix}/v/g/${fileId}`, as OpenModelDialog#handleOpenById
 *   and #handlePickerSelect build it. A `/v/g/<drive URL>` route parses to
 *   the same fileId (routes/google.ts), so it lands on the same key.
 *   Whether it counts is the file's visibility (useDirectLinkQuota below).
 * - GitHub: navigateBaseOnModelPath, as GitHubFileBrowser builds the
 *   sharePath it records and saves to recents. That helper hard-codes
 *   `/share`, not appPrefix; matching it is what keeps the dedup working.
 *   The element path (`…/model.ifc/12/34`) is not part of the key.
 *   Whether a GitHub file is private is the SERVER's call (record-load's
 *   unauthenticated repo lookup): a public repo comes back not-quotable and
 *   is never counted.
 * - Everything else (local files, hosted `/v/p/`, generic `/v/u/` URLs):
 *   null. Local files are unmetered (Share#1966), and a `/v/local-only/` link
 *   only opens in the browser that already recorded it from the dialog.
 *
 * @param {object|null} modelPath route result (routes/routes.ts#handleRoute)
 * @param {string} appPrefix e.g. '/share'
 * @return {{key: string, routeKind: string, fileId: (string|undefined)}|null}
 */
export function directLinkQuotaKey(modelPath, appPrefix) {
  if (!modelPath || modelPath.kind !== 'provider') {
    return null
  }
  if (modelPath.provider === 'google' && modelPath.fileId) {
    return {
      key: `${appPrefix}/v/g/${modelPath.fileId}`,
      routeKind: DIRECT_LINK_ROUTE_KINDS.GDRIVE,
      fileId: modelPath.fileId,
    }
  }
  if (modelPath.provider === 'github' && modelPath.org && modelPath.repo && modelPath.branch && modelPath.filepath) {
    return {
      key: navigateBaseOnModelPath(modelPath.org, modelPath.repo, modelPath.branch, `/${modelPath.filepath}`),
      routeKind: DIRECT_LINK_ROUTE_KINDS.GITHUB,
    }
  }
  return null
}


/**
 * Meters a model loaded straight from its URL — a pasted or clicked
 * `/share/v/g/…` or `/share/v/gh/…` link — which never passes through the
 * Open dialog's record() gate (codex P1 on Share#1971).
 *
 * This is a SOFT gate, by the owner's decision (2026-10-23): the load is
 * recorded with the same useQuota().record() the dialog uses, but never
 * blocked. If record-load refuses it (over the limit), the model stays
 * loaded, QuotaLimitDialog is NOT shown, and quota_soft_limit_exceeded is
 * sent instead, so the use of this workaround can be measured before
 * deciding whether to block it (design/new/quotas.md §"Direct links: soft
 * gate").
 *
 * Returns a function CadView calls after each successful load with the
 * route it loaded and, for Drive, how it downloaded the file. Each key is
 * metered at most once per page load (a theme change re-inits the viewer and
 * reloads the same model; navigating A → B → A in-app is one open of A), and
 * not before Auth0 has settled: while `isAuthenticated` is still false,
 * record() treats the user as signed out and meters nothing, which would let
 * a signed-in user's load go uncounted.
 *
 * A Drive file counts only when it is private (design/new/quotas.md §"Drive
 * visibility"). CadView passes `driveDownload`: `{connection: null}` when it
 * downloaded the file with the API key, which only works for a file anyone
 * with the link can open, so it is public and nothing is recorded;
 * `{connection}` when it used the user's Drive connection, so the file's
 * permissions are looked up (driveVisibility.js). The lookup runs inside
 * record(), only for a free user. A Drive route with no `driveDownload` counts
 * as private.
 *
 * Dedup across opens is record()'s own, by key: record-load's ledger for a
 * signed-in user (a key it already holds comes back `alreadyCounted`, with
 * no write). That is what makes "open from the dialog, then load" one count.
 * The hook deliberately does NOT short-circuit on the local mirror
 * (`check(key).alreadyCounted`): OPFS is per browser, not per user, so a row
 * left by an offline fallback or another account would silence this user's
 * server call, and with it the meter and the event (codex review on
 * Share#1971).
 *
 * @param {string} appPrefix e.g. '/share'
 * @return {Function} (modelPath, driveDownload?) => void, fire-and-forget
 */
export default function useDirectLinkQuota(appPrefix) {
  const {record} = useQuota()
  const {isLoading: isAuthLoading} = useAuth0()
  const [pending, setPending] = useState(null)
  // Keys already metered this page load. A ref, so StrictMode's double
  // effect run and the record identity changes (every quota update)
  // that re-run the effect below can't meter a key twice.
  const meteredKeysRef = useRef(new Set())

  const meterLoadedModel = useCallback((modelPath, driveDownload) => {
    const quotaKey = directLinkQuotaKey(modelPath, appPrefix)
    if (quotaKey === null) {
      return
    }
    const target = {key: quotaKey.key, routeKind: quotaKey.routeKind}
    // No driveDownload, no resolver: record() then counts the file as private.
    if (quotaKey.routeKind === DIRECT_LINK_ROUTE_KINDS.GDRIVE && driveDownload) {
      target.resolveDriveVisibility = () => driveFileQuotaVisibility(driveDownload.connection, quotaKey.fileId)
    }
    // Functional update keeps the previous object when the key is the same,
    // so a same-model re-init causes no render.
    setPending((prev) => (prev?.key === target.key ? prev : target))
  }, [appPrefix])

  useEffect(() => {
    if (pending === null || isAuthLoading) {
      return
    }
    const {key, routeKind, resolveDriveVisibility} = pending
    if (meteredKeysRef.current.has(key)) {
      return
    }
    meteredKeysRef.current.add(key)
    // record() never rejects: network and token failures fall back to OPFS
    // inside useQuota. Not awaited — the model is already on screen and
    // nothing here may hold it.
    const outcomePromise = resolveDriveVisibility ? record(key, {resolveDriveVisibility}) : record(key)
    outcomePromise.then((outcome) => {
      if (outcome.allowed !== false) {
        return
      }
      gtagEventWithCid(GATE_EVENTS.QUOTA_SOFT_LIMIT_EXCEEDED, {
        tier: outcome.tier,
        used: outcome.used,
        limit: outcome.limit,
        route_kind: routeKind,
      })
    })
  }, [pending, isAuthLoading, record])

  return meterLoadedModel
}

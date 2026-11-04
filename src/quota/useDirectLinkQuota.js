import {useCallback, useEffect, useRef, useState} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useQuota from '../hooks/useQuota'
import {
  GATE_EVENTS,
  MODEL_ACTIONS,
  MODEL_GATES,
  MODEL_SOURCES,
  gtagEventWithCid,
  modelContentId,
} from '../privacy/analytics'
import {trackModelActionWhenAuthSettled} from '../privacy/modelActionTracking'
import {localOnlyPath} from '../routes/localOnly'
import {navigateBaseOnModelPath} from '../utils/location'
import {driveFileQuotaVisibility} from './driveVisibility'
import {isLocalFileMeteringEnabled} from './quota'


/**
 * The `route_kind` param of quota_soft_limit_exceeded, by route. A closed
 * set, registered GA-side as a custom dimension. `local` (bldrs-ai/ops#39)
 * is sent only while the `meterLocalFiles` switch is on, and is the value
 * MODEL_ROUTE_KINDS.LOCAL already gives a local file on model_view and
 * model_share, so the events still share one vocabulary (the test pins the
 * two equal). A literal, not a reference to that constant: suites that mock
 * privacy/analytics wholesale load this module through quota/modelSlotKey.js,
 * and a module-scope read of their mock fails at import.
 */
export const DIRECT_LINK_ROUTE_KINDS = Object.freeze({
  GDRIVE: 'gdrive',
  GITHUB: 'github',
  LOCAL: 'local',
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
 * - Local files (`/v/local-only/`), only while the `meterLocalFiles` abuse
 *   switch is on: `localOnlyPath(appPrefix, <storageId>)`, the key the drop
 *   and the Open dialog record. Local files are unmetered (Share#1966), so
 *   with the switch off this is null and record() is never called for one.
 *   With it on, a refused drop or pick never navigates, but its storage id
 *   could still be loaded straight from the URL, and a past upload reopened
 *   from its URL after its slot rolled off was never counted
 *   (bldrs-ai/ops#39). A legacy `/v/new/` route, should it load before
 *   ShareRoutes' redirect lands, parses the same and gets the same key.
 *   An upload the drop or the dialog just recorded is reported again here
 *   once it loads, and comes back `alreadyCounted`.
 * - Everything else (hosted `/v/p/`, generic `/v/u/` URLs): null.
 *
 * @param {object|null} modelPath route result (routes/routes.ts#handleRoute)
 * @param {string} appPrefix e.g. '/share'
 * @param {boolean} [meterLocalFiles] the switch, parameterized for tests
 * @return {{key: string, routeKind: string, fileId: (string|undefined)}|null}
 */
export function directLinkQuotaKey(modelPath, appPrefix, meterLocalFiles = isLocalFileMeteringEnabled()) {
  if (!modelPath) {
    return null
  }
  if (modelPath.kind === 'file' && modelPath.isUploadedFile === true && meterLocalFiles === true) {
    return {
      key: localOnlyPath(appPrefix, modelPath.filepath),
      routeKind: DIRECT_LINK_ROUTE_KINDS.LOCAL,
    }
  }
  if (modelPath.kind !== 'provider') {
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
 * `/share/v/g/…` or `/share/v/gh/…` link, and with the `meterLocalFiles`
 * switch on a `/share/v/local-only/…` one — which never passes through the
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
  const {isLoading: isAuthLoading, isAuthenticated} = useAuth0()
  // The latest sign-in state, for the normalized event's fallback tier: the
  // record() promise resolves after the effect that started it, so reading
  // `isAuthenticated` from that closure would be stale.
  const isAuthenticatedRef = useRef(isAuthenticated)
  isAuthenticatedRef.current = isAuthenticated
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
    // contentId is snapshotted here, with the route it belongs to: the
    // outcome arrives after record-load answers, and a navigation meanwhile
    // must not credit model_share to the next model.
    const target = {key: quotaKey.key, routeKind: quotaKey.routeKind, contentId: modelContentId(modelPath)}
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
    const {key, routeKind, contentId, resolveDriveVisibility} = pending
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
      // Its normalized twin (design/new/quotas.md §"Analytics: normalized
      // tier events"): a private open, the tier model's "share", let through
      // over the limit. The tier is the one record-load acted on (free or
      // paid: only a signed-in user is metered, so this can't be a signed-out
      // tier), and an explicit one sends at once
      // (privacy/modelActionTracking.js). If the outcome ever carries none,
      // the sign-in tier at emit time stands in instead of a guess. The view
      // itself is model_view {gate: 'none'} from CadView.
      trackModelActionWhenAuthSettled(MODEL_ACTIONS.SHARE, {
        gate: MODEL_GATES.SOFT,
        // A local file is the one route here that isn't hosted.
        source: routeKind === DIRECT_LINK_ROUTE_KINDS.LOCAL ? MODEL_SOURCES.LOCAL : MODEL_SOURCES.HOSTED,
        routeKind,
        contentId,
        tier: outcome.tier,
        getIsAuthenticated: () => isAuthenticatedRef.current,
      })
    })
  }, [pending, isAuthLoading, record])

  return meterLoadedModel
}

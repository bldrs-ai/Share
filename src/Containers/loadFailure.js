import {captureException} from '@sentry/react'
import {NeedsReconnectError} from '../connections/errors'
import {EngineOpenFailureError, engineFailureCaptureContext, engineSourceTags} from '../engine/engineOpenFailure'
import {loadFailureParams, omitUndefined} from '../loader/loadAnalytics'
import {loadFailureInfoOf} from '../loader/loadProgress'
import {ARCHIVE_UNREADABLE} from '../loader/modelArchive'
import {NotFoundError} from '../loader/notFoundError'
import {UnsupportedSchemaError, unsupportedSchemaAlert} from '../engine/unsupportedSchema'
import {ZipArchiveError} from '../loader/zipArchive'
import {
  InMemoryUploadGoneError,
  UploadNotInBrowserError,
  inMemoryUploadGoneAlert,
  uploadNotInBrowserAlert,
} from '../OPFS/messages'
import {hasSeenLocalUpload} from '../connections/uploadLedger'
import {
  FUNNEL_EVENTS,
  LOCAL_LINK_EVENTS,
  gtagEventWithCid,
  gtagFunnelEvent,
  isRealModelOpen,
} from '../privacy/analytics'
import modelIdentity from '../routes/modelIdentity'
import {isOutOfMemoryError} from '../utils/oom'
import {modelOpenKind} from '../utils/reportModelOpen'
import {AUTH_SETTLE_RETRY_MS, waitForAuthSettled} from './authLoadGate'


/**
 * The failure path of a model load the user is still on: what they see
 * (the alert), what GA counts (`load_failed`, `local_link_missing`) and what
 * Sentry gets (`captureException`, with the load's phase and stall tags).
 * Moved out of CadView#onViewerInternal's catch unchanged (Share#2247); the
 * caller has already told an abort, and a load the user has left, from a
 * failure (open-205 #2019: a left session's job is not current), so
 * everything here is about the model shown. CLAUDE.md §"Reported
 * Conditions" is the routing it follows: one failure, one event.
 *
 * @param {Error} e what the load threw
 * @param {object} context
 * @param {object} context.modelPath the route loaded (the store's modelPath)
 * @param {string} context.installPrefix
 * @param {object|null} context.report the reporter of the attempt that
 *   failed (LoadJob#report), or null when it failed before one began, so the
 *   phase read is this attempt's and never an earlier load's
 * @param {{loadFailure: {current: *}, refusal: {current: *}}} context.reported
 *   CadView's per-open dedupe refs (reportedLoadFailureRef,
 *   reportedRefusalRef): an auth or view-settings re-run of the same open
 *   must not count its failure again
 * @param {Function} context.setAlert the store's
 * @param {boolean} context.isLegacyUploadRoute the route came through the
 *   pre-#1959 `/v/new/` redirect
 * @param {Function} context.getIsAuthenticated the latest auth state, read
 *   after auth settles
 * @return {{isOOM: boolean}}
 */
export function reportLoadFailure(e, {
  modelPath, installPrefix, report, reported, setAlert, isLegacyUploadRoute, getIsAuthenticated,
}) {
  const isOOM = isOutOfMemoryError(e)
  // GA's view of a load that did not display: the other half of
  // real_model_open, which only ever sees successes. Sent from here, the
  // one place every failure of an attempt lands, and not from loadModel's
  // own catch, which also sees the auth-shaped first try that
  // loadModelWithAuthRetry then retries and may well win: that is not a
  // failed load, and counting it would. The same isRealModelOpen guard as
  // the success event, so the homepage demo never reports. Deduped per
  // model like the schema refusal below, because the auth-state effect
  // re-runs onViewer for the same route after a failure. Closed-set
  // params only (loadAnalytics#loadFailureParams).
  const failureKey = modelIdentity(modelPath, installPrefix)
  if (isRealModelOpen(modelPath) && reported.loadFailure.current !== failureKey) {
    reported.loadFailure.current = failureKey
    const {phase, fileSize, format} = loadFailureInfoOf(report)
    gtagFunnelEvent(FUNNEL_EVENTS.LOAD_FAILED, omitUndefined({
      ...loadFailureParams({error: e, format, fileSize, phase}),
      open_kind: modelOpenKind(modelPath),
    }))
  }
  if (isOOM) {
    // Provide actionable OOM alert object; AlertDialog will render a Refresh button.
    setAlert({
      type: 'oom',
      message: 'We ran out of memory attempting to load this model. ' +
        'Try opening it on a desktop browser with more memory or ' +
        'refresh the page.',
    })
  } else if (e instanceof UnsupportedSchemaError) {
    // conway refused the model's schema by design (IFC4X3 content it
    // can't read correctly — bldrs-ai/conway#713), not because the file
    // or the engine is broken. Say what happened in the user's terms
    // instead of the raw "OpenModel returned -1".
    // Counted, not reported as a defect: AlertDialog counts it in GA,
    // with the schema as a param, to rank the IFC 4.3 work (Share#1879).
    // The captureException below stays skipped for it. A re-run for the
    // same model shows it again as a `repeat`, which isn't counted.
    const refusalKey = modelIdentity(modelPath, installPrefix)
    const repeat = reported.refusal.current === refusalKey
    reported.refusal.current = refusalKey
    setAlert({...unsupportedSchemaAlert(e, modelPath), repeat})
  } else if (e instanceof ZipArchiveError) {
    // A downloaded archive that isn't one model in a readable zip — a
    // hosted zip of several models, or of none
    // (loader/modelArchive.js#unwrapHostedArchive). The user's file, not
    // a defect: say why under its own header, counted in analytics only
    // (AlertDialog), and kept out of the captureException below. The
    // message names no file and is what analytics counts; `dialogText`
    // may name the entries inside, for the dialog alone.
    setAlert({type: ARCHIVE_UNREADABLE, message: e.message, dialogText: e.dialogText})
  } else if (e instanceof EngineOpenFailureError) {
    // conway said why the open failed (conway#742): a short form of the
    // reason in place of the raw "OpenModel returned -1". Still a real
    // failure, so it keeps the help footer and the Sentry capture below.
    setAlert({type: 'engineFailure', message: e.alertMessage})
  } else if (e instanceof NeedsReconnectError) {
    // Deep-link / reload landed on a Drive route with a stale token, and
    // GIS couldn't escalate to a popup outside a user gesture. Surface a
    // Reconnect button (a future user gesture) instead of "Failed to
    // parse model".
    setAlert({
      type: 'needsReconnect',
      connection: e.connection,
      message: 'Your Google Drive session expired. Reconnect to load this file.',
    })
  } else if (e instanceof InMemoryUploadGoneError) {
    // No OPFS and this page doesn't hold the file (#1906). Distinct from
    // the next case, where OPFS exists but lacks the entry.
    setAlert(inMemoryUploadGoneAlert())
  } else if (e instanceof UploadNotInBrowserError) {
    // A /v/local-only/ URL whose upload this browser never held or no longer
    // holds (#1955). Explain it and offer to open a file, instead of
    // the worker's raw "Folder <id> not found" under an Error header.
    // User state, not a defect (#1956): AlertDialog counts it in GA, how
    // often stale or shared local-file links are opened, and so how much
    // #705 is worth. Once per route, like a schema refusal.
    const goneKey = `upload-not-in-browser:${modelIdentity(modelPath, installPrefix)}`
    const repeat = reported.refusal.current === goneKey
    reported.refusal.current = goneKey
    // `origin` says whether this browser once held the file
    // (connections/uploadLedger.js) or the link's source is unknown; it rides on
    // the alert so AlertDialog's follow-up action event can repeat it.
    const origin = hasSeenLocalUpload(e.storageId) ? 'this_browser' : 'unknown'
    setAlert({...uploadNotInBrowserAlert(), repeat, origin})
    // Beside, never instead of, AlertDialog's `alert` event. Same
    // first-sighting rule as that one, and the same isRealModelOpen guard
    // as load_failed above so deploy previews stay quiet.
    if (!repeat && isRealModelOpen(modelPath)) {
      // Snapshot what the failure itself knows, now; `signed_in` is read
      // after auth settles. A local-only route never awaits auth, so at
      // this point useAuth0().isAuthenticated can still be its loading-
      // state false for a signed-in visitor. Only the GA send waits: the
      // alert above is already up, and a rejection here must not reach
      // the load path. The once-per-route dedupe (`repeat`) was decided
      // synchronously above, so a re-run during the wait can't resend.
      // Router state lives on the history entry, so a
      // `window.location.hash = ...` push before this failure drops
      // legacyUploadRoute: legacy links are undercounted, never
      // mislabelled.
      const legacyRoute = isLegacyUploadRoute
      waitForAuthSettled(AUTH_SETTLE_RETRY_MS)
        .then(() => {
          gtagEventWithCid(LOCAL_LINK_EVENTS.MISSING, {
            origin,
            legacy_route: legacyRoute,
            signed_in: getIsAuthenticated() === true,
          })
        })
        .catch(() => {
          // Analytics only: a failed send must not surface to the user.
        })
    }
  } else {
    setAlert(e)
  }

  console.error(e)
  // Don't send the OOM/device-too-constrained case to Sentry's error
  // stream: it's an expected, handled outcome on memory-constrained
  // devices, already surfaced to the user with actionable advice (the
  // 'oom' alert above). Capturing it generated the SHARE-RS noise
  // (11k+ events / 2.7k users, ~100% old Android) — a device limit, not
  // a code defect. Real (non-OOM) loader failures are still captured,
  // and get load.* tags + context from the last progress event first
  // (via the reporter's attachFailureContext), so they group by phase in Sentry
  // instead of landing in one detail-free "model loading failed"
  // bucket (conway #301 §7).
  // Same for an unsupported schema: an intended, documented limit that
  // is already explained to the user, not a defect for triage. And for
  // an in-memory upload whose page is gone: a known limit of browsers
  // without OPFS (#1906), counted in analytics by AlertDialog. And for
  // an upload that isn't in this browser (OPFS present, entry absent):
  // the loader only raises it after OPFS confirmed the entry is absent,
  // so it's user state, not a bug — and it was SHARE-1NR, the top
  // hard-failure group (#1955). Its volume is still counted: an
  // info-level message above, plus AlertDialog's analytics event. And
  // for a GitHub link that isn't there or isn't visible to this user
  // (SHARE-1XP, notFoundError.js): AlertDialog counts it in GA.
  const isExpectedNotFound = e instanceof NotFoundError && e.isExpected
  if (!isOOM && !(e instanceof UnsupportedSchemaError) && !(e instanceof InMemoryUploadGoneError) &&
      !(e instanceof UploadNotInBrowserError) && !(e instanceof ZipArchiveError) && !isExpectedNotFound) {
    report?.attachFailureContext()
    // A load that stalled before it failed says so on this event only
    // (loadProgress.js#LoadReporter#stallCaptureTags), never on the scope.
    const stallTags = report?.stallCaptureTags() ?? null
    const withStall = (context) => (stallTags ? {...context, tags: {...context?.tags, ...stallTags}} : context)
    if (e instanceof EngineOpenFailureError) {
      // The engine's status and reason as tags/context on this event
      // only; the alert's GA count is AlertDialog's (trackAlertEvent).
      captureException(e, withStall(engineFailureCaptureContext(e)))
    } else if (e?.engineSource) {
      // A failed engine-worker open without a recorded reason: still say
      // how its source was read (engineOpenFailure.js#engineSourceTags).
      captureException(e, withStall({tags: engineSourceTags(e)}))
    } else if (stallTags) {
      captureException(e, {tags: stallTags})
    } else {
      captureException(e)
    }
  }
  return {isOOM}
}

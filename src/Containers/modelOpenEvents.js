import {
  LOAD_OUTCOMES,
  captureLoadDiagnostics,
  getCompletedLoadOutcome,
  getCompletedLoadStats,
  noGeometryAlert,
} from '../loader/loadProgress'
import {buildOutcomeParams} from '../loader/loadAnalytics'
import {recordLocalUpload} from '../connections/uploadLedger'
import {
  FUNNEL_EVENTS,
  LOCAL_HOUR_PARAM,
  MODEL_ACTIONS,
  MODEL_GATES,
  OPEN_CID_PARAM,
  getLocalHour,
  getOpenCid,
  gtagEvent,
  isRealModelOpen,
  modelContentId,
  modelRouteSource,
  startModelEngagement,
} from '../privacy/analytics'
import {trackEngagementOnOpen} from '../privacy/engagementTracking'
import {trackModelActionWhenAuthSettled} from '../app/modelActionTracking'
import {reportModelOpenCount} from '../app/modelOpenCount'
import modelIdentity from '../routes/modelIdentity'
import {modelOpenId} from '../routes/modelOpen'
import {modelOpenKind} from '../utils/reportModelOpen'


/**
 * What a model on screen reports, once its load is in (moved out of
 * CadView#loadModel unchanged, Share#2247): the engagement window, the
 * no-geometry alert, the local-upload ledger, and the open's analytics
 * (real_model_open, model_view, the engagement count, the load
 * diagnostics), once per open. Called only by a load job that is still
 * current (open-205 #2019, session/modelSession.js), so all of it is
 * about the model shown.
 *
 * @param {object} routeResult the route loaded, the store's modelPath
 * @param {object} loadedModel
 * @param {object} context
 * @param {string} context.installPrefix
 * @param {{engagementStop: {current: *}, refusal: {current: *}, open: {current: *}}} context.refs
 *   CadView's stopModelEngagementRef, reportedRefusalRef and reportedOpenRef
 * @param {Function} context.setAlert the store's
 * @param {Function} context.getIsAuthenticated the latest auth state
 */
export function reportModelOpened(routeResult, loadedModel, {installPrefix, refs, setAlert, getIsAuthenticated}) {
  // Replaces the retired `select_content` event, whose counts were
  // conflated with homepage visits because the demo model fired it
  // too. The isRealModelOpen guard keeps that from recurring — see
  // its doc for why the demo must stay out of this event.
  // The successfully loaded model replaces the prior engagement window,
  // including when this load is the bundled demo (which is never tracked).
  refs.engagementStop.current?.()
  refs.engagementStop.current = null
  // The verdict the real_model_open below reports (load_outcome), read once
  // so the user's message and GA's count cannot disagree about this load.
  const loadOutcome = getCompletedLoadOutcome()
  if (loadOutcome === LOAD_OUTCOMES.NO_GEOMETRY) {
    // The engine read the file and it has nothing to draw (Share#1962): say
    // so in place of leaving an empty viewer unexplained. Not a failure, so
    // no captureException and no load_failed; GA still gets the open, as
    // real_model_open with load_outcome 'no_geometry', and AlertDialog
    // counts the alert. Once per model: the auth-state and view-settings
    // effects re-run onViewerInternal for the same route, and the user has
    // already dismissed it.
    const noGeometryKey = `no-geometry:${modelIdentity(routeResult, installPrefix)}`
    if (refs.refusal.current !== noGeometryKey) {
      refs.refusal.current = noGeometryKey
      setAlert(noGeometryAlert())
    }
  }
  // Every way an upload opens (picker, drop, reload, recents) lands here,
  // so this one seam keeps the ledger complete. Deliberately outside the
  // isRealModelOpen guard: it is bookkeeping, not an analytics send, and
  // the same storage id derivation as the loader (Loader.js#uploadStorageId).
  if (routeResult.isUploadedFile === true) {
    recordLocalUpload(routeResult.filepath.split('/').pop())
  }
  // Each open has its own number, so only a reload of this same open (a
  // theme toggle, a view-settings change) finds it here already.
  const openId = modelOpenId(routeResult)
  const isNewOpen = refs.open.current !== openId
  refs.open.current = openId
  if (isRealModelOpen(routeResult)) {
    const eventParams = {
      content_type: loadedModel.type || 'undefined',
      // The same helper stamps content_id on model_view below, and on
      // model_share / model_export elsewhere, so GA counts one model the
      // same way on every event. Equal to loadModel's `filepath`, by design.
      content_id: modelContentId(routeResult),
    }
    // The page's first open, or one switched to in-app
    // (utils/reportModelOpen.js): splits opens, and with load_failed the
    // failure rate, by whether a previous model was in this document.
    const openKind = modelOpenKind(routeResult)
    if (openKind) {
      eventParams.open_kind = openKind
    }
    // How the load went: the reporter's cross-format snapshot merged with
    // Conway's engine stats for IFC/STEP, plus the displayed/no_geometry/
    // unusable verdict. loadTime stays the reporter's wall clock whatever
    // the engine says; see loadAnalytics#buildOutcomeParams.
    Object.assign(eventParams, buildOutcomeParams({
      completedStats: getCompletedLoadStats() ?? undefined,
      loadStats: loadedModel.loadStats,
      loadOutcome,
    }))
    // Per-user open depth: GA4 has no user-id dimension, so the
    // client id rides along as an event-scoped custom dimension,
    // prefix-tagged by getOpenCid so GA4 can't type it as a number.
    // Absent whenever GA didn't initialize — see analytics#gaClientId.
    const openCid = getOpenCid()
    if (openCid) {
      eventParams[OPEN_CID_PARAM] = openCid
    }
    // GA4's own `hour` dimension is in the *property's* timezone, which
    // says nothing about when a user in Milan or São Paulo actually
    // works — and the real-opens audience is Europe + Brazil (bizdev
    // growth-strategy §2). This is their local hour, prefixed so gtag
    // keeps it in the text slot; see analytics#getLocalHour.
    eventParams[LOCAL_HOUR_PARAM] = getLocalHour()
    if (isNewOpen) {
      sendOpenEvents(routeResult, eventParams, getIsAuthenticated)
      // The cookieless first-party count of the same open
      // (app/modelOpenCount.js, design/new/model-open-counts.md): sent
      // whatever the consent choice, so it counts the opens real_model_open
      // stopped seeing when GA became opt-in (#2051). Same gate as
      // real_model_open, so the two count the same opens; the size is the
      // one real_model_open reports.
      reportModelOpenCount(routeResult, loadedModel, {fileSize: eventParams.stats_fileSize, openKind})
    }
    // The engagement window restarts on every load, a theme rebuild's
    // too: the stop above ended the last one, and the user is still on
    // the model.
    refs.engagementStop.current = startModelEngagement({
      content_type: eventParams.content_type,
      content_id: eventParams.content_id,
    })
  }
}


/**
 * The events that count an open of a real model, sent once per open
 * (reportedOpenRef; routes/modelOpen.ts): not again for a theme toggle or a
 * view-settings change, which reload the same open.
 *
 * @param {object} routeResult the route loaded, the store's modelPath
 * @param {object} eventParams real_model_open's params, assembled by reportModelOpened
 * @param {Function} getIsAuthenticated the latest auth state, read once auth settles
 */
function sendOpenEvents(routeResult, eventParams, getIsAuthenticated) {
  gtagEvent(FUNNEL_EVENTS.REAL_MODEL_OPEN, eventParams)
  // The normalized twin, beside — never instead of — real_model_open,
  // which the bizdev dashboard keys on. Sent once auth settles, with the
  // auth state of then (app/modelActionTracking.js says why: a
  // non-GitHub load doesn't wait for auth, and the auth-change reload is
  // deduped). The route is read now, so a later navigation can't
  // relabel it. Always `gate: 'none'`: a view a soft gate let through
  // over the limit is still an ungated view; the over-limit fact is
  // model_share {gate: 'soft'}. Not awaited.
  trackModelActionWhenAuthSettled(MODEL_ACTIONS.VIEW, {
    gate: MODEL_GATES.NONE,
    ...modelRouteSource(routeResult),
    contentId: eventParams.content_id,
    getIsAuthenticated,
  })
  // Engaged-use conversions (Share#1960). Same real-open gate as the
  // event above; keyed by open, so a theme/view-settings reload of the
  // same model is not a second open and an in-app return to it is.
  // Resolves to the events it sent and never rejects, so it is not
  // awaited.
  trackEngagementOnOpen(Date.now(), modelOpenId(routeResult))
  // Give a chip with non-zero errors/warnings a Sentry event to link
  // to (issue #1767). Gated on the very counts just assembled above,
  // because those are what colour the chip: Conway's own
  // stats_errorCount / stats_warningCount when it supplies them
  // (conway#740; it does not yet), else the page-wide console tee the
  // reporter publishes as stats_pageErrorCount / stats_pageWarnCount.
  // Siting the call here is also what keeps it to real, successful
  // opens. See loadProgress#captureLoadDiagnostics.
  captureLoadDiagnostics({
    errorCount: eventParams.stats_errorCount ?? eventParams.stats_pageErrorCount,
    warningCount: eventParams.stats_warningCount ?? eventParams.stats_pageWarnCount,
    contentId: eventParams.content_id,
    contentType: eventParams.content_type,
  })
}


/**
 * Count the user's orbit and zoom on the model shown, for GA's
 * `model_interact`, at most once every 10 s (moved out of
 * CadView#onViewerInternal, Share#2247). The listener lives on the viewer's
 * camera controls, which IfcCamera#dispose clears with the viewer.
 *
 * @param {object} viewer
 * @return {Function} removes the listener
 */
export function trackModelInteraction(viewer) {
  let lastSent = 0
  const debounceWaitMs = 10000
  const cameraControls = viewer.context.getCameraControls()
  // Our visual testing waits until animations are finished to take screenshot
  // Would like to use zero but doesn't work
  // viewer.context.getCameraControls().restThreshold = 0.1
  const onRest = () => {
    const now = Date.now()
    if (now - lastSent > debounceWaitMs) { // e.g. send once every 10s
      gtagEvent('model_interact', {
        interaction_type: 'rotate_or_zoom',
      })
      lastSent = now
    }
  }
  cameraControls.addEventListener('rest', onRest)
  return () => cameraControls.removeEventListener('rest', onRest)
}

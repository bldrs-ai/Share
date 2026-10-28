import Cookies from 'js-cookie'
import {setTag} from '@sentry/react'
import {assertDefined} from '../utils/assert'
import {isFeatureEnabled} from '../FeatureFlags'
import {TIERS, getTier} from '../quota/quota'
import Expires from './Expires'
import {encodeGaClientReference} from './gaClientReference'
import {SUBSCRIPTION_EVENT_NAMES} from './subscriptionEventNames'


const COOKIE_NAME = 'isAnalyticsAllowed'
const DEFAULT_VALUE = true


/** @return {boolean} */
export function isAllowed() {
  const val = Cookies.get(COOKIE_NAME)
  return val === undefined ? DEFAULT_VALUE : val === 'true'
}


/**
 * @param {boolean} allowed
 */
export function setIsAllowed(allowed) {
  assertDefined(allowed)
  Cookies.set(COOKIE_NAME, allowed, {expires: Expires.DAYS})
  // gtagEvent re-reads consent on every call, so withholding it is
  // enough to stop our own events. A user property is different: it is
  // sticky once set, and gtag/js keeps attaching it to the automatic
  // events it sends on its own (page_view, user_engagement) for the
  // rest of the page's life — including after an opt-out, since
  // index/ga.js has no way to unload the tag it already injected.
  // Withdrawal therefore has to clear it explicitly.
  syncUserCidProperty()
  // Sentry's global-scope tag is sticky in exactly the same way, and for
  // a sharper reason: it outlives withdrawal on *every* later event, and
  // an event's own tags merge OVER the global scope, so even a
  // deliberately cid-less event (loadProgress#captureDiagnostics) would
  // still inherit the stale one.
  syncSentryCidTag()
}


/**
 * @param {string} eventName
 * @param {object} parameters
 */
export function gtagEvent(eventName, parameters) {
  if (window.location.hostname.startsWith('deploy-preview-') &&
      window.location.hostname.endsWith('.netlify.app') &&
      isFeatureEnabled('gaEnableInPreview')) {
    // Preview-only observability: production stays quiet, while a smoke test
    // remains inspectable even when browser privacy tooling blocks gtag/js.
    // eslint-disable-next-line no-console
    console.info(`[ga] event ${eventName}`, parameters)
  }
  if (window.gtag && isAllowed()) {
    window.gtag('event', eventName, parameters)
  }
}


/**
 * Track foreground engagement with one loaded model. Durations are emitted
 * when the page loses focus/visibility, unloads, or the next model replaces
 * this one. This follows GA4's foreground-engagement semantics while keeping
 * the model identity explicit instead of relying on a mutable page title.
 *
 * The duration rides in `engagement_time_msec`, which is GA4's own reserved
 * parameter rather than a name of our choosing. Two consequences, both
 * load-bearing:
 *
 *   1. It can never be a custom metric. Admin → Custom definitions rejects
 *      the name inline with "Parameter name is not allowed for this scope"
 *      (tried 2026-08-21), so `customEvent:engagement_time_msec` never
 *      resolves and a Data API report naming it 400s forever.
 *   2. It doesn't need to be. GA4 reserves the name precisely because it
 *      consumes it to compute the standard `userEngagementDuration` metric,
 *      so these intervals are already queryable with no GA4-side
 *      registration at all: metric `userEngagementDuration`, dimension
 *      `customEvent:content_id`, filtered to eventName `model_engagement`
 *      — which is what the bizdev dashboard reads (bizdev `ga/README.md`
 *      §"Model engagement"). As queried today that total is across *all*
 *      users: unlike `real_model_open` this event carries no `open_cid`
 *      event param, so that query has nothing to group people by. But
 *      per-user is reachable, and not by adding that param here — the
 *      same id also rides as the sticky user property below
 *      (`setUserCidProperty`), which attaches to this event like any
 *      other, so a User-scoped dimension would key engagement by person.
 *      That definition is still unregistered GA4-side, so until it
 *      exists the number must be labelled all users. Mind the unit too
 *      — the metric reports seconds, against the milliseconds sent from
 *      here.
 *
 * So the name is load-bearing while the query above is what reads these
 * durations. Renaming it to something registerable is not impossible, but
 * it is a migration rather than an edit: the durations leave
 * `userEngagementDuration` the moment the name changes, and only come back
 * as a custom metric once one is registered GA4-side and the dashboard is
 * repointed at it. Don't rename one end alone.
 *
 * Sending it explicitly is also what ties the interval to *this* model:
 * gtag accrues foreground time on its own and attaches it to whatever event
 * it sends next, which is neither model-scoped nor aligned with the
 * visibility windows tracked here.
 *
 * How gtag reconciles the two is unverified, and the answer decides how
 * exact the reported total is: if it replaces its accrued value with the
 * one sent here, the metric is these intervals; if it adds the two, the
 * metric runs high. So treat per-model engagement as close rather than
 * exact until a DebugView pass (or a look at `_et` on the collect beacon)
 * settles it — and don't write "GA4 summed exactly what we sent" anywhere
 * downstream before then.
 *
 * @param {object} modelParams stable `content_id` / `content_type` identity
 * @return {Function} idempotent stop function that flushes the final interval
 */
export function startModelEngagement(modelParams) {
  let startedAt = null
  let stopped = false
  const isForeground = () => document.visibilityState === 'visible' && document.hasFocus()
  const resume = () => {
    if (!stopped && startedAt === null && isForeground()) {
      startedAt = performance.now()
    }
  }
  const pause = () => {
    if (startedAt === null) {
      return
    }
    const engagementTimeMs = Math.round(performance.now() - startedAt)
    startedAt = null
    if (engagementTimeMs > 0) {
      gtagEvent('model_engagement', {
        ...modelParams,
        engagement_time_msec: engagementTimeMs,
        transport_type: 'beacon',
      })
    }
  }
  const onVisibilityChange = () => isForeground() ? resume() : pause()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', resume)
  window.addEventListener('blur', pause)
  window.addEventListener('pagehide', pause)
  window.addEventListener('pageshow', resume)
  resume()

  return () => {
    if (stopped) {
      return
    }
    pause()
    stopped = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', resume)
    window.removeEventListener('blur', pause)
    window.removeEventListener('pagehide', pause)
    window.removeEventListener('pageshow', resume)
  }
}


/*
 * GA4's client id, captured at init by index/ga.js.
 *
 * The GA4 Data API exposes no user-id dimension, so per-user open
 * depth ("how many people opened exactly one model vs six or more")
 * can't be derived — only the eventCount ÷ totalUsers average. Sending
 * the client id as the OPEN_CID_PARAM event param, with a matching
 * event-scoped custom dimension registered GA4-side, makes the
 * distribution queryable: customEvent:open_cid × eventCount, bucketed
 * client-side.
 *
 * Null wherever GA never initializes — off-prod, under automation, or
 * on blocked clients — so events simply omit the param there rather
 * than carrying a placeholder that would form its own bogus bucket. No
 * backfill: the dimension only accrues data from ship time forward.
 *
 * At much larger scale GA4 rolls high-cardinality dimension values
 * into "(other)"; that's the signal to graduate this query to the
 * BigQuery export.
 */
let gaClientId = null


/*
 * NOT `ga_cid`: GA4 reserves the `ga_`, `google_`, `firebase_` and
 * `gtag.` prefixes (plus a leading underscore) for event and parameter
 * names, and silently disables anything that matches — the param would
 * be dropped at ingestion with no error, leaving the custom dimension
 * permanently empty.
 */
export const OPEN_CID_PARAM = 'open_cid'


/*
 * Hour of day in the *user's* timezone, on model-open events.
 *
 * GA4 already has an `hour` dimension, but it is in the property's
 * timezone, which says nothing about when someone in Milan or São Paulo
 * actually works — and real authored opens are a Europe + Brazil story
 * (bizdev growth-strategy §2).
 */
export const LOCAL_HOUR_PARAM = 'local_hour'


/*
 * Prefix on the LOCAL_HOUR_PARAM value, for the same reason
 * OPEN_CID_PREFIX exists: gtag types each param when it builds the
 * beacon, and anything that parses as a number goes out as `epn.`,
 * which an event-scoped custom *dimension* will not populate from.
 *
 * Zero-padding alone does NOT achieve this — `Number('08')` is 8, so
 * every one of the 24 values would still be numeric and the dimension
 * would stay empty. The padding is kept only so values sort correctly
 * and read like GA4's own `hour`.
 */
const LOCAL_HOUR_PREFIX = 'h.'


/**
 * The LOCAL_HOUR_PARAM value for right now: the browser's hour, padded
 * and prefixed so GA4 stores it as text.
 *
 * @return {string} e.g. 'h.09'
 */
export function getLocalHour() {
  const HOUR_DIGITS = 2
  return `${LOCAL_HOUR_PREFIX}${String(new Date().getHours()).padStart(HOUR_DIGITS, '0')}`
}


// Cookie GA writes the client id into, as `GA<version>.<domain depth>.<id>`
// where the id itself contains a dot (GA1.1.1234567890.0987654321).
const GA_COOKIE_NAME = '_ga'
const GA_COOKIE_ID_OFFSET = 2


/**
 * Record the GA4 client id. Ignores anything but a non-empty string —
 * gtag's `get` callback yields undefined when the property isn't
 * loaded yet, and a falsy id is worse than none.
 *
 * @param {string} cid
 */
export function setGaClientId(cid) {
  if (typeof cid === 'string' && cid.length > 0) {
    gaClientId = cid
  }
}


/**
 * The client id from gtag's async `get` callback, falling back to the
 * `_ga` cookie gtag/js writes synchronously on config.
 *
 * The fallback matters more than it looks: the callback only resolves
 * after gtag/js loads, and any event fired before then still reaches
 * GA4 (gtagEvent buffers into dataLayer, which gtag/js drains on load)
 * — just without the param. That window sits at session start, so the
 * losses would concentrate on each visitor's *first* open, which is
 * exactly the "1 open" cohort this instrumentation exists to size.
 *
 * @return {string|null} GA4 client id, or null if unavailable
 */
export function getGaClientId() {
  return gaClientId ?? gaClientIdFromCookie()
}


/*
 * Tag prefixing the client id in the OPEN_CID_PARAM value, so the value
 * can never be read as a number.
 *
 * A raw client id is numeric-looking by construction
 * ("1871520000.1754700000"), and gtag classifies each event param as
 * text or numeric when it builds the collect beacon — numeric-looking
 * values go out as `epn.` (number) instead of `ep.` (text). Landing in
 * the numeric slot has two consequences, both observed in the GA4 UI as
 * a value rendered "1.87152e+09":
 *
 *   1. float64 holds ~15-17 significant digits against the id's 20, so
 *      "1871520000.1754700000" truncates to 1871520000.17547 and
 *      distinct clients silently collide — fatal for a per-user count.
 *   2. An event-scoped custom *dimension* (text) doesn't populate from
 *      a numeric param at all.
 *
 * The same coercion bites downstream of GA4 too: any CSV/Sheets export
 * of a bare id re-parses it to a float on open.
 *
 * A non-digit prefix removes the ambiguity everywhere at once. It makes
 * the value opaque rather than joinable against a raw client id, which
 * this metric doesn't need — it only ever counts events per distinct
 * value.
 */
const OPEN_CID_PREFIX = 'cid.'


/**
 * The OPEN_CID_PARAM value for the current client: the client id
 * tagged so GA4 stores it as text. Null when no id is available, in
 * which case callers must omit the param rather than send a blank.
 *
 * @return {string|null}
 */
export function getOpenCid() {
  const cid = getGaClientId()
  return cid === null ? null : `${OPEN_CID_PREFIX}${cid}`
}


/**
 * The GA4 client id for Stripe Checkout's `client-reference-id`
 * (privacy/gaClientReference.js has the encoding and why it exists), so the
 * stripe-webhook's server-side subscription_started / subscription_ended
 * land on this browser's GA client.
 *
 * Null when consent is withheld, for the reason getOpenCidForSentry is: it
 * is an analytics identifier, and a declined visitor's checkout must not
 * carry one to a server that will report it to GA. The webhook then falls
 * back to an id derived from the Stripe customer, flagged as such
 * (design/new/quotas.md §"Server-side subscription
 * events"). Also null when no client id has resolved.
 *
 * @return {string|null} e.g. 'gacid_1871520000_1754700000'
 */
export function getGaClientReference() {
  return isAllowed() ? encodeGaClientReference(getGaClientId()) : null
}


/*
 * GA4 event names for the growth funnel
 *
 *   Visit → Model open → Hit a limit → Signed in → Upgrade click → Subscribed
 *
 * The consumer is the bizdev GA dashboard's funnel card
 * (`bldrs-ai/bizdev`, ga/static/index.html), which queries these names
 * verbatim — GA4 has no rename, so a renamed event here silently empties
 * its funnel step from ship time on. Change both ends together, or not at
 * all. "Visit" is GA4's automatic session_start/page_view and needs no
 * constant.
 *
 * Params, and where each fires (design/new/quotas.md §"Funnel analytics"):
 *   REAL_MODEL_OPEN      {content_id, content_type, load_outcome, stats_*, …}
 *                        CadView, on success only
 *   LOAD_FAILED          {content_type, size_bucket, reason_class, last_phase}
 *                        CadView's onViewerInternal catch, once per failed
 *                        attempt; closed-set values only (Share#1954)
 *   QUOTA_LIMIT_REACHED  {tier, feature}  QuotaLimitDialog, once per showing
 *   LOGIN                {method, from?, feature?}  Auth0/useLoginTracking,
 *                        once per completed sign-in, never on a
 *                        cached-session boot; `from: 'gate'` + `feature`
 *                        when the sign-in began at a visible gate
 *                        (Auth0/gateLogin.js)
 *   BEGIN_CHECKOUT       {from, destination}  Profile/subscriptionNav
 *   SUBSCRIPTION_STARTED / SUBSCRIPTION_ENDED  {tier, source: 'server',
 *                        interval?, plan?, open_cid?, cid_source}
 *                        NOT sent from here: the stripe-webhook function
 *                        sends them through the Measurement Protocol, once
 *                        per Pro subscription status transition
 *                        (netlify/functions/_lib/subscriptionAnalytics.js).
 *                        Listed because the dashboard reads them with the rest.
 *   SUBSCRIPTION_STARTED_CLIENT / SUBSCRIPTION_ENDED_CLIENT  {}  BaseRoutes'
 *                        processAccessToken on the pendingReauth statuses,
 *                        deduped per user + status, reset by a settled
 *                        status on a fresh token (subscriptionTracking.js).
 *                        The browser SEEING the transition, under its own
 *                        name so it never adds to the server's count
 *                        (subscriptionEventNames.js).
 *
 * All but REAL_MODEL_OPEN go out through gtagFunnelEvent, which attaches
 * OPEN_CID_PARAM so the dashboard can follow one client down the funnel.
 * The GA4-side registrations these need (custom dimensions, key events)
 * are listed in the same design-doc section.
 */
export const FUNNEL_EVENTS = Object.freeze({
  REAL_MODEL_OPEN: 'real_model_open',
  LOAD_FAILED: 'load_failed',
  QUOTA_LIMIT_REACHED: 'quota_limit_reached',
  // GA4 recommended-event names, so `login` {method} and `begin_checkout`
  // also land in GA4's own standard reports.
  LOGIN: 'login',
  BEGIN_CHECKOUT: 'begin_checkout',
  SUBSCRIPTION_STARTED: SUBSCRIPTION_EVENT_NAMES.STARTED,
  SUBSCRIPTION_ENDED: SUBSCRIPTION_EVENT_NAMES.ENDED,
  SUBSCRIPTION_STARTED_CLIENT: SUBSCRIPTION_EVENT_NAMES.STARTED_CLIENT,
  SUBSCRIPTION_ENDED_CLIENT: SUBSCRIPTION_EVENT_NAMES.ENDED_CLIENT,
  // Engaged-use conversions for Google Ads (Share#1960, bizdev#339); sent
  // by privacy/engagementTracking.js from the real-open path.
  ENGAGED_USE: 'engaged_use',
  RETURN_VISIT: 'return_visit',
})


/**
 * gtagEvent with the funnel's per-client join key attached: OPEN_CID_PARAM
 * set to getOpenCid(), and omitted — never blank — when no client id has
 * resolved, exactly as CadView does for real_model_open.
 *
 * @param {string} eventName one of FUNNEL_EVENTS
 * @param {object} [parameters]
 */
export function gtagFunnelEvent(eventName, parameters = {}) {
  gtagEventWithCid(eventName, parameters)
}


/*
 * Events at the visible gates and the actions behind them (Share#1964), all
 * sent through gtagEventWithCid so the dashboard can join them to the same
 * client's real_model_open, login and begin_checkout. Params, and where each
 * fires:
 *
 *   EXPORT_GATED    {reason: 'anonymous'|'free'}  ExportSection, on the gate's
 *                   help opening; 'free' is a free user whose model holds no
 *                   slot while every model slot is taken (the slot rule,
 *                   2026-10-27; it was the 2-exports-a-week cap before)
 *   EXPORT_MODEL    {format, bytes_bucket, source_kind, portable,
 *                   free_export, slot_taken}  useExport, on a delivered
 *                   download; free_export: exported on the free tier;
 *                   slot_taken: that export took a new model slot
 *   EXPORT_FAILED   {format, reason: 'no_slot'|'denied'|'unavailable'|
 *                   'error'}  useExport, once per run that delivers no file;
 *                   'no_slot' replaced 'free_limit' with the slot rule
 *   SHARE_GATED     {reason: 'local_file', signed_in}  ShareControl, on the
 *                   local-only Share gate's help opening
 *   SHARE_INTEREST  {feature: 'save_to_cloud', signed_in}  ShareControl, on
 *                   the "coming soon" line in that help
 *   QUOTA_SOFT_LIMIT_EXCEEDED  {tier, used, limit, route_kind: 'gdrive'|
 *                   'github'}  quota/useDirectLinkQuota, when a model opened
 *                   straight from its URL is over the private-model limit.
 *                   The load is NOT blocked (a soft gate, measured first);
 *                   once per model per page load (design/new/quotas.md
 *                   §"Direct links: soft gate")
 *
 * Like FUNNEL_EVENTS, the names are queried verbatim GA-side; GA4 has no
 * rename.
 */
export const GATE_EVENTS = Object.freeze({
  EXPORT_GATED: 'export_gated',
  EXPORT_MODEL: 'export_model',
  EXPORT_FAILED: 'export_failed',
  SHARE_GATED: 'share_gated',
  SHARE_INTEREST: 'share_interest',
  QUOTA_SOFT_LIMIT_EXCEEDED: 'quota_soft_limit_exceeded',
})


/**
 * gtagEvent plus OPEN_CID_PARAM (getOpenCid()), omitted rather than blank
 * when no client id has resolved — off-prod, under automation, on blocked
 * clients. The join key for any event the funnel needs to follow per client.
 *
 * @param {string} eventName
 * @param {object} [parameters]
 */
export function gtagEventWithCid(eventName, parameters = {}) {
  const openCid = getOpenCid()
  gtagEvent(eventName, openCid ? {...parameters, [OPEN_CID_PARAM]: openCid} : parameters)
}


/*
 * Normalized model-action events: one event per ACTION, with the tier, the
 * model's source and the gate's verdict as params — "normalized in the
 * database sense" (owner, 2026-10-26), so GA can cut any action by
 * tier × source × gate instead of joining a dozen differently-shaped legacy
 * events. design/new/quotas.md §"Analytics: normalized tier events" has
 * the grid and which legacy event each cell shadows.
 *
 * These are ADDED beside the legacy events, never instead of them: GA4 has
 * no rename, Ads imports `real_model_open` as its conversion, and the bizdev
 * dashboard queries the old names verbatim. Each call site below fires both,
 * the new one through modelActionTracking.js#trackModelActionWhenAuthSettled.
 *
 *   model_view    {tier, source, route_kind, content_id, gate: 'none', open_cid}
 *                 CadView, beside every real_model_open
 *   model_share   {tier, source, route_kind?, content_id?, gate, open_cid}
 *                 none     ShareDialog opening (beside `share`)
 *                 upsell   ShareControl's local-file gate (beside share_gated)
 *                 blocked  QuotaLimitDialog (beside quota_limit_reached)
 *                 soft     useDirectLinkQuota (beside quota_soft_limit_exceeded)
 *   model_export  {tier, source?, route_kind?, content_id?, gate, open_cid}
 *                 none     useExport delivery (beside export_model)
 *                 upsell   ExportSection's gates (beside export_gated)
 *                 blocked  useExport, export_failed{reason: 'no_slot'} only
 *                          ("refused: no free model slot"; it was
 *                          'free_limit' before the slot rule, 2026-10-27)
 *
 * `content_id` is the model's key, the value real_model_open sends under the
 * same (registered) dimension, from the same helper (modelContentId), so GA
 * can count distinct models on any of these events. Optional (`?`) where the
 * model the action concerns isn't the one on screen or isn't known.
 */
export const MODEL_ACTION_EVENTS = Object.freeze({
  view: 'model_view',
  share: 'model_share',
  export: 'model_export',
})

/** The model actions trackModelAction takes: the keys of MODEL_ACTION_EVENTS. */
export const MODEL_ACTIONS = Object.freeze({VIEW: 'view', SHARE: 'share', EXPORT: 'export'})

/**
 * What the gate did to the action: let it through (`none`), showed an upsell
 * in place of it (`upsell`), refused it (`blocked`), or let it through while
 * recording that it was over the limit (`soft`).
 */
export const MODEL_GATES = Object.freeze({NONE: 'none', UPSELL: 'upsell', BLOCKED: 'blocked', SOFT: 'soft'})

/** Where the model came from: the user's computer, or anywhere hosted. */
export const MODEL_SOURCES = Object.freeze({LOCAL: 'local', HOSTED: 'hosted'})

/**
 * `route_kind` per route, the finer cut under `source`. 'gdrive' and 'github'
 * are the values quota_soft_limit_exceeded already sends under the same
 * (registered) dimension, so the two events share a vocabulary.
 */
export const MODEL_ROUTE_KINDS = Object.freeze({
  LOCAL: 'local',
  PROJECT: 'project',
  GITHUB: 'github',
  GDRIVE: 'gdrive',
  URL: 'url',
})

/**
 * The `tier` param for a quota tier (quota/limits.js#TIERS: free and paid
 * only). There is no entry for "signed out": that is not a quota tier since
 * Share#1977 (quota.js#getTier returns null), and it is the `anon` GA value,
 * which means sign-in state. Keep the two apart: an entry keyed on a missing
 * constant would become the key "undefined" and turn every missing tier into
 * `anon`.
 */
const TIER_PARAMS = Object.freeze({
  [TIERS.FREE]: 'free',
  [TIERS.PAID]: 'pro',
})

/** The `tier` param of a signed-out user: the sign-in tier, not a quota tier. */
const ANON_TIER_PARAM = 'anon'


/**
 * The `tier` param: 'anon' | 'free' | 'pro'. This is the user's SIGN-IN tier
 * — a different concept from the quota tiers, which only signed-in users
 * have. A quota tier the caller already has (QuotaLimitDialog's prop,
 * record-load's answer) is used as is, since it is the verdict the gate
 * acted on; a missing or unrecognised one (null, undefined — nothing to
 * report, never "anonymous") falls back to deriving the tier exactly as the
 * quota code does, quota.js#getTier, which reads Pro off proStatus.js, so
 * `shareProPendingReauth` is 'pro' here too. Signed out is 'anon'.
 *
 * @param {object} [who]
 * @param {?string} [who.tier] a quota tier (TIERS) the caller already has
 * @param {boolean} [who.isAuthenticated]
 * @param {object} [who.appMetadata]
 * @return {string} 'anon' | 'free' | 'pro'
 */
export function modelActionTier({tier, isAuthenticated, appMetadata} = {}) {
  return TIER_PARAMS[tier] || TIER_PARAMS[getTier(appMetadata, isAuthenticated === true)] || ANON_TIER_PARAM
}


/**
 * `source` and `route_kind` for a route result (routes.ts#handleRoute, the
 * store's `modelPath`). Empty for no route, so a caller that can't tell
 * sends neither rather than a guess.
 *
 * @param {object|null} routeResult
 * @return {object} `{source, routeKind}`, or `{}` when unknown
 */
export function modelRouteSource(routeResult) {
  if (!routeResult) {
    return {}
  }
  if (routeResult.kind === 'file') {
    return routeResult.isUploadedFile === true ?
      {source: MODEL_SOURCES.LOCAL, routeKind: MODEL_ROUTE_KINDS.LOCAL} :
      {source: MODEL_SOURCES.HOSTED, routeKind: MODEL_ROUTE_KINDS.PROJECT}
  }
  if (routeResult.kind === 'provider' && routeResult.provider === 'github') {
    return {source: MODEL_SOURCES.HOSTED, routeKind: MODEL_ROUTE_KINDS.GITHUB}
  }
  if (routeResult.kind === 'provider' && routeResult.provider === 'google') {
    return {source: MODEL_SOURCES.HOSTED, routeKind: MODEL_ROUTE_KINDS.GDRIVE}
  }
  if (routeResult.kind === 'url') {
    return {source: MODEL_SOURCES.HOSTED, routeKind: MODEL_ROUTE_KINDS.URL}
  }
  return {}
}


/**
 * The `content_id` of a model: the value real_model_open (and
 * model_engagement) send, so a normalized event can be joined to them and
 * GA can count DISTINCT models from any of them. CadView sends this very
 * function's result on real_model_open, so the two cannot drift.
 *
 * The privacy treatment is real_model_open's, unchanged: the route's
 * `downloadUrl` (GitHub, Drive built from the file id, generic URL, an
 * upload's blob-store path), falling back to `filepath`. Nothing is added
 * and nothing is stripped: a local file's id is its UUID-derived upload
 * path, not the name the user's file had.
 *
 * Callers snapshot it when the user acts, next to modelRouteSource, and not
 * when the event is sent: the event waits for auth and, for an export, the
 * conversion, and a navigation meanwhile must not credit the action to the
 * next model.
 *
 * @param {object|null} routeResult routes.ts#handleRoute, the store's `modelPath`
 * @return {string|undefined} undefined for no route, so a caller that
 *   can't tell sends no `content_id` rather than a guess
 */
export function modelContentId(routeResult) {
  if (!routeResult) {
    return undefined
  }
  const isGoogle = routeResult.kind === 'provider' && routeResult.provider === 'google'
  const id = isGoogle ? routeResult.downloadUrl : (routeResult.downloadUrl || routeResult.filepath)
  // `downloadUrl` is a URL object. gtag serializes a param to its string
  // form, the href, so that is what GA has always held here; stringifying
  // makes it the same on every event by construction (and comparable in a
  // test: Jest's toEqual sees any two URL objects as equal).
  return id ? String(id) : undefined
}


/**
 * Send one normalized model-action event (MODEL_ACTION_EVENTS) through
 * gtagEventWithCid: consent is checked there (gtagEvent re-reads it on every
 * call) and `open_cid` attached the same way as on every funnel and gate
 * event. Org users are not filtered here, as for every other event: the
 * dashboard drops them at query time by `open_cid` (GA_CONFIG.orgUsers).
 *
 * An unknown action or gate sends nothing: analytics must never throw into
 * a load or a click, and a misspelt cell is worse than a missing one.
 *
 * Call sites don't call this directly: they go through
 * modelActionTracking.js#trackModelActionWhenAuthSettled, which reads the
 * tier once auth has settled (a static test there enforces it).
 *
 * @param {string} action 'view' | 'share' | 'export' (MODEL_ACTIONS)
 * @param {object} [details]
 * @param {string} details.gate one of MODEL_GATES
 * @param {string} [details.source] one of MODEL_SOURCES; omitted when unknown
 * @param {string} [details.routeKind] sent as `route_kind`; omitted when unknown
 * @param {string} [details.contentId] modelContentId of the model the
 *   action concerns, sent as `content_id`; omitted when unknown
 * @param {string} [details.tier] a quota tier the caller already has
 * @param {boolean} [details.isAuthenticated] for deriving the tier
 * @param {object} [details.appMetadata] for deriving the tier
 */
export function trackModelAction(action, {gate, source, routeKind, contentId, tier, isAuthenticated, appMetadata} = {}) {
  const eventName = MODEL_ACTION_EVENTS[action]
  if (!eventName || !Object.values(MODEL_GATES).includes(gate)) {
    return
  }
  const params = {tier: modelActionTier({tier, isAuthenticated, appMetadata}), gate}
  if (Object.values(MODEL_SOURCES).includes(source)) {
    params.source = source
  }
  if (routeKind) {
    params.route_kind = routeKind
  }
  if (contentId) {
    params.content_id = contentId
  }
  gtagEventWithCid(eventName, params)
}


/*
 * Name of the *Sentry tag* carrying the same client id. Identical to
 * OPEN_CID_PARAM on purpose: it is the same identifier, the bizdev
 * dashboard builds its Sentry search URL straight from the GA param
 * name, and the two live in separate namespaces so there is no
 * collision to avoid (issue #1767).
 *
 * It has to be a tag and not a context field. Sentry indexes tags for
 * issue search; context values are display-only, so a cid folded into
 * the `load` context that loadProgress#applySentryLoadState already
 * sets would be invisible to `open_cid:<id>` queries.
 */
export const SENTRY_CID_TAG = OPEN_CID_PARAM


/**
 * The SENTRY_CID_TAG value for this client: the *bare* client id, not
 * the `cid.`-prefixed getOpenCid form. That prefix exists purely to stop
 * GA4 typing a numeric-looking id as a float (see OPEN_CID_PREFIX);
 * Sentry stores tag values as strings and has no such problem, and the
 * dashboard strips the prefix before building the search URL — so bare
 * is what makes the two ids compare equal.
 *
 * Null when no id has resolved, and null when analytics consent is
 * withheld: a cid is an analytics identifier, so a visitor who declined
 * must not have one stapled to their error reports either. Same reason
 * syncUserCidProperty retracts the GA user property, and read from
 * isAllowed() here for the same fail-closed reason. Callers must omit
 * the tag rather than send a blank.
 *
 * Coverage is structurally partial and will stay that way: a client
 * that blocks GA never resolves a cid, and per the triage notes in
 * index/sentry.js that ad-blocked emerging-markets mobile cohort is
 * this project's single largest source of Sentry events. An empty
 * search result therefore cannot distinguish "this user hit no errors"
 * from "this user had no cid".
 *
 * @return {string|null}
 */
export function getOpenCidForSentry() {
  return isAllowed() ? getGaClientId() : null
}


/**
 * Publish or retract the Sentry `open_cid` tag to match current consent,
 * the exact counterpart of syncUserCidProperty for the GA user property.
 *
 * Both halves matter. The tag lives on Sentry's *global* scope so that
 * everything captured afterwards carries it — load-failure exceptions
 * included, which is the point — but that same stickiness means merely
 * declining to set a new value leaves a previously published id
 * attached to every later event. Withdrawal has to clear it.
 *
 * Retraction sets the tag to `undefined` rather than null, which is what
 * actually removes it: applyScopeDataToEvent runs the scope's tags
 * through dropUndefinedKeys before merging, so an undefined value is
 * omitted from the payload, while null would transmit as a literal.
 *
 * Called at init from index/ga.js (twice, tracking the cookie fallback
 * and the gtag callback) and from setIsAllowed on any consent change.
 */
export function syncSentryCidTag() {
  setTag(SENTRY_CID_TAG, getOpenCidForSentry() ?? undefined)
}


/*
 * Name of the GA4 *user property* carrying the same value as
 * OPEN_CID_PARAM. Same string on purpose — it is the same identifier,
 * and GA4 keeps event parameters and user properties in separate
 * namespaces, so an event-scoped and a user-scoped custom dimension can
 * both be registered from `open_cid` without colliding.
 */
export const OPEN_CID_USER_PROPERTY = OPEN_CID_PARAM


/**
 * Publish the client id as a user property as well as an event param.
 *
 * The event param answers "how many models did this person open",
 * because it rides on real_model_open. It cannot answer anything else:
 * an event-scoped dimension exists only on the events that carry it, so
 * session count, engagement duration, landing page and
 * new-vs-returning are unreachable per user no matter how the GA4 Data
 * API query is written — filtering to real_model_open yields no
 * engagement, and not filtering yields "(not set)" for every other
 * event. A user property attaches to *every* subsequent event and
 * session from this browser, which is what makes those queryable.
 *
 * Requires a matching User-scoped custom dimension GA4-side; without
 * one the property is collected but not reportable. No backfill, as
 * ever.
 *
 * Called twice by index/ga.js by design — once at setup, so events
 * fired before gtag/js resolves the id still carry it via the `_ga`
 * cookie fallback, and again from the `get` callback, which is the
 * only path that works for a first-ever visitor who has no cookie yet.
 * Setting it twice with the same value is a no-op GA4-side.
 */
export function setUserCidProperty() {
  syncUserCidProperty()
}


/**
 * Publish or retract the user property to match current consent.
 *
 * Reads isAllowed() rather than taking the decision as an argument, so
 * a caller passing something merely truthy — setIsAllowed('false')
 * writes a cookie that isAllowed() then reads as a denial — cannot
 * publish an identifier the cookie says is not allowed. Consent gates
 * should fail closed.
 *
 * Retraction sets the property to null. Verify in GA4 DebugView that
 * this actually clears it, rather than storing null as a value, before
 * PrivacyControl is restored to the UI (AboutDialog has it commented
 * out today, so nothing in the app can currently withdraw consent). If
 * null does not clear, this is the one place to change.
 */
function syncUserCidProperty() {
  if (!window.gtag) {
    return
  }
  if (!isAllowed()) {
    window.gtag('set', 'user_properties', {[OPEN_CID_USER_PROPERTY]: null})
    return
  }
  const cid = getOpenCid()
  if (cid) {
    window.gtag('set', 'user_properties', {[OPEN_CID_USER_PROPERTY]: cid})
  }
}


/** @return {string|null} client id parsed from the `_ga` cookie */
function gaClientIdFromCookie() {
  const raw = Cookies.get(GA_COOKIE_NAME)
  if (!raw) {
    return null
  }
  const parts = raw.split('.')
  if (parts.length <= GA_COOKIE_ID_OFFSET) {
    return null
  }
  const cid = parts.slice(GA_COOKIE_ID_OFFSET).join('.')
  return cid.length > 0 ? cid : null
}


/** Test-only reset for the captured client id. */
export function _resetGaClientIdForTests() {
  gaClientId = null
}


/**
 * Hosted demo models under public/: the homepage's logo (index.ifc) and its
 * STEP twin (index.step, the `/viewer/step` landing page's default target;
 * tools/models/README.md). Both are pageview-shaped, never a user's own
 * model.
 */
const HOSTED_DEMO_FILEPATHS = ['index.ifc', 'index.step']


/**
 * True for model loads worth counting as the `real_model_open` GA event:
 * any remote source (GitHub, Google Drive, generic URL) or an uploaded
 * file. False for the bundled demo model the homepage auto-loads
 * (navToDefault → /share/v/p/index.ifc) — counting it would fire on
 * every homepage visit. real_model_open is a GA4 key event imported
 * into Google Ads as the search campaigns' conversion, so
 * pageview-shaped noise here would poison bidding (bizdev
 * ads-campaign-build §1, growth-strategy §3).
 *
 * Demo detection matches routes.ts#processFile output for hosted
 * project files: {kind: 'file', isUploadedFile: false, filepath}. Since
 * #1959 processFile derives isUploadedFile prefix-independently
 * (routes/localOnly.ts), so a local-only open is never mistaken for the
 * demo on a GitHub Pages install either. The filepath check is
 * independent backup: upload filepaths are UUID-derived, never a hosted
 * demo's name (HOSTED_DEMO_FILEPATHS). The route rename changes nothing
 * here or in the event: the demos stay /v/p/index.ifc and /v/p/index.step,
 * and content_id is the file's download URL, which never carried the
 * route segment.
 *
 * Also false on Netlify hosts (*.netlify.app), except deploy previews with
 * `?feature=gaEnableInPreview`, so ordinary team review sessions don't
 * register as conversions. This is deliberate defense-in-depth behind
 * index/ga.js#shouldInitGa, whose host allowlist keeps gtag/js from loading
 * off-prod unless that same preview override is present. The two predicates
 * differ on purpose and can't be merged:
 * localhost must stay *included* here because the Playwright E2E suite
 * (realModelOpen.spec.ts) asserts this event lands in the dataLayer
 * buffer on localhost, while shouldInitGa excludes localhost from
 * loading GA entirely.
 *
 * @param {object} routeResult from routes.ts#handleRoute
 * @param {string} hostname current page host; parameterized for tests
 * @param {boolean} enableInPreview feature override; parameterized for tests
 * @return {boolean}
 */
export function isRealModelOpen(
  routeResult,
  hostname = window.location.hostname,
  enableInPreview = isFeatureEnabled('gaEnableInPreview'),
) {
  const isDeployPreview = hostname.startsWith('deploy-preview-') && hostname.endsWith('.netlify.app')
  if (hostname.endsWith('.netlify.app') && !(isDeployPreview && enableInPreview)) {
    return false
  }
  const isBundledDemo = routeResult?.kind === 'file' &&
    !routeResult.isUploadedFile &&
    HOSTED_DEMO_FILEPATHS.includes(routeResult.filepath)
  return !isBundledDemo
}

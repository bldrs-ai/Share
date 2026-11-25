import {getAuth0AccessToken} from '../connections/auth0Bridge'
import {AUTH_SETTLE_RETRY_MS} from '../Containers/authLoadGate'
import {formFactor} from '../privacy/clientCapabilities'
import {
  ACCOUNT_USAGE_KINDS,
  LIMIT_GATES,
  LIMIT_KINDS,
  LOAD_REPORT_FIELDS,
  LOAD_REPORT_METRICS,
  MAX_METRIC,
  parseFunnelParams,
} from '../privacy/accountUsageReport'
import {MODEL_OPEN_FORMATS} from '../privacy/modelOpenCountReport'
import {bucketFileSize} from '../loader/loadAnalytics'
import {isProSubscriptionStatus} from '../quota/proStatus'
import useStore from '../store/useStore'
import {modelOpenSource} from './modelOpenCount'
import {waitForSettledFor} from './modelActionTracking'


/**
 * Where a signed-in user's page reports usage: netlify/functions/
 * account-usage.js, which records it against the account
 * (design/new/account-usage.md). Same-origin, with the user's Auth0 token.
 */
export const ACCOUNT_USAGE_PATH = '/.netlify/functions/account-usage'


/**
 * Whether the account lets its usage be recorded: the Profile toggle "Use
 * my usage to improve Bldrs", on unless the user turned it off. Read from the
 * token's `app_metadata` claim (Auth0/appMetadata.js), where account-usage's
 * preference call writes `usageReports`. The function checks its own mirror
 * too, so this is the page skipping a call it knows would be dropped, not
 * the enforcement.
 *
 * @param {?object} appMetadata the store's
 * @return {boolean}
 */
export function usageReportsEnabled(appMetadata) {
  return appMetadata?.usageReports !== false
}


/**
 * The load report for one open: #2355's enums, the verdict, the tier and the
 * timings and counts real_model_open carries (accountUsageReport.js says
 * which and why). Null when a field has no value in its enum: nothing is
 * sent rather than a guess.
 *
 * @param {object} routeResult the route loaded
 * @param {object} loadedModel only its `type` is read
 * @param {object} eventParams real_model_open's params (modelOpenEvents.js)
 * @param {object} context
 * @param {string} context.openKind utils/reportModelOpen.js#OpenKind
 * @param {?object} context.appMetadata for the tier
 * @param {object} [context.nav] navigator
 * @return {?object}
 */
export function accountLoadReport(routeResult, loadedModel, eventParams, {openKind, appMetadata, nav = globalThis.navigator}) {
  const type = String(loadedModel?.type ?? '').toLowerCase()
  const report = {
    content_type: MODEL_OPEN_FORMATS.includes(type) ? type : 'other',
    size_bucket: bucketFileSize(eventParams.stats_fileSize),
    source: modelOpenSource(routeResult),
    open_kind: openKind,
    form_factor: formFactor(nav),
    load_outcome: eventParams.load_outcome ?? 'displayed',
    cache_hit: String(eventParams.stats_cacheHit) === 'true' ? 'true' : 'false',
    tier: isProSubscriptionStatus(appMetadata?.subscriptionStatus) ? 'pro' : 'free',
  }
  for (const [field, allowed] of Object.entries(LOAD_REPORT_FIELDS)) {
    if (!allowed.includes(report[field])) {
      return null
    }
  }
  for (const metric of LOAD_REPORT_METRICS) {
    const value = Number(eventParams[`stats_${metric}`])
    // The function takes non-negative integers only; timings arrive as
    // fractional milliseconds.
    if (eventParams[`stats_${metric}`] !== undefined && Number.isFinite(value) && value >= 0) {
      report[metric] = Math.min(Math.round(value), MAX_METRIC)
    }
  }
  return report
}


/**
 * Report one real model open of a signed-in user (Containers/
 * modelOpenEvents.js calls it beside reportModelOpenCount, once per open).
 * Waits for auth to settle for the sign-in state the user is in, as the
 * normalized events do (app/modelActionTracking.js), since a local or URL
 * model loads without waiting for Auth0 to restore a returning session.
 * Sends nothing signed out, or with the opt-out on.
 *
 * Best-effort: never rejects.
 *
 * @param {object} routeResult
 * @param {object} loadedModel
 * @param {object} eventParams real_model_open's params
 * @param {object} context
 * @param {string} context.openKind
 * @param {Function} context.getIsAuthenticated the latest auth state
 * @return {Promise<boolean>} whether a report was posted
 */
export async function reportAccountLoad(routeResult, loadedModel, eventParams, {openKind, getIsAuthenticated}) {
  try {
    const readIsAuthenticated = () => (getIsAuthenticated ? getIsAuthenticated() === true : false)
    await waitForSettledFor(readIsAuthenticated, AUTH_SETTLE_RETRY_MS)
    const {appMetadata} = useStore.getState()
    if (!readIsAuthenticated() || !usageReportsEnabled(appMetadata)) {
      return false
    }
    const report = accountLoadReport(routeResult, loadedModel, eventParams, {openKind, appMetadata})
    if (!report) {
      return false
    }
    return await postAccountUsage({kind: ACCOUNT_USAGE_KINDS.LOAD, report})
  } catch (_) {
    return false
  }
}


/**
 * Report a private-model refusal the PAGE decided: the Open dialog's
 * pre-check of the ledger (useQuota#check) or useQuota's offline fallback.
 * A refusal record-load answered 403 is recorded by record-load itself, so
 * this is never called for one. Sent whatever the opt-out says: a limit
 * record is the service's (account-usage.md §"Opt-out").
 *
 * @param {object} hit
 * @param {string} [hit.gate] LIMIT_GATES, blocked by default
 * @param {string} [hit.routeKind] gdrive | github | local
 * @return {Promise<boolean>}
 */
export function reportClientLimitHit({gate = LIMIT_GATES.BLOCKED, routeKind} = {}) {
  const body = {kind: ACCOUNT_USAGE_KINDS.LIMIT, limit: LIMIT_KINDS.PRIVATE_MODEL, gate}
  if (routeKind) {
    body.route_kind = routeKind
  }
  return postAccountUsage(body)
}


/**
 * Forward a funnel step (login, begin_checkout) for the server to send to GA
 * under its fixed client id. Signed in only (it rides the token), and not
 * with the opt-out on. Params outside the step's enums are dropped, not sent.
 *
 * @param {string} event FUNNEL_REPORT_EVENTS
 * @param {object} params
 * @return {Promise<boolean>}
 */
export async function reportFunnelStep(event, params) {
  try {
    // A login is reported on the signed-in edge, before BaseRoutes has the
    // new session's token and claims: wait for that settlement, so the token
    // is there to send and the opt-out read is this account's.
    await waitForSettledFor(() => true, AUTH_SETTLE_RETRY_MS)
    if (!usageReportsEnabled(useStore.getState().appMetadata)) {
      return false
    }
    const known = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const valid = parseFunnelParams(event, known)
    if (!valid) {
      return false
    }
    return await postAccountUsage({kind: ACCOUNT_USAGE_KINDS.FUNNEL, event, params: valid})
  } catch (_) {
    return false
  }
}


/**
 * Turn the account's usage reports on or off (the Profile toggle). On
 * success the store's appMetadata is updated in place, so the toggle shows
 * the new state before the next token refresh brings the claim.
 *
 * @param {boolean} on
 * @return {Promise<boolean>} whether the server stored it
 */
export async function setUsageReportsPreference(on) {
  const token = await getAuth0AccessToken()
  if (!token) {
    return false
  }
  try {
    const response = await fetch(ACCOUNT_USAGE_PATH, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
      body: JSON.stringify({kind: ACCOUNT_USAGE_KINDS.PREFERENCE, usage_reports: on}),
    })
    if (!response.ok) {
      return false
    }
    const {appMetadata, setAppMetadata} = useStore.getState()
    setAppMetadata({...appMetadata, usageReports: on})
    return true
  } catch (_) {
    return false
  }
}


/**
 * POST one body with the user's token; false without one (signed out).
 * `keepalive` so a report made just before a navigation still goes out.
 *
 * @param {object} body
 * @return {Promise<boolean>} whether the function accepted it
 */
async function postAccountUsage(body) {
  try {
    const token = await getAuth0AccessToken()
    if (!token) {
      return false
    }
    const response = await fetch(ACCOUNT_USAGE_PATH, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
      body: JSON.stringify(body),
      keepalive: true,
    })
    return response.ok
  } catch (_) {
    return false
  }
}

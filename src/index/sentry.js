import {init, reactRouterV6BrowserTracingIntegration} from '@sentry/react'
import {useEffect} from 'react'
import {useLocation, useNavigationType, createRoutesFromChildren, matchRoutes} from 'react-router-dom'
import {gtagEvent} from '../privacy/analytics'
import {redactBreadcrumb} from '../privacy/sentryRedaction'
// Named import (rather than `import pkg from '../../package.json'`) so
// esbuild can prune the rest of the JSON — we only care about `version`.
import {version as pkgVersion} from '../../package.json'


/*
 * Stack-frame URLs matching any of these patterns mark the event as
 * "third-party noise" — we drop them in `beforeSend` below before
 * they reach Sentry. We add to this list when triage finds a class
 * of events whose stack identifies a script we can't action.
 *
 * Current entries:
 *
 *   /\/\.netlify\/scripts\/rum/
 *     Netlify's RUM (Real User Monitoring) beacon, which POSTs to
 *     ingesteer.services-prod.nsvcs.net. Ad-blockers, mobile
 *     carriers in emerging markets, and corp proxies frequently
 *     block that domain, surfacing here as
 *     "TypeError: Failed to fetch" with mechanism: onunhandledrejection
 *     and a stack rooted at /.netlify/scripts/rum. SHARE-K3 alone
 *     was 7,118 users / 21,540 events of this — 94% Android, 99%
 *     mobile — same emerging-markets demographic that blocks all
 *     third-party telemetry. The page itself works; only Sentry
 *     was noisy.
 *
 *     We can't make the RUM script stop trying (it keeps flushing
 *     on every visibilitychange:hidden / pagehide), but we can stop
 *     it from filling Sentry with one issue per flush. To avoid
 *     losing the "this client has telemetry blocking" signal
 *     entirely, the first detected RUM failure per session fires a
 *     single GA `netlify_rum_blocked` event before dropping —
 *     see emitOncePerSession() and shouldSendSentryEvent() below.
 */
const THIRD_PARTY_NOISE_PATTERNS = [
  {
    pattern: /\/\.netlify\/scripts\/rum/,
    gaEventName: 'netlify_rum_blocked',
  },
]


/*
 * Whole-event shape heuristics for noise that can't be identified by
 * a script URL — typically injected scripts from custom WebViews or
 * userscripts where the browser only reports `<anonymous>` for the
 * source. Each entry pairs a `match(event)` predicate with the GA
 * event name fired on the first per-session detection.
 *
 * Current entries:
 *
 *   isAnonymousOnerrorEvent  →  gaEventName: 'anonymous_injected_error'
 *     SHARE-152 and SHARE-153 (2 users / ~2,200 events combined,
 *     same trace_id / IP / Chrome Mobile WebView 76 on a Pixel
 *     Android 10) presented as `TypeError: Cannot read properties of
 *     null (reading 'querySelector' | 'src')` with `mechanism: onerror`
 *     and a single-frame stack `<anonymous>:1:60`. That's the
 *     fingerprint of an injected script (likely a userscript in a
 *     customized Android WebView) hitting our DOM with the wrong
 *     selectors. We can't fix THEIR script; we can stop showing
 *     ourselves as the culprit. The two issues share the same
 *     trace_id because each tick of the injected script throws both
 *     errors back-to-back.
 */


/**
 * True when every frame of the top exception has no identifiable
 * source AND the exception was caught via `window.onerror`. That's
 * the signature of an injected/eval'd script from a third party we
 * can't inspect — Chrome Mobile WebView userscripts, in-app browser
 * helpers, malicious overlays, etc. Restricted to values[0] (the
 * outermost catch) so a chained exception with a legitimate
 * application-frame top doesn't get suppressed by a noise cause.
 *
 * @param {object} event Sentry event payload
 * @return {boolean}
 */
function isAnonymousOnerrorEvent(event) {
  const exception = event?.exception?.values?.[0]
  if (!exception) {
    return false
  }
  if (exception.mechanism?.type !== 'onerror') {
    return false
  }
  const frames = exception.stacktrace?.frames
  if (!Array.isArray(frames) || frames.length === 0) {
    return false
  }
  return frames.every((frame) => {
    const filename = frame?.filename
    return !filename || filename === '<anonymous>' || filename === '<unknown>'
  })
}


/*
 * Globals that in-app browsers' native hosts call into the page as a JS
 * bridge. The host evaluates its script against the document, so when the
 * bridge isn't set up yet the browser reports a ReferenceError framed at
 * the page's own URL, line 1 (the HTML), not `<anonymous>`, and
 * isAnonymousOnerrorEvent can't see it. Share never references these names,
 * so the name in an uncaught ReferenceError is the fingerprint.
 *
 *   zaloJSV2  Zalo (Vietnam's messenger) in-app browser on iOS WKWebView,
 *             `Can't find variable: zaloJSV2` (SHARE-1X7).
 */
const IN_APP_BROWSER_BRIDGE_GLOBALS = /\bzaloJSV2\b/


/**
 * True for an uncaught ReferenceError naming an in-app browser's bridge
 * global (IN_APP_BROWSER_BRIDGE_GLOBALS). Like isAnonymousOnerrorEvent,
 * restricted to values[0] and `mechanism: onerror`.
 *
 * @param {object} event Sentry event payload
 * @return {boolean}
 */
function isInAppBrowserBridgeError(event) {
  const exception = event?.exception?.values?.[0]
  return exception?.type === 'ReferenceError' &&
    exception.mechanism?.type === 'onerror' &&
    typeof exception.value === 'string' &&
    IN_APP_BROWSER_BRIDGE_GLOBALS.test(exception.value)
}


const HEURISTIC_NOISE_MATCHERS = [
  {
    match: isAnonymousOnerrorEvent,
    gaEventName: 'anonymous_injected_error',
  },
  {
    match: isInAppBrowserBridgeError,
    gaEventName: 'in_app_browser_bridge_error',
  },
]


/*
 * Per-pattern "have we already reported this in this session?" flags.
 * Module-level so they persist across multiple beforeSend calls on
 * the same page load, and reset on full page reload (which is the
 * natural session boundary here — sessionStorage would persist them
 * across reloads but adds storage failure modes for marginal benefit).
 */
const reportedNoiseSessions = new Set()


/**
 * Test-only reset for the per-session reported-noise flags. Tests
 * that exercise the once-per-session contract need a way to clear
 * state between cases without re-importing the module.
 */
export function _resetSentryFilterStateForTests() {
  reportedNoiseSessions.clear()
  shadowedConditions.clear()
}


/**
 * Returns false for Sentry events we've classified as third-party
 * noise — either by stack-frame URL pattern
 * (THIRD_PARTY_NOISE_PATTERNS) or by whole-event shape heuristic
 * (HEURISTIC_NOISE_MATCHERS). On the first detection per session
 * for each pattern / heuristic, fires the configured GA event so
 * the "this client has X" statistic isn't lost when we drop the
 * Sentry event.
 *
 * Exported so it can be unit-tested with synthetic events — the
 * `setupSentry` call below is one-shot and not test-friendly.
 *
 * @param {object} event Sentry event payload
 * @return {boolean} true to send, false to drop
 */
export function shouldSendSentryEvent(event) {
  const exceptions = event?.exception?.values
  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    return true
  }
  // Filename-pattern pass: walk every exception in the chain
  // (caused-by exceptions appear as additional entries in values[]),
  // not just the top — RUM beacons typically surface as a single
  // exception, but a wrapped / chained exception with RUM as the
  // cause should still be dropped.
  for (const exception of exceptions) {
    const frames = exception?.stacktrace?.frames
    if (!Array.isArray(frames) || frames.length === 0) {
      continue
    }
    for (const frame of frames) {
      if (typeof frame?.filename !== 'string') {
        continue
      }
      for (const {pattern, gaEventName} of THIRD_PARTY_NOISE_PATTERNS) {
        if (pattern.test(frame.filename)) {
          emitOncePerSession(gaEventName)
          return false
        }
      }
    }
  }
  // Shape-heuristic pass: each matcher inspects the whole event
  // (e.g. mechanism + stack shape). Cheaper after the URL pass
  // because we've already excluded most matches.
  for (const {match, gaEventName} of HEURISTIC_NOISE_MATCHERS) {
    if (match(event)) {
      emitOncePerSession(gaEventName)
      return false
    }
  }
  return true
}


/**
 * Fire a GA event the first time per session it's requested, then
 * suppress subsequent calls for the same name. Lets us preserve the
 * "this client blocks third-party telemetry" signal without each
 * blocked beacon becoming its own GA event too. Best-effort — GA
 * itself may be blocked by the same client, and `gtagEvent` already
 * handles `window.gtag === undefined`.
 *
 * @param {string|null|undefined} eventName
 */
function emitOncePerSession(eventName) {
  if (!eventName || reportedNoiseSessions.has(eventName)) {
    return
  }
  try {
    // Don't consume the once-per-session slot unless gtagEvent actually sent:
    // it returns false when gtag/js isn't loaded yet or blocked, or consent is
    // off, and a later call (or opt-in) must still get the event (same
    // rationale as shadowReportedCondition, #2110). Inside the try because
    // isAllowed reads document.cookie, which throws in a sandboxed iframe, and
    // this runs inside Sentry's beforeSend.
    if (!gtagEvent(eventName, {})) {
      return
    }
    // Record only after the call returned, so a throw retries (#2109).
    reportedNoiseSessions.add(eventName)
  } catch {
    // GA not ready / consent declined / blocked — the Sentry drop
    // happens regardless. Best-effort signal capture.
  }
}


/*
 * Dedupe keys (`${level}|${category}`) already shadowed to GA in this
 * page session. Same lifetime rationale as reportedNoiseSessions.
 */
const shadowedConditions = new Set()


const SHADOW_LEVELS = new Set(['error', 'warning', 'fatal'])
const SHADOW_CATEGORY_MAX = 100


/**
 * Send one coarse GA `reported_condition` event per page session per
 * (level, category) for an event Sentry is about to receive.
 *
 * Why: GA shows roughly when sessions hit actionable error/warning
 * conditions (and can segment by tier, source, etc.); Sentry holds the
 * detail. The reverse link already exists: every Sentry event carries the
 * GA client id as a tag (`syncSentryCidTag` in privacy/analytics.js), so
 * no Sentry event id is sent to GA.
 *
 * Privacy: `category` comes ONLY from the custom fingerprint's first two
 * entries or the first exception's type. Never the message, an exception
 * value, a URL or any free text: those can name a private model.
 *
 * Once per session: GA counts sessions, and a looping error must not
 * flood it.
 *
 * Call only for events that passed shouldSendSentryEvent. Never throws.
 *
 * @param {object} event Sentry event payload
 */
export function shadowReportedCondition(event) {
  try {
    const level = event?.level || 'error'
    if (!SHADOW_LEVELS.has(level)) {
      return
    }
    // A reporter that already counts this failure in GA marks its event
    // `ga_counted` (alertTracking.js#trackAlert and its `alert` event), so
    // one failure stays one GA event.
    if (typeof event.tags?.ga_counted === 'string') {
      return
    }
    let category
    if (Array.isArray(event.fingerprint) && !event.fingerprint.includes('{{ default }}') &&
        event.fingerprint.length > 0) {
      category = event.fingerprint.slice(0, 2).join('/')
    } else {
      category = event.exception?.values?.[0]?.type || 'message'
    }
    category = String(category).slice(0, SHADOW_CATEGORY_MAX)
    const key = `${level}|${category}`
    if (shadowedConditions.has(key)) {
      return
    }
    // No load phase: by the time beforeSend runs, `event.tags` already
    // includes the global scope, where loadProgress#applySentryLoadState
    // leaves a sticky `load.phase` after a stall or failure. An unrelated
    // later event would carry that stale phase into GA. GA's own timestamp
    // says roughly when; Sentry keeps the phase on the event.
    // Record the key only when gtagEvent actually sent (it returns false with
    // no gtag/js or no consent), so a user who opts in later, or an event after
    // gtag/js loads, still gets the condition shadowed; and after a throw (as
    // in reportRenderMode, #2109).
    if (!gtagEvent('reported_condition', {level, category})) {
      return
    }
    shadowedConditions.add(key)
  } catch {
    // Best-effort: never affect what Sentry receives.
  }
}


/**
 * Setup Sentry for error tracking.
 */
export default function setupSentry() {
  init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    // `release` is the package.json version, which `tools/updateVersion.mjs`
    // rewrites at build-time to `<major>.<PR>.<commit>`. Tagging events with
    // it is what lets Sentry triage map a crash back to the PR that
    // shipped it. Prefix with the project slug so the same Sentry org can
    // host multiple bldrs apps without release-tag collisions.
    release: `bldrs-share@${pkgVersion}`,
    beforeSend(event) {
      if (!shouldSendSentryEvent(event)) {
        return null
      }
      shadowReportedCondition(event)
      return event
    },
    // Console and click breadcrumbs that name the user's file are rewritten
    // before they're recorded (privacy/sentryRedaction.js); the page and the
    // console keep them.
    beforeBreadcrumb: redactBreadcrumb,
    integrations: [
      reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: [
      'https://bldrs.ai',
      'https://*.bldrs.dev',
    ],
  })
}

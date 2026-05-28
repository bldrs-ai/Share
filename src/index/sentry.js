import {init, reactRouterV6BrowserTracingIntegration} from '@sentry/react'
import {useEffect} from 'react'
import {useLocation, useNavigationType, createRoutesFromChildren, matchRoutes} from 'react-router-dom'
// Named import (rather than `import pkg from '../../package.json'`) so
// esbuild can prune the rest of the JSON — we only care about `version`.
import {version as pkgVersion} from '../../package.json'


/*
 * Stack-frame URLs matching any of these patterns mark the event as
 * "third-party noise" — we drop them in `beforeSend` below before
 * they reach Sentry. We add to this list when triage finds a class
 * of events with no actionable first-party signal.
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
 *     was noisy. Drop them upstream.
 */
const THIRD_PARTY_NOISE_PATTERNS = [
  /\/\.netlify\/scripts\/rum/,
]


/**
 * Returns false for Sentry events whose stack is rooted in a script
 * we've marked as third-party noise (see THIRD_PARTY_NOISE_PATTERNS).
 * Exported so it can be unit-tested with a synthetic event — the
 * `setupSentry` call below is one-shot and not test-friendly.
 *
 * @param {object} event Sentry event payload
 * @return {boolean} true to send, false to drop
 */
export function shouldSendSentryEvent(event) {
  const frames = event?.exception?.values?.[0]?.stacktrace?.frames
  if (!Array.isArray(frames) || frames.length === 0) {
    return true
  }
  for (const frame of frames) {
    if (typeof frame?.filename !== 'string') {
      continue
    }
    for (const pattern of THIRD_PARTY_NOISE_PATTERNS) {
      if (pattern.test(frame.filename)) {
        return false
      }
    }
  }
  return true
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
      return shouldSendSentryEvent(event) ? event : null
    },
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

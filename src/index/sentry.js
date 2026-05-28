import {init, reactRouterV6BrowserTracingIntegration} from '@sentry/react'
import {useEffect} from 'react'
import {useLocation, useNavigationType, createRoutesFromChildren, matchRoutes} from 'react-router-dom'
import PkgJson from '../../package.json'


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
    release: `bldrs-share@${PkgJson.version}`,
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

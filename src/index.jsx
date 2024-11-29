import {CypressHistorySupport} from 'cypress-react-router'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {FlagsProvider} from 'react-feature-flags'
import {Helmet, HelmetProvider} from 'react-helmet-async'
import {
  BrowserRouter,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom'
import * as Sentry from '@sentry/react'
import {BrowserTracing} from '@sentry/tracing'
import Auth0ProviderWithHistory from './Auth0ProviderWithHistory'
import BaseRoutes from './BaseRoutes'
import ApplicationError from './Components/ApplicationError'
import {flags} from './FeatureFlags'


Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  integrations: [
    new BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
          React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
      ),
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [
    'https://bldrs.ai',
    'https://*.bldrs.dev',
  ],
})


// NB: This transcludes all msw for testing.  Without it the prod build is much
// smaller.
if (process.env.MSW_IS_ENABLED) {
  const {initWorker} = require('./__mocks__/browser')
  // We used to read process.env in api-helpers, but that was behind the dynamic
  // require above (which saves us from putting all of msw into prod).  Those
  // defines were getting removed during esbuild tree shaking.  So, to maintain
  // a single interface, any env var cypress needs we also pass in here to
  // ensure it's visible to esbuild and the dependent codepaths work correctly.
  //
  // Should match with ./cypress.config.js
  const worker = initWorker({
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    GITHUB_BASE_URL: process.env.GITHUB_BASE_URL,
    GITHUB_BASE_URL_UNAUTHENTICATED: process.env.GITHUB_BASE_URL_UNAUTHENTICATED,
    MSW_IS_ENABLED: process.env.MSW_IS_ENABLED,
    OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID,
    RAW_GIT_PROXY_URL: process.env.RAW_GIT_PROXY_URL,
    RAW_GIT_PROXY_URL_NEW: process.env.RAW_GIT_PROXY_URL_NEW,
  })
  worker.start({
    onUnhandledRequest(req) {
      if (req.url.host === 'api.github.com') {
        console.warn(`Found an unhandled GH API request: ${req.method} ${req.url}`)
      } else {
        console.warn(`Found an unhandled non-GH request: ${req.method} ${req.url}`)
      }
    },
  })
}

// Enable esbuild hot-reload model
if (process.env.NODE_ENV === 'development') {
  new EventSource('/esbuild').addEventListener('change', () => location.reload())
}

const root = createRoot(document.getElementById('root'))

root.render(
    <Sentry.ErrorBoundary fallback={<ApplicationError/>}>
      <FlagsProvider value={flags}>
        <HelmetProvider>
          <Helmet>
            <title>Bldrs.ai</title>
          </Helmet>
          <BrowserRouter>
            <CypressHistorySupport/>
            <Auth0ProviderWithHistory>
              <BaseRoutes/>
            </Auth0ProviderWithHistory>
          </BrowserRouter>
        </HelmetProvider>
      </FlagsProvider>
    </Sentry.ErrorBoundary>,
)

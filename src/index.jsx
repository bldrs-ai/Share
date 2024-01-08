import React from 'react'
import {createRoot} from 'react-dom/client'
import {
  BrowserRouter,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'
import {FlagsProvider} from 'react-feature-flags'
import {flags} from './FeatureFlags'
import {Auth0ProviderWithHistory} from './Components/Auth0ProviderWithHistory'
import * as Sentry from '@sentry/react'
import {BrowserTracing} from '@sentry/tracing'
import ApplicationError from './Components/ApplicationError'
import {Helmet, HelmetProvider} from 'react-helmet-async'
import {CypressHistorySupport} from 'cypress-react-router'


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

console.log("process.env.DISABLE_MOCK_SERVICE_WORKER: " + process.env.DISABLE_MOCK_SERVICE_WORKER)
console.log("process.env.OAUTH2_CLIENT_ID: " + process.env.OAUTH2_CLIENT_ID)
console.log("process.env.OAUTH2_REDIRECT_URI: " + process.env.OAUTH2_REDIRECT_URI)
console.log("process.env.AUTH0_DOMAIN: " + process.env.AUTH0_DOMAIN)
console.log("process.env.GITHUB_API_TOKEN: " + process.env.GITHUB_API_TOKEN)
console.log("process.env.GITHUB_BASE_URL: " + process.env.GITHUB_BASE_URL)
console.log("process.env.RAW_GIT_PROXY_URL: " + process.env.RAW_GIT_PROXY_URL)
console.log("process.env.USE_WEBIFC_SHIM: " + process.env.USE_WEBIFC_SHIM)
console.log("window.location.origin: " +  window.location.origin)
if (process.env.DISABLE_MOCK_SERVICE_WORKER !== true) {
  const {worker} = require('./__mocks__/browser')
  worker.start({
    onUnhandledRequest(req) {
      if (req.url.host === 'api.github.com') {
        // eslint-disable-next-line no-console
        console.error(`Found an unhandled ${req.method} request to ${req.url}`)
      }
    },
  })
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

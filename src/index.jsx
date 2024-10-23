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

if (process.env.MSW_IS_ENABLED) {
  const {worker} = require('./__mocks__/browser')
  worker.start({
    onUnhandledRequest(req) {
      if (req.url.host === 'api.github.com') {
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

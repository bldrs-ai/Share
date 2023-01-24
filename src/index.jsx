import React from 'react'
import {createRoot} from 'react-dom/client'
import {
  BrowserRouter,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom'
import {FlagsProvider} from 'react-feature-flags'
import * as Sentry from '@sentry/react'
import {BrowserTracing} from '@sentry/tracing'
import BaseRoutes from './BaseRoutes'
import {flags} from './FeatureFlags'
import ApplicationError from './Components/ApplicationError'


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
})

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
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
        <BrowserRouter>
          <BaseRoutes/>
        </BrowserRouter>
      </FlagsProvider>
    </Sentry.ErrorBoundary>,
)

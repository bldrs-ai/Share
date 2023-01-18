import React from 'react'
import {createRoot} from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'
import {FlagsProvider} from 'react-feature-flags'
import {flags} from './FeatureFlags'
import * as Sentry from '@sentry/react'
import {BrowserTracing} from '@sentry/tracing'


Sentry.init({
  dsn: process.env.SENTRY_DSN,
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
    <FlagsProvider value={flags}>
      <BrowserRouter>
        <BaseRoutes/>
      </BrowserRouter>
    </FlagsProvider>)

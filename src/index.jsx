import React, {ReactElement, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {FlagsProvider} from 'react-feature-flags'
import {Helmet, HelmetProvider} from 'react-helmet-async'
import {BrowserRouter} from 'react-router-dom'
import {ErrorBoundary} from '@sentry/react'
import Auth0ProviderWithHistory from './Auth0/Auth0ProviderWithHistory'
import BaseRoutes from './BaseRoutes'
import ApplicationError from './Components/ApplicationError'
import {flags} from './FeatureFlags'
import './compat'
import setupEsbuildWatch from './index/esbuild'
import setupMSW from './index/msw'
import setupSentry from './index/sentry'
import './index.css'
import '@fontsource/roboto/latin-300.css'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'


setupSentry()
setupMSW()
setupEsbuildWatch()

const root = createRoot(document.getElementById('root'))

/** @return {ReactElement} The app with its context. */
function AppWithContext() {
  return (
    <FlagsProvider value={flags}>
      <HelmetProvider>
        <Helmet>
          <title>Bldrs.ai</title>
        </Helmet>
        <BrowserRouter>
          <Auth0ProviderWithHistory>
            <BaseRoutes/>
          </Auth0ProviderWithHistory>
        </BrowserRouter>
      </HelmetProvider>
    </FlagsProvider>
  )
}

// In prod use Sentry error tracking.  In local dev and testing use StrictMode.
root.render(
  process.env.NODE_ENV === 'production' ? (
    <ErrorBoundary fallback={<ApplicationError/>}>
      <AppWithContext/>
    </ErrorBoundary>
  ) : (
    <StrictMode>
      <AppWithContext/>
    </StrictMode>
  ),
)

import React, {ReactElement, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {FlagsProvider} from 'react-feature-flags'
import {Helmet, HelmetProvider} from 'react-helmet-async'
import {BrowserRouter} from 'react-router-dom'
import {ErrorBoundary} from '@sentry/react'
import Auth0ProviderWithHistory from './Auth0/Auth0ProviderWithHistory'
import BaseRoutes from './BaseRoutes'
import ApplicationError from './Components/ApplicationError'
import Auth0BridgeRegistrar from './connections/Auth0BridgeRegistrar'
import {flags, isFeatureEnabled} from './FeatureFlags'
import './compat'
import setupEsbuildWatch from './index/esbuild'
import setupGa from './index/ga'
import setupMSW from './index/msw'
import setupSentry from './index/sentry'
import useStore from './store/useStore'
import {installMainThreadTrace} from './utils/mainThreadTrace'
import {requestPaint} from './viewer/three/renderDemand'
import './index.css'
import '@fontsource/roboto/latin-300.css'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'


// First, so its buffered observers and rAF clock cover as much of startup
// as possible (open-205 §9.1 measurement; utils/mainThreadTrace.js).
if (isFeatureEnabled('mainThreadTrace')) {
  installMainThreadTrace({store: useStore, requestPaint})
}
setupSentry()
// After setupSentry: ga.js reports init failures via captureException.
setupGa()
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
            <Auth0BridgeRegistrar/>
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

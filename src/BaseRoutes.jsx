import {jwtDecode} from 'jwt-decode'
import React, {useCallback, useEffect, useRef, useState} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import {Button, CssBaseline, Dialog, DialogActions, DialogContent, DialogTitle, ThemeProvider} from '@mui/material'
import * as Sentry from '@sentry/react'
import {useAuth0} from './Auth0/Auth0Proxy'
import PopupAuth from './Components/Auth/PopupAuth'
import PopupCallback from './Components/Auth/PopupCallback'
import {checkOPFSAvailability, setUpGlobalDebugFunctions} from './OPFS/utils'
import ShareRoutes from './ShareRoutes'
import Styles from './Styles'
import About from './pages/About'
import Ipsum from './pages/Ipsum'
import Privacy from './pages/Privacy'
import TOS from './pages/TOS'
import BlogRoutes from './pages/blog/BlogRoutes'
import {initializeOctoKitAuthenticated, initializeOctoKitUnauthenticated} from './net/github/OctokitExport'
import useStore from './store/useStore'
import useShareTheme from './theme/Theme'
import debug from './utils/debug'
import {navWith} from './utils/navigate'


const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)

/**
 * From URL design: https://github.com/bldrs-ai/Share/wiki/URL-Structure
 * ... We adopt a URL structure similar to Google Apps URL structure:
 *
 *   http://host/<app>/<view>/<object>
 *
 * which when fully expanded becomes:
 *
 *   http://host/share/v/p/index.ifc
 *   http://host/share/v/gh/bldrs-ai/Share/main/public/index.ifc
 *
 * @see https://github.com/bldrs-ai/Share/wiki/Design#ifc-scene-load
 * @param {React.Component} testElt For unit test allow use of a stub here instead of loading the app.
 * @return {object}
 */
export default function BaseRoutes({testElt = null}) {
  const location = useLocation()
  const navigate = useNavigate()
  const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : ''
  const basePath = `${installPrefix}/`
  const {isLoading, isAuthenticated, getAccessTokenSilently, logout} = useAuth0()
  const setAccessToken = useStore((state) => state.setAccessToken)
  const setHasGithubIdentity = useStore((state) => state.setHasGithubIdentity)
  const setIsAuthResolved = useStore((state) => state.setIsAuthResolved)
  const appPrefix = `${basePath}share`
  const setAppPrefix = useStore((state) => state.setAppPrefix)
  const setIsOpfsAvailable = useStore((state) => state.setIsOpfsAvailable)
  const setAppMetadata = useStore((state) => state.setAppMetadata)
  const theme = useShareTheme()

  // State for reauthentication modal.
  const [reauthModalOpen, setReauthModalOpen] = useState(false)
  const [reauthScope, setReauthScope] = useState('')
  const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

  // The background fresh-claims pass below must run once per page load, not
  // once per effect run — the auth effect re-fires on every navigation
  // (`location` dep), and an unguarded cacheMode:'off' call there would
  // reintroduce a network token exchange per SPA route change.
  const freshClaimsRequestedRef = useRef(false)

  /**
   * Apply a resolved Auth0 access token to app state: reauth-modal short
   * circuits from app_metadata, appMetadata store, GitHub identity → octokit
   * init + accessToken. Shared by the boot-time cached-token fast path and
   * the background fresh-claims pass; idempotent, so processing the same
   * token twice is harmless. useCallback (all deps are stable setters) so
   * the auth effect below can depend on it without re-firing per render.
   */
  const processAccessToken = useCallback((token) => {
    if (token === '') {
      initializeOctoKitUnauthenticated()
      setAccessToken(token)
      return
    }

    const decodedToken = jwtDecode(token)
    const appData = decodedToken['https://bldrs.ai/app_metadata']

    // Reauth-modal short circuits: show the modal and stop — leave
    // identity/token state as it was.
    if (appData?.subscriptionStatus === 'shareProPendingReauth') {
      setReauthScope('repo')
      setReauthModalOpen(true)
      return
    }
    if (appData?.subscriptionStatus === 'freePendingReauth') {
      setReauthScope('public_repo')
      setReauthModalOpen(true)
      return
    }

    // Only overwrite store appMetadata when the JWT actually carries
    // one — tests (e.g. Subscription.spec) inject appMetadata directly
    // before login and expect it to stick.
    if (appData) {
      setAppMetadata(appData)
    }

    const identities = decodedToken['https://bldrs.ai/identities'] || decodedToken.identities || []
    if (identities.length > 0) {
      const hasGitHubIdentity = identities.some((identity) => identity.connection === 'github')
      if (hasGitHubIdentity) {
        initializeOctoKitAuthenticated()
        setAccessToken(token)
        setHasGithubIdentity(true)
      } else {
        initializeOctoKitUnauthenticated()
        setAccessToken('')
        setHasGithubIdentity(false)
      }
    }
  }, [setAccessToken, setAppMetadata, setHasGithubIdentity])

  useEffect(() => {
    setAppPrefix(appPrefix)

    if (OAUTH_2_CLIENT_ID === 'cypresstestaudience') {
      window.store = useStore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAppPrefix, appPrefix])

  useEffect(() => {
    const checkAvailability = async () => {
      const available = await checkOPFSAvailability()

      if (available) {
        setUpGlobalDebugFunctions()
      }

      setIsOpfsAvailable(available)
    }

    checkAvailability()
  }, [setIsOpfsAvailable])

  useEffect(() => {
    if (location.pathname === installPrefix || location.pathname === basePath) {
      const fwdPath = `${appPrefix}`
      debug().log('BaseRoutes#useEffect[], forwarding to: ', fwdPath)
      navWith(navigate, fwdPath)
    }

    if (process.env.NODE_ENV === 'development' && process.env.GITHUB_API_TOKEN) {
      setAccessToken(process.env.GITHUB_API_TOKEN)
      setIsAuthResolved(true)
    } else if (!isLoading && !isAuthenticated) {
      setIsAuthResolved(true)
    } else if (!isLoading && isAuthenticated) {
      const tokenFetchOpts = {
        authorizationParams: {
          // audience: 'https://bldrs.us.auth0.com/userinfo',
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
        // 'on', not 'off': resolve from the SDK's localstorage token cache
        // (ms) and only hit the network when the cached token has expired.
        // 'off' forced a refresh-grant round trip to auth0's /oauth/token on
        // every page load, and CadView#onViewer serializes the first model
        // load behind this resolution — so a slow exchange (cross-tab lock
        // stall, timed-out first attempt) froze the viewer for ~10s before
        // any progress UI appeared. The background pass below covers claims
        // freshness off the critical path.
        cacheMode: 'on',
        useRefreshTokens: true,
      }
      getAccessTokenSilently(tokenFetchOpts)
        .then(processAccessToken)
        .catch((err) => {
          if (err.error === 'invalid_grant') {
            logout({returnTo: window.location.origin})
          } else if (err.error !== 'login_required') {
            throw err
          }
        })
        .finally(() => {
          setIsAuthResolved(true)
        })

      // Background fresh-claims pass. Cached tokens carry JWT claims frozen
      // at mint time, so a boot that only reads the cache would miss
      // anything set server-side since: the Stripe webhook flipping
      // app_metadata.subscriptionStatus to a pendingReauth state (the modal
      // would never open), a revoked refresh token / Auth0 session (the
      // invalid_grant → logout path would never fire), or an out-of-band
      // identity link/unlink. Force one refresh-grant per page load —
      // exactly what cacheMode:'off' used to do — but off the load-blocking
      // path: it doesn't gate isAuthResolved, and processAccessToken
      // re-applies whatever it learns when it lands.
      if (!freshClaimsRequestedRef.current) {
        freshClaimsRequestedRef.current = true
        getAccessTokenSilently({...tokenFetchOpts, cacheMode: 'off'})
          .then(processAccessToken)
          .catch((err) => {
            if (err.error === 'invalid_grant') {
              logout({returnTo: window.location.origin})
            }
            // Anything else is non-fatal here: the cached-token pass above
            // already established a working session; this pass only exists
            // to refresh claims.
          })
      }
    }
  }, [
    appPrefix,
    setAppPrefix,
    basePath,
    installPrefix,
    location,
    navigate,
    isLoading,
    isAuthenticated,
    getAccessTokenSilently,
    setAccessToken,
    setAppMetadata,
    setHasGithubIdentity,
    setIsAuthResolved,
    logout,
    processAccessToken,
  ])

  return (
    <>
      <CssBaseline enableColorScheme>
        <ThemeProvider theme={theme}>
          <Styles theme={theme}/>
          <SentryRoutes>
            <Route path={basePath} element={<Outlet/>}>
              <Route
                path='share/*'
                element={
                  testElt || (
                    <ShareRoutes
                      installPrefix={installPrefix}
                      appPrefix={`${appPrefix}`}
                    />
                  )
                }
              />
              <Route path='about' element={<About/>}/>
              <Route path='privacy' element={<Privacy/>}/>
              <Route path='tos' element={<TOS/>}/>
              <Route path='ipsum' element={<Ipsum/>}/>
              <Route path='blog/*' element={<BlogRoutes/>}/>
            </Route>
            <Route path='popup-auth' element={<PopupAuth/>}/>
            <Route path='popup-callback' element={<PopupCallback/>}/>
          </SentryRoutes>
        </ThemeProvider>
      </CssBaseline>

      {/* Reauthentication Modal */}
      <Dialog open={reauthModalOpen} onClose={() => setReauthModalOpen(false)}>
        <DialogTitle>Reauthentication Required</DialogTitle>
        <DialogContent>
          Your session requires reauthentication with GitHub. Please click the button below to proceed.
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              window.open(`/popup-auth?scope=${reauthScope}&connection=github`, 'authPopup', 'width=600,height=600')
              setReauthModalOpen(false)
            }}
          >
            Reauthenticate
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

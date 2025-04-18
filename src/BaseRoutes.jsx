import {jwtDecode} from 'jwt-decode'
import React, {useEffect, useState} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import * as Sentry from '@sentry/react'
import {useAuth0} from './Auth0/Auth0Proxy'
import {checkOPFSAvailability, setUpGlobalDebugFunctions} from './OPFS/utils'
import ShareRoutes from './ShareRoutes'
import Styles from './Styles'
import usePageTracking from './hooks/usePageTracking'
import About from './pages/About'
import BlogRoutes from './pages/blog/BlogRoutes'
import {initializeOctoKitAuthenticated, initializeOctoKitUnauthenticated} from './net/github/OctokitExport'
import useStore from './store/useStore'
import useShareTheme from './theme/Theme'
import debug from './utils/debug'
import {navWith} from './utils/navigate'
import PopupAuth from './Components/Auth/PopupAuth'
import PopupCallback from './Components/Auth/PopupCallback'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'


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
  const {isLoading, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const setAccessToken = useStore((state) => state.setAccessToken)
  const appPrefix = `${basePath}share`
  const setAppPrefix = useStore((state) => state.setAppPrefix)
  const setIsOpfsAvailable = useStore((state) => state.setIsOpfsAvailable)
  const setAppMetadata = useStore((state) => state.setAppMetadata)
  const theme = useShareTheme()

  // State for reauthentication modal.
  const [reauthModalOpen, setReauthModalOpen] = useState(false)
  const [reauthScope, setReauthScope] = useState('')
  const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

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
    } else if (!isLoading && isAuthenticated) {
      getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
        cacheMode: 'off',
        useRefreshTokens: true,
      })
        .then((token) => {
          if (token !== '') {
            // Cypress check
            if (token.access_token && token.access_token === 'mock_access_token') {
              initializeOctoKitAuthenticated()
              setAccessToken(token)
              return
            }
            const decodedToken = jwtDecode(token)
            const appData = decodedToken['https://bldrs.ai/app_metadata']
            if (appData) {
              if (appData.subscriptionStatus === 'shareProPendingReauth') {
                // Instead of immediately calling window.open we show a modal dialog.
                setReauthScope('repo')
                setReauthModalOpen(true)
              } else if (appData.subscriptionStatus === 'freePendingReauth') {
                setReauthScope('public_repo')
                setReauthModalOpen(true)
              } else {
                setAppMetadata(appData)
                initializeOctoKitAuthenticated()
                setAccessToken(token)
              }
            }
          } else {
            initializeOctoKitUnauthenticated()
            setAccessToken(token)
          }
        })
        .catch((err) => {
          if (err.error !== 'login_required') {
            throw err
          }
        })
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
  ])

  return (
    <>
      <CssBaseline enableColorScheme>
        <ThemeProvider theme={theme}>
          <Styles theme={theme}/>
          <SentryRoutes>
            {usePageTracking()}
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
              window.open(`/popup-auth?scope=${reauthScope}`, 'authPopup', 'width=600,height=600')
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

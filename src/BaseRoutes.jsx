import React, {useEffect} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import * as Sentry from '@sentry/react'
import {useAuth0} from './Auth0/Auth0Proxy'
import {checkOPFSAvailability, setUpGlobalDebugFunctions} from './OPFS/utils'
import ShareRoutes from './ShareRoutes'
import Styles from './Styles'
import About from './pages/About'
import BlogIndex from './pages/blog/BlogIndex'
import FirstPost from './pages/blog/FirstPost'
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
  const basePath = `${installPrefix }/`
  const {isLoading, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const setAccessToken = useStore((state) => state.setAccessToken)
  const appPrefix = `${basePath}share`
  const setAppPrefix = useStore((state) => state.setAppPrefix)
  const setIsOpfsAvailable = useStore((state) => state.setIsOpfsAvailable)


  useEffect(() => {
    setAppPrefix(appPrefix)
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
    if (location.pathname === installPrefix ||
        location.pathname === basePath) {
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
          scope: 'openid profile email offline_access repo',
        },
      }).then((token) => {
        if (token !== '') {
          initializeOctoKitAuthenticated()
        } else {
          initializeOctoKitUnauthenticated()
        }
        setAccessToken(token)
      }).catch((err) => {
        if (err.error !== 'login_required') {
          throw err
        }
      })
    }
  }, [appPrefix, setAppPrefix, basePath, installPrefix, location, navigate,
      isLoading, isAuthenticated, getAccessTokenSilently, setAccessToken])

  const theme = useShareTheme()
  return (
    <CssBaseline enableColorScheme>
      <ThemeProvider theme={theme}>
        <Styles theme={theme}/>
        <SentryRoutes>
          <Route path={basePath} element={<Outlet/>}>
            <Route
              path='share/*'
              element={
                testElt ||
                  <ShareRoutes
                    installPrefix={installPrefix}
                    appPrefix={`${appPrefix}`}
                  />
              }
            />
            <Route path='about' element={<About/>}/>
            <Route path='blog' element={<BlogIndex/>}/>
            <Route path='blog/first-post' element={<FirstPost/>}/>
          </Route>
        </SentryRoutes>
      </ThemeProvider>
    </CssBaseline>
  )
}

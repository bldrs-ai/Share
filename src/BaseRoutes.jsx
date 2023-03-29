import React, {useEffect} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'
import debug from './utils/debug'
import {useAuth0} from '@auth0/auth0-react'
import useStore from './store/useStore'
import * as Sentry from '@sentry/react'


const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)

/**
 * From URL design: https://github.com/bldrs-ai/Share/wiki/URL-Structure
 * ... We adopt a URL structure similar to Google Apps URL structure:
 *
 *   http://host/<app>/<view>/<object>
 *
 * which when fully expanded becomes:
 *
 *   http://host/share/v/p/indec.ifc
 *   http://host/share/v/gh/bldrs-ai/Share/main/public/index.ifc
 *
 * @see https://github.com/bldrs-ai/Share/wiki/Design#ifc-scene-load
 * @param {React.Component} testElt For unit test allow use of a stub here instead of loading the app.
 * @return {object}
 */
export default function BaseRoutes({testElt = null}) {
  const location = useLocation()
  const navigation = useNavigate()
  const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : ''
  const basePath = `${installPrefix }/`
  const {isLoading, isAuthenticated, getAccessTokenSilently} = useAuth0()
  const setAccessToken = useStore((state) => state.setAccessToken)

  useEffect(() => {
    if (location.pathname === installPrefix ||
        location.pathname === basePath) {
      debug().log('BaseRoutes#useEffect[], forwarding to: ', `${installPrefix }/share`)

      let targetURL = `${installPrefix}/share`
      if (location.search !== '') {
        targetURL += location.search
      }

      if (location.hash !== '') {
        targetURL += location.hash
      }

      navigation(targetURL)
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
        setAccessToken(token)
      }).catch((err) => {
        if (err.error !== 'login_required') {
          throw err
        }
      })
    }
  }, [basePath, installPrefix, location, navigation, getAccessTokenSilently, isAuthenticated, isLoading, setAccessToken])

  return (
    <SentryRoutes>
      <Route path={basePath} element={<Outlet/>}>
        <Route
          path="share/*"
          element={
            testElt ||
              <ShareRoutes
                installPrefix={installPrefix}
                appPrefix={`${installPrefix }/share`}
              />
          }
        />
      </Route>
    </SentryRoutes>
  )
}

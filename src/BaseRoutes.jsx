import React, {useEffect} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'
import debug from './utils/debug'
import {navWith} from './utils/navigate'
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

  useEffect(() => {
    if (location.pathname === installPrefix ||
        location.pathname === basePath) {
      const fwdPath = `${installPrefix}/share`
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
        setAccessToken(token)
      }).catch((err) => {
        if (err.error !== 'login_required') {
          throw err
        }
      })
    }
  }, [basePath, installPrefix, location, navigate, getAccessTokenSilently, isAuthenticated, isLoading, setAccessToken])

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
